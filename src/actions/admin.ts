'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Json } from '@/lib/supabase/types'
import { logAudit } from '@/lib/audit'
import { validateStringLength, validateHexColor } from '@/lib/validators'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('org_id, role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('Acceso restringido a administradores')
  }
  return { supabase, userId: user.id, orgId: profile.org_id, actorName: profile.full_name }
}

// ─── Reportes admin (vista completa) ────────────────────────────────────────

export async function getAdminReports() {
  const { supabase, orgId } = await requireAdmin()

  const { data } = await supabase
    .from('expense_reports')
    .select('id, title, status, total_amount, approved_amount, currency, created_at, submitted_at, approved_at, reimbursed_at, payment_reference, defontana_exported_at, defontana_export_ref, submitter_id, is_historical_import, historical_type, fund_number')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .or('historical_type.neq.caja_chica,historical_type.is.null')
    .order('created_at', { ascending: false })

  if (!data?.length) return []

  const submitterIds = [...new Set(data.map(r => r.submitter_id))]
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, department')
    .in('id', submitterIds)

  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u]))

  return data.map(r => ({
    ...r,
    submitter_name: userMap[r.submitter_id]?.full_name ?? 'Desconocido',
    department:     userMap[r.submitter_id]?.department ?? null,
  }))
}

export async function getReportDetailForAdmin(reportId: string) {
  const { supabase } = await requireAdmin()

  type RawItem = { id: string; category_id: string | null; description: string; amount_clp: number; status: string; rejection_reason: string | null; expense_categories: { name: string } | null }

  const [itemsRes, approvalsRes] = await Promise.all([
    supabase
      .from('expense_items')
      .select('id, category_id, description, amount_clp, status, rejection_reason, expense_categories(name)')
      .eq('report_id', reportId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('expense_report_approvals')
      .select('level, action, notes, created_at, approver_id')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true }),
  ])

  const approvals = approvalsRes.data ?? []
  const approverIds = [...new Set(approvals.map(a => a.approver_id))]
  let approverMap: Record<string, string> = {}

  if (approverIds.length > 0) {
    const { data: approvers } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', approverIds)
    approverMap = Object.fromEntries((approvers ?? []).map(u => [u.id, u.full_name]))
  }

  return {
    items: (itemsRes.data ?? [] as RawItem[]).map(i => {
      const item = i as unknown as RawItem
      return {
        id:               item.id,
        category_id:      item.category_id,
        description:      item.description,
        amount_clp:       item.amount_clp,
        status:           item.status,
        rejection_reason: item.rejection_reason,
        category_name:    item.expense_categories?.name ?? null,
      }
    }),
    approvals: approvals.map(a => ({
      level:          a.level as number,
      action:         a.action,
      approver_name:  approverMap[a.approver_id] ?? 'Desconocido',
      notes:          a.notes,
      created_at:     a.created_at,
    })),
  }
}

// ─── Reportes (legacy simple) ────────────────────────────────────────────────

export async function getAllReports(status?: string) {
  const { supabase, orgId } = await requireAdmin()

  let query = supabase
    .from('expense_reports')
    .select('id, title, status, total_amount, approved_amount, currency, submitted_at, created_at, reimbursed_at, payment_reference, submitter_id')
    .eq('org_id', orgId)
    .is('deleted_at', null)
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

  const [pending, approved, reimbursed, pcPendingApproval, pcFundsSent, pcLiquidationPending, pcSettled] = await Promise.all([
    // Rendiciones pendientes de aprobación
    supabase.from('expense_reports').select('id, total_amount', { count: 'exact' })
      .eq('org_id', orgId).in('status', ['submitted', 'pending_l2']).is('deleted_at', null),
    // Rendiciones aprobadas sin reembolsar (excluye cargas históricas de caja chica — la empresa dio dinero, no el empleado)
    supabase.from('expense_reports').select('id, approved_amount', { count: 'exact' })
      .eq('org_id', orgId).in('status', ['approved', 'partially_approved']).is('deleted_at', null)
      .or('is_historical_import.eq.false,historical_type.eq.rendicion'),
    // Rendiciones reembolsadas
    supabase.from('expense_reports').select('id, approved_amount', { count: 'exact' })
      .eq('org_id', orgId).eq('status', 'reimbursed').is('deleted_at', null),
    // Caja chica: pendiente de aprobación inicial del fondo
    supabase.from('petty_cash_funds').select('id, amount_requested', { count: 'exact' })
      .eq('org_id', orgId).eq('status', 'pending_approval').is('deleted_at', null),
    // Caja chica: fondos enviados (pendiente de rendición por empleado)
    supabase.from('petty_cash_funds').select('id, amount_approved, amount_requested', { count: 'exact' })
      .eq('org_id', orgId).eq('status', 'funds_sent').is('deleted_at', null),
    // Caja chica: liquidación pendiente de aprobación
    supabase.from('petty_cash_funds').select('id, amount_approved', { count: 'exact' })
      .eq('org_id', orgId).in('status', ['submitted', 'pending_liquidation_approval']).is('deleted_at', null),
    // Caja chica: liquidadas (dinero aprobado, esperando transferencia de diferencia)
    supabase.from('petty_cash_funds').select('id, amount_approved', { count: 'exact' })
      .eq('org_id', orgId).eq('status', 'settled').is('deleted_at', null),
  ])

  const pendingAmount    = (pending.data    ?? []).reduce((s, r) => s + r.total_amount,    0)
  const approvedAmount   = (approved.data   ?? []).reduce((s, r) => s + r.approved_amount, 0)
  const reimbursedAmount = (reimbursed.data ?? []).reduce((s, r) => s + r.approved_amount, 0)

  const pcPendingAmount      = (pcPendingApproval.data     ?? []).reduce((s, f) => s + f.amount_requested, 0)
  const pcFundsSentAmount    = (pcFundsSent.data           ?? []).reduce((s, f) => s + (f.amount_approved ?? f.amount_requested), 0)
  const pcLiquidationAmount  = (pcLiquidationPending.data  ?? []).reduce((s, f) => s + (f.amount_approved ?? 0), 0)
  const pcSettledAmount      = (pcSettled.data             ?? []).reduce((s, f) => s + (f.amount_approved ?? 0), 0)

  return {
    // Rendiciones
    pendingCount:    pending.count    ?? 0,
    pendingAmount,
    approvedCount:   approved.count   ?? 0,
    approvedAmount,
    reimbursedCount: reimbursed.count ?? 0,
    reimbursedAmount,
    // Caja chica — para sumar a las tarjetas
    pcPendingCount:   (pcPendingApproval.count ?? 0) + (pcLiquidationPending.count ?? 0),
    pcPendingAmount:  pcPendingAmount + pcLiquidationAmount,
    pcApprovedCount:  pcSettled.count ?? 0,
    pcApprovedAmount: pcSettledAmount,
    // Pendiente de rendición (fondos enviados al empleado, no rendidos aún)
    pendingToRenderCount:  pcFundsSent.count ?? 0,
    pendingToRenderAmount: pcFundsSentAmount,
  }
}

/** Lista detallada de fondos/importaciones pendientes de rendir — para el panel expandible del dashboard */
export async function getPendingToRenderList() {
  const { supabase, orgId } = await requireAdmin()

  const [fundsRes, historicalRes] = await Promise.all([
    supabase
      .from('petty_cash_funds')
      .select('id, name, amount_approved, amount_requested, employee_id, period_start, period_end')
      .eq('org_id', orgId)
      .eq('status', 'funds_sent')
      .or('is_historical_import.is.null,is_historical_import.eq.false')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('expense_reports')
      .select('id, title, submitter_id, approved_at, fund_number')
      .eq('org_id', orgId)
      .eq('is_historical_import', true)
      .is('deleted_at', null),
  ])

  const funds      = fundsRes.data     ?? []
  const historical = historicalRes.data ?? []

  // ── Cajas chicas activas: calcular saldo neto (desembolso − gastos registrados) ──
  // Solo aparecen si el saldo neto > 0 (hay dinero sin justificar).
  // Si cuadran (neto ≤ 0) se excluyen aunque el estado sea funds_sent.
  let activeFundsWithBalance: (typeof funds[number] & { netBalance: number })[] = []
  if (funds.length > 0) {
    const { data: activeItems } = await supabase
      .from('petty_cash_items')
      .select('fund_id, amount_clp')
      .in('fund_id', funds.map(f => f.id))

    const spentByFund = new Map<string, number>()
    for (const item of (activeItems ?? [])) {
      spentByFund.set(item.fund_id, (spentByFund.get(item.fund_id) ?? 0) + item.amount_clp)
    }

    activeFundsWithBalance = funds
      .map(f => ({
        ...f,
        netBalance: (f.amount_approved ?? f.amount_requested ?? 0) - (spentByFund.get(f.id) ?? 0),
      }))
      .filter(f => f.netBalance > 0)
  }

  // ── Históricas: agrupar por fund_number PRIMERO, luego filtrar por neto > 0 ──
  // Un mismo fondo puede tener advance, expense y return en expense_reports separados
  // con el mismo fund_number. Filtrar por report individual causaría falsos positivos.
  const fundGroups = new Map<string, {
    id: string; title: string; submitterId: string; approvedAt: string | null; amount: number
  }>()
  if (historical.length > 0) {
    const { data: items } = await supabase
      .from('expense_items')
      .select('report_id, item_type, amount_clp')
      .in('report_id', historical.map(r => r.id))
      .is('deleted_at', null)

    // Mapa reportId → fundKey para lookup rápido
    const reportToFundKey = new Map<string, string>()
    for (const r of historical) {
      reportToFundKey.set(r.id, r.fund_number ?? r.id)
    }

    // Acumular advance y expense por fundKey (no por reportId)
    const byFundKey = new Map<string, { advance: number; expense: number }>()
    for (const r of historical) {
      const key = r.fund_number ?? r.id
      if (!byFundKey.has(key)) byFundKey.set(key, { advance: 0, expense: 0 })
    }
    for (const item of (items ?? [])) {
      const fundKey = reportToFundKey.get(item.report_id)
      if (!fundKey) continue
      const e = byFundKey.get(fundKey)!
      if (item.item_type === 'advance') e.advance += item.amount_clp
      if (item.item_type === 'expense' || item.item_type === 'return') e.expense += item.amount_clp
    }

    // Construir fundGroups solo para fondos con neto > 0
    const seenKeys = new Set<string>()
    for (const r of historical) {
      const key = r.fund_number ?? r.id
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      const t = byFundKey.get(key)!
      const net = t.advance - t.expense
      if (net <= 0) continue
      fundGroups.set(key, {
        id:          r.id,
        title:       r.fund_number ? `Fondo Nº ${r.fund_number}` : r.title,
        submitterId: r.submitter_id,
        approvedAt:  r.approved_at,
        amount:      net,
      })
    }
  }

  // ── Nombres de empleados ──
  const pendingSubmitterIds = Array.from(fundGroups.values()).map(g => g.submitterId)
  const empIds = [...new Set([
    ...activeFundsWithBalance.map(f => f.employee_id),
    ...pendingSubmitterIds,
  ])]
  const { data: users } = empIds.length
    ? await supabase.from('users').select('id, full_name').in('id', empIds)
    : { data: [] }
  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]))

  return {
    pettyCashFunds: activeFundsWithBalance.map(f => ({
      id:           f.id,
      name:         f.name,
      employeeName: userMap[f.employee_id] ?? 'Desconocido',
      amount:       f.netBalance,   // saldo neto, no el desembolso total
      period_start: f.period_start,
      period_end:   f.period_end,
    })),
    historicalImports: Array.from(fundGroups.values()).map(g => ({
      id:           g.id,
      title:        g.title,
      employeeName: userMap[g.submitterId] ?? 'Desconocido',
      amount:       g.amount,
      date:         g.approvedAt ?? '',
    })),
  }
}

export type PendingToRenderList = Awaited<ReturnType<typeof getPendingToRenderList>>

/** Lista de rendiciones y cajas chicas pendientes de aprobación */
export async function getPendingApprovalList() {
  const { supabase, orgId } = await requireAdmin()

  const [reportsRes, fundsRes] = await Promise.all([
    supabase.from('expense_reports')
      .select('id, title, submitter_id, total_amount, submitted_at, status')
      .eq('org_id', orgId)
      .in('status', ['submitted', 'pending_l2'])
      .is('deleted_at', null)
      .order('submitted_at', { ascending: false }),
    supabase.from('petty_cash_funds')
      .select('id, name, employee_id, amount_requested, amount_approved, status, created_at')
      .eq('org_id', orgId)
      .in('status', ['pending_approval', 'submitted', 'pending_liquidation_approval'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  const reports = reportsRes.data ?? []
  const funds   = fundsRes.data   ?? []
  const empIds  = [...new Set([...reports.map(r => r.submitter_id), ...funds.map(f => f.employee_id)])]
  const { data: users } = empIds.length
    ? await supabase.from('users').select('id, full_name').in('id', empIds)
    : { data: [] }
  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]))

  return {
    reports: reports.map(r => ({
      id: r.id, title: r.title,
      employeeName: userMap[r.submitter_id] ?? 'Desconocido',
      amount: r.total_amount, status: r.status,
      submittedAt: r.submitted_at ?? '',
    })),
    pettyCashFunds: funds.map(f => ({
      id: f.id, name: f.name,
      employeeName: userMap[f.employee_id] ?? 'Desconocido',
      amount: f.amount_approved ?? f.amount_requested, status: f.status,
    })),
  }
}
export type PendingApprovalList = Awaited<ReturnType<typeof getPendingApprovalList>>

/** Lista de rendiciones y cajas chicas aprobadas pendientes de reembolso */
export async function getPendingReimbursementList() {
  const { supabase, orgId } = await requireAdmin()

  const [reportsRes] = await Promise.all([
    supabase.from('expense_reports')
      .select('id, title, submitter_id, approved_amount, approved_at, status')
      .eq('org_id', orgId)
      .in('status', ['approved', 'partially_approved'])
      .is('deleted_at', null)
      // Solo rendiciones donde el empleado gastó de su bolsillo; excluye cajas históricas
      .or('is_historical_import.eq.false,historical_type.eq.rendicion')
      .order('approved_at', { ascending: false }),
  ])

  const reports = reportsRes.data ?? []
  const empIds  = [...new Set(reports.map(r => r.submitter_id))]
  const { data: users } = empIds.length
    ? await supabase.from('users').select('id, full_name').in('id', empIds)
    : { data: [] }
  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]))

  return {
    reports: reports.map(r => ({
      id: r.id, title: r.title,
      employeeName: userMap[r.submitter_id] ?? 'Desconocido',
      amount: r.approved_amount, status: r.status,
      approvedAt: r.approved_at ?? '',
    })),
    pettyCashFunds: [] as { id: string; name: string; employeeName: string; amount: number }[],
  }
}
export type PendingReimbursementList = Awaited<ReturnType<typeof getPendingReimbursementList>>

/** Editar un ítem de una importación histórica (solo admin) */
export async function updateHistoricalExpenseItem(itemId: string, patch: {
  description?: string
  amount_clp?:  number
  date?:        string
  item_type?:   'expense' | 'advance' | 'return' | 'transfer'
  category_id?: string | null
  merchant?:    string | null
}) {
  const { supabase, orgId } = await requireAdmin()

  const { data: item } = await supabase
    .from('expense_items').select('report_id').eq('id', itemId).is('deleted_at', null).single()
  if (!item) throw new Error('Ítem no encontrado')

  const { data: report } = await supabase
    .from('expense_reports').select('org_id, is_historical_import').eq('id', item.report_id).single()
  if (!report || report.org_id !== orgId || !report.is_historical_import)
    throw new Error('Sin permiso para editar este ítem')

  // Usar adminClient para el UPDATE porque RLS bloquea ediciones de ítems
  // cuyo submitter_id no es el usuario actual (el admin edita ítems de empleados)
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('expense_items').update(patch).eq('id', itemId)
  if (error) throw new Error(error.message)

  revalidatePath('/petty-cash')
  revalidatePath('/admin/carga-historica')
}

/** Renombrar una importación histórica (solo admin) */
export async function updateHistoricalImportTitle(reportId: string, title: string): Promise<void> {
  const { supabase, orgId } = await requireAdmin()
  if (!title.trim()) throw new Error('El título no puede estar vacío')

  const { data: report } = await supabase
    .from('expense_reports').select('org_id, is_historical_import').eq('id', reportId).single()
  if (!report || report.org_id !== orgId || !report.is_historical_import)
    throw new Error('Sin permiso para renombrar este registro')

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('expense_reports').update({ title: title.trim() }).eq('id', reportId)
  if (error) throw new Error(error.message)

  revalidatePath('/petty-cash')
  revalidatePath('/admin/carga-historica')
}

// ─── Empleados ───────────────────────────────────────────────────────────────

export async function getOrgEmployees() {
  const { supabase, orgId } = await requireAdmin()

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('full_name', { ascending: true })

  if (!data?.length) return []

  /* Cruzar emails desde auth.users (no están en public.users) */
  const adminClient = createAdminClient()
  const { data: authData } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  const emailMap: Record<string, string> = {}
  for (const u of authData?.users ?? []) {
    if (u.email) emailMap[u.id] = u.email
  }

  return data.map(emp => ({ ...emp, email: emailMap[emp.id] ?? '' }))
}

export async function updateEmployeeEmail(userId: string, newEmail: string) {
  await requireAdmin()
  const adminClient = createAdminClient()

  const { error } = await adminClient.auth.admin.updateUserById(userId, { email: newEmail })
  if (error) throw new Error(error.message)

  revalidatePath('/admin/employees')
  revalidatePath('/admin/settings')
}

export async function resendInvitation(userId: string) {
  await requireAdmin()
  const adminClient = createAdminClient()

  const { data: authUser } = await adminClient.auth.admin.getUserById(userId)
  if (!authUser?.user?.email) throw new Error('No se encontró el correo del empleado')

  const { error } = await adminClient.auth.admin.generateLink({
    type: 'invite',
    email: authUser.user.email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/auth/callback?next=/set-password` },
  })
  if (error) throw new Error(error.message)
}

export async function deactivateEmployee(userId: string) {
  const { supabase } = await requireAdmin()
  await supabase.from('users').update({ is_active: false }).eq('id', userId)
  revalidatePath('/admin/employees')
}

export async function deleteEmployee(userId: string) {
  const { supabase, userId: actorId, orgId, actorName } = await requireAdmin()

  // Capture before state
  const { data: emp } = await supabase
    .from('users')
    .select('full_name, is_active, role')
    .eq('id', userId)
    .single()

  // Soft delete: marca deleted_at, el usuario pierde acceso pero los datos se conservan 90 días
  const { error } = await supabase
    .from('users')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', userId)

  if (error) throw new Error(error.message)

  // Suspender cuenta en auth (no puede iniciar sesión)
  const adminClient = createAdminClient()
  await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876000h' })

  await logAudit({
    orgId,
    actorId,
    actorName,
    action:      'deleted',
    entityType:  'user',
    entityId:    userId,
    entityLabel: emp?.full_name ?? userId,
    oldValue:    { is_active: emp?.is_active, role: emp?.role },
  })

  revalidatePath('/admin/settings')
  revalidatePath('/admin/employees')
  revalidatePath('/admin/trash')
}

export async function deleteEmployees(userIds: string[]): Promise<{ id: string; error?: string }[]> {
  const { supabase } = await requireAdmin()
  const adminClient = createAdminClient()

  const deletedAt = new Date().toISOString()
  const results = await Promise.all(
    userIds.map(async (id) => {
      const { error } = await supabase
        .from('users')
        .update({ deleted_at: deletedAt, is_active: false })
        .eq('id', id)
      if (!error) {
        await adminClient.auth.admin.updateUserById(id, { ban_duration: '876000h' })
      }
      return { id, error: error?.message }
    })
  )

  revalidatePath('/admin/settings')
  revalidatePath('/admin/employees')
  revalidatePath('/admin/trash')
  return results
}

export async function updateEmployee(
  userId: string,
  updates: {
    role?:                       'admin' | 'approver' | 'employee'
    can_submit?:                 boolean
    can_approve?:                boolean
    can_manage_petty_cash?:      boolean
    can_load_bank_transfer?:     boolean
    can_authorize_bank_transfer?: boolean
    is_active?:                  boolean
    full_name?:                  string
    rut?:                        string | null
    department?:                 string | null
    bank_account?:               string | null
    cost_center_id?:             string | null
  }
) {
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()

  // Capture before state
  const { data: before } = await supabase
    .from('users')
    .select('full_name, role, department, cost_center_id, approver_l1_id, approver_l2_id, is_active, can_submit, can_approve, can_manage_petty_cash, can_load_bank_transfer, can_authorize_bank_transfer, rut, bank_account')
    .eq('id', userId)
    .single()

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)

  if (error) throw new Error(error.message)

  await logAudit({
    orgId,
    actorId,
    actorName,
    action:      'updated',
    entityType:  'user',
    entityId:    userId,
    entityLabel: before?.full_name ?? userId,
    oldValue:    before as unknown as Record<string, unknown>,
    newValue:    updates as Record<string, unknown>,
  })

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
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()

  if (!validateStringLength(data.name, 100)) throw new Error('Nombre inválido (1-100 caracteres)')
  if (data.color && !validateHexColor(data.color)) throw new Error('Color inválido — debe ser hex (#RRGGBB)')

  const { data: newCat, error } = await supabase
    .from('expense_categories')
    .insert({
      org_id:    orgId,
      name:      data.name.trim(),
      icon:      data.icon  ?? null,
      color:     data.color ?? null,
      is_active: true,
    })
    .select('id, name')
    .single()

  if (error) throw new Error(error.message)

  await logAudit({
    orgId,
    actorId,
    actorName,
    action:      'created',
    entityType:  'category',
    entityId:    (newCat as unknown as { id: string } | null)?.id ?? 'unknown',
    entityLabel: (newCat as unknown as { name: string } | null)?.name ?? data.name,
    newValue:    { name: data.name, icon: data.icon ?? null, color: data.color ?? null },
  })

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

export async function updateCategory(id: string, data: { name: string; color?: string; icon?: string; monthly_budget_clp?: number | null }) {
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()

  if (!validateStringLength(data.name, 100)) throw new Error('Nombre inválido (1-100 caracteres)')
  if (data.color && !validateHexColor(data.color)) throw new Error('Color inválido — debe ser hex (#RRGGBB)')

  const admin = createAdminClient()

  // Capture before state
  const { data: before } = await supabase
    .from('expense_categories').select('name, color, icon, monthly_budget_clp').eq('id', id).single()

  const { error } = await admin
    .from('expense_categories')
    .update({
      name:               data.name.trim(),
      color:              data.color ?? null,
      icon:               data.icon ?? null,
      monthly_budget_clp: data.monthly_budget_clp ?? null,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)

  await logAudit({
    orgId,
    actorId,
    actorName,
    action:      'updated',
    entityType:  'category',
    entityId:    id,
    entityLabel: before?.name ?? id,
    oldValue:    before as unknown as Record<string, unknown>,
    newValue:    { name: data.name, color: data.color ?? null, icon: data.icon ?? null, monthly_budget_clp: data.monthly_budget_clp ?? null },
  })

  revalidatePath('/admin/settings')
}

export async function deleteCategory(id: string) {
  const { supabase, userId: actorId, orgId, actorName } = await requireAdmin()
  const admin = createAdminClient()

  // Capture before state
  const { data: category } = await supabase
    .from('expense_categories')
    .select('name, org_id')
    .eq('id', id)
    .single()

  const { error } = await admin
    .from('expense_categories')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)

  await logAudit({
    orgId,
    actorId,
    actorName,
    action:      'deleted',
    entityType:  'category',
    entityId:    id,
    entityLabel: category?.name ?? id,
    oldValue:    category as unknown as Record<string, unknown>,
  })

  revalidatePath('/admin/settings')
}

export async function reclassifyExpenseItem(itemId: string, categoryId: string) {
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()

  // Capture before state
  const { data: before } = await supabase
    .from('expense_items').select('category_id, description').eq('id', itemId).single()

  const { error } = await supabase
    .from('expense_items')
    .update({ category_id: categoryId })
    .eq('id', itemId)

  if (error) throw new Error(error.message)

  await logAudit({
    orgId,
    actorId,
    actorName,
    action:      'updated',
    entityType:  'expense_item',
    entityId:    itemId,
    entityLabel: before?.description ?? itemId,
    oldValue:    { category_id: before?.category_id },
    newValue:    { category_id: categoryId },
  })

  revalidatePath('/admin/reports')
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

export async function setEmployeeApprovers(
  userId: string,
  approverL1Id: string | null,
  approverL2Id: string | null
) {
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()

  // Capture before state
  const { data: employee } = await supabase
    .from('users').select('full_name, approver_l1_id, approver_l2_id').eq('id', userId).single()

  // Verificar que los aprobadores pertenezcan a la misma org
  if (approverL1Id) {
    const { data: l1 } = await supabase.from('users').select('org_id').eq('id', approverL1Id).single()
    if (!l1 || l1.org_id !== orgId) throw new Error('Aprobador N1 no pertenece a esta organización')
  }
  if (approverL2Id) {
    const { data: l2 } = await supabase.from('users').select('org_id').eq('id', approverL2Id).single()
    if (!l2 || l2.org_id !== orgId) throw new Error('Aprobador N2 no pertenece a esta organización')
  }

  const { error } = await supabase
    .from('users')
    .update({
      approver_l1_id: approverL1Id,
      approver_l2_id: approverL2Id,
    })
    .eq('id', userId)
    .eq('org_id', orgId)

  if (error) throw new Error(error.message)

  await logAudit({
    orgId,
    actorId,
    actorName,
    action:      'config_changed',
    entityType:  'approver_assignment',
    entityId:    userId,
    entityLabel: employee?.full_name ?? userId,
    oldValue:    { approver_l1_id: employee?.approver_l1_id, approver_l2_id: employee?.approver_l2_id },
    newValue:    { approver_l1_id: approverL1Id, approver_l2_id: approverL2Id },
  })

  revalidatePath('/admin/employees')
}

export async function setEmployeeBackupApprover(
  userId: string,
  backupApproverL1Id: string | null,
  backupActiveFrom: string | null,
  backupActiveUntil: string | null
) {
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()

  // Capture before state
  const { data: employee } = await supabase
    .from('users').select('full_name, approver_l1_backup_id, backup_active_from, backup_active_until').eq('id', userId).single()

  if (backupApproverL1Id) {
    const { data: backup } = await supabase.from('users').select('org_id').eq('id', backupApproverL1Id).single()
    if (!backup || backup.org_id !== orgId) throw new Error('Aprobador suplente no pertenece a esta organización')
  }

  const { error } = await supabase
    .from('users')
    .update({
      approver_l1_backup_id: backupApproverL1Id,
      backup_active_from:    backupActiveFrom,
      backup_active_until:   backupActiveUntil,
    })
    .eq('id', userId)
    .eq('org_id', orgId)

  if (error) throw new Error(error.message)

  await logAudit({
    orgId,
    actorId,
    actorName,
    action:      'config_changed',
    entityType:  'approver_assignment',
    entityId:    userId,
    entityLabel: employee?.full_name ?? userId,
    oldValue:    {
      approver_l1_backup_id: employee?.approver_l1_backup_id,
      backup_active_from:    employee?.backup_active_from,
      backup_active_until:   employee?.backup_active_until,
    },
    newValue:    {
      approver_l1_backup_id: backupApproverL1Id,
      backup_active_from:    backupActiveFrom,
      backup_active_until:   backupActiveUntil,
    },
  })

  revalidatePath('/admin/employees')
}

// ─── Defontana: configuración y datos de export ──────────────────────────────

export async function getDefontanaSettings() {
  const { supabase, orgId } = await requireAdmin()
  const { data } = await supabase
    .from('organizations')
    .select('defontana_contra_account, defontana_voucher_type, defontana_cost_center, defontana_provider_account')
    .eq('id', orgId)
    .single()
  return {
    contraAccount:   data?.defontana_contra_account   ?? '',
    voucherType:     data?.defontana_voucher_type      ?? 'Egreso',
    costCenter:      data?.defontana_cost_center       ?? '',
    providerAccount: data?.defontana_provider_account  ?? '',
  }
}

export async function updateDefontanaSettings(settings: {
  contraAccount:   string
  voucherType:     string
  costCenter:      string | null
  providerAccount: string | null
}) {
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()

  // Capture before state
  const { data: before } = await supabase
    .from('organizations')
    .select('defontana_contra_account, defontana_voucher_type, defontana_cost_center, defontana_provider_account')
    .eq('id', orgId)
    .single()

  const newValues = {
    defontana_contra_account:   settings.contraAccount   || null,
    defontana_voucher_type:     settings.voucherType      || 'Egreso',
    defontana_cost_center:      settings.costCenter       || null,
    defontana_provider_account: settings.providerAccount || null,
  }

  const { error } = await supabase
    .from('organizations')
    .update(newValues)
    .eq('id', orgId)
  if (error) throw new Error(error.message)

  await logAudit({
    orgId,
    actorId,
    actorName,
    action:      'config_changed',
    entityType:  'defontana_settings',
    entityId:    orgId,
    entityLabel: 'Configuración Defontana',
    oldValue:    before as unknown as Record<string, unknown>,
    newValue:    newValues as unknown as Record<string, unknown>,
  })

  revalidatePath('/admin/settings')
}

export async function updateCategoryDefontanaCode(categoryId: string, code: string) {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from('expense_categories')
    .update({ defontana_account_code: code || null })
    .eq('id', categoryId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

export async function getDefontanaExportData(filters: {
  dateFrom?:   string
  dateTo?:     string
  reportIds?:  string[]
}) {
  const { supabase, orgId } = await requireAdmin()

  // Settings + supplier map en paralelo
  const [orgRes, suppliersRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('defontana_contra_account, defontana_voucher_type, defontana_cost_center, defontana_provider_account')
      .eq('id', orgId)
      .single(),
    supabase
      .from('defontana_suppliers')
      .select('merchant_name, defontana_account_code')
      .eq('org_id', orgId),
  ])

  const orgData = orgRes.data
  const supplierMap: Record<string, string> = {}
  for (const s of suppliersRes.data ?? []) {
    supplierMap[s.merchant_name.toLowerCase()] = s.defontana_account_code
  }

  // Rendiciones aprobadas / reembolsadas (excluye papelera)
  let query = supabase
    .from('expense_reports')
    .select('id, title, approved_at, reimbursed_at, submitter_id, defontana_exported_at, defontana_export_ref')
    .eq('org_id', orgId)
    .in('status', ['approved', 'partially_approved', 'reimbursed'])
    .is('deleted_at', null)
    .order('approved_at', { ascending: true })

  if (filters.dateFrom)         query = query.gte('approved_at', filters.dateFrom)
  if (filters.dateTo)           query = query.lte('approved_at', filters.dateTo + 'T23:59:59')
  if (filters.reportIds?.length) query = query.in('id', filters.reportIds)

  const { data: reports } = await query
  if (!reports?.length) return { reports: [], settings: null, exportedReportIds: [] }

  const exportedReportIds = reports
    .filter(r => r.defontana_exported_at != null)
    .map(r => r.id)

  // Submitters con cost_center_id
  const submitterIds = [...new Set(reports.map(r => r.submitter_id))]
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, cost_center_id, rut')
    .in('id', submitterIds)

  const userMap = Object.fromEntries(
    (users ?? []).map(u => [u.id, { name: u.full_name, costCenter: u.cost_center_id, rut: u.rut }])
  )

  // Ítems aprobados con todos los campos nuevos
  const { data: rawItems } = await supabase
    .from('expense_items')
    .select('report_id, description, amount_clp, date, merchant, doc_type, doc_number, cost_center_id, supplier_rut, expense_categories(name, defontana_account_code)')
    .in('report_id', reports.map(r => r.id))
    .eq('status', 'approved')
    .is('deleted_at', null)

  type RawItem = {
    report_id:       string
    description:     string
    amount_clp:      number
    date:            string | null
    merchant:        string | null
    doc_type:        string | null
    doc_number:      string | null
    cost_center_id:  string | null
    supplier_rut:    string | null
    expense_categories: { name: string; defontana_account_code: string | null } | null
  }

  const items = (rawItems ?? []) as unknown as RawItem[]

  const itemsByReport: Record<string, RawItem[]> = {}
  for (const item of items) {
    if (!itemsByReport[item.report_id]) itemsByReport[item.report_id] = []
    itemsByReport[item.report_id].push(item)
  }

  const exportReports = reports.map(r => {
    const submitter = userMap[r.submitter_id]

    // Fecha = fecha del ítem más antiguo del reporte (o approved_at como fallback)
    const reportItems = itemsByReport[r.id] ?? []

    const itemDates = reportItems.map(i => i.date).filter(Boolean).sort() as string[]
    const reportDate = itemDates[0] ?? (r.reimbursed_at ?? r.approved_at ?? '').split('T')[0]

    const mappedItems = reportItems.map(i => {
      const rawCat = i.expense_categories
      const merchantKey = (i.merchant ?? '').toLowerCase()
      return {
        description:            i.description,
        amount_clp:             i.amount_clp,
        category_name:          rawCat?.name ?? null,
        defontana_account_code: rawCat?.defontana_account_code ?? null,
        supplier_account_code:  merchantKey ? (supplierMap[merchantKey] ?? null) : null,
        doc_type:               i.doc_type,
        doc_number:             i.doc_number,
        cost_center_id:         i.cost_center_id,
        supplier_rut:           i.supplier_rut,
        merchant:               i.merchant,
      }
    })

    return {
      reportId:             r.id,
      reportTitle:          r.title,
      date:                 reportDate,
      employeeName:         submitter?.name ?? 'Desconocido',
      employeeRut:          submitter?.rut ?? null,
      employeeCostCenterId: submitter?.costCenter ?? null,
      items:                mappedItems,
    }
  })

  return {
    reports: exportReports,
    exportedReportIds,
    settings: {
      contraAccount:   orgData?.defontana_contra_account   ?? '',
      voucherType:     orgData?.defontana_voucher_type      ?? 'Egreso',
      costCenter:      orgData?.defontana_cost_center       ?? null,
      providerAccount: orgData?.defontana_provider_account  ?? null,
    },
  }
}

// ─── Límites de gasto ────────────────────────────────────────────────────────

export async function getSpendingLimits() {
  const { supabase, orgId } = await requireAdmin()
  const { data } = await supabase
    .from('organizations')
    .select('max_item_amount_clp, max_fund_amount_clp')
    .eq('id', orgId)
    .single()
  return {
    maxItemAmount: data?.max_item_amount_clp ?? null,
    maxFundAmount: data?.max_fund_amount_clp ?? null,
  }
}

export async function updateSpendingLimits(limits: {
  maxItemAmount: number | null
  maxFundAmount: number | null
}) {
  const { supabase, orgId } = await requireAdmin()
  const { error } = await supabase
    .from('organizations')
    .update({
      max_item_amount_clp: limits.maxItemAmount,
      max_fund_amount_clp: limits.maxFundAmount,
    })
    .eq('id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

// ─── Centros de costo ────────────────────────────────────────────────────────

export async function getCostCenters() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data } = await supabase
    .from('cost_centers')
    .select('*')
    .eq('activo', true)
    .order('descripcion')
  return data ?? []
}

// ─── Defontana: proveedores ───────────────────────────────────────────────────

export async function getDefontanaSuppliers() {
  const { supabase, orgId } = await requireAdmin()
  const { data } = await supabase
    .from('defontana_suppliers')
    .select('*')
    .eq('org_id', orgId)
    .order('merchant_name')
  return data ?? []
}

export async function addDefontanaSupplier(merchant: string, accountCode: string) {
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()
  const { data: newSupplier, error } = await supabase
    .from('defontana_suppliers')
    .insert({ org_id: orgId, merchant_name: merchant.trim(), defontana_account_code: accountCode.trim() })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  await logAudit({
    orgId,
    actorId,
    actorName,
    action:      'created',
    entityType:  'defontana_supplier',
    entityId:    (newSupplier as unknown as { id: string } | null)?.id ?? 'unknown',
    entityLabel: merchant.trim(),
    newValue:    { merchant_name: merchant.trim(), defontana_account_code: accountCode.trim() },
  })

  revalidatePath('/admin/settings')
}

export async function deleteDefontanaSupplier(id: string) {
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()

  // Capture before state
  const { data: before } = await supabase
    .from('defontana_suppliers').select('merchant_name, defontana_account_code').eq('id', id).single()

  const { error } = await supabase.from('defontana_suppliers').delete().eq('id', id)
  if (error) throw new Error(error.message)

  await logAudit({
    orgId,
    actorId,
    actorName,
    action:      'deleted',
    entityType:  'defontana_supplier',
    entityId:    id,
    entityLabel: before?.merchant_name ?? id,
    oldValue:    before as unknown as Record<string, unknown>,
  })

  revalidatePath('/admin/settings')
}

// ─── Lock de exportación Defontana ───────────────────────────────────────────

export async function markDefontanaExported(reportIds: string[], exportRef: string) {
  const { supabase, orgId } = await requireAdmin()
  const { error } = await supabase
    .from('expense_reports')
    .update({
      defontana_exported_at: new Date().toISOString(),
      defontana_export_ref:  exportRef,
    })
    .in('id', reportIds)
    .eq('org_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reports')
}

// ─── Corrección masiva de centro de costo ────────────────────────────────────

export async function bulkUpdateExpenseItemsCostCenter(reportId: string, costCenterId: string | null) {
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()

  // Count items to be updated
  const { count } = await supabase
    .from('expense_items')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', reportId)

  const { error } = await supabase
    .from('expense_items')
    .update({ cost_center_id: costCenterId })
    .eq('report_id', reportId)
  if (error) throw new Error(error.message)

  await logAudit({
    orgId,
    actorId,
    actorName,
    action:      'bulk_updated',
    entityType:  'cost_center_assignment',
    entityId:    reportId,
    entityLabel: `Reporte ${reportId}`,
    newValue:    { cost_center_id: costCenterId, items_count: count ?? 0 },
    notes:       `Reasignación masiva de CC a ${costCenterId ?? 'ninguno'}`,
  })

  revalidatePath('/admin/reports')
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

// ─── Papelera de reciclaje ───────────────────────────────────────────────────

export async function getTrashItems() {
  const { supabase, orgId } = await requireAdmin()

  const [reportsRes, fundsRes, usersRes] = await Promise.all([
    supabase
      .from('expense_reports')
      .select('id, title, status, total_amount, currency, deleted_at, submitter_id')
      .eq('org_id', orgId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
    supabase
      .from('petty_cash_funds')
      .select('id, name, status, amount_requested, currency, deleted_at, employee_id')
      .eq('org_id', orgId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
    supabase
      .from('users')
      .select('id, full_name, role, department, deleted_at')
      .eq('org_id', orgId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
  ])

  const allUserIds = [
    ...(reportsRes.data ?? []).map(r => r.submitter_id),
    ...(fundsRes.data ?? []).map(f => f.employee_id),
  ]
  const uniqueIds = [...new Set(allUserIds)]
  let nameMap: Record<string, string> = {}
  if (uniqueIds.length > 0) {
    const { data: names } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', uniqueIds)
    nameMap = Object.fromEntries((names ?? []).map(u => [u.id, u.full_name]))
  }

  return {
    reports: (reportsRes.data ?? []).map(r => ({
      ...r,
      submitter_name: nameMap[r.submitter_id] ?? 'Desconocido',
    })),
    funds:   (fundsRes.data ?? []).map(f => ({
      ...f,
      employee_name: nameMap[f.employee_id] ?? 'Desconocido',
    })),
    users:   usersRes.data ?? [],
  }
}

export async function restoreFromTrash(type: 'report' | 'fund' | 'user', id: string) {
  const { supabase, userId: actorId, orgId, actorName } = await requireAdmin()

  if (type === 'report') {
    const { data: before } = await supabase
      .from('expense_reports').select('title').eq('id', id).single()
    const { error } = await supabase
      .from('expense_reports')
      .update({ deleted_at: null })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await logAudit({
      orgId, actorId, actorName,
      action: 'restored', entityType: 'expense_report', entityId: id,
      entityLabel: before?.title ?? id,
    })
    revalidatePath('/admin/reports')
  } else if (type === 'fund') {
    const { data: before } = await supabase
      .from('petty_cash_funds').select('name').eq('id', id).single()
    const { error } = await supabase
      .from('petty_cash_funds')
      .update({ deleted_at: null })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await logAudit({
      orgId, actorId, actorName,
      action: 'restored', entityType: 'petty_cash_fund', entityId: id,
      entityLabel: before?.name ?? id,
    })
    revalidatePath('/petty-cash')
  } else if (type === 'user') {
    const { data: before } = await supabase
      .from('users').select('full_name').eq('id', id).single()
    const { error } = await supabase
      .from('users')
      .update({ deleted_at: null, is_active: true })
      .eq('id', id)
    if (error) throw new Error(error.message)
    // Desbanear en auth
    const adminClient = createAdminClient()
    await adminClient.auth.admin.updateUserById(id, { ban_duration: 'none' })
    await logAudit({
      orgId, actorId, actorName,
      action: 'restored', entityType: 'user', entityId: id,
      entityLabel: before?.full_name ?? id,
    })
    revalidatePath('/admin/employees')
    revalidatePath('/admin/settings')
  }
  revalidatePath('/admin/trash')
}

export async function permanentlyDeleteFromTrash(type: 'report' | 'fund' | 'user', id: string) {
  const { supabase, userId: actorId, orgId, actorName } = await requireAdmin()
  const adminClient = createAdminClient()

  if (type === 'report') {
    const { data: before } = await supabase
      .from('expense_reports').select('title').eq('id', id).single()
    const { error } = await adminClient
      .from('expense_reports')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
    await logAudit({
      orgId, actorId, actorName,
      action: 'permanently_deleted', entityType: 'expense_report', entityId: id,
      entityLabel: before?.title ?? id,
      notes: 'Eliminación definitiva desde papelera',
    })
  } else if (type === 'fund') {
    const { data: before } = await supabase
      .from('petty_cash_funds').select('name').eq('id', id).single()
    const { error } = await adminClient
      .from('petty_cash_funds')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
    await logAudit({
      orgId, actorId, actorName,
      action: 'permanently_deleted', entityType: 'petty_cash_fund', entityId: id,
      entityLabel: before?.name ?? id,
      notes: 'Eliminación definitiva desde papelera',
    })
  } else if (type === 'user') {
    const { data: before } = await supabase
      .from('users').select('full_name').eq('id', id).single()
    const { error } = await adminClient.auth.admin.deleteUser(id)
    if (error) throw new Error(error.message)
    await logAudit({
      orgId, actorId, actorName,
      action: 'permanently_deleted', entityType: 'user', entityId: id,
      entityLabel: before?.full_name ?? id,
      notes: 'Eliminación definitiva desde papelera',
    })
  }

  revalidatePath('/admin/trash')
}

/** Genera URLs firmadas (5 min) para los adjuntos de una rendición — para ZIP cliente. */
export async function getReportAttachmentUrls(reportId: string): Promise<
  { filename: string; url: string }[]
> {
  const { supabase } = await requireAdmin()

  const { data: rawItems } = await supabase
    .from('expense_items')
    .select(`id, description, merchant, date, attachments (id, storage_path, file_type)`)
    .eq('report_id', reportId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (!rawItems?.length) return []

  const result: { filename: string; url: string }[] = []

  for (const raw of rawItems) {
    const item = raw as unknown as {
      id: string; description: string; merchant: string | null; date: string | null
      attachments: { id: string; storage_path: string; file_type: string }[]
    }
    for (const att of item.attachments ?? []) {
      const { data: signed } = await supabase.storage
        .from('expense-attachments')
        .createSignedUrl(att.storage_path, 300)
      if (!signed?.signedUrl) continue

      const ext  = att.file_type === 'pdf' ? 'pdf' : 'jpg'
      const safe = (item.merchant || item.description || 'item')
        .replace(/[^a-zA-Z0-9À-ɏ -]/g, '_')
        .slice(0, 30)
        .trim()
      result.push({ filename: `${item.date ?? 'sin-fecha'}_${safe}.${ext}`, url: signed.signedUrl })
    }
  }

  return result
}

/** Cambia el módulo de una importación histórica entre 'rendicion' y 'caja_chica'.
 *  Solo aplica a registros con is_historical_import = true. */
export async function changeHistoricalImportType(
  reportId: string,
  newType: 'rendicion' | 'caja_chica',
): Promise<void> {
  const { supabase } = await requireAdmin()

  const { data: report } = await supabase
    .from('expense_reports')
    .select('is_historical_import')
    .eq('id', reportId)
    .single()

  if (!report?.is_historical_import) {
    throw new Error('Solo se pueden reclasificar importaciones históricas')
  }

  const { error } = await supabase
    .from('expense_reports')
    .update({ historical_type: newType })
    .eq('id', reportId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin/reports')
  revalidatePath('/petty-cash')
}

// ─── Dashboard de saldos de caja chica activos (R16) ────────────────────────

export type ActiveFundSummary = {
  id: string
  name: string
  employeeName: string
  department: string | null
  status: string
  advance: number
  expense: number
  balance: number
  balancePct: number
  daysSinceActivity: number
  period_end: string
}

export async function getActiveFundsSummary(): Promise<ActiveFundSummary[]> {
  const { supabase, orgId } = await requireAdmin()

  // petty_cash_items NO tiene item_type — el adelanto está en amount_approved del fondo
  const { data: funds, error } = await supabase
    .from('petty_cash_funds')
    .select(`
      id, name, employee_id, amount_approved, status, updated_at, period_end,
      users:employee_id (full_name, department),
      petty_cash_items (amount_clp, status)
    `)
    .eq('org_id', orgId)
    .in('status', ['funds_sent', 'submitted', 'pending_liquidation_approval'])
    .not('is_historical_import', 'eq', true)
    .is('deleted_at', null)
    .order('updated_at', { ascending: true })

  if (error) throw new Error(error.message)

  type RawFund = {
    id: string; name: string; status: string; updated_at: string; period_end: string
    amount_approved: number | null
    users: { full_name: string; department: string | null } | null
    petty_cash_items: { amount_clp: number; status: string }[]
  }

  return ((funds ?? []) as unknown as RawFund[]).map(f => {
    const advance  = f.amount_approved ?? 0
    const expense  = (f.petty_cash_items ?? [])
      .filter(i => i.status !== 'rejected')
      .reduce((s, i) => s + i.amount_clp, 0)
    const balance  = advance - expense
    const days     = Math.floor((Date.now() - new Date(f.updated_at).getTime()) / 86_400_000)

    return {
      id:                 f.id,
      name:               f.name,
      employeeName:       f.users?.full_name ?? 'Desconocido',
      department:         f.users?.department ?? null,
      status:             f.status,
      advance,
      expense,
      balance,
      balancePct:         advance > 0 ? Math.round((balance / advance) * 100) : 0,
      daysSinceActivity:  days,
      period_end:         f.period_end,
    }
  })
}

// ─── Análisis por centro de costo (R19) ─────────────────────────────────────

export type CenterExpenseRow = {
  cost_center_id:    string | null
  cost_center_name:  string | null
  month:             string           // YYYY-MM
  category_id:       string | null
  category_name:     string | null
  monthly_budget_clp: number | null
  total_clp:         number
}

export async function getExpensesByCenter(monthsBack = 6): Promise<{
  rows:   CenterExpenseRow[]
  months: string[]
}> {
  const { supabase, orgId } = await requireAdmin()

  // Rango: primer día del mes (monthsBack - 1) meses atrás
  const now      = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1)
  const dateFrom = fromDate.toISOString().split('T')[0]

  // Array de meses YYYY-MM (más antiguo primero)
  const months: string[] = []
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // expense_items aprobados de rendiciones aprobadas/reembolsadas
  // Excluye adelantos/devoluciones/traspasos (no son gastos reales)
  const { data: rawItems, error } = await supabase
    .from('expense_items')
    .select(`
      amount_clp, date, cost_center_id, category_id, item_type,
      expense_categories (name, monthly_budget_clp),
      cost_centers:cost_center_id (descripcion),
      expense_reports!inner (org_id, status, deleted_at, submitter_id)
    `)
    .eq('expense_reports.org_id', orgId)
    .in('expense_reports.status', ['approved', 'partially_approved', 'reimbursed'])
    .eq('status', 'approved')
    .gte('date', dateFrom)
    .is('expense_reports.deleted_at', null)
    .is('deleted_at', null)

  if (error) throw new Error(error.message)

  type RawReport = { org_id: string; status: string; deleted_at: string | null; submitter_id: string }
  type Raw = {
    amount_clp: number
    date: string
    cost_center_id: string | null
    category_id: string | null
    item_type: string | null
    expense_categories: { name: string; monthly_budget_clp: number | null } | null
    cost_centers: { descripcion: string } | null
    expense_reports: RawReport
  }

  const items = (rawItems ?? []) as unknown as Raw[]

  // Cargar CC de los submitters para cascada: ítem sin CC → CC del empleado
  const submitterIds = [...new Set(items.map(i => i.expense_reports?.submitter_id).filter(Boolean))]
  const userCcMap = new Map<string, { cc_id: string | null; cc_name: string | null }>()
  if (submitterIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, cost_center_id, cost_centers:cost_center_id (descripcion)')
      .in('id', submitterIds)
    type RawUser = { id: string; cost_center_id: string | null; cost_centers: { descripcion: string } | null }
    for (const u of (users ?? []) as unknown as RawUser[]) {
      userCcMap.set(u.id, {
        cc_id:   u.cost_center_id ?? null,
        cc_name: u.cost_centers?.descripcion ?? null,
      })
    }
  }

  const aggMap = new Map<string, CenterExpenseRow>()

  for (const item of items) {
    // Excluir adelantos, devoluciones y traspasos — no son gastos
    if (item.item_type && item.item_type !== 'expense') continue

    const month = item.date.slice(0, 7)
    if (!months.includes(month)) continue

    // Cascada: CC del ítem → CC del empleado → null
    const submitterId = item.expense_reports?.submitter_id
    const empCc       = submitterId ? userCcMap.get(submitterId) : null
    const ccId   = item.cost_center_id ?? empCc?.cc_id ?? null
    const ccName = item.cost_center_id
      ? (item.cost_centers as unknown as { descripcion: string } | null)?.descripcion ?? null
      : empCc?.cc_name ?? null

    const key = `${ccId}|${month}|${item.category_id}`
    if (!aggMap.has(key)) {
      aggMap.set(key, {
        cost_center_id:    ccId,
        cost_center_name:  ccName,
        month,
        category_id:        item.category_id,
        category_name:      item.expense_categories?.name ?? null,
        monthly_budget_clp: item.expense_categories?.monthly_budget_clp ?? null,
        total_clp:          0,
      })
    }
    aggMap.get(key)!.total_clp += item.amount_clp
  }

  return { rows: Array.from(aggMap.values()), months }
}

// ─── Ítems de gasto sin centro de costo (para corrección manual) ─────────────

export type ItemWithoutCC = {
  id: string
  description: string
  merchant: string | null
  date: string
  amount_clp: number
  category_name: string | null
  report_id: string
  report_title: string
  employee_name: string
  employee_cc_id: string | null
}

export async function getItemsWithoutCC(): Promise<ItemWithoutCC[]> {
  const { supabase, orgId } = await requireAdmin()

  const { data, error } = await supabase
    .from('expense_items')
    .select(`
      id, description, merchant, date, amount_clp, category_id, item_type,
      expense_categories (name),
      expense_reports!inner (id, title, org_id, status, deleted_at, submitter_id)
    `)
    .eq('expense_reports.org_id', orgId)
    .in('expense_reports.status', ['approved', 'partially_approved', 'reimbursed'])
    .eq('status', 'approved')
    .is('cost_center_id', null)
    .is('expense_reports.deleted_at', null)
    .is('deleted_at', null)
    .order('date', { ascending: false })

  if (error) throw new Error(error.message)

  type RawItem = {
    id: string; description: string; merchant: string | null; date: string
    amount_clp: number; category_id: string | null; item_type: string | null
    expense_categories: { name: string } | null
    expense_reports: { id: string; title: string; submitter_id: string }
  }

  const items = (data ?? []) as unknown as RawItem[]

  // Excluir adelantos/devoluciones/traspasos
  const realExpenses = items.filter(i => !i.item_type || i.item_type === 'expense')
  if (realExpenses.length === 0) return []

  // Cargar CC de los submitters
  const submitterIds = [...new Set(realExpenses.map(i => i.expense_reports?.submitter_id).filter(Boolean))]
  const userMap = new Map<string, { cc_id: string | null; full_name: string }>()
  if (submitterIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, cost_center_id')
      .in('id', submitterIds)
    for (const u of users ?? []) userMap.set(u.id, { cc_id: u.cost_center_id ?? null, full_name: u.full_name })
  }

  return realExpenses
    .filter(i => {
      // Solo devolver ítems donde la cascada TAMBIÉN es null (ningún CC disponible)
      const empCcId = userMap.get(i.expense_reports?.submitter_id)?.cc_id ?? null
      return empCcId === null
    })
    .map(i => {
      const emp = userMap.get(i.expense_reports?.submitter_id)
      return {
        id:            i.id,
        description:   i.description,
        merchant:      i.merchant,
        date:          i.date,
        amount_clp:    i.amount_clp,
        category_name: i.expense_categories?.name ?? null,
        report_id:     i.expense_reports?.id,
        report_title:  i.expense_reports?.title,
        employee_name: emp?.full_name ?? 'Desconocido',
        employee_cc_id: null,
      }
    })
}

export async function updateExpenseItemCostCenter(itemId: string, costCenterId: string | null) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('expense_items')
    .update({ cost_center_id: costCenterId })
    .eq('id', itemId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/analisis')
}

/** Retorna las importaciones históricas de Caja Chica (expense_reports con historical_type='caja_chica').
 *  Se usa en el módulo /petty-cash para mostrar históricas separadas de los fondos activos. */
export async function getHistoricalCajaChicaImports() {
  const { supabase, orgId } = await requireAdmin()

  const { data } = await supabase
    .from('expense_reports')
    .select(`
      id, title, total_amount, approved_at, fund_number, submitter_id, created_at,
      defontana_exported_at, defontana_export_ref,
      expense_items(id, item_type, amount_clp, description, date, doc_type, doc_number, merchant, category_id, supplier_rut, defontana_exported_at, transfer_id)
    `)
    .eq('org_id', orgId)
    .eq('is_historical_import', true)
    .eq('historical_type', 'caja_chica')
    .is('deleted_at', null)
    .order('approved_at', { ascending: true })

  if (!data?.length) return []

  const reportIds   = data.map(r => r.id)
  const submitterIds = [...new Set(data.map(r => r.submitter_id))]

  // Consultas paralelas: usuarios + fund_transfers (payer y receiver)
  const [{ data: users }, { data: ftPayer }, { data: ftReceiver }] = await Promise.all([
    supabase.from('users').select('id, full_name').in('id', submitterIds),
    supabase.from('fund_transfers').select('id, amount, payer_report_id').in('payer_report_id', reportIds),
    supabase.from('fund_transfers').select('id, amount, receiver_report_id').in('receiver_report_id', reportIds),
  ])

  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]))

  // Totales de traspasos por report
  const transferOutMap: Record<string, number> = {}
  const transferInMap:  Record<string, number> = {}
  for (const ft of ftPayer  ?? []) { const rid = ft.payer_report_id;    if (rid) transferOutMap[rid] = (transferOutMap[rid] ?? 0) + ft.amount }
  for (const ft of ftReceiver ?? []) { const rid = ft.receiver_report_id; if (rid) transferInMap[rid]  = (transferInMap[rid]  ?? 0) + ft.amount }

  return data.map(r => {
    type RawItem = {
      id: string; item_type: string; amount_clp: number; description: string; date: string
      doc_type: string | null; doc_number: string | null; merchant: string | null
      category_id: string | null; supplier_rut: string | null
      defontana_exported_at: string | null; transfer_id: string | null
    }
    const items = (r.expense_items ?? []) as unknown as RawItem[]
    const advance_total      = items.filter(i => i.item_type === 'advance' ).reduce((s, i) => s + i.amount_clp, 0)
    const expense_total      = items.filter(i => i.item_type === 'expense' ).reduce((s, i) => s + i.amount_clp, 0)
    const return_total       = items.filter(i => i.item_type === 'return'  ).reduce((s, i) => s + i.amount_clp, 0)
    const transfer_out_total = transferOutMap[r.id] ?? 0
    const transfer_in_total  = transferInMap[r.id]  ?? 0
    return {
      id:                     r.id,
      title:                  r.title,
      total_amount:           r.total_amount,
      approved_at:            r.approved_at,
      fund_number:            r.fund_number,
      submitter_id:           r.submitter_id,
      created_at:             r.created_at,
      defontana_exported_at:  r.defontana_exported_at,
      defontana_export_ref:   r.defontana_export_ref,
      submitter_name:         userMap[r.submitter_id] ?? 'Desconocido',
      items,
      advance_total,
      expense_total,
      return_total,
      transfer_out_total,
      transfer_in_total,
    }
  })
}

/** Marca una importación histórica (caja chica o rendición) como contabilizada en Defontana */
export async function markHistoricalImportDefontana(
  reportId: string,
  exportRef: string,
): Promise<void> {
  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('expense_reports')
    .update({
      defontana_exported_at: new Date().toISOString(),
      defontana_export_ref:  exportRef || null,
    })
    .eq('id', reportId)
  if (error) throw new Error(error.message)
  revalidatePath('/petty-cash')
  revalidatePath('/admin/reports')
}

// ─── Export Defontana por tipo de ítem (caja chica histórica) ────────────────

export async function getHistoricalFundDefontanaData(
  reportId:  string,
  itemTypes: ('expense' | 'advance' | 'return')[],
) {
  const { supabase, orgId } = await requireAdmin()

  const [reportRes, orgRes, suppliersRes] = await Promise.all([
    supabase
      .from('expense_reports')
      .select('id, title, approved_at, submitter_id')
      .eq('id', reportId)
      .single(),
    supabase
      .from('organizations')
      .select('defontana_contra_account, defontana_voucher_type, defontana_cost_center, defontana_provider_account')
      .eq('id', orgId)
      .single(),
    supabase
      .from('defontana_suppliers')
      .select('merchant_name, defontana_account_code')
      .eq('org_id', orgId),
  ])

  const report = reportRes.data
  if (!report) throw new Error('Reporte no encontrado')

  const supplierMap: Record<string, string> = {}
  for (const s of suppliersRes.data ?? []) {
    supplierMap[s.merchant_name.toLowerCase()] = s.defontana_account_code
  }

  const { data: empUser } = await supabase
    .from('users')
    .select('full_name, rut, cost_center_id')
    .eq('id', report.submitter_id)
    .single()

  // Ítems de los tipos seleccionados que NO han sido exportados todavía
  const { data: rawItems } = await supabase
    .from('expense_items')
    .select('id, description, amount_clp, date, merchant, doc_type, doc_number, supplier_rut, expense_categories(name, defontana_account_code)')
    .eq('report_id', reportId)
    .in('item_type', itemTypes)
    .is('defontana_exported_at', null)
    .is('deleted_at', null)

  type RawItem = {
    id: string
    description: string
    amount_clp: number
    date: string | null
    merchant: string | null
    doc_type: string | null
    doc_number: string | null
    supplier_rut: string | null
    expense_categories: { name: string; defontana_account_code: string | null } | null
  }

  const items = (rawItems ?? []) as unknown as RawItem[]
  const itemIds = items.map(i => i.id)

  const dates = items.map(i => i.date).filter(Boolean).sort() as string[]
  const reportDate = dates[0] ?? (report.approved_at ?? '').split('T')[0]

  const mappedItems = items.map(i => {
    const cat = i.expense_categories
    const merchantKey = (i.merchant ?? '').toLowerCase()
    return {
      description:            i.description,
      amount_clp:             i.amount_clp,
      category_name:          cat?.name ?? null,
      defontana_account_code: cat?.defontana_account_code ?? null,
      supplier_account_code:  merchantKey ? (supplierMap[merchantKey] ?? null) : null,
      doc_type:               i.doc_type,
      doc_number:             i.doc_number,
      cost_center_id:         null as string | null,
      supplier_rut:           i.supplier_rut,
      merchant:               i.merchant,
    }
  })

  const orgData = orgRes.data

  return {
    report: {
      reportId:             report.id,
      reportTitle:          report.title,
      date:                 reportDate,
      employeeName:         empUser?.full_name ?? 'Desconocido',
      employeeRut:          empUser?.rut ?? null,
      employeeCostCenterId: empUser?.cost_center_id ?? null,
      items:                mappedItems,
    },
    settings: {
      contraAccount:   orgData?.defontana_contra_account   ?? '',
      voucherType:     orgData?.defontana_voucher_type      ?? 'Egreso',
      costCenter:      orgData?.defontana_cost_center       ?? null,
      providerAccount: orgData?.defontana_provider_account  ?? null,
    },
    itemIds,
  }
}

export async function markExpenseItemsDefontanaExported(itemIds: string[]) {
  if (!itemIds.length) return
  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('expense_items')
    .update({ defontana_exported_at: new Date().toISOString() })
    .in('id', itemIds)
  if (error) throw new Error(error.message)
  revalidatePath('/petty-cash')
}

export interface CategoryBreakdownItem {
  category_name: string
  amount_clp:    number
  item_count:    number
  percentage:    number
}

/** Breakdown de gastos aprobados por categoría (rendiciones + cargas históricas). */
export async function getExpenseCategoryBreakdown(): Promise<CategoryBreakdownItem[]> {
  const { supabase, orgId } = await requireAdmin()

  // Todos los reportes aprobados/reembolsados de la org (incluye históricas)
  const { data: reportIds } = await supabase
    .from('expense_reports')
    .select('id')
    .eq('org_id', orgId)
    .in('status', ['approved', 'partially_approved', 'reimbursed'])
    .is('deleted_at', null)

  if (!reportIds || reportIds.length === 0) return []

  const ids = reportIds.map((r: { id: string }) => r.id)

  const { data: items } = await supabase
    .from('expense_items')
    .select('amount_clp, expense_categories (name)')
    .in('report_id', ids)
    .eq('status', 'approved')
    .eq('item_type', 'expense')
    .is('deleted_at', null)

  if (!items || items.length === 0) return []

  // Agrupar por categoría
  const map = new Map<string, { amount: number; count: number }>()
  let total = 0

  for (const item of items) {
    const raw = item as unknown as { amount_clp: number; expense_categories: { name: string } | null }
    const name = raw.expense_categories?.name ?? 'Sin categoría'
    const existing = map.get(name) ?? { amount: 0, count: 0 }
    existing.amount += raw.amount_clp
    existing.count  += 1
    map.set(name, existing)
    total += raw.amount_clp
  }

  const result = Array.from(map.entries())
    .map(([category_name, { amount, count }]) => ({
      category_name,
      amount_clp:  Math.round(amount),
      item_count:  count,
      percentage:  total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount_clp - a.amount_clp)

  return result
}

// ─── Auditoría ──────────────────────────────────────────────────────────────

export type AuditLogFilters = {
  actorId?:    string
  entityType?: string
  action?:     string
  from?:       string  // YYYY-MM-DD
  to?:         string
  search?:     string  // busca en entity_label, notes, actor_name
  limit?:      number
  offset?:     number
}

export async function getAuditLog(filters: AuditLogFilters = {}) {
  const { orgId } = await requireAdmin()
  const admin = createAdminClient()

  let q = admin
    .from('audit_log')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 50)

  if (filters.offset)     q = q.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1)
  if (filters.actorId)    q = q.eq('actor_id', filters.actorId)
  if (filters.entityType) q = q.eq('entity_type', filters.entityType)
  if (filters.action)     q = q.eq('action', filters.action)
  if (filters.from)       q = q.gte('created_at', `${filters.from}T00:00:00Z`)
  if (filters.to)         q = q.lte('created_at', `${filters.to}T23:59:59Z`)
  if (filters.search)     q = q.or(`entity_label.ilike.%${filters.search}%,notes.ilike.%${filters.search}%,actor_name.ilike.%${filters.search}%`)

  const { data, count } = await q
  return { items: (data ?? []) as import('@/lib/supabase/types').AuditLog[], total: count ?? 0 }
}
