'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { computeReportStatus, computeApprovedAmount } from '@/lib/approval-helpers'
import {
  notifySubmitterOfDecision,
  notifyL2ApproverOfPromotion,
  notifyBankLoadersOfApproval,
  notifyBankAuthorizersOfLoad,
  notifySubmitterOfReimbursement,
} from '@/actions/notifications'
import Anthropic from '@anthropic-ai/sdk'
import { buildAnalysisPrompt, parseAnalysisResponse } from '@/lib/approval-analysis-helpers'
import type { AiAnalysis, ReportForAnalysis, HistoricalItem } from '@/lib/approval-analysis-helpers'
import type { Json } from '@/lib/supabase/types'
import { checkRateLimit } from '@/lib/rate-limit'

export interface ApprovalDecision {
  itemId: string
  action: 'approve' | 'reject'
  reason?: string
}

export async function getPendingApprovals() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('users')
    .select('org_id, can_approve, role')
    .eq('id', user.id)
    .single()

  if (!profile || (!profile.can_approve && profile.role !== 'admin')) return []

  // Obtener todos los reportes pendientes de la org, incluyendo los aprobadores configurados del rendidor
  const { data } = await supabase
    .from('expense_reports')
    .select(`
      id, title, status, total_amount, submitted_at, currency,
      submitter:users!submitter_id (
        approver_l1_id, approver_l2_id, full_name,
        approver_l1_backup_id, backup_active_from, backup_active_until
      )
    `)
    .eq('org_id', profile.org_id)
    .in('status', ['submitted', 'pending_l2'])
    .is('deleted_at', null)
    .order('submitted_at', { ascending: true })

  const reports = data ?? []
  const today   = new Date().toISOString().split('T')[0]

  type SubType = {
    approver_l1_id:        string | null
    approver_l2_id:        string | null
    approver_l1_backup_id: string | null
    backup_active_from:    string | null
    backup_active_until:   string | null
    full_name:             string
  }

  // Filtrar: solo los reportes donde el usuario actual es el aprobador designado para ese nivel
  return reports.filter(r => {
    const sub = r.submitter as SubType | null

    if (!sub) {
      // Sin aprobador configurado → visible a todos los can_approve (fallback)
      return profile.can_approve || profile.role === 'admin'
    }

    if (r.status === 'submitted') {
      const isL1 = sub.approver_l1_id === user.id
      const isBackup = sub.approver_l1_backup_id === user.id &&
        !!sub.backup_active_from && !!sub.backup_active_until &&
        sub.backup_active_from <= today && sub.backup_active_until >= today
      return isL1 || isBackup
    }
    if (r.status === 'pending_l2')  return sub.approver_l2_id === user.id
    return false
  }).map(r => {
    const sub = r.submitter as SubType | null
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      total_amount: r.total_amount,
      submitted_at: r.submitted_at,
      currency: r.currency,
      submitter_name: sub?.full_name ?? null,
      approval_level: r.status === 'pending_l2' ? 2 : 1,
    }
  })
}

export async function getReportForApproval(reportId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('role, can_approve')
    .eq('id', user.id)
    .single()

  // Solo approvers y admins pueden llamar esta función
  if (!profile || (profile.role === 'employee' && !profile.can_approve)) return null

  const { data: report } = await supabase
    .from('expense_reports')
    .select('*')
    .eq('id', reportId)
    .single()

  if (!report) return null

  const { data: submitter } = await supabase
    .from('users')
    .select('full_name, approver_l1_id, approver_l2_id')
    .eq('id', report.submitter_id)
    .single()

  const { data: items } = await supabase
    .from('expense_items')
    .select(`
      *,
      expense_categories (name, icon, color),
      attachments (id, storage_path, file_type)
    `)
    .eq('report_id', reportId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  return {
    ...report,
    submitter_name:    submitter?.full_name    ?? null,
    approver_l1_id:    submitter?.approver_l1_id ?? null,
    approver_l2_id:    submitter?.approver_l2_id ?? null,
    expense_items:     items ?? [],
  }
}

export async function submitApprovalDecision(
  reportId: string,
  decisions: ApprovalDecision[],
  notes?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('org_id, can_approve, role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || (!profile.can_approve && profile.role !== 'admin')) {
    throw new Error('Sin permiso para aprobar rendiciones')
  }

  // Obtener reporte actual (para saber si es decisión N1 o N2)
  const { data: report } = await supabase
    .from('expense_reports')
    .select('status, submitter_id, org_id')
    .eq('id', reportId)
    .single()

  if (!report || report.org_id !== profile.org_id) throw new Error('Rendición no encontrada')

  const isL1Decision = report.status === 'submitted'
  const level        = isL1Decision ? 1 : 2

  // Obtener aprobadores del rendidor para determinar si hay N2
  const { data: submitter } = await supabase
    .from('users')
    .select('approver_l2_id')
    .eq('id', report.submitter_id)
    .single()

  const hasL2 = !!submitter?.approver_l2_id

  // Actualizar ítems
  for (const decision of decisions) {
    await supabase
      .from('expense_items')
      .update({
        status:           decision.action === 'approve' ? 'approved' : 'rejected',
        rejection_reason: decision.action === 'reject' ? (decision.reason ?? null) : null,
      })
      .eq('id', decision.itemId)
  }

  // Re-leer ítems para calcular estado
  const { data: allItems } = await supabase
    .from('expense_items')
    .select('status, amount_clp')
    .eq('report_id', reportId)
    .is('deleted_at', null)

  const items       = allItems ?? []
  const itemStatus  = computeReportStatus(items)
  const approvedAmt = computeApprovedAmount(items)

  // Lógica de cadena:
  // Si es N1 y hay N2 y todos los ítems fueron aprobados → pending_l2
  // Cualquier otro caso → estado final
  let newStatus: typeof itemStatus | 'pending_l2'
  if (isL1Decision && hasL2 && itemStatus === 'approved') {
    newStatus = 'pending_l2'
    // Resetear ítems a 'pending' para que N2 los revise desde cero
    await supabase
      .from('expense_items')
      .update({ status: 'pending', rejection_reason: null })
      .eq('report_id', reportId)
  } else {
    newStatus = itemStatus
  }

  const isDecided = newStatus !== 'pending_l2'

  await supabase
    .from('expense_reports')
    .update({
      status:          newStatus,
      approved_amount: approvedAmt,
      approved_at:     isDecided ? new Date().toISOString() : null,
    })
    .eq('id', reportId)

  // Log auditoría (append-only)
  const approvedIds = decisions.filter(d => d.action === 'approve').map(d => d.itemId)
  const rejectedIds = decisions.filter(d => d.action === 'reject').map(d => d.itemId)

  const logAction =
    itemStatus === 'approved'           ? 'approved'           :
    itemStatus === 'rejected'           ? 'rejected'           :
    itemStatus === 'partially_approved' ? 'partially_approved' : 'approved'

  await supabase
    .from('expense_report_approvals')
    .insert({
      report_id:      reportId,
      approver_id:    user.id,
      level,
      action:         logAction as 'approved' | 'rejected' | 'partially_approved' | 'returned_to_draft',
      items_approved: approvedIds.length > 0 ? approvedIds : null,
      items_rejected: rejectedIds.length > 0 ? rejectedIds : null,
      notes:          notes?.trim() || null,
    })

  // Notificaciones según resultado
  if (newStatus === 'pending_l2') {
    notifyL2ApproverOfPromotion(reportId).catch(() => {})
  } else {
    const notifAction =
      logAction === 'approved'           ? 'approved'           :
      logAction === 'rejected'           ? 'rejected'           : 'partially_approved'
    notifySubmitterOfDecision(reportId, notifAction).catch(() => {})
    if (notifAction === 'approved' || notifAction === 'partially_approved') {
      notifyBankLoadersOfApproval(reportId).catch(() => {})
    }
  }

  revalidatePath(`/approvals/${reportId}`)
  revalidatePath('/approvals')
  revalidatePath('/')
}

export async function getOrGenerateApprovalAnalysis(reportId: string): Promise<AiAnalysis | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profileForRole } = await supabase
    .from('users')
    .select('role, can_approve')
    .eq('id', user.id)
    .single()

  if (!profileForRole || (profileForRole.role === 'employee' && !profileForRole.can_approve)) return null

  const { data: report } = await supabase
    .from('expense_reports')
    .select('id, title, total_amount, submitter_id, ai_analysis, ai_analysis_at, updated_at')
    .eq('id', reportId)
    .single()
  if (!report) return null

  // Usar análisis cacheado si está actualizado
  if (report.ai_analysis && report.ai_analysis_at) {
    const analysisAt = new Date(report.ai_analysis_at as string).getTime()
    const updatedAt  = new Date(report.updated_at as string).getTime()
    if (analysisAt > updatedAt) {
      return report.ai_analysis as unknown as AiAnalysis
    }
  }

  // Cargar ítems actuales
  const { data: itemsRaw } = await supabase
    .from('expense_items')
    .select(`id, description, amount_clp, merchant, doc_type, doc_number, policy_violations, expense_categories (name)`)
    .eq('report_id', reportId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  const { data: submitterData } = await supabase
    .from('users').select('full_name').eq('id', report.submitter_id as string).single()

  // Historial de 6 meses
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data: histReports } = await supabase
    .from('expense_reports')
    .select('id')
    .eq('submitter_id', report.submitter_id as string)
    .neq('id', reportId)
    .gte('created_at', sixMonthsAgo.toISOString())

  const histRids = (histReports ?? []).map((r: { id: string }) => r.id)
  let historyItems: HistoricalItem[] = []

  if (histRids.length > 0) {
    const { data: histItemsRaw } = await supabase
      .from('expense_items')
      .select(`description, amount_clp, merchant, status, rejection_reason, expense_categories (name)`)
      .in('report_id', histRids)
      .is('deleted_at', null)

    historyItems = (histItemsRaw ?? []).map(h => {
      const raw = h as unknown as {
        description: string; amount_clp: number; merchant: string | null; status: string
        rejection_reason: string | null; expense_categories: { name: string } | null
      }
      return {
        description:      raw.description,
        amount_clp:       raw.amount_clp,
        merchant:         raw.merchant,
        category_name:    raw.expense_categories?.name ?? null,
        status:           raw.status,
        rejection_reason: raw.rejection_reason,
      }
    })
  }

  const reportForAnalysis: ReportForAnalysis = {
    id:             reportId,
    title:          report.title as string,
    submitter_name: submitterData?.full_name ?? 'Empleado',
    expense_items:  (itemsRaw ?? []).map(i => {
      const raw = i as unknown as {
        id: string; description: string; amount_clp: number; merchant: string | null
        doc_type: string | null; doc_number: string | null; policy_violations: unknown
        expense_categories: { name: string } | null
      }
      return {
        id:                raw.id,
        description:       raw.description,
        amount_clp:        raw.amount_clp,
        category_name:     raw.expense_categories?.name ?? null,
        merchant:          raw.merchant,
        doc_type:          raw.doc_type,
        doc_number:        raw.doc_number,
        policy_violations: raw.policy_violations,
      }
    }),
  }

  // Rate limiting: máx 20 análisis IA por hora por usuario
  const { allowed } = await checkRateLimit(user.id, 'ai_analysis', 20)
  if (!allowed) {
    // Retornar el análisis cacheado si existe, sin regenerar
    const { data: existing } = await supabase
      .from('expense_reports').select('ai_analysis').eq('id', reportId).single()
    return existing?.ai_analysis as unknown as AiAnalysis ?? null
  }

  const prompt = buildAnalysisPrompt(reportForAnalysis, historyItems)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    messages:   [{ role: 'user', content: prompt }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
  const analysis = parseAnalysisResponse(rawText)

  await supabase
    .from('expense_reports')
    .update({
      ai_analysis:    analysis as unknown as Json,
      ai_analysis_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  return analysis
}

export async function bulkApproveItems(reportId: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('org_id, can_approve, role').eq('id', user.id).single()
  if (!profile || (!profile.can_approve && profile.role !== 'admin')) {
    throw new Error('Sin permiso para aprobar rendiciones')
  }

  const { data: report } = await supabase
    .from('expense_reports')
    .select('status, submitter_id, org_id')
    .eq('id', reportId)
    .single()
  if (!report || report.org_id !== profile.org_id) throw new Error('Rendición no encontrada')

  // Aprobar ítems indicados
  await supabase
    .from('expense_items')
    .update({ status: 'approved' })
    .in('id', itemIds)

  // Leer todos los ítems para calcular estado global
  const { data: allItems } = await supabase
    .from('expense_items').select('id, status, amount_clp').eq('report_id', reportId).is('deleted_at', null)
  const items = (allItems ?? []) as { id: string; status: string; amount_clp: number }[]

  const isL1 = report.status === 'submitted'
  const allApproved = items.every(i => i.status === 'approved')
  const approvedAmt = computeApprovedAmount(items)

  if (!allApproved) {
    // Quedan ítems pendientes — actualizar monto aprobado parcial
    await supabase
      .from('expense_reports')
      .update({ approved_amount: approvedAmt })
      .eq('id', reportId)
  } else {
    // Todos aprobados — verificar cadena L2
    const { data: submitter } = await supabase
      .from('users').select('approver_l2_id').eq('id', report.submitter_id as string).single()
    const hasL2 = !!submitter?.approver_l2_id

    let newStatus: 'pending_l2' | 'approved'
    if (isL1 && hasL2) {
      newStatus = 'pending_l2'
      await supabase
        .from('expense_items')
        .update({ status: 'pending', rejection_reason: null })
        .eq('report_id', reportId)
    } else {
      newStatus = 'approved'
    }

    await supabase
      .from('expense_reports')
      .update({
        status:          newStatus,
        approved_amount: approvedAmt,
        approved_at:     newStatus === 'approved' ? new Date().toISOString() : null,
      })
      .eq('id', reportId)
  }

  // Registro de auditoría — siempre, independiente de si quedan ítems pendientes
  await supabase.from('expense_report_approvals').insert({
    report_id:      reportId,
    approver_id:    user.id,
    level:          isL1 ? 1 : 2,
    action:         'approved',
    items_approved: itemIds,
    notes:          `Aprobación masiva de ${itemIds.length} ítem(s) rutinario(s) vía análisis IA`,
  })

  // Notificaciones
  if (allApproved) {
    const { data: submitterData } = await supabase
      .from('users').select('approver_l2_id').eq('id', report.submitter_id as string).single()
    if (isL1 && submitterData?.approver_l2_id) {
      notifyL2ApproverOfPromotion(reportId).catch(() => {})
    } else {
      notifySubmitterOfDecision(reportId, 'approved').catch(() => {})
      notifyBankLoadersOfApproval(reportId).catch(() => {})
    }
  }

  revalidatePath(`/approvals/${reportId}`)
  revalidatePath('/approvals')
  revalidatePath('/')
}

export async function markReimbursed(reportId: string, paymentReference: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('Solo los administradores pueden marcar reembolsos')
  }

  const { error } = await supabase
    .from('expense_reports')
    .update({
      status:            'reimbursed',
      reimbursed_at:     new Date().toISOString(),
      reimbursed_by:     user.id,
      payment_reference: paymentReference.trim() || null,
    })
    .eq('id', reportId)
    .in('status', ['approved', 'partially_approved'])

  if (error) throw new Error(error.message)

  revalidatePath('/admin/reports')
  revalidatePath('/')
}

// ── Workflow bancario para Rendiciones ────────────────────────────────────────

async function requireAdminOrBankPerm(perm: 'can_load_bank_transfer' | 'can_authorize_bank_transfer') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('users')
    .select(`role, ${perm}`)
    .eq('id', user.id)
    .single()
  if (!profile) throw new Error('Perfil no encontrado')
  if (profile.role !== 'admin' && !(profile as Record<string, unknown>)[perm]) {
    throw new Error('Sin permiso para esta acción bancaria')
  }
  return { userId: user.id, profile }
}

/** Paso 1: Admin envía la rendición aprobada al proceso bancario */
export async function requestReportBankLoad(reportId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    throw new Error('Solo los administradores pueden iniciar el proceso bancario')
  }

  const admin = createAdminClient()
  const { error } = await (await admin)
    .from('expense_reports')
    .update({ status: 'pending_bank_load' })
    .eq('id', reportId)
    .in('status', ['approved', 'partially_approved'])

  if (error) throw new Error(error.message)

  await supabase.from('expense_report_approvals').insert({
    report_id:   reportId,
    approver_id: user.id,
    level:       1,
    action:      'bank_load_requested',
    notes:       'Iniciado proceso bancario de reembolso',
  })

  revalidatePath('/admin/reports')
  revalidatePath('/')
}

/** Paso 2: Encargado de carga confirma que cargó la transferencia en el banco */
export async function confirmReportBankLoad(reportId: string, data: {
  paymentReference: string
  transferredAt:    string
}) {
  const { userId } = await requireAdminOrBankPerm('can_load_bank_transfer')
  const supabase = await createClient()

  const admin = createAdminClient()
  const { error } = await (await admin)
    .from('expense_reports')
    .update({ status: 'pending_bank_auth' })
    .eq('id', reportId)
    .eq('status', 'pending_bank_load')

  if (error) throw new Error(error.message)

  await supabase.from('expense_report_approvals').insert({
    report_id:   reportId,
    approver_id: userId,
    level:       1,
    action:      'bank_load_confirmed',
    notes:       `Ref: ${data.paymentReference || 'Sin referencia'} · ${data.transferredAt}`,
  })

  notifyBankAuthorizersOfLoad(reportId).catch(() => {})

  revalidatePath('/admin/reports')
  revalidatePath('/')
}

/** Paso 3: Autorizador bancario confirma → reembolso completado */
export async function authorizeReportBank(reportId: string, paymentReference: string) {
  const { userId } = await requireAdminOrBankPerm('can_authorize_bank_transfer')
  const supabase = await createClient()

  const admin = createAdminClient()
  const { error } = await (await admin)
    .from('expense_reports')
    .update({
      status:            'reimbursed',
      reimbursed_at:     new Date().toISOString(),
      reimbursed_by:     userId,
      payment_reference: paymentReference.trim() || null,
    })
    .eq('id', reportId)
    .eq('status', 'pending_bank_auth')

  if (error) throw new Error(error.message)

  await supabase.from('expense_report_approvals').insert({
    report_id:   reportId,
    approver_id: userId,
    level:       1,
    action:      'bank_authorized',
    notes:       paymentReference.trim() || null,
  })

  notifySubmitterOfReimbursement(reportId).catch(() => {})

  revalidatePath('/admin/reports')
  revalidatePath('/')
}
