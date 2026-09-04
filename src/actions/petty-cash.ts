'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { FundStatus } from '@/lib/supabase/types'
import { logAudit } from '@/lib/audit'
import { validateStringLength, validateDateRange } from '@/lib/validators'
import { DEFONTANA_ORG_COLUMNS, mapDefontanaSettings, type DefontanaOrgRow } from '@/lib/export/defontana-settings'
import type { DefontanaItem } from '@/lib/export/defontana'

async function getProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, org_id, role, can_approve, can_manage_petty_cash, can_load_bank_transfer, can_authorize_bank_transfer, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Perfil no encontrado')
  return { supabase, userId: user.id, profile }
}

async function audit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fundId: string,
  actorId: string,
  action: string,
  notes?: string | null,
  amount?: number | null,
) {
  await supabase.from('petty_cash_approvals').insert({
    fund_id:  fundId,
    actor_id: actorId,
    action:   action as never,
    notes:    notes ?? null,
    amount:   amount ?? null,
  })
}

// ── Crear fondo ───────────────────────────────────────────────────────────────

export async function createPettyCashFund(data: {
  name:             string
  employee_id:      string
  amount_requested: number
  currency:         string
  period_start:     string
  period_end:       string
  description?:     string
}) {
  const { supabase, userId, profile } = await getProfile()

  if (!profile.can_manage_petty_cash && profile.role !== 'admin') {
    throw new Error('Sin permiso para crear fondos')
  }

  if (!validateStringLength(data.name ?? '', 200)) throw new Error('Nombre requerido (máx 200 caracteres)')
  if (data.period_start && data.period_end && !validateDateRange(data.period_start, data.period_end)) {
    throw new Error('La fecha de fin debe ser posterior a la fecha de inicio')
  }

  // Verificar límite de monto por fondo
  const { data: org } = await supabase
    .from('organizations')
    .select('max_fund_amount_clp')
    .eq('id', profile.org_id)
    .single()
  if (org?.max_fund_amount_clp && data.amount_requested > org.max_fund_amount_clp) {
    const limit = org.max_fund_amount_clp.toLocaleString('es-CL')
    throw new Error(`El monto solicitado excede el límite máximo por fondo ($${limit} CLP). Contacta al administrador.`)
  }

  const { data: fund, error } = await supabase
    .from('petty_cash_funds')
    .insert({
      org_id:           profile.org_id,
      name:             data.name.trim(),
      employee_id:      data.employee_id,
      manager_id:       userId,
      amount_requested: data.amount_requested,
      currency:         data.currency,
      period_start:     data.period_start,
      period_end:       data.period_end,
      description:      data.description?.trim() || null,
      status:           'draft',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  await audit(supabase, fund.id, userId, 'created', null, data.amount_requested)
  revalidatePath('/petty-cash')
  redirect(`/petty-cash/${fund.id}`)
}

// ── EFF: enviar a autorización ────────────────────────────────────────────────

export async function submitFundForApproval(fundId: string) {
  const { supabase, userId } = await getProfile()

  const { error } = await supabase
    .from('petty_cash_funds')
    .update({ status: 'pending_approval' as FundStatus })
    .eq('id', fundId)
    .eq('manager_id', userId)
    .eq('status', 'draft')

  if (error) throw new Error(error.message)

  await audit(supabase, fundId, userId, 'submitted_for_approval')
  revalidatePath(`/petty-cash/${fundId}`)
}

// ── Aprobador: autorizar fondo ────────────────────────────────────────────────

export async function approveFund(fundId: string, approvedAmount: number, notes?: string) {
  const { supabase, userId, profile } = await getProfile()

  if (!profile.can_approve && profile.role !== 'admin') {
    throw new Error('Sin permiso para aprobar fondos')
  }

  const { error } = await supabase
    .from('petty_cash_funds')
    .update({ status: 'approved' as FundStatus, amount_approved: approvedAmount })
    .eq('id', fundId)
    .eq('status', 'pending_approval')

  if (error) throw new Error(error.message)

  await audit(supabase, fundId, userId, 'approved', notes ?? null, approvedAmount)
  revalidatePath(`/petty-cash/${fundId}`)
  revalidatePath('/petty-cash')
}

// ── Aprobador: rechazar fondo ─────────────────────────────────────────────────

export async function rejectFund(fundId: string, notes: string) {
  const { supabase, userId, profile } = await getProfile()

  if (!profile.can_approve && profile.role !== 'admin') {
    throw new Error('Sin permiso para rechazar fondos')
  }

  const { error } = await supabase
    .from('petty_cash_funds')
    .update({ status: 'rejected' as FundStatus })
    .eq('id', fundId)
    .in('status', ['pending_approval', 'pending_liquidation_approval'] as FundStatus[])

  if (error) throw new Error(error.message)

  await audit(supabase, fundId, userId, 'rejected', notes)
  revalidatePath(`/petty-cash/${fundId}`)
  revalidatePath('/petty-cash')
}

// ── EFF: registrar transferencia de fondos al empleado ───────────────────────

export async function recordFundDisbursement(fundId: string, data: {
  amount:         number
  reference?:     string
  transferred_at: string
  notes?:         string
}) {
  const { supabase, userId } = await getProfile()

  const { error: fundError } = await supabase
    .from('petty_cash_funds')
    .update({ status: 'funds_sent' as FundStatus })
    .eq('id', fundId)
    .eq('manager_id', userId)
    .eq('status', 'approved')

  if (fundError) throw new Error(fundError.message)

  const { error: txError } = await supabase
    .from('petty_cash_transfers')
    .insert({
      fund_id:        fundId,
      type:           'disbursement',
      amount:         data.amount,
      reference:      data.reference ?? null,
      transferred_at: data.transferred_at,
      registered_by:  userId,
      notes:          data.notes ?? null,
    })

  if (txError) throw new Error(txError.message)

  await audit(supabase, fundId, userId, 'funds_sent', data.reference ?? null, data.amount)
  revalidatePath(`/petty-cash/${fundId}`)
}

// ── Empleado: agregar ítem de gasto ──────────────────────────────────────────

export async function addFundItem(fundId: string, item: {
  description:  string
  amount:       number
  currency:     string
  exchange_rate?: number
  amount_clp:   number
  date:         string
  category_id?: string | null
  merchant?:    string | null
  doc_type?:    'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro' | null
  doc_number?:  string | null
  supplier_rut?: string | null
  notes?:       string | null
}) {
  const { supabase, userId, profile } = await getProfile()

  const { data: fund, error: fundError } = await supabase
    .from('petty_cash_funds')
    .select('status, employee_id, org_id')
    .eq('id', fundId)
    .single()

  if (fundError || !fund) throw new Error('Fondo no encontrado')
  if (fund.employee_id !== userId && profile.role !== 'admin') {
    throw new Error('Solo el empleado asignado puede agregar gastos')
  }
  if (fund.status !== 'funds_sent') {
    throw new Error('Solo se pueden agregar gastos cuando los fondos han sido enviados')
  }

  // Verificar límite de monto por ítem
  const { data: org } = await supabase
    .from('organizations')
    .select('max_item_amount_clp')
    .eq('id', fund.org_id)
    .single()
  if (org?.max_item_amount_clp && item.amount_clp > org.max_item_amount_clp) {
    const limit = org.max_item_amount_clp.toLocaleString('es-CL')
    throw new Error(`El monto excede el límite máximo por ítem ($${limit} CLP). Contacta al administrador.`)
  }

  /* Devuelve el id del ítem creado. Antes no devolvía nada, y por eso el flujo
     rápido de /quick no tenía a qué adjuntarle la foto: sacaba la boleta, la
     usaba para el OCR y la descartaba. El gasto quedaba sin respaldo, que en una
     rendición chilena es justamente lo que hay que conservar. */
  const { data: creado, error } = await supabase.from('petty_cash_items').insert({
    fund_id:      fundId,
    org_id:       fund.org_id,
    description:  item.description.trim(),
    amount:       item.amount,
    currency:     item.currency,
    exchange_rate: item.exchange_rate ?? 1,
    amount_clp:   item.amount_clp,
    date:         item.date,
    category_id:  item.category_id ?? null,
    merchant:     item.merchant ?? null,
    doc_type:     item.doc_type ?? null,
    doc_number:   item.doc_number ?? null,
    supplier_rut: item.supplier_rut ?? null,
    notes:        item.notes ?? null,
    status:       'pending',
  }).select('id').single()

  if (error) throw new Error(error.message)
  revalidatePath(`/petty-cash/${fundId}`)
  return creado.id as string
}

// ── Empleado/Admin: editar ítem ──────────────────────────────────────────────

export async function updateFundItem(itemId: string, patch: {
  description?:  string
  amount_clp?:   number
  date?:         string
  category_id?:  string | null
  merchant?:     string | null
  doc_type?:     'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro' | null
  doc_number?:   string | null
  supplier_rut?: string | null
  notes?:        string | null
}) {
  const { supabase, userId, profile } = await getProfile()

  const { data: item } = await supabase
    .from('petty_cash_items')
    .select('fund_id')
    .eq('id', itemId)
    .single()

  if (!item) throw new Error('Ítem no encontrado')

  const { data: fund } = await supabase
    .from('petty_cash_funds')
    .select('employee_id, manager_id, status')
    .eq('id', item.fund_id)
    .single()

  if (!fund) throw new Error('Fondo no encontrado')

  const isEmployee = fund.employee_id === userId
  const isAdmin    = profile.role === 'admin'

  if (!isEmployee && !isAdmin) throw new Error('Sin permiso para editar este ítem')
  if (fund.status !== 'funds_sent' && !isAdmin) {
    throw new Error('Solo se pueden editar ítems cuando los fondos han sido enviados')
  }

  const { error } = await supabase
    .from('petty_cash_items')
    .update(patch)
    .eq('id', itemId)

  if (error) throw new Error(error.message)
  revalidatePath(`/petty-cash/${item.fund_id}`)
}

// ── Empleado: eliminar ítem ───────────────────────────────────────────────────

export async function removeFundItem(itemId: string) {
  const { supabase, userId, profile } = await getProfile()

  const { data: item } = await supabase
    .from('petty_cash_items')
    .select('fund_id')
    .eq('id', itemId)
    .single()

  if (!item) throw new Error('Ítem no encontrado')

  const { data: fund } = await supabase
    .from('petty_cash_funds')
    .select('employee_id, status')
    .eq('id', item.fund_id)
    .single()

  if (!fund) throw new Error('Fondo no encontrado')

  if (fund.employee_id !== userId && profile.role !== 'admin') {
    throw new Error('Sin permiso')
  }
  if (fund.status !== 'funds_sent' && profile.role !== 'admin') {
    throw new Error('No se pueden eliminar ítems en este estado')
  }

  const { error } = await supabase.from('petty_cash_items').delete().eq('id', itemId)
  if (error) throw new Error(error.message)

  revalidatePath(`/petty-cash/${item.fund_id}`)
}

// ── Empleado: enviar liquidación ──────────────────────────────────────────────

export async function submitLiquidation(fundId: string) {
  const { supabase, userId, profile } = await getProfile()

  const { data: fund } = await supabase
    .from('petty_cash_funds')
    .select('employee_id, status')
    .eq('id', fundId)
    .single()

  if (!fund) throw new Error('Fondo no encontrado')
  if (fund.employee_id !== userId && profile.role !== 'admin') {
    throw new Error('Solo el empleado asignado puede enviar la liquidación')
  }
  if (fund.status !== 'funds_sent') throw new Error('Estado inválido')

  const { error } = await supabase
    .from('petty_cash_funds')
    .update({ status: 'submitted' as FundStatus })
    .eq('id', fundId)

  if (error) throw new Error(error.message)

  await audit(supabase, fundId, userId, 'liquidation_submitted')
  revalidatePath(`/petty-cash/${fundId}`)
}

// ── EFF: elevar liquidación a aprobadores ─────────────────────────────────────

export async function elevateLiquidation(fundId: string, notes?: string) {
  const { supabase, userId } = await getProfile()

  const { error } = await supabase
    .from('petty_cash_funds')
    .update({ status: 'pending_liquidation_approval' as FundStatus })
    .eq('id', fundId)
    .eq('manager_id', userId)
    .eq('status', 'submitted')

  if (error) throw new Error(error.message)

  await audit(supabase, fundId, userId, 'liquidation_elevated', notes ?? null)
  revalidatePath(`/petty-cash/${fundId}`)
}

// ── Aprobador: aprobar liquidación con decisión por ítem ──────────────────────

export async function approveLiquidation(
  fundId: string,
  decisions: { itemId: string; action: 'approved' | 'rejected'; reason?: string }[],
  notes?: string,
) {
  const { supabase, userId, profile } = await getProfile()

  if (!profile.can_approve && profile.role !== 'admin') {
    throw new Error('Sin permiso para aprobar liquidaciones')
  }

  for (const d of decisions) {
    await supabase.from('petty_cash_items')
      .update({ status: d.action, rejection_reason: d.reason ?? null })
      .eq('id', d.itemId)
  }

  const { error } = await supabase
    .from('petty_cash_funds')
    .update({ status: 'settled' as FundStatus, settled_at: new Date().toISOString() })
    .eq('id', fundId)
    .eq('status', 'pending_liquidation_approval')

  if (error) throw new Error(error.message)

  await audit(supabase, fundId, userId, 'liquidation_approved', notes ?? null)
  revalidatePath(`/petty-cash/${fundId}`)
  revalidatePath('/petty-cash')
}

// ── EFF: registrar transferencia de diferencia ────────────────────────────────

export async function recordSettlement(fundId: string, data: {
  type:           'refund_to_employee' | 'reimbursement_from_employee'
  amount:         number
  reference?:     string
  transferred_at: string
  notes?:         string
}) {
  const { supabase, userId } = await getProfile()

  const { error } = await supabase.from('petty_cash_transfers').insert({
    fund_id:        fundId,
    type:           data.type,
    amount:         data.amount,
    reference:      data.reference ?? null,
    transferred_at: data.transferred_at,
    registered_by:  userId,
    notes:          data.notes ?? null,
  })

  if (error) throw new Error(error.message)

  await audit(supabase, fundId, userId, 'settled',
    `${data.type === 'refund_to_employee' ? 'Devolución al empleado' : 'Reembolso a empresa'}: ${data.reference ?? ''}`.trim(),
    data.amount,
  )
  revalidatePath(`/petty-cash/${fundId}`)
}

// ── Eliminar fondo (solo admin) ───────────────────────────────────────────────

export async function deletePettyCashFund(fundId: string) {
  const { supabase, userId, profile } = await getProfile()
  if (profile.role !== 'admin') throw new Error('Solo administradores')

  // Capture fund before soft delete
  const { data: fund } = await supabase
    .from('petty_cash_funds').select('name').eq('id', fundId).single()

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('petty_cash_funds')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', fundId)
    .eq('org_id', profile.org_id)

  if (error) throw new Error(error.message)

  await logAudit({
    orgId:       profile.org_id,
    actorId:     userId,
    actorName:   profile.full_name,
    action:      'deleted',
    entityType:  'petty_cash_fund',
    entityId:    fundId,
    entityLabel: fund?.name ?? fundId,
  })

  revalidatePath('/petty-cash')
  revalidatePath('/admin/trash')
}

// ── Consultas ─────────────────────────────────────────────────────────────────

export async function listPettyCashFunds() {
  const { supabase, userId, profile } = await getProfile()

  let query = supabase
    .from('petty_cash_funds')
    .select('id, name, status, amount_requested, amount_approved, currency, period_start, period_end, employee_id, manager_id, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (profile.role !== 'admin') {
    if (profile.can_approve) {
      query = query.or(`manager_id.eq.${userId},employee_id.eq.${userId},status.in.(pending_approval,pending_liquidation_approval)`)
    } else {
      query = query.or(`manager_id.eq.${userId},employee_id.eq.${userId}`)
    }
  } else {
    query = query.eq('org_id', profile.org_id)
  }

  const { data: funds } = await query

  if (!funds?.length) return []

  const userIds = [...new Set([
    ...funds.map(f => f.employee_id),
    ...funds.map(f => f.manager_id),
  ])]

  const { data: users } = await supabase
    .from('users')
    .select('id, full_name')
    .in('id', userIds)

  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]))

  return funds.map(f => ({
    ...f,
    employee_name: userMap[f.employee_id] ?? 'Desconocido',
    manager_name:  userMap[f.manager_id]  ?? 'Desconocido',
  }))
}

export type FundListItem = Awaited<ReturnType<typeof listPettyCashFunds>>[number]

export async function getFundDetail(fundId: string) {
  const { supabase, userId, profile } = await getProfile()

  const { data: fund, error } = await supabase
    .from('petty_cash_funds')
    .select('*')
    .eq('id', fundId)
    .single()

  if (error || !fund) return null

  const [itemsRes, auditsRes, transfersRes, usersRes, categoriesRes] = await Promise.all([
    supabase.from('petty_cash_items').select('*').eq('fund_id', fundId).order('date', { ascending: true }),
    supabase.from('petty_cash_approvals').select('*').eq('fund_id', fundId).order('created_at', { ascending: true }),
    supabase.from('petty_cash_transfers').select('*').eq('fund_id', fundId).order('created_at', { ascending: true }),
    supabase.from('users').select('id, full_name').in('id', [fund.employee_id, fund.manager_id]),
    supabase.from('expense_categories').select('id, name, color').eq('is_active', true).is('deleted_at', null),
  ])

  const userMap = Object.fromEntries((usersRes.data ?? []).map(u => [u.id, u.full_name]))

  const auditorIds = [...new Set((auditsRes.data ?? []).map(a => a.actor_id))]
  const { data: auditorUsers } = await supabase.from('users').select('id, full_name').in('id', auditorIds)
  const auditorMap = Object.fromEntries((auditorUsers ?? []).map(u => [u.id, u.full_name]))

  return {
    fund,
    items:      itemsRes.data ?? [],
    audits:     (auditsRes.data ?? []).map(a => ({ ...a, actor_name: auditorMap[a.actor_id] ?? 'Desconocido' })),
    transfers:  transfersRes.data ?? [],
    categories: categoriesRes.data ?? [],
    employee_name: userMap[fund.employee_id] ?? 'Desconocido',
    manager_name:  userMap[fund.manager_id]  ?? 'Desconocido',
    currentUser: {
      id:                          userId,
      role:                        profile.role,
      can_approve:                 profile.can_approve,
      can_manage_petty_cash:       profile.can_manage_petty_cash,
      can_load_bank_transfer:      profile.can_load_bank_transfer,
      can_authorize_bank_transfer: profile.can_authorize_bank_transfer,
    },
  }
}

export type FundDetail = NonNullable<Awaited<ReturnType<typeof getFundDetail>>>

// ── Workflow bancario ─────────────────────────────────────────────────────────

/** Paso 1: Admin/manager envía el fondo aprobado al proceso bancario */
export async function requestBankLoad(fundId: string) {
  const { supabase, userId, profile } = await getProfile()

  if (!profile.can_manage_petty_cash && profile.role !== 'admin') {
    throw new Error('Sin permiso para iniciar el proceso bancario')
  }

  const admin = createAdminClient()
  const { error } = await (await admin)
    .from('petty_cash_funds')
    .update({ status: 'pending_bank_load' as FundStatus })
    .eq('id', fundId)
    .eq('status', 'approved')

  if (error) throw new Error(error.message)

  await audit(supabase, fundId, userId, 'bank_load_requested')
  revalidatePath(`/petty-cash/${fundId}`)
  revalidatePath('/petty-cash')
}

/** Paso 2: Encargado de carga bancaria confirma que cargó la transferencia */
export async function confirmBankLoad(fundId: string, data: {
  amount:         number
  reference?:     string
  transferred_at: string
  notes?:         string
}) {
  const { supabase, userId, profile } = await getProfile()

  if (!profile.can_load_bank_transfer && profile.role !== 'admin') {
    throw new Error('Sin permiso para confirmar carga bancaria')
  }

  const admin = createAdminClient()
  const { error: fundError } = await (await admin)
    .from('petty_cash_funds')
    .update({ status: 'pending_bank_auth' as FundStatus })
    .eq('id', fundId)
    .eq('status', 'pending_bank_load')

  if (fundError) throw new Error(fundError.message)

  await supabase.from('petty_cash_transfers').insert({
    fund_id:        fundId,
    type:           'disbursement',
    amount:         data.amount,
    reference:      data.reference ?? null,
    transferred_at: data.transferred_at,
    registered_by:  userId,
    notes:          data.notes ?? null,
  })

  await audit(supabase, fundId, userId, 'bank_load_confirmed', data.reference ?? null, data.amount)
  revalidatePath(`/petty-cash/${fundId}`)
  revalidatePath('/petty-cash')
}

/** Paso 3: Autorizador bancario aprueba la transferencia → fondos enviados */
export async function authorizeBank(fundId: string) {
  const { supabase, userId, profile } = await getProfile()

  if (!profile.can_authorize_bank_transfer && profile.role !== 'admin') {
    throw new Error('Sin permiso para autorizar transferencias bancarias')
  }

  const admin = createAdminClient()
  const { error } = await (await admin)
    .from('petty_cash_funds')
    .update({ status: 'funds_sent' as FundStatus })
    .eq('id', fundId)
    .eq('status', 'pending_bank_auth')

  if (error) throw new Error(error.message)

  await audit(supabase, fundId, userId, 'bank_authorized')
  await audit(supabase, fundId, userId, 'funds_sent')
  revalidatePath(`/petty-cash/${fundId}`)
  revalidatePath('/petty-cash')
}

// ── Categorías activas (para filtros) ────────────────────────────────────────

export async function getActivePettyCashCategories() {
  const { supabase, profile } = await getProfile()
  const { data } = await supabase
    .from('expense_categories')
    .select('id, name, color')
    .or(`org_id.eq.${profile.org_id},org_id.is.null`)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name', { ascending: true })
  return data ?? []
}

// ── Informe de ítems (para export con filtros) ────────────────────────────────

export async function getPettyCashItemsForReport(filters: {
  dateFrom?:    string
  dateTo?:      string
  itemStatus?:  'pending' | 'approved' | 'rejected' | 'all'
  employeeIds?: string[]
  categoryIds?: string[]
}) {
  const { supabase, profile } = await getProfile()

  if (profile.role !== 'admin' && !profile.can_manage_petty_cash) {
    throw new Error('Sin permiso para generar informes de caja chica')
  }

  // ── Fondos reales (petty_cash_funds → petty_cash_items) ─────────────────
  let fundsQuery = supabase
    .from('petty_cash_funds')
    .select('id, name, employee_id')
    .eq('org_id', profile.org_id)

  if (filters.employeeIds?.length) {
    fundsQuery = fundsQuery.in('employee_id', filters.employeeIds)
  }

  const { data: funds } = await fundsQuery
  const fundIds = (funds ?? []).map(f => f.id)
  const fundMap = Object.fromEntries((funds ?? []).map(f => [f.id, f]))

  // ── Carga histórica (expense_reports → expense_items, historical_type='caja_chica') ──
  let histReportsQuery = supabase
    .from('expense_reports')
    .select('id, title, submitter_id')
    .eq('org_id', profile.org_id)
    .eq('is_historical_import', true)
    .eq('historical_type', 'caja_chica')
    .is('deleted_at', null)

  if (filters.employeeIds?.length) {
    histReportsQuery = histReportsQuery.in('submitter_id', filters.employeeIds)
  }

  const { data: histReports } = await histReportsQuery
  const histReportIds = (histReports ?? []).map(r => r.id)
  const histReportMap = Object.fromEntries((histReports ?? []).map(r => [r.id, r]))

  // Consultas de ítems en paralelo
  function applyItemFilters<T extends ReturnType<typeof supabase.from>>(q: T) {
    let r = q as any
    if (filters.dateFrom) r = r.gte('date', filters.dateFrom)
    if (filters.dateTo)   r = r.lte('date', filters.dateTo)
    if (filters.itemStatus && filters.itemStatus !== 'all')
      r = r.eq('status', filters.itemStatus)
    if (filters.categoryIds?.length) r = r.in('category_id', filters.categoryIds)
    return r
  }

  const realItemsP = fundIds.length
    ? applyItemFilters(
        supabase
          .from('petty_cash_items')
          .select('id, fund_id, description, amount, currency, amount_clp, date, category_id, merchant, doc_type, doc_number, notes, status, rejection_reason')
          .in('fund_id', fundIds)
          .order('date', { ascending: true })
      )
    : Promise.resolve({ data: [] })

  const histItemsP = histReportIds.length
    ? applyItemFilters(
        supabase
          .from('expense_items')
          .select('id, report_id, description, amount, currency, amount_clp, date, category_id, merchant, doc_type, doc_number, notes, status, rejection_reason')
          .in('report_id', histReportIds)
          .is('deleted_at', null)
          .order('date', { ascending: true })
      )
    : Promise.resolve({ data: [] })

  const [{ data: realItems }, { data: histItems }] = await Promise.all([realItemsP, histItemsP])

  if (!realItems?.length && !histItems?.length) return { items: [], totalCLP: 0 }

  // ── Enriquecer con categorías y empleados ─────────────────────────────────
  const allCatIds = [...new Set([
    ...(realItems ?? []).map((i: any) => i.category_id),
    ...(histItems ?? []).map((i: any) => i.category_id),
  ].filter(Boolean))] as string[]

  const allEmpIds = [...new Set([
    ...(funds ?? []).map(f => f.employee_id),
    ...(histReports ?? []).map(r => r.submitter_id),
  ].filter(Boolean))]

  const [catsRes, usersRes] = await Promise.all([
    allCatIds.length
      ? supabase.from('expense_categories').select('id, name, color').in('id', allCatIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as { id: string; name: string; color: string | null }[] }),
    allEmpIds.length
      ? supabase.from('users').select('id, full_name').in('id', allEmpIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ])

  const catMap  = Object.fromEntries((catsRes.data ?? []).map(c => [c.id, c]))
  const userMap = Object.fromEntries((usersRes.data ?? []).map(u => [u.id, u.full_name]))

  const normalizedReal = (realItems ?? []).map((i: any) => ({
    fund_name:        fundMap[i.fund_id]?.name ?? 'Desconocido',
    employee_name:    fundMap[i.fund_id] ? (userMap[fundMap[i.fund_id].employee_id] ?? 'Desconocido') : 'Desconocido',
    description:      i.description,
    merchant:         i.merchant,
    date:             i.date,
    category_name:    i.category_id ? (catMap[i.category_id]?.name ?? null) : null,
    category_color:   i.category_id ? (catMap[i.category_id]?.color ?? null) : null,
    amount:           i.amount,
    currency:         i.currency,
    amount_clp:       i.amount_clp,
    doc_type:         i.doc_type,
    doc_number:       i.doc_number,
    status:           i.status,
    rejection_reason: i.rejection_reason,
    notes:            i.notes,
  }))

  const normalizedHist = (histItems ?? []).map((i: any) => {
    const report = histReportMap[i.report_id]
    return {
      fund_name:        report?.title ?? 'Carga Histórica',
      employee_name:    report ? (userMap[report.submitter_id] ?? 'Desconocido') : 'Desconocido',
      description:      i.description,
      merchant:         i.merchant,
      date:             i.date,
      category_name:    i.category_id ? (catMap[i.category_id]?.name ?? null) : null,
      category_color:   i.category_id ? (catMap[i.category_id]?.color ?? null) : null,
      amount:           i.amount,
      currency:         i.currency,
      amount_clp:       i.amount_clp,
      doc_type:         i.doc_type,
      doc_number:       i.doc_number,
      status:           i.status,
      rejection_reason: i.rejection_reason,
      notes:            i.notes,
    }
  })

  const all = [...normalizedReal, ...normalizedHist].sort((a, b) => a.date.localeCompare(b.date))
  const totalCLP = all.reduce((s, i) => s + i.amount_clp, 0)

  return { items: all, totalCLP }
}

// ── Defontana por movimiento en fondos vivos ─────────────────────────────────
// En un fondo vivo el adelanto y los reembolsos son transferencias bancarias, no
// ítems. Se mapean al movimiento contable según hacia dónde se mueve la plata:
//   disbursement / refund_to_employee    → sale del banco  → adelanto   (CARGO)
//   reimbursement_from_employee          → entra al banco  → devolución (ABONO)

export type FundMovement = 'advance' | 'expense' | 'return'

// Una transferencia nunca es un gasto: siempre mueve el banco en un sentido u otro
const TRANSFER_MOVEMENT: Record<string, 'advance' | 'return'> = {
  disbursement:                'advance',
  refund_to_employee:          'advance',
  reimbursement_from_employee: 'return',
}

/** Desglose por movimiento de un fondo vivo: qué está pendiente de contabilizar
 *  y qué ya se contabilizó. Los gastos cuentan solo si están aprobados. */
export async function getFundDefontanaBreakdown(fundId: string) {
  const { supabase, profile } = await getProfile()
  if (profile.role !== 'admin') throw new Error('Sin permiso')

  const [fundRes, itemsRes, transfersRes] = await Promise.all([
    supabase.from('petty_cash_funds')
      .select('id, name, defontana_export_ref')
      .eq('id', fundId).eq('org_id', profile.org_id).single(),
    supabase.from('petty_cash_items')
      .select('id, amount_clp, status, defontana_exported_at')
      .eq('fund_id', fundId),
    supabase.from('petty_cash_transfers')
      .select('id, type, amount, transferred_at, defontana_exported_at')
      .eq('fund_id', fundId),
  ])

  const fund = fundRes.data
  if (!fund) throw new Error('Fondo no encontrado')

  type ItemRow     = { id: string; amount_clp: number; status: string; defontana_exported_at: string | null }
  type TransferRow = { id: string; type: string; amount: number; transferred_at: string; defontana_exported_at: string | null }

  const items     = ((itemsRes.data ?? []) as unknown as ItemRow[]).filter(i => i.status === 'approved')
  const transfers = (transfersRes.data ?? []) as unknown as TransferRow[]

  function summarize(pending: { amount: number }[], exported: { amount: number }[]) {
    return {
      pendingCount:  pending.length,
      pendingCLP:    pending.reduce((s, x) => s + x.amount, 0),
      exportedCount: exported.length,
      exportedCLP:   exported.reduce((s, x) => s + x.amount, 0),
      totalCount:    pending.length + exported.length,
    }
  }

  const byMovement = (['advance', 'expense', 'return'] as const).map(movement => {
    if (movement === 'expense') {
      const pending  = items.filter(i => !i.defontana_exported_at).map(i => ({ amount: i.amount_clp }))
      const exported = items.filter(i =>  i.defontana_exported_at).map(i => ({ amount: i.amount_clp }))
      return { movement, ...summarize(pending, exported) }
    }
    const ofKind   = transfers.filter(t => TRANSFER_MOVEMENT[t.type] === movement)
    const pending  = ofKind.filter(t => !t.defontana_exported_at).map(t => ({ amount: t.amount }))
    const exported = ofKind.filter(t =>  t.defontana_exported_at).map(t => ({ amount: t.amount }))
    return { movement, ...summarize(pending, exported) }
  }).filter(m => m.totalCount > 0)

  return { fundName: fund.name, headerRef: fund.defontana_export_ref, byMovement }
}

/** Datos para armar los asientos de los movimientos indicados. Sintetiza un
 *  DefontanaItem por transferencia para reusar el mismo generador que las
 *  rendiciones: el motor ya sabe qué asiento corresponde a cada item_type. */
export async function getFundDefontanaMovementData(fundId: string, movements: FundMovement[]) {
  const { supabase, profile } = await getProfile()
  if (profile.role !== 'admin') throw new Error('Sin permiso')
  if (!movements.length) throw new Error('Selecciona al menos un movimiento')

  const [fundRes, orgRes, suppliersRes] = await Promise.all([
    supabase.from('petty_cash_funds')
      .select('id, name, period_start, employee_id')
      .eq('id', fundId).eq('org_id', profile.org_id).single(),
    supabase.from('organizations').select(DEFONTANA_ORG_COLUMNS).eq('id', profile.org_id).single(),
    supabase.from('defontana_suppliers').select('merchant_name, defontana_account_code').eq('org_id', profile.org_id),
  ])

  const fund = fundRes.data
  if (!fund) throw new Error('Fondo no encontrado')

  const supplierMap: Record<string, string> = {}
  for (const s of suppliersRes.data ?? []) supplierMap[s.merchant_name.toLowerCase()] = s.defontana_account_code

  const { data: empUser } = await supabase
    .from('users').select('full_name, rut, cost_center_id').eq('id', fund.employee_id).single()

  const mapped: DefontanaItem[] = []
  const itemIds:     string[] = []
  const transferIds: string[] = []

  if (movements.includes('expense')) {
    const { data: rawItems } = await supabase
      .from('petty_cash_items')
      .select('id, description, amount_clp, date, merchant, doc_type, doc_number, supplier_rut, expense_categories(name, defontana_account_code)')
      .eq('fund_id', fundId)
      .eq('status', 'approved')
      .is('defontana_exported_at', null)

    type RawItem = {
      id: string; description: string; amount_clp: number; date: string
      merchant: string | null; doc_type: string | null; doc_number: string | null; supplier_rut: string | null
      expense_categories: { name: string; defontana_account_code: string | null } | null
    }
    for (const i of (rawItems ?? []) as unknown as RawItem[]) {
      const merchantKey = (i.merchant ?? '').toLowerCase()
      itemIds.push(i.id)
      mapped.push({
        description:            i.description,
        amount_clp:             i.amount_clp,
        category_name:          i.expense_categories?.name ?? null,
        defontana_account_code: i.expense_categories?.defontana_account_code ?? null,
        supplier_account_code:  merchantKey ? (supplierMap[merchantKey] ?? null) : null,
        doc_type:               i.doc_type,
        doc_number:             i.doc_number,
        cost_center_id:         null,
        supplier_rut:           i.supplier_rut,
        merchant:               i.merchant,
        item_type:              'expense',
        date:                   i.date,
      })
    }
  }

  const transferMovements = movements.filter(m => m !== 'expense')
  if (transferMovements.length) {
    const { data: rawTransfers } = await supabase
      .from('petty_cash_transfers')
      .select('id, type, amount, transferred_at')
      .eq('fund_id', fundId)
      .is('defontana_exported_at', null)

    type RawTransfer = { id: string; type: string; amount: number; transferred_at: string }
    const TRANSFER_LABEL: Record<string, string> = {
      disbursement:                'Fondos enviados al empleado',
      refund_to_employee:          'Devolución al empleado',
      reimbursement_from_employee: 'Reembolso del empleado',
    }
    for (const t of (rawTransfers ?? []) as unknown as RawTransfer[]) {
      const movement = TRANSFER_MOVEMENT[t.type]
      if (!movement || !transferMovements.includes(movement)) continue
      transferIds.push(t.id)
      mapped.push({
        description:            TRANSFER_LABEL[t.type] ?? 'Movimiento de fondos',
        amount_clp:             t.amount,
        category_name:          null,
        defontana_account_code: null,
        supplier_account_code:  null,
        doc_type:               null,
        doc_number:             null,
        cost_center_id:         null,
        supplier_rut:           null,
        merchant:               null,
        item_type:              movement,
        date:                   t.transferred_at,
      })
    }
  }

  const dates      = mapped.map(m => m.date).filter(Boolean).sort() as string[]
  const reportDate = dates[0] ?? fund.period_start

  return {
    report: {
      reportId:             fund.id,
      reportTitle:          fund.name,
      date:                 reportDate,
      employeeName:         empUser?.full_name ?? 'Desconocido',
      employeeRut:          empUser?.rut ?? null,
      employeeCostCenterId: empUser?.cost_center_id ?? null,
      items:                mapped,
    },
    settings: mapDefontanaSettings(orgRes.data as unknown as DefontanaOrgRow),
    itemIds,
    transferIds,
  }
}

/** Marca como contabilizados los movimientos indicados que estaban pendientes. */
export async function confirmFundDefontana(
  fundId:      string,
  movements:   FundMovement[],
  comprobante: string,
) {
  const { supabase, userId, profile } = await getProfile()
  if (profile.role !== 'admin') throw new Error('Sin permiso')
  if (!movements.length) throw new Error('Selecciona al menos un movimiento')

  const { data: fund } = await supabase
    .from('petty_cash_funds').select('id, name').eq('id', fundId).eq('org_id', profile.org_id).single()
  if (!fund) throw new Error('Fondo no encontrado')

  const now = new Date().toISOString()
  const ref = comprobante.trim() || null
  let marked = 0

  if (movements.includes('expense')) {
    const { data: pend } = await supabase
      .from('petty_cash_items').select('id')
      .eq('fund_id', fundId).eq('status', 'approved').is('defontana_exported_at', null)
    const ids = (pend ?? []).map(i => i.id)
    if (ids.length) {
      const { error } = await supabase
        .from('petty_cash_items')
        .update({ defontana_exported_at: now, defontana_export_ref: ref })
        .in('id', ids)
      if (error) throw new Error(error.message)
      marked += ids.length
    }
  }

  const transferMovements = movements.filter(m => m !== 'expense')
  if (transferMovements.length) {
    const { data: pend } = await supabase
      .from('petty_cash_transfers').select('id, type')
      .eq('fund_id', fundId).is('defontana_exported_at', null)
    const ids = ((pend ?? []) as unknown as { id: string; type: string }[])
      .filter(t => transferMovements.includes(TRANSFER_MOVEMENT[t.type]))
      .map(t => t.id)
    if (ids.length) {
      const { error } = await supabase
        .from('petty_cash_transfers')
        .update({ defontana_exported_at: now, defontana_export_ref: ref })
        .in('id', ids)
      if (error) throw new Error(error.message)
      marked += ids.length
    }
  }

  // La marca del fondo queda como referencia del último comprobante cargado
  await supabase
    .from('petty_cash_funds')
    .update({ defontana_exported_at: now, defontana_export_ref: ref })
    .eq('id', fundId).eq('org_id', profile.org_id)

  await logAudit({
    orgId:       profile.org_id,
    actorId:     userId,
    actorName:   profile.full_name,
    action:      'exported',
    entityType:  'defontana_export_petty_cash',
    entityId:    fundId,
    entityLabel: fund.name,
    newValue:    { movements, exportRef: ref, marcados: marked },
  })

  revalidatePath(`/petty-cash/${fundId}`)
  revalidatePath('/petty-cash')
  return { marked }
}

/** Deshace la contabilización de los movimientos indicados. Motivo obligatorio. */
export async function revertFundDefontana(
  fundId:    string,
  movements: FundMovement[],
  reason:    string,
) {
  const { supabase, userId, profile } = await getProfile()
  if (profile.role !== 'admin') throw new Error('Sin permiso')

  const motivo = reason.trim()
  if (motivo.length < 5) throw new Error('Indica el motivo de la reversa (mínimo 5 caracteres)')
  if (!movements.length) throw new Error('Selecciona al menos un movimiento para revertir')

  const { data: fund } = await supabase
    .from('petty_cash_funds').select('id, name, defontana_export_ref')
    .eq('id', fundId).eq('org_id', profile.org_id).single()
  if (!fund) throw new Error('Fondo no encontrado')

  let reverted = 0

  if (movements.includes('expense')) {
    const { data: done } = await supabase
      .from('petty_cash_items').select('id')
      .eq('fund_id', fundId).not('defontana_exported_at', 'is', null)
    const ids = (done ?? []).map(i => i.id)
    if (ids.length) {
      const { error } = await supabase
        .from('petty_cash_items')
        .update({ defontana_exported_at: null, defontana_export_ref: null })
        .in('id', ids)
      if (error) throw new Error(error.message)
      reverted += ids.length
    }
  }

  const transferMovements = movements.filter(m => m !== 'expense')
  if (transferMovements.length) {
    const { data: done } = await supabase
      .from('petty_cash_transfers').select('id, type')
      .eq('fund_id', fundId).not('defontana_exported_at', 'is', null)
    const ids = ((done ?? []) as unknown as { id: string; type: string }[])
      .filter(t => transferMovements.includes(TRANSFER_MOVEMENT[t.type]))
      .map(t => t.id)
    if (ids.length) {
      const { error } = await supabase
        .from('petty_cash_transfers')
        .update({ defontana_exported_at: null, defontana_export_ref: null })
        .in('id', ids)
      if (error) throw new Error(error.message)
      reverted += ids.length
    }
  }

  if (!reverted) throw new Error('No hay movimientos contabilizados de los tipos seleccionados')

  // Si ya no queda nada contabilizado, el fondo vuelve a estar sin contabilizar
  const [itemsLeft, transfersLeft] = await Promise.all([
    supabase.from('petty_cash_items').select('id', { count: 'exact', head: true })
      .eq('fund_id', fundId).not('defontana_exported_at', 'is', null),
    supabase.from('petty_cash_transfers').select('id', { count: 'exact', head: true })
      .eq('fund_id', fundId).not('defontana_exported_at', 'is', null),
  ])
  const headerCleared = !itemsLeft.count && !transfersLeft.count
  if (headerCleared) {
    await supabase
      .from('petty_cash_funds')
      .update({ defontana_exported_at: null, defontana_export_ref: null })
      .eq('id', fundId).eq('org_id', profile.org_id)
  }

  await logAudit({
    orgId:       profile.org_id,
    actorId:     userId,
    actorName:   profile.full_name,
    action:      'reverted',
    entityType:  'defontana_export_petty_cash',
    entityId:    fundId,
    entityLabel: fund.name,
    oldValue:    { defontana_export_ref: fund.defontana_export_ref, movements },
    newValue:    { reverted, headerCleared },
    notes:       motivo,
  })

  revalidatePath(`/petty-cash/${fundId}`)
  revalidatePath('/petty-cash')
  return { reverted, headerCleared }
}
