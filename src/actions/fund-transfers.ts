'use server'

import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath }    from 'next/cache'
import { redirect }          from 'next/navigation'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, org_id, role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Perfil no encontrado')
  if (profile.role !== 'admin') throw new Error('Sin permiso para gestionar traspasos')
  return { supabase, userId: user.id, profile, orgId: profile.org_id }
}

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export type PendingTransfer = {
  id:                   string
  date:                 string
  amount:               number
  description:          string | null
  payer_employee_id:    string
  payer_employee_name:  string
  payer_fund_id:        string | null
  payer_fund_name:      string | null
  payer_report_id:      string | null
  payer_report_title:   string | null
  receiver_employee_id: string
  created_at:           string
}

export type FundTransferRow = {
  id:                    string
  date:                  string
  amount:                number
  description:           string | null
  matched:               boolean
  matched_at:            string | null
  payer_employee_id:     string
  payer_employee_name:   string
  payer_fund_id:         string | null
  payer_fund_name:       string | null
  payer_report_id:       string | null
  payer_report_title:    string | null
  receiver_employee_id:  string
  receiver_employee_name: string
  receiver_fund_id:      string | null
  receiver_fund_name:    string | null
  receiver_report_id:    string | null
  receiver_report_title: string | null
  created_at:            string
}

// ── Crear traspaso (pago desde fondo activo o rendición/carga histórica) ──────

export async function createFundTransfer(params: {
  date:                  string
  amount:                number
  description?:          string
  receiver_employee_id:  string
  // Exactamente uno de los dos para el origen:
  payer_fund_id?:        string
  payer_report_id?:      string
  // Opcionales para vinculación directa al crear:
  receiver_fund_id?:     string
  receiver_report_id?:   string
}) {
  const { supabase, userId, orgId } = await requireAdmin()

  if (!params.payer_fund_id && !params.payer_report_id)
    throw new Error('Debe especificar el fondo o rendición de origen')
  if (params.amount <= 0) throw new Error('El monto debe ser mayor a cero')

  // Verificar que el empleado receptor pertenece a la misma org
  const { data: receiver } = await supabase
    .from('users')
    .select('id, org_id')
    .eq('id', params.receiver_employee_id)
    .eq('org_id', orgId)
    .single()
  if (!receiver) throw new Error('Empleado receptor no encontrado en la organización')

  const adminClient = createAdminClient()
  let transferId: string | null = null
  let payerEmployeeId: string | null = null

  // ── Rama origen: fondo de caja chica ────────────────────────────────────
  if (params.payer_fund_id) {
    const { data: fund } = await supabase
      .from('petty_cash_funds')
      .select('id, org_id, employee_id')
      .eq('id', params.payer_fund_id)
      .eq('org_id', orgId)
      .single()
    if (!fund) throw new Error('Fondo de origen no encontrado')
    payerEmployeeId = fund.employee_id

    const { data: t, error: tErr } = await adminClient
      .from('fund_transfers')
      .insert({
        org_id:               orgId,
        date:                 params.date,
        amount:               params.amount,
        description:          params.description?.trim() || null,
        payer_employee_id:    fund.employee_id,
        payer_fund_id:        params.payer_fund_id,
        payer_report_id:      null,
        receiver_employee_id: params.receiver_employee_id,
        created_by:           userId,
      })
      .select('id')
      .single()
    if (tErr || !t) throw new Error(tErr?.message ?? 'Error al crear traspaso')
    transferId = t.id

    const { data: recUser } = await supabase
      .from('users').select('full_name').eq('id', params.receiver_employee_id).single()
    await adminClient.from('petty_cash_items').insert({
      fund_id:       params.payer_fund_id,
      org_id:        orgId,
      description:   `↗ Traspaso → ${recUser?.full_name ?? 'empleado'}`,
      amount:        params.amount,
      currency:      'CLP',
      exchange_rate: 1,
      amount_clp:    params.amount,
      date:          params.date,
      notes:         params.description?.trim() || null,
      transfer_id:   t.id,
    })

  // ── Rama origen: rendición o carga histórica ─────────────────────────────
  } else if (params.payer_report_id) {
    const { data: report } = await supabase
      .from('expense_reports')
      .select('id, org_id, submitter_id')
      .eq('id', params.payer_report_id)
      .eq('org_id', orgId)
      .single()
    if (!report) throw new Error('Rendición de origen no encontrada')
    payerEmployeeId = report.submitter_id

    const { data: t, error: tErr } = await adminClient
      .from('fund_transfers')
      .insert({
        org_id:               orgId,
        date:                 params.date,
        amount:               params.amount,
        description:          params.description?.trim() || null,
        payer_employee_id:    report.submitter_id,
        payer_fund_id:        null,
        payer_report_id:      params.payer_report_id,
        receiver_employee_id: params.receiver_employee_id,
        created_by:           userId,
      })
      .select('id')
      .single()
    if (tErr || !t) throw new Error(tErr?.message ?? 'Error al crear traspaso')
    transferId = t.id

    const { data: recUser } = await supabase
      .from('users').select('full_name').eq('id', params.receiver_employee_id).single()
    await adminClient.from('expense_items').insert({
      report_id:            params.payer_report_id,
      org_id:               orgId,
      description:          `↗ Traspaso → ${recUser?.full_name ?? 'empleado'}`,
      amount:               params.amount,
      currency:             'CLP',
      exchange_rate:        1,
      exchange_rate_source: 'manual' as const,
      amount_clp:           params.amount,
      date:                 params.date,
      item_type:            'transfer' as const,
      notes:                params.description?.trim() || null,
      transfer_id:          t.id,
    })
  }

  // ── Vinculación directa al receptor (si se especificó destino) ───────────
  if (transferId && (params.receiver_fund_id || params.receiver_report_id)) {
    const { data: payerUser } = payerEmployeeId
      ? await supabase.from('users').select('full_name').eq('id', payerEmployeeId).single()
      : { data: null }
    const payerName = payerUser?.full_name ?? 'empleado'

    if (params.receiver_fund_id) {
      await adminClient.from('petty_cash_items').insert({
        fund_id:       params.receiver_fund_id,
        org_id:        orgId,
        description:   `↙ Traspaso ← ${payerName}`,
        amount:        params.amount,
        currency:      'CLP',
        exchange_rate: 1,
        amount_clp:    params.amount,
        date:          params.date,
        notes:         params.description?.trim() || null,
        transfer_id:   transferId,
      })
      await adminClient.from('fund_transfers').update({
        receiver_fund_id: params.receiver_fund_id,
        matched:          true,
        matched_at:       new Date().toISOString(),
      }).eq('id', transferId)
    } else if (params.receiver_report_id) {
      await adminClient.from('expense_items').insert({
        report_id:            params.receiver_report_id,
        org_id:               orgId,
        description:          `↙ Traspaso ← ${payerName}`,
        amount:               params.amount,
        currency:             'CLP',
        exchange_rate:        1,
        exchange_rate_source: 'manual' as const,
        amount_clp:           params.amount,
        date:                 params.date,
        item_type:            'transfer' as const,
        notes:                params.description?.trim() || null,
        transfer_id:          transferId,
      })
      await adminClient.from('fund_transfers').update({
        receiver_report_id: params.receiver_report_id,
        matched:            true,
        matched_at:         new Date().toISOString(),
      }).eq('id', transferId)
    }
  }

  revalidatePath('/petty-cash')
  revalidatePath('/admin/carga-historica')
  revalidatePath('/admin/reports')
}

// ── Vincular traspaso pendiente a un fondo o carga histórica receptora ─────────

export async function linkFundTransfer(
  transferId: string,
  target: { fundId?: string; reportId?: string },
) {
  const { supabase, orgId } = await requireAdmin()

  if (!target.fundId && !target.reportId)
    throw new Error('Debe especificar el fondo o carga histórica destino')

  // Leer el traspaso
  const { data: transfer } = await supabase
    .from('fund_transfers')
    .select('*')
    .eq('id', transferId)
    .eq('org_id', orgId)
    .single()
  if (!transfer) throw new Error('Traspaso no encontrado')
  if (transfer.matched) throw new Error('Este traspaso ya está vinculado')

  const adminClient = createAdminClient()

  // Obtener nombre del empleado pagador para la descripción
  const { data: payerUser } = await supabase
    .from('users').select('full_name').eq('id', transfer.payer_employee_id).single()
  const payerName = payerUser?.full_name ?? 'empleado'

  if (target.fundId) {
    // Verificar que el fondo pertenece a la org y al empleado receptor
    const { data: fund } = await supabase
      .from('petty_cash_funds')
      .select('id, org_id, employee_id')
      .eq('id', target.fundId)
      .eq('org_id', orgId)
      .single()
    if (!fund) throw new Error('Fondo destino no encontrado')
    if (fund.employee_id !== transfer.receiver_employee_id)
      throw new Error('El fondo no pertenece al empleado receptor del traspaso')

    // Crear ítem receptor en petty_cash_items
    await adminClient.from('petty_cash_items').insert({
      fund_id:      target.fundId,
      org_id:       orgId,
      description:  `↙ Traspaso ← ${payerName}`,
      amount:       transfer.amount,
      currency:     'CLP',
      exchange_rate: 1,
      amount_clp:   transfer.amount,
      date:         transfer.date,
      notes:        transfer.description,
      transfer_id:  transferId,
    })

    // Marcar traspaso como vinculado
    const { error } = await adminClient
      .from('fund_transfers')
      .update({
        receiver_fund_id: target.fundId,
        matched:          true,
        matched_at:       new Date().toISOString(),
      })
      .eq('id', transferId)
    if (error) throw new Error(error.message)

  } else if (target.reportId) {
    // Verificar que el reporte pertenece a la org y al empleado receptor
    const { data: report } = await supabase
      .from('expense_reports')
      .select('id, org_id, submitter_id')
      .eq('id', target.reportId)
      .eq('org_id', orgId)
      .single()
    if (!report) throw new Error('Carga histórica destino no encontrada')
    if (report.submitter_id !== transfer.receiver_employee_id)
      throw new Error('La carga histórica no pertenece al empleado receptor del traspaso')

    // Crear ítem receptor en expense_items
    await adminClient.from('expense_items').insert({
      report_id:            target.reportId,
      org_id:               orgId,
      description:          `↙ Traspaso ← ${payerName}`,
      amount:               transfer.amount,
      currency:             'CLP',
      exchange_rate:        1,
      exchange_rate_source: 'manual' as const,
      amount_clp:           transfer.amount,
      date:                 transfer.date,
      item_type:            'transfer' as const,
      notes:                transfer.description,
      transfer_id:          transferId,
    })

    // Marcar traspaso como vinculado
    const { error } = await adminClient
      .from('fund_transfers')
      .update({
        receiver_report_id: target.reportId,
        matched:            true,
        matched_at:         new Date().toISOString(),
      })
      .eq('id', transferId)
    if (error) throw new Error(error.message)
  }

  revalidatePath('/petty-cash')
  revalidatePath('/admin/carga-historica')
}

// ── Traspasos sin vincular para un empleado (el receptor) ─────────────────────
// Usado para mostrar el banner "saldo flotante" en la vista del receptor

export async function getPendingTransfersForEmployee(
  employeeId: string,
): Promise<PendingTransfer[]> {
  const { supabase, orgId } = await requireAdmin()

  const { data, error } = await supabase
    .from('fund_transfers')
    .select('id, date, amount, description, payer_employee_id, payer_fund_id, payer_report_id, receiver_employee_id, created_at')
    .eq('org_id', orgId)
    .eq('receiver_employee_id', employeeId)
    .eq('matched', false)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const transfers = data ?? []
  if (!transfers.length) return []

  // Nombres de los pagadores
  const payerIds = [...new Set(transfers.map(t => t.payer_employee_id))]
  const { data: payers } = await supabase
    .from('users').select('id, full_name').in('id', payerIds)
  const payerMap = Object.fromEntries((payers ?? []).map(u => [u.id, u.full_name]))

  // Nombres de fondos pagadores
  const fundIds = transfers.map(t => t.payer_fund_id).filter(Boolean) as string[]
  const fundMap: Record<string, string> = {}
  if (fundIds.length) {
    const { data: funds } = await supabase
      .from('petty_cash_funds').select('id, name').in('id', fundIds)
    for (const f of funds ?? []) fundMap[f.id] = f.name
  }

  // Títulos de cargas históricas pagadoras
  const reportIds = transfers.map(t => t.payer_report_id).filter(Boolean) as string[]
  const reportMap: Record<string, string> = {}
  if (reportIds.length) {
    const { data: reports } = await supabase
      .from('expense_reports').select('id, title').in('id', reportIds)
    for (const r of reports ?? []) reportMap[r.id] = r.title
  }

  return transfers.map(t => ({
    id:                   t.id,
    date:                 t.date,
    amount:               t.amount,
    description:          t.description,
    payer_employee_id:    t.payer_employee_id,
    payer_employee_name:  payerMap[t.payer_employee_id] ?? '—',
    payer_fund_id:        t.payer_fund_id,
    payer_fund_name:      t.payer_fund_id ? (fundMap[t.payer_fund_id] ?? null) : null,
    payer_report_id:      t.payer_report_id,
    payer_report_title:   t.payer_report_id ? (reportMap[t.payer_report_id] ?? null) : null,
    receiver_employee_id: t.receiver_employee_id,
    created_at:           t.created_at,
  }))
}

// ── Todos los traspasos de la organización (vista admin) ──────────────────────

export async function getOrgFundTransfers(): Promise<FundTransferRow[]> {
  const { supabase, orgId } = await requireAdmin()

  const { data, error } = await supabase
    .from('fund_transfers')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  const transfers = data ?? []
  if (!transfers.length) return []

  // Resolver nombres de empleados
  const empIds = [...new Set([
    ...transfers.map(t => t.payer_employee_id),
    ...transfers.map(t => t.receiver_employee_id),
  ])]
  const { data: emps } = await supabase
    .from('users').select('id, full_name').in('id', empIds)
  const empMap = Object.fromEntries((emps ?? []).map(u => [u.id, u.full_name]))

  // Resolver nombres de fondos
  const fundIds = [...new Set([
    ...transfers.map(t => t.payer_fund_id).filter(Boolean),
    ...transfers.map(t => t.receiver_fund_id).filter(Boolean),
  ])] as string[]
  const fundMap: Record<string, string> = {}
  if (fundIds.length) {
    const { data: funds } = await supabase
      .from('petty_cash_funds').select('id, name').in('id', fundIds)
    for (const f of funds ?? []) fundMap[f.id] = f.name
  }

  // Resolver títulos de reportes
  const reportIds = [...new Set([
    ...transfers.map(t => t.payer_report_id).filter(Boolean),
    ...transfers.map(t => t.receiver_report_id).filter(Boolean),
  ])] as string[]
  const reportMap: Record<string, string> = {}
  if (reportIds.length) {
    const { data: reports } = await supabase
      .from('expense_reports').select('id, title').in('id', reportIds)
    for (const r of reports ?? []) reportMap[r.id] = r.title
  }

  return transfers.map(t => ({
    id:                    t.id,
    date:                  t.date,
    amount:                t.amount,
    description:           t.description,
    matched:               t.matched,
    matched_at:            t.matched_at,
    payer_employee_id:     t.payer_employee_id,
    payer_employee_name:   empMap[t.payer_employee_id] ?? '—',
    payer_fund_id:         t.payer_fund_id,
    payer_fund_name:       t.payer_fund_id    ? (fundMap[t.payer_fund_id]     ?? null) : null,
    payer_report_id:       t.payer_report_id,
    payer_report_title:    t.payer_report_id  ? (reportMap[t.payer_report_id] ?? null) : null,
    receiver_employee_id:  t.receiver_employee_id,
    receiver_employee_name: empMap[t.receiver_employee_id] ?? '—',
    receiver_fund_id:      t.receiver_fund_id,
    receiver_fund_name:    t.receiver_fund_id ? (fundMap[t.receiver_fund_id]  ?? null) : null,
    receiver_report_id:    t.receiver_report_id,
    receiver_report_title: t.receiver_report_id ? (reportMap[t.receiver_report_id] ?? null) : null,
    created_at:            t.created_at,
  }))
}

// ── Eliminar traspaso sin vincular ─────────────────────────────────────────────

export async function deleteFundTransfer(transferId: string): Promise<void> {
  const { supabase, orgId } = await requireAdmin()

  const { data: transfer } = await supabase
    .from('fund_transfers')
    .select('*')
    .eq('id', transferId)
    .eq('org_id', orgId)
    .single()
  if (!transfer) throw new Error('Traspaso no encontrado')
  if (transfer.matched) throw new Error('No se puede eliminar un traspaso ya vinculado')

  const adminClient = createAdminClient()

  // Eliminar ítem del lado pagador
  if (transfer.payer_fund_id) {
    await adminClient.from('petty_cash_items').delete().eq('transfer_id', transferId)
  } else if (transfer.payer_report_id) {
    await adminClient.from('expense_items').delete().eq('transfer_id', transferId)
  }

  // Eliminar el traspaso
  const { error } = await adminClient.from('fund_transfers').delete().eq('id', transferId)
  if (error) throw new Error(error.message)

  revalidatePath('/petty-cash')
  revalidatePath('/admin/carga-historica')
}

// ── Actualizar traspaso sin vincular ───────────────────────────────────────────

export async function updateFundTransfer(
  transferId: string,
  updates: {
    amount?:               number
    date?:                 string
    description?:          string | null
    receiver_employee_id?: string
  },
): Promise<void> {
  const { supabase, orgId } = await requireAdmin()

  const { data: transfer } = await supabase
    .from('fund_transfers')
    .select('*')
    .eq('id', transferId)
    .eq('org_id', orgId)
    .single()
  if (!transfer) throw new Error('Traspaso no encontrado')
  if (transfer.matched) throw new Error('No se puede modificar un traspaso ya vinculado')

  const adminClient = createAdminClient()

  // Resolver nombre del receptor (para actualizar descripción del ítem)
  const newReceiverId = updates.receiver_employee_id ?? transfer.receiver_employee_id
  const { data: recUser } = await supabase.from('users').select('full_name').eq('id', newReceiverId).single()
  const receiverName = recUser?.full_name ?? 'empleado'

  // Actualizar fund_transfers
  const ftPatch = {
    ...(updates.amount               !== undefined ? { amount: updates.amount }                               : {}),
    ...(updates.date                 !== undefined ? { date: updates.date }                                   : {}),
    ...(updates.description          !== undefined ? { description: updates.description?.trim() || null }     : {}),
    ...(updates.receiver_employee_id !== undefined ? { receiver_employee_id: updates.receiver_employee_id }  : {}),
  }
  if (Object.keys(ftPatch).length) {
    const { error } = await adminClient.from('fund_transfers').update(ftPatch).eq('id', transferId)
    if (error) throw new Error(error.message)
  }

  // Actualizar ítem del lado pagador
  const newDesc = `↗ Traspaso → ${receiverName}`
  const itemPatch = {
    description: newDesc,
    ...(updates.amount      !== undefined ? { amount: updates.amount, amount_clp: updates.amount }         : {}),
    ...(updates.date        !== undefined ? { date: updates.date }                                         : {}),
    ...(updates.description !== undefined ? { notes: updates.description?.trim() || null }                 : {}),
  }
  if (transfer.payer_fund_id) {
    await adminClient.from('petty_cash_items').update(itemPatch).eq('transfer_id', transferId)
  } else if (transfer.payer_report_id) {
    await adminClient.from('expense_items').update(itemPatch).eq('transfer_id', transferId)
  }

  revalidatePath('/petty-cash')
  revalidatePath('/admin/carga-historica')
}

// ── Eliminar traspaso YA vinculado (borra ambos ítems + el registro) ────────────

export async function deleteLinkedFundTransfer(transferId: string): Promise<void> {
  const { supabase, orgId } = await requireAdmin()

  const { data: transfer } = await supabase
    .from('fund_transfers')
    .select('*')
    .eq('id', transferId)
    .eq('org_id', orgId)
    .single()
  if (!transfer) throw new Error('Traspaso no encontrado')

  const adminClient = createAdminClient()

  // Eliminar ítems en ambos lados (payer + receiver)
  if (transfer.payer_fund_id) {
    await adminClient.from('petty_cash_items').delete().eq('transfer_id', transferId)
  } else if (transfer.payer_report_id) {
    await adminClient.from('expense_items').delete().eq('transfer_id', transferId)
  }
  // El receiver puede ser fondo o reporte; borramos en ambas tablas para seguridad
  if (transfer.receiver_fund_id) {
    await adminClient.from('petty_cash_items').delete().eq('transfer_id', transferId)
  }
  if (transfer.receiver_report_id) {
    await adminClient.from('expense_items').delete().eq('transfer_id', transferId)
  }

  const { error } = await adminClient.from('fund_transfers').delete().eq('id', transferId)
  if (error) throw new Error(error.message)

  revalidatePath('/petty-cash')
  revalidatePath('/admin/carga-historica')
}

// ── Editar traspaso YA vinculado (actualiza monto/fecha/desc en ambos ítems) ───

export async function updateLinkedFundTransfer(
  transferId: string,
  updates: { amount?: number; date?: string; description?: string | null },
): Promise<void> {
  const { supabase, orgId } = await requireAdmin()

  const { data: transfer } = await supabase
    .from('fund_transfers')
    .select('*')
    .eq('id', transferId)
    .eq('org_id', orgId)
    .single()
  if (!transfer) throw new Error('Traspaso no encontrado')

  const adminClient = createAdminClient()

  // Actualizar fund_transfers
  const ftPatch = {
    ...(updates.amount      !== undefined ? { amount: updates.amount }                           : {}),
    ...(updates.date        !== undefined ? { date: updates.date }                               : {}),
    ...(updates.description !== undefined ? { description: updates.description?.trim() || null } : {}),
  }
  if (Object.keys(ftPatch).length) {
    const { error } = await adminClient.from('fund_transfers').update(ftPatch).eq('id', transferId)
    if (error) throw new Error(error.message)
  }

  // Actualizar ítems: solo monto/fecha/notas (la descripción del item tiene el nombre del otro lado)
  const itemPatch = {
    ...(updates.amount      !== undefined ? { amount: updates.amount, amount_clp: updates.amount } : {}),
    ...(updates.date        !== undefined ? { date: updates.date }                                  : {}),
    ...(updates.description !== undefined ? { notes: updates.description?.trim() || null }          : {}),
  }
  if (Object.keys(itemPatch).length) {
    // Payer side
    if (transfer.payer_fund_id)   await adminClient.from('petty_cash_items').update(itemPatch).eq('transfer_id', transferId)
    if (transfer.payer_report_id) await adminClient.from('expense_items').update(itemPatch).eq('transfer_id', transferId)
    // Receiver side
    if (transfer.receiver_fund_id)   await adminClient.from('petty_cash_items').update(itemPatch).eq('transfer_id', transferId)
    if (transfer.receiver_report_id) await adminClient.from('expense_items').update(itemPatch).eq('transfer_id', transferId)
  }

  revalidatePath('/petty-cash')
  revalidatePath('/admin/carga-historica')
}

// ── Lista simple de empleados activos de la org (para selector de receptor) ───

export async function getOrgEmployeesSimple(): Promise<{ id: string; full_name: string }[]> {
  const { supabase, orgId } = await requireAdmin()
  const { data } = await supabase
    .from('users')
    .select('id, full_name')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('full_name')
  return data ?? []
}

// ── Fondos/cargas históricas de un empleado (para el selector al vincular) ────

export type EmployeeTarget = {
  id:    string
  label: string
  type:  'fund' | 'report'
}

export async function getEmployeeTargets(employeeId: string): Promise<EmployeeTarget[]> {
  const { supabase, orgId } = await requireAdmin()

  const [{ data: funds }, { data: reports }] = await Promise.all([
    supabase
      .from('petty_cash_funds')
      .select('id, name, status')
      .eq('org_id', orgId)
      .eq('employee_id', employeeId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('expense_reports')
      .select('id, title, is_historical_import, historical_type')
      .eq('org_id', orgId)
      .eq('submitter_id', employeeId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  const fundTargets: EmployeeTarget[] = (funds ?? []).map(f => ({
    id:    f.id,
    label: `${f.name} (${f.status})`,
    type:  'fund' as const,
  }))
  const reportTargets: EmployeeTarget[] = (reports ?? []).map(r => {
    let prefix = 'Rendición'
    if (r.is_historical_import) {
      prefix = r.historical_type === 'caja_chica' ? 'Histórica (CC)' : 'Histórica (Rend.)'
    }
    return {
      id:    r.id,
      label: `${prefix} — ${r.title}`,
      type:  'report' as const,
    }
  })

  return [...fundTargets, ...reportTargets]
}

// ── Todas las rendiciones de la org (para selector directo en modal traspaso) ─

export type OrgReportSimple = {
  id:             string
  title:          string
  submitter_id:   string
  submitter_name: string
  status:         string
}

export async function getOrgReportsForTransfer(): Promise<OrgReportSimple[]> {
  const { supabase, orgId } = await requireAdmin()
  const { data } = await supabase
    .from('expense_reports')
    .select('id, title, submitter_id, status, users!expense_reports_submitter_id_fkey(full_name)')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .not('status', 'eq', 'draft')
    .order('created_at', { ascending: false })
  return (data ?? []).map(r => ({
    id:             r.id,
    title:          r.title,
    submitter_id:   r.submitter_id,
    submitter_name: (r.users as { full_name: string } | null)?.full_name ?? '—',
    status:         r.status,
  }))
}
