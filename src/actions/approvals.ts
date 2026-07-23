'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { computeReportStatus, computeApprovedAmount } from '@/lib/approval-helpers'

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
      submitter:users!submitter_id (approver_l1_id, approver_l2_id, full_name)
    `)
    .eq('org_id', profile.org_id)
    .in('status', ['submitted', 'pending_l2'])
    .is('deleted_at', null)
    .order('submitted_at', { ascending: true })

  const reports = data ?? []

  // Filtrar: solo los reportes donde el usuario actual es el aprobador designado para ese nivel
  return reports.filter(r => {
    const sub = r.submitter as { approver_l1_id: string | null; approver_l2_id: string | null; full_name: string } | null

    if (!sub) {
      // Sin aprobador configurado → visible a todos los can_approve (fallback)
      return profile.can_approve || profile.role === 'admin'
    }

    if (r.status === 'submitted')   return sub.approver_l1_id === user.id
    if (r.status === 'pending_l2')  return sub.approver_l2_id === user.id
    return false
  }).map(r => {
    const sub = r.submitter as { approver_l1_id: string | null; approver_l2_id: string | null; full_name: string } | null
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
