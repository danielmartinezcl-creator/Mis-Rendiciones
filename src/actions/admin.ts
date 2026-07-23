'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
    // Rendiciones aprobadas sin reembolsar
    supabase.from('expense_reports').select('id, approved_amount', { count: 'exact' })
      .eq('org_id', orgId).in('status', ['approved', 'partially_approved']).is('deleted_at', null),
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
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('expense_reports')
      .select('id, title, submitter_id, approved_at')
      .eq('org_id', orgId)
      .eq('is_historical_import', true)
      .is('deleted_at', null),
  ])

  const funds     = fundsRes.data     ?? []
  const historical = historicalRes.data ?? []

  // Para importaciones históricas: obtener ítems y filtrar las que son solo adelantos
  let historicalPending: typeof historical = []
  const advanceTotals: Record<string, number> = {}
  if (historical.length > 0) {
    const { data: items } = await supabase
      .from('expense_items')
      .select('report_id, item_type, amount_clp')
      .in('report_id', historical.map(r => r.id))

    const byReport = new Map<string, { advance: number; expense: number }>()
    for (const item of (items ?? [])) {
      if (!byReport.has(item.report_id)) byReport.set(item.report_id, { advance: 0, expense: 0 })
      const e = byReport.get(item.report_id)!
      if (item.item_type === 'advance') e.advance += item.amount_clp
      if (item.item_type === 'expense') e.expense += item.amount_clp
    }

    historicalPending = historical.filter(r => {
      const t = byReport.get(r.id)
      return t && t.advance > 0 && t.expense === 0
    })
    for (const r of historicalPending) {
      advanceTotals[r.id] = byReport.get(r.id)?.advance ?? 0
    }
  }

  // Nombres de empleados
  const empIds = [...new Set([...funds.map(f => f.employee_id), ...historicalPending.map(r => r.submitter_id)])]
  const { data: users } = empIds.length
    ? await supabase.from('users').select('id, full_name').in('id', empIds)
    : { data: [] }
  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]))

  return {
    pettyCashFunds: funds.map(f => ({
      id:           f.id,
      name:         f.name,
      employeeName: userMap[f.employee_id] ?? 'Desconocido',
      amount:       f.amount_approved ?? f.amount_requested,
      period_start: f.period_start,
      period_end:   f.period_end,
    })),
    historicalImports: historicalPending.map(r => ({
      id:           r.id,
      title:        r.title,
      employeeName: userMap[r.submitter_id] ?? 'Desconocido',
      amount:       advanceTotals[r.id] ?? 0,
      date:         r.approved_at ?? '',
    })),
  }
}

export type PendingToRenderList = Awaited<ReturnType<typeof getPendingToRenderList>>

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
  const { supabase } = await requireAdmin()

  // Soft delete: marca deleted_at, el usuario pierde acceso pero los datos se conservan 90 días
  const { error } = await supabase
    .from('users')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', userId)

  if (error) throw new Error(error.message)

  // Suspender cuenta en auth (no puede iniciar sesión)
  const adminClient = createAdminClient()
  await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876000h' })

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
    role?:                  'admin' | 'approver' | 'employee'
    can_submit?:            boolean
    can_approve?:           boolean
    can_manage_petty_cash?: boolean
    is_active?:             boolean
    full_name?:             string
    rut?:                   string | null
    department?:            string | null
    bank_account?:          string | null
    cost_center_id?:        string | null
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

export async function updateCategory(id: string, data: { name: string; color?: string; icon?: string }) {
  await requireAdmin()
  const admin = createAdminClient()

  const { error } = await admin
    .from('expense_categories')
    .update({ name: data.name.trim(), color: data.color ?? null, icon: data.icon ?? null })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

export async function deleteCategory(id: string) {
  await requireAdmin()
  const admin = createAdminClient()

  const { error } = await admin
    .from('expense_categories')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

export async function reclassifyExpenseItem(itemId: string, categoryId: string) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('expense_items')
    .update({ category_id: categoryId })
    .eq('id', itemId)

  if (error) throw new Error(error.message)
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
  const { supabase, orgId } = await requireAdmin()

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
  const { supabase, orgId } = await requireAdmin()
  const { error } = await supabase
    .from('organizations')
    .update({
      defontana_contra_account:   settings.contraAccount   || null,
      defontana_voucher_type:     settings.voucherType      || 'Egreso',
      defontana_cost_center:      settings.costCenter       || null,
      defontana_provider_account: settings.providerAccount || null,
    })
    .eq('id', orgId)
  if (error) throw new Error(error.message)
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
    .select('id, title, approved_at, reimbursed_at, submitter_id, defontana_exported_at')
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
    .select('report_id, description, amount_clp, merchant, doc_type, doc_number, cost_center_id, supplier_rut, expense_categories(name, defontana_account_code)')
    .in('report_id', reports.map(r => r.id))
    .eq('status', 'approved')

  type RawItem = {
    report_id:       string
    description:     string
    amount_clp:      number
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
      date:                 (r.reimbursed_at ?? r.approved_at ?? '').split('T')[0],
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
  const { supabase, orgId } = await requireAdmin()
  const { error } = await supabase
    .from('defontana_suppliers')
    .insert({ org_id: orgId, merchant_name: merchant.trim(), defontana_account_code: accountCode.trim() })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

export async function deleteDefontanaSupplier(id: string) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('defontana_suppliers').delete().eq('id', id)
  if (error) throw new Error(error.message)
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
  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('expense_items')
    .update({ cost_center_id: costCenterId })
    .eq('report_id', reportId)
  if (error) throw new Error(error.message)
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
  const { supabase } = await requireAdmin()

  if (type === 'report') {
    const { error } = await supabase
      .from('expense_reports')
      .update({ deleted_at: null })
      .eq('id', id)
    if (error) throw new Error(error.message)
    revalidatePath('/admin/reports')
  } else if (type === 'fund') {
    const { error } = await supabase
      .from('petty_cash_funds')
      .update({ deleted_at: null })
      .eq('id', id)
    if (error) throw new Error(error.message)
    revalidatePath('/petty-cash')
  } else if (type === 'user') {
    const { error } = await supabase
      .from('users')
      .update({ deleted_at: null, is_active: true })
      .eq('id', id)
    if (error) throw new Error(error.message)
    // Desbanear en auth
    const adminClient = createAdminClient()
    await adminClient.auth.admin.updateUserById(id, { ban_duration: 'none' })
    revalidatePath('/admin/employees')
    revalidatePath('/admin/settings')
  }
  revalidatePath('/admin/trash')
}

export async function permanentlyDeleteFromTrash(type: 'report' | 'fund' | 'user', id: string) {
  await requireAdmin()
  const adminClient = createAdminClient()

  if (type === 'report') {
    const { error } = await adminClient
      .from('expense_reports')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
  } else if (type === 'fund') {
    const { error } = await adminClient
      .from('petty_cash_funds')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
  } else if (type === 'user') {
    const { error } = await adminClient.auth.admin.deleteUser(id)
    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin/trash')
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

/** Retorna las importaciones históricas de Caja Chica (expense_reports con historical_type='caja_chica').
 *  Se usa en el módulo /petty-cash para mostrar históricas separadas de los fondos activos. */
export async function getHistoricalCajaChicaImports() {
  const { supabase, orgId } = await requireAdmin()

  const { data } = await supabase
    .from('expense_reports')
    .select(`
      id, title, total_amount, approved_at, fund_number, submitter_id, created_at,
      defontana_exported_at, defontana_export_ref,
      expense_items(id, item_type, amount_clp, description, date, doc_type)
    `)
    .eq('org_id', orgId)
    .eq('is_historical_import', true)
    .eq('historical_type', 'caja_chica')
    .is('deleted_at', null)
    .order('approved_at', { ascending: true })

  if (!data?.length) return []

  const submitterIds = [...new Set(data.map(r => r.submitter_id))]
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name')
    .in('id', submitterIds)

  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]))

  return data.map(r => {
    type RawItem = { id: string; item_type: string; amount_clp: number; description: string; date: string; doc_type: string | null }
    const items = (r.expense_items ?? []) as unknown as RawItem[]
    const advance_total = items.filter(i => i.item_type === 'advance').reduce((s, i) => s + i.amount_clp, 0)
    const expense_total = items.filter(i => i.item_type === 'expense').reduce((s, i) => s + i.amount_clp, 0)
    const return_total  = items.filter(i => i.item_type === 'return' ).reduce((s, i) => s + i.amount_clp, 0)
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
