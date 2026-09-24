'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { computeReportStatus, computeApprovedAmount } from '@/lib/approval-helpers'
import { puedeOperarPago } from '@/lib/bank-helpers'
import { contextoRendicion, exigirPaso, permisoEn, cargarPersonas, type ContextoRendicion } from '@/lib/contexto-permisos'
import { puedeActuar, pasoSegunEstado, suplenteVigente, type Paso, type Documento } from '@/lib/permisos'
import { estadoTrasDecisionReporte, type ResultadoDecision } from '@/lib/flujo'
import {
  notifySubmitterOfDecision,
  notifyReportApprovers,
  notifyReportBankStep,
  notifySubmitterOfReimbursement,
} from '@/actions/notifications'
import Anthropic from '@anthropic-ai/sdk'
import { buildAnalysisPrompt, parseAnalysisResponse } from '@/lib/approval-analysis-helpers'
import type { AiAnalysis, ReportForAnalysis, HistoricalItem } from '@/lib/approval-analysis-helpers'
import type { Json } from '@/lib/supabase/types'
import { checkRateLimit } from '@/lib/rate-limit'
import { dispatchWebhooks, type WebhookEvent } from '@/lib/webhooks'

export interface ApprovalDecision {
  itemId: string
  action: 'approve' | 'reject'
  reason?: string
}

export async function getPendingApprovals() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data: yoRow } = await admin.from('users').select('org_id').eq('id', user.id).single()
  if (!yoRow) return []

  const [personas, { data }] = await Promise.all([
    cargarPersonas(admin, yoRow.org_id),
    admin
      .from('expense_reports')
      .select(`
        id, title, status, total_amount, submitted_at, currency, submitter_id,
        submitter:users!submitter_id (
          approver_l1_id, approver_l2_id, full_name,
          approver_l1_backup_id, backup_active_from, backup_active_until
        )
      `)
      .eq('org_id', yoRow.org_id)
      .in('status', ['submitted', 'pending_l2'])
      .is('deleted_at', null)
      .order('submitted_at', { ascending: true }),
  ])

  const yo = personas.find(p => p.id === user.id)
  if (!yo) return []
  const hoy = new Date().toISOString().slice(0, 10)

  type SubType = {
    approver_l1_id:        string | null
    approver_l2_id:        string | null
    approver_l1_backup_id: string | null
    backup_active_from:    string | null
    backup_active_until:   string | null
    full_name:             string
  }

  // Solo lo que esta persona puede decidir, con la misma regla que la acción.
  // Ya no hay «sin aprobador → visible a todos»: sin N1 no se puede enviar.
  return (data ?? []).flatMap(r => {
    const sub  = r.submitter as SubType | null
    const paso = pasoSegunEstado('rendicion', r.status)
    if (!sub || !paso) return []
    const doc: Documento = {
      tipo:           'rendicion',
      beneficiarioId: r.submitter_id,
      cadena: {
        l1:                sub.approver_l1_id,
        l2:                sub.approver_l2_id,
        suplenteL1Vigente: suplenteVigente(sub.approver_l1_backup_id, sub.backup_active_from, sub.backup_active_until, hoy),
      },
      historial: [],
    }
    if (!puedeActuar(yo, paso, doc, personas).ok) return []
    return [{
      id:             r.id,
      title:          r.title,
      status:         r.status,
      total_amount:   r.total_amount,
      submitted_at:   r.submitted_at,
      currency:       r.currency,
      submitter_name: sub.full_name,
      approval_level: r.status === 'pending_l2' ? 2 : 1,
    }]
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

  const ctx     = await contextoRendicion(reportId)
  const permiso = permisoEn(ctx, report.status, user.id)

  return {
    ...report,
    submitter_name:    submitter?.full_name    ?? null,
    approver_l1_id:    submitter?.approver_l1_id ?? null,
    approver_l2_id:    submitter?.approver_l2_id ?? null,
    expense_items:     items ?? [],
    permiso,
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

  const ctx = await contextoRendicion(reportId)
  const { paso } = exigirPaso(ctx, ctx.reporte.status, user.id, ['decidir_l1', 'decidir_l2'], 'Esta rendición ya fue decidida')

  // Solo ítems de esta rendición: un id ajeno no se toca
  const ids = decisions.map(d => d.itemId)
  const { data: propios } = await ctx.admin.from('expense_items').select('id').eq('report_id', reportId).in('id', ids)
  if ((propios ?? []).length !== new Set(ids).size) throw new Error('Hay ítems que no pertenecen a esta rendición')

  for (const d of decisions) {
    const { error } = await ctx.admin
      .from('expense_items')
      .update({
        status:           d.action === 'approve' ? 'approved' : 'rejected',
        rejection_reason: d.action === 'reject' ? (d.reason ?? null) : null,
      })
      .eq('id', d.itemId)
    if (error) throw new Error(error.message)
  }

  await cerrarDecision(ctx, user.id, paso, {
    itemsAprobados:  decisions.filter(d => d.action === 'approve').map(d => d.itemId),
    itemsRechazados: decisions.filter(d => d.action === 'reject').map(d => d.itemId),
    notas:           notes?.trim() || null,
  })
}

// Calcula el estado que sigue, lo escribe, deja la entrada en el historial y
// avisa. La usan la decisión ítem por ítem y la aprobación masiva.
async function cerrarDecision(
  ctx: ContextoRendicion,
  actorId: string,
  paso: Paso,
  d: { itemsAprobados: string[]; itemsRechazados: string[]; notas: string | null },
) {
  const { admin, reporte } = ctx
  const nivel = paso === 'decidir_l2' ? 2 : 1

  const { data: items } = await admin
    .from('expense_items')
    .select('status, amount_clp, item_type')
    .eq('report_id', reporte.id)
    .is('deleted_at', null)
  const lista     = items ?? []
  const resultado = computeReportStatus(lista) as ResultadoDecision
  const monto     = computeApprovedAmount(lista)
  const nuevo     = estadoTrasDecisionReporte({ nivel, tieneL2: !!ctx.doc.cadena.l2, resultado, montoAPagar: monto })

  if (nuevo === 'pending_l2') {
    // El N2 revisa desde cero lo que el N1 aprobó; lo que el N1 rechazó sigue rechazado
    const { error } = await admin
      .from('expense_items')
      .update({ status: 'pending', rejection_reason: null })
      .eq('report_id', reporte.id)
      .eq('status', 'approved')
    if (error) throw new Error(error.message)
  }

  const decidida = nuevo !== 'pending_l2'
  const { data: actualizada, error: updateError } = await admin
    .from('expense_reports')
    .update({
      status:          nuevo,
      approved_amount: monto,
      approved_at:     decidida ? new Date().toISOString() : null,
    })
    .eq('id', reporte.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq('status', reporte.status as any)
    .select('id')
  if (updateError || !actualizada?.length) {
    console.error('[approvals] no se pudo cambiar el estado de', reporte.id, updateError)
    throw new Error('No se pudo registrar la decisión. Avisa al administrador.')
  }

  const { error: logError } = await admin.from('expense_report_approvals').insert({
    report_id:      reporte.id,
    approver_id:    actorId,
    level:          nivel,
    action:         resultado,
    items_approved: d.itemsAprobados.length ? d.itemsAprobados : null,
    items_rejected: d.itemsRechazados.length ? d.itemsRechazados : null,
    notes:          d.notas,
  })
  if (logError) throw new Error(logError.message)

  if (nuevo === 'pending_l2') {
    notifyReportApprovers(reporte.id, 'decidir_l2', actorId).catch(() => {})
  } else {
    notifySubmitterOfDecision(reporte.id, resultado).catch(() => {})
    if (nuevo === 'pending_bank_load') notifyReportBankStep(reporte.id, 'cargar_pago', actorId).catch(() => {})
  }

  revalidatePath(`/approvals/${reporte.id}`)
  revalidatePath('/approvals')
  revalidatePath('/banco')
  revalidatePath('/')

  if (decidida) {
    dispatchWebhooks(reporte.org_id, `report.${resultado}` as WebhookEvent, {
      report_id:   reporte.id,
      status:      nuevo,
      approved_by: ctx.personas.find(p => p.id === actorId)?.nombre ?? null,
      approved_at: new Date().toISOString(),
    }).catch(console.error)
  }
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

  /* Si hay análisis guardado, sirve. Punto.
     Antes esto comparaba `ai_analysis_at > updated_at` para decidir si el caché
     estaba fresco, y la condición NUNCA se cumplía: guardar el análisis es un
     UPDATE sobre `expense_reports`, la tabla tiene un trigger `set_updated_at()`
     que corre en cada UPDATE, y por lo tanto la escritura del caché pisaba la
     misma marca contra la que se comparaba. Medido: 0 de 4 análisis guardados
     tenían caché válido. Cada apertura de la pantalla recalculaba lo que ya
     estaba en la base.
     Ahora la frescura la garantiza el trigger `trg_invalidar_analisis_ia`
     (migración 024): si cambia un ítem de la rendición, el análisis se anula en
     la base. Que exista un valor ES la garantía de que está vigente. */
  if (report.ai_analysis) {
    return report.ai_analysis as unknown as AiAnalysis
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

  const ctx = await contextoRendicion(reportId)
  const { paso } = exigirPaso(ctx, ctx.reporte.status, user.id, ['decidir_l1', 'decidir_l2'], 'Esta rendición ya fue decidida')
  const nota = `Aprobación masiva de ${itemIds.length} ítem(s) rutinario(s) vía análisis IA`

  const { error } = await ctx.admin
    .from('expense_items')
    .update({ status: 'approved' })
    .eq('report_id', reportId)
    .in('id', itemIds)
  if (error) throw new Error(error.message)

  const { data: items } = await ctx.admin
    .from('expense_items')
    .select('status, amount_clp, item_type')
    .eq('report_id', reportId)
    .is('deleted_at', null)
  const lista = items ?? []

  if (lista.some(i => i.status === 'pending')) {
    // Quedan ítems por decidir: solo se actualiza el monto parcial
    const { error: e1 } = await ctx.admin
      .from('expense_reports').update({ approved_amount: computeApprovedAmount(lista) }).eq('id', reportId)
    if (e1) throw new Error(e1.message)
    const { error: e2 } = await ctx.admin.from('expense_report_approvals').insert({
      report_id: reportId, approver_id: user.id, level: paso === 'decidir_l2' ? 2 : 1,
      action: 'approved', items_approved: itemIds, notes: nota,
    })
    if (e2) throw new Error(e2.message)
    revalidatePath(`/approvals/${reportId}`)
    return
  }

  await cerrarDecision(ctx, user.id, paso, { itemsAprobados: itemIds, itemsRechazados: [], notas: nota })
}

export async function markReimbursed(reportId: string, paymentReference: string, reimbursedAmount?: number) {
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
      status:             'reimbursed',
      reimbursed_at:      new Date().toISOString(),
      reimbursed_by:      user.id,
      payment_reference:  paymentReference.trim() || null,
      reimbursed_amount:  reimbursedAmount ?? null,
    })
    .eq('id', reportId)
    .in('status', ['approved', 'partially_approved'])

  if (error) throw new Error(error.message)

  revalidatePath('/admin/reports')
  revalidatePath('/')
}

export async function revertReimbursement(reportId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('Solo los administradores pueden revertir reembolsos')
  }

  // Recalcular monto aprobado neto (expense - advance - return) para corregir
  // valores calculados con la fórmula vieja (suma bruta sin distinguir item_type)
  const { data: itemsData } = await supabase
    .from('expense_items')
    .select('status, amount_clp, item_type')
    .eq('report_id', reportId)
    .is('deleted_at', null)

  const netApproved = computeApprovedAmount(itemsData ?? [])

  const { error } = await supabase
    .from('expense_reports')
    .update({
      status:            'approved',
      reimbursed_at:     null,
      reimbursed_by:     null,
      payment_reference: null,
      reimbursed_amount: null,
      approved_amount:   netApproved,
    })
    .eq('id', reportId)
    .eq('status', 'reimbursed')

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
  revalidatePath('/banco')
  revalidatePath('/')
}

// Quien tiene el permiso bancario puede operar su propio reembolso solo si otra
// persona aprobó la rendición (ver puedeOperarPago en lib/bank-helpers).
async function exigirPagoOperable(reportId: string, actorId: string) {
  const admin = await createAdminClient()
  const { data: report } = await admin
    .from('expense_reports').select('submitter_id').eq('id', reportId).single()
  if (!report) throw new Error('Rendición no encontrada')

  const { data: aprobaciones } = await admin
    .from('expense_report_approvals').select('approver_id, action').eq('report_id', reportId)
  const log = (aprobaciones ?? []).map(a => ({ actor_id: a.approver_id, action: a.action }))

  if (!puedeOperarPago(actorId, report.submitter_id, log)) {
    throw new Error('No puedes operar el pago de tu propia rendición: tiene que haberla aprobado otra persona')
  }
}

/** Paso 2: Encargado de carga confirma que cargó la transferencia en el banco */
export async function confirmReportBankLoad(reportId: string, data: {
  paymentReference: string
  transferredAt:    string
}) {
  const { userId } = await requireAdminOrBankPerm('can_load_bank_transfer')
  await exigirPagoOperable(reportId, userId)
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

  notifyReportBankStep(reportId, 'autorizar_pago', userId).catch(() => {})

  revalidatePath('/admin/reports')
  revalidatePath('/banco')
  revalidatePath('/')
}

/** Paso 3: Autorizador bancario confirma → reembolso completado */
export async function authorizeReportBank(reportId: string, paymentReference: string) {
  const { userId } = await requireAdminOrBankPerm('can_authorize_bank_transfer')
  await exigirPagoOperable(reportId, userId)
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
  revalidatePath('/banco')
  revalidatePath('/')
}
