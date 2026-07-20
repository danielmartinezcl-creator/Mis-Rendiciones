'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { FundStatus } from '@/lib/supabase/types'

async function getProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, org_id, role, can_approve, can_manage_petty_cash, full_name')
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

  const { error } = await supabase.from('petty_cash_items').insert({
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
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/petty-cash/${fundId}`)
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
  if (fund.status !== 'funds_sent') {
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
  const { supabase } = await getProfile()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') throw new Error('Solo administradores')

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('petty_cash_funds')
    .delete()
    .eq('id', fundId)

  if (error) throw new Error(error.message)
  revalidatePath('/petty-cash')
}

// ── Consultas ─────────────────────────────────────────────────────────────────

export async function listPettyCashFunds() {
  const { supabase, userId, profile } = await getProfile()

  let query = supabase
    .from('petty_cash_funds')
    .select('id, name, status, amount_requested, amount_approved, currency, period_start, period_end, employee_id, manager_id, created_at')
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
    supabase.from('expense_categories').select('id, name, color').eq('is_active', true),
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
    currentUser: { id: userId, role: profile.role, can_approve: profile.can_approve, can_manage_petty_cash: profile.can_manage_petty_cash },
  }
}

export type FundDetail = NonNullable<Awaited<ReturnType<typeof getFundDetail>>>

// ── Categorías activas (para filtros) ────────────────────────────────────────

export async function getActivePettyCashCategories() {
  const { supabase, profile } = await getProfile()
  const { data } = await supabase
    .from('expense_categories')
    .select('id, name, color')
    .or(`org_id.eq.${profile.org_id},org_id.is.null`)
    .eq('is_active', true)
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

  // Obtener fondos del tenant (con filtro de empleado si aplica)
  let fundsQuery = supabase
    .from('petty_cash_funds')
    .select('id, name, employee_id')
    .eq('org_id', profile.org_id)

  if (filters.employeeIds?.length) {
    fundsQuery = fundsQuery.in('employee_id', filters.employeeIds)
  }

  const { data: funds } = await fundsQuery
  if (!funds?.length) return { items: [], totalCLP: 0 }

  const fundIds   = funds.map(f => f.id)
  const fundMap   = Object.fromEntries(funds.map(f => [f.id, f]))

  // Obtener ítems filtrados
  let itemsQuery = supabase
    .from('petty_cash_items')
    .select('id, fund_id, description, amount, currency, amount_clp, date, category_id, merchant, doc_type, doc_number, notes, status, rejection_reason')
    .in('fund_id', fundIds)
    .order('date', { ascending: true })

  if (filters.dateFrom) itemsQuery = itemsQuery.gte('date', filters.dateFrom)
  if (filters.dateTo)   itemsQuery = itemsQuery.lte('date', filters.dateTo)
  if (filters.itemStatus && filters.itemStatus !== 'all') {
    itemsQuery = itemsQuery.eq('status', filters.itemStatus as 'pending' | 'approved' | 'rejected')
  }
  if (filters.categoryIds?.length) {
    itemsQuery = itemsQuery.in('category_id', filters.categoryIds)
  }

  const { data: items } = await itemsQuery
  if (!items?.length) return { items: [], totalCLP: 0 }

  // Enriquecer con categorías y empleados
  const catIds = [...new Set(items.map(i => i.category_id).filter(Boolean))] as string[]
  const empIds = [...new Set(funds.map(f => f.employee_id))]

  const [catsRes, usersRes] = await Promise.all([
    catIds.length
      ? supabase.from('expense_categories').select('id, name, color').in('id', catIds)
      : Promise.resolve({ data: [] as { id: string; name: string; color: string | null }[] }),
    supabase.from('users').select('id, full_name').in('id', empIds),
  ])

  const catMap  = Object.fromEntries((catsRes.data ?? []).map(c => [c.id, c]))
  const userMap = Object.fromEntries((usersRes.data ?? []).map(u => [u.id, u.full_name]))

  const enriched = items.map(i => ({
    ...i,
    fund_name:      fundMap[i.fund_id]?.name ?? 'Desconocido',
    employee_name:  fundMap[i.fund_id] ? (userMap[fundMap[i.fund_id].employee_id] ?? 'Desconocido') : 'Desconocido',
    category_name:  i.category_id ? (catMap[i.category_id]?.name ?? null) : null,
    category_color: i.category_id ? (catMap[i.category_id]?.color ?? null) : null,
  }))

  const totalCLP = enriched.reduce((s, i) => s + i.amount_clp, 0)

  return { items: enriched, totalCLP }
}
