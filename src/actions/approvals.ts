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

  const { data } = await supabase
    .from('expense_reports')
    .select('id, title, status, total_amount, submitted_at, currency')
    .eq('org_id', profile.org_id)
    .in('status', ['submitted', 'pending_l2'])
    .order('submitted_at', { ascending: true })

  return data ?? []
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
    .select('full_name')
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

  return { ...report, submitter_name: submitter?.full_name ?? null, expense_items: items ?? [] }
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
    .select('org_id, can_approve, role')
    .eq('id', user.id)
    .single()

  if (!profile || (!profile.can_approve && profile.role !== 'admin')) {
    throw new Error('Sin permiso para aprobar rendiciones')
  }

  // Update each item status
  for (const decision of decisions) {
    await supabase
      .from('expense_items')
      .update({
        status:           decision.action === 'approve' ? 'approved' : 'rejected',
        rejection_reason: decision.action === 'reject' ? (decision.reason ?? null) : null,
      })
      .eq('id', decision.itemId)
  }

  // Re-fetch all items to compute report status
  const { data: allItems } = await supabase
    .from('expense_items')
    .select('status, amount_clp')
    .eq('report_id', reportId)

  const items = allItems ?? []
  const newStatus   = computeReportStatus(items)
  const approvedAmt = computeApprovedAmount(items)

  const isDecided = newStatus === 'approved' || newStatus === 'partially_approved' || newStatus === 'rejected'

  await supabase
    .from('expense_reports')
    .update({
      status:          newStatus,
      approved_amount: approvedAmt,
      approved_at:     isDecided ? new Date().toISOString() : null,
    })
    .eq('id', reportId)

  // Log approval — append-only table
  const approvedIds = decisions.filter(d => d.action === 'approve').map(d => d.itemId)
  const rejectedIds = decisions.filter(d => d.action === 'reject').map(d => d.itemId)

  const logAction =
    newStatus === 'approved'           ? 'approved'           :
    newStatus === 'rejected'           ? 'rejected'           :
    newStatus === 'partially_approved' ? 'partially_approved' : 'approved'

  await supabase
    .from('expense_report_approvals')
    .insert({
      report_id:      reportId,
      approver_id:    user.id,
      level:          1,
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
