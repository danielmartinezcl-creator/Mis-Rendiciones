'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  resolveApplicablePolicy,
  checkItemLimit,
  checkPeriodLimit,
} from '@/lib/policy-helpers'
import type { PolicyViolation } from '@/lib/policy-helpers'
import type { ExpensePolicy } from '@/lib/supabase/types'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('users').select('org_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin')
    throw new Error('Solo los administradores pueden gestionar políticas')
  return { supabase, user, org_id: profile.org_id }
}

// ─── Consultas ────────────────────────────────────────────────────────────────

export async function getOrgPolicies(): Promise<ExpensePolicy[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()
  if (!profile) return []
  const { data } = await supabase
    .from('expense_policies')
    .select('*')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: true })
  return (data ?? []) as ExpensePolicy[]
}

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface PolicyInput {
  name:                   string
  category_id?:           string | null
  department?:            string | null
  target_user_id?:        string | null
  item_limit?:            number | null
  item_enforcement?:      'warn' | 'require_justification' | 'block' | null
  monthly_limit?:         number | null
  monthly_enforcement?:   'warn' | 'require_justification' | 'block' | null
  quarterly_limit?:       number | null
  quarterly_enforcement?: 'warn' | 'require_justification' | 'block' | null
  annual_limit?:          number | null
  annual_enforcement?:    'warn' | 'require_justification' | 'block' | null
}

export interface PolicyCheckResult {
  violations:               PolicyViolation[]
  hasBlock:                 boolean
  hasJustificationRequired: boolean
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createPolicy(data: PolicyInput): Promise<void> {
  const { supabase, org_id } = await requireAdmin()
  const { error } = await supabase.from('expense_policies').insert({ org_id, ...data })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

export async function updatePolicy(id: string, data: Partial<PolicyInput>): Promise<void> {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('expense_policies').update(data).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

export async function togglePolicyActive(id: string, active: boolean): Promise<void> {
  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('expense_policies').update({ is_active: active }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

export async function deletePolicy(id: string): Promise<void> {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('expense_policies').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

// ─── Verificación de políticas para un ítem ───────────────────────────────────

export async function checkPolicyViolations(params: {
  categoryId: string | null
  amount:     number
  date:       string
}): Promise<PolicyCheckResult> {
  const { categoryId, amount, date } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { violations: [], hasBlock: false, hasJustificationRequired: false }

  const { data: profile } = await supabase
    .from('users').select('org_id, department').eq('id', user.id).single()
  if (!profile) return { violations: [], hasBlock: false, hasJustificationRequired: false }

  const { data: policiesData } = await supabase
    .from('expense_policies')
    .select('*')
    .eq('org_id', profile.org_id)
    .eq('is_active', true)

  const policies = (policiesData ?? []) as ExpensePolicy[]
  const policy = resolveApplicablePolicy(policies, user.id, profile.department, categoryId)
  if (!policy) return { violations: [], hasBlock: false, hasJustificationRequired: false }

  const violations: PolicyViolation[] = []

  // ─── Límite por ítem ───────────────────────────────────────────────────────
  const itemV = checkItemLimit(policy, amount)
  if (itemV) violations.push(itemV)

  // ─── Acumulados en períodos ────────────────────────────────────────────────
  const d        = new Date(date)
  const year     = d.getFullYear()
  const month    = d.getMonth() + 1   // 1-12
  const quarter  = Math.ceil(month / 3)
  const qStartM  = (quarter - 1) * 3 + 1
  const qEndM    = quarter * 3

  const monthStart   = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd     = new Date(year, month, 0).toISOString().split('T')[0]
  const quarterStart = `${year}-${String(qStartM).padStart(2, '0')}-01`
  const quarterEnd   = new Date(year, qEndM, 0).toISOString().split('T')[0]
  const annualStart  = `${year}-01-01`
  const annualEnd    = `${year}-12-31`

  // Rendiciones activas del empleado
  const { data: empReports } = await supabase
    .from('expense_reports')
    .select('id')
    .eq('submitter_id', user.id)
    .in('status', ['submitted', 'pending_l2', 'approved', 'partially_approved', 'reimbursed'])

  const rids = (empReports ?? []).map((r: { id: string }) => r.id)

  let monthlyAcc = 0, quarterlyAcc = 0, annualAcc = 0

  if (rids.length > 0) {
    let q = supabase
      .from('expense_items')
      .select('amount_clp, date')
      .in('report_id', rids)
      .neq('status', 'rejected')
      .gte('date', annualStart)
      .lte('date', annualEnd)

    if (categoryId) q = q.eq('category_id', categoryId)

    const { data: periodItems } = await q
    const items = (periodItems ?? []) as { amount_clp: number; date: string }[]

    monthlyAcc   = items
      .filter(i => i.date >= monthStart && i.date <= monthEnd)
      .reduce((s, i) => s + i.amount_clp, 0)
    quarterlyAcc = items
      .filter(i => i.date >= quarterStart && i.date <= quarterEnd)
      .reduce((s, i) => s + i.amount_clp, 0)
    annualAcc    = items.reduce((s, i) => s + i.amount_clp, 0)
  }

  const monthV = checkPeriodLimit(policy, monthlyAcc, amount, 'monthly')
  if (monthV) violations.push(monthV)
  const quarterV = checkPeriodLimit(policy, quarterlyAcc, amount, 'quarterly')
  if (quarterV) violations.push(quarterV)
  const annualV = checkPeriodLimit(policy, annualAcc, amount, 'annual')
  if (annualV) violations.push(annualV)

  return {
    violations,
    hasBlock:                 violations.some(v => v.enforcement === 'block'),
    hasJustificationRequired: violations.some(v => v.enforcement === 'require_justification'),
  }
}
