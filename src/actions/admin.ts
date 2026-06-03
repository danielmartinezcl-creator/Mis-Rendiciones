'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Json } from '@/lib/supabase/types'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('org_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('Acceso restringido a administradores')
  }
  return { supabase, userId: user.id, orgId: profile.org_id }
}

// ─── Reportes ───────────────────────────────────────────────────────────────

export async function getAllReports(status?: string) {
  const { supabase, orgId } = await requireAdmin()

  let query = supabase
    .from('expense_reports')
    .select('id, title, status, total_amount, approved_amount, currency, submitted_at, created_at, reimbursed_at, payment_reference, submitter_id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (status) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = query.eq('status', status as any)
  }

  const { data } = await query
  return data ?? []
}

export async function getAdminKpis() {
  const { supabase, orgId } = await requireAdmin()

  const [pending, approved, reimbursed] = await Promise.all([
    supabase
      .from('expense_reports')
      .select('id, total_amount', { count: 'exact' })
      .eq('org_id', orgId)
      .in('status', ['submitted', 'pending_l2']),
    supabase
      .from('expense_reports')
      .select('id, approved_amount', { count: 'exact' })
      .eq('org_id', orgId)
      .in('status', ['approved', 'partially_approved']),
    supabase
      .from('expense_reports')
      .select('id, approved_amount', { count: 'exact' })
      .eq('org_id', orgId)
      .eq('status', 'reimbursed'),
  ])

  const pendingAmount    = (pending.data    ?? []).reduce((s, r) => s + r.total_amount,    0)
  const approvedAmount   = (approved.data   ?? []).reduce((s, r) => s + r.approved_amount, 0)
  const reimbursedAmount = (reimbursed.data ?? []).reduce((s, r) => s + r.approved_amount, 0)

  return {
    pendingCount:    pending.count    ?? 0,
    pendingAmount,
    approvedCount:   approved.count   ?? 0,
    approvedAmount,
    reimbursedCount: reimbursed.count ?? 0,
    reimbursedAmount,
  }
}

// ─── Empleados ───────────────────────────────────────────────────────────────

export async function getOrgEmployees() {
  const { supabase, orgId } = await requireAdmin()

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('org_id', orgId)
    .order('full_name', { ascending: true })

  return data ?? []
}

export async function updateEmployee(
  userId: string,
  updates: {
    role?:       'admin' | 'approver' | 'employee'
    can_submit?: boolean
    can_approve?: boolean
    is_active?:  boolean
    department?: string | null
    bank_account?: string | null
  }
) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/employees')
}

// ─── Categorías ──────────────────────────────────────────────────────────────

export async function getOrgCategories() {
  const { supabase, orgId } = await requireAdmin()

  const { data } = await supabase
    .from('expense_categories')
    .select('*')
    .or(`org_id.eq.${orgId},org_id.is.null`)
    .order('name', { ascending: true })

  return data ?? []
}

export async function addCategory(data: {
  name:  string
  icon?: string
  color?: string
}) {
  const { supabase, orgId } = await requireAdmin()

  const { error } = await supabase
    .from('expense_categories')
    .insert({
      org_id:    orgId,
      name:      data.name.trim(),
      icon:      data.icon  ?? null,
      color:     data.color ?? null,
      is_active: true,
    })

  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

export async function toggleCategoryActive(id: string, isActive: boolean) {
  const { supabase } = await requireAdmin()

  await supabase
    .from('expense_categories')
    .update({ is_active: isActive })
    .eq('id', id)

  revalidatePath('/admin/settings')
}

// ─── Políticas de aprobación ─────────────────────────────────────────────────

export async function getOrgPolicies() {
  const { supabase, orgId } = await requireAdmin()

  const { data } = await supabase
    .from('approval_policies')
    .select('*')
    .eq('org_id', orgId)
    .order('is_default', { ascending: false })

  return data ?? []
}

export async function addPolicy(data: {
  name:      string
  approverIds: string[]
  isDefault?:  boolean
}) {
  const { supabase, orgId } = await requireAdmin()

  const levels: Json = [{ level: 1, approver_ids: data.approverIds }]

  const { error } = await supabase
    .from('approval_policies')
    .insert({
      org_id:     orgId,
      name:       data.name.trim(),
      levels,
      is_default: data.isDefault ?? false,
    })

  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

export async function setDefaultPolicy(policyId: string) {
  const { supabase, orgId } = await requireAdmin()

  // Quitar default de todas
  await supabase
    .from('approval_policies')
    .update({ is_default: false })
    .eq('org_id', orgId)

  // Setear nueva default
  await supabase
    .from('approval_policies')
    .update({ is_default: true })
    .eq('id', policyId)

  revalidatePath('/admin/settings')
}
