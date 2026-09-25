'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { FundStatus, Database } from '@/lib/supabase/types'
import { logAudit } from '@/lib/audit'
import { validateStringLength, validateDateRange } from '@/lib/validators'
import { DEFONTANA_ORG_COLUMNS, mapDefontanaSettings, type DefontanaOrgRow } from '@/lib/export/defontana-settings'
import type { DefontanaItem } from '@/lib/export/defontana'
import { contextoFondo, exigirPaso, permisoEn, type ContextoFondo } from '@/lib/contexto-permisos'
import { puedeEnviar, enEtapa, type Paso } from '@/lib/permisos'
import { estadoTrasAprobacionFondo, estadoTrasLiquidacion } from '@/lib/flujo'
import { notifyFundStep, notifyFundOutcome, notifyAdminsMissingApprover } from '@/lib/avisos'

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

// El historial del fondo lo escribe solo el servidor: la 033 le quita a la
// sesión el INSERT en petty_cash_approvals, porque de ese historial salen las
// reglas (quién cargó, quién aprobó). El actor es siempre quien tiene la sesión.
// Se llama después de una escritura que ya pasó por la RLS (crear el fondo,
// registrar la transferencia), que es la que decide si la persona podía hacerlo.
async function audit(
  fundId: string,
  actorId: string,
  action: FundAuditAction,
  notes?: string | null,
  amount?: number | null,
) {
  const { error } = await createAdminClient().from('petty_cash_approvals').insert({
    fund_id:  fundId,
    actor_id: actorId,
    action,
    notes:    notes ?? null,
    amount:   amount ?? null,
  })
  if (error) console.error('[fondos] no se pudo registrar en el historial', fundId, action, error)
}

type FundUpdate      = Database['public']['Tables']['petty_cash_funds']['Update']
type FundAuditAction = Database['public']['Tables']['petty_cash_approvals']['Insert']['action']

// Toda transición de estado de un fondo pasa por acá: escribe con la llave de
// servicio (desde la 033 la base rechaza cambios de estado desde una sesión) y
// confirma que la fila cambió de verdad.
async function moverFondo(ctx: ContextoFondo, desde: FundStatus, hacia: FundStatus, extra: FundUpdate = {}) {
  const { data, error } = await ctx.admin
    .from('petty_cash_funds')
    .update({ ...extra, status: hacia })
    .eq('id', ctx.fondo.id)
    .eq('status', desde)
    .select('id')
  if (error || !data?.length) throw new Error('El fondo cambió mientras lo mirabas. Recarga la página')
}

async function registrar(
  ctx: ContextoFondo, actorId: string, action: FundAuditAction,
  opts: { notes?: string | null; amount?: number | null; level?: 1 | 2 | null } = {},
) {
  const { error } = await ctx.admin.from('petty_cash_approvals').insert({
    fund_id: ctx.fondo.id, actor_id: actorId, action,
    notes: opts.notes ?? null, amount: opts.amount ?? null, level: opts.level ?? null,
  })
  if (error) throw new Error(error.message)
}

function revalidarFondo(fundId: string) {
  revalidatePath(`/petty-cash/${fundId}`)
  revalidatePath('/petty-cash')
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

  await audit(fund.id, userId, 'created', null, data.amount_requested)
  revalidatePath('/petty-cash')
  redirect(`/petty-cash/${fund.id}`)
}

// ── EFF: enviar a autorización ────────────────────────────────────────────────

export async function submitFundForApproval(fundId: string) {
  const { userId } = await getProfile()
  const ctx = await contextoFondo(fundId)
  if (ctx.fondo.manager_id !== userId) throw new Error('Solo quien creó el fondo puede enviarlo')
  if (ctx.fondo.status !== 'draft') throw new Error('Este fondo ya fue enviado')

  const yo = ctx.personas.find(p => p.id === userId)
  if (!yo) throw new Error('Fondo no encontrado')
  const envio = puedeEnviar('fondo', yo, ctx.doc.cadena)
  if (!envio.ok) {
    if (!ctx.doc.cadena.l1) {
      const beneficiario = ctx.personas.find(p => p.id === ctx.fondo.employee_id)?.nombre ?? 'Un empleado'
      notifyAdminsMissingApprover(ctx.fondo.org_id, beneficiario, 'un fondo').catch(() => {})
    }
    throw new Error(envio.motivo)
  }

  await moverFondo(ctx, 'draft', 'pending_approval')
  await registrar(ctx, userId, 'submitted_for_approval')
  notifyFundStep(fundId, 'decidir_l1', userId).catch(() => {})
  revalidarFondo(fundId)
}

// ── Aprobador: autorizar fondo ────────────────────────────────────────────────

export async function approveFund(fundId: string, approvedAmount: number, notes?: string) {
  const { userId } = await getProfile()
  if (!(approvedAmount > 0)) throw new Error('El monto aprobado debe ser mayor que cero')

  const ctx = await contextoFondo(fundId)
  // Un fondo en liquidación también espera «decidir»: sin esto, aprobarlo acá
  // lo devolvía a la cola del banco con la plata ya enviada.
  const etapa = enEtapa(ctx.doc, 'fondo')
  if (!etapa.ok) throw new Error(etapa.motivo)
  const { paso } = exigirPaso(ctx, ctx.fondo.status, userId, ['decidir_l1', 'decidir_l2'], 'Este fondo ya fue decidido')
  const nivel = paso === 'decidir_l2' ? 2 : 1
  const hacia = estadoTrasAprobacionFondo({ nivel, tieneL2: !!ctx.doc.cadena.l2 })

  await moverFondo(ctx, ctx.fondo.status as FundStatus, hacia, { amount_approved: approvedAmount })
  await registrar(ctx, userId, 'approved', { notes: notes ?? null, amount: approvedAmount, level: nivel })
  notifyFundStep(fundId, hacia === 'pending_approval_l2' ? 'decidir_l2' : 'cargar_pago', userId).catch(() => {})
  revalidarFondo(fundId)
}

// ── Aprobador: rechazar fondo ─────────────────────────────────────────────────

export async function rejectFund(fundId: string, notes: string) {
  const { userId } = await getProfile()
  if (!notes.trim()) throw new Error('Indica el motivo del rechazo')

  const ctx = await contextoFondo(fundId)
  // Vale en las dos etapas (fondo y liquidación: spec §2, «rechazo en cualquier
  // nivel»). Con la plata ya enviada (`funds_sent`) no hay paso de decisión y
  // `exigirPaso` lo rechaza.
  const { paso } = exigirPaso(ctx, ctx.fondo.status, userId, ['decidir_l1', 'decidir_l2'], 'Este fondo ya fue decidido')

  await moverFondo(ctx, ctx.fondo.status as FundStatus, 'rejected')
  await registrar(ctx, userId, 'rejected', { notes, level: paso === 'decidir_l2' ? 2 : 1 })
  notifyFundOutcome(fundId, 'rejected', userId).catch(() => {})
  revalidarFondo(fundId)
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
  const { userId } = await getProfile()
  const ctx = await contextoFondo(fundId)
  if (ctx.fondo.employee_id !== userId) throw new Error('Solo el empleado asignado puede enviar la liquidación')
  if (ctx.fondo.status !== 'funds_sent') throw new Error('Estado inválido')

  const yo = ctx.personas.find(p => p.id === userId)
  if (!yo) throw new Error('Fondo no encontrado')
  const envio = puedeEnviar('liquidacion', yo, ctx.doc.cadena)
  if (!envio.ok) {
    if (!ctx.doc.cadena.l1) notifyAdminsMissingApprover(ctx.fondo.org_id, yo.nombre, 'una liquidación').catch(() => {})
    throw new Error(envio.motivo)
  }

  // Directo al N1: el paso «elevar» del EFF se eliminó (D6)
  await moverFondo(ctx, 'funds_sent', 'pending_liquidation_approval')
  await registrar(ctx, userId, 'liquidation_submitted')
  notifyFundStep(fundId, 'decidir_l1', userId).catch(() => {})
  revalidarFondo(fundId)
}

// ── Aprobador: aprobar liquidación con decisión por ítem ──────────────────────

export async function approveLiquidation(
  fundId: string,
  decisions: { itemId: string; action: 'approved' | 'rejected'; reason?: string }[],
  notes?: string,
) {
  const { userId } = await getProfile()
  const ctx = await contextoFondo(fundId)
  // Un fondo recién enviado también espera «decidir»: sin esto, aprobar su
  // «liquidación» lo daba por liquidado sin que la plata hubiera salido.
  const etapa = enEtapa(ctx.doc, 'liquidacion')
  if (!etapa.ok) throw new Error(etapa.motivo)
  const { paso } = exigirPaso(ctx, ctx.fondo.status, userId, ['decidir_l1', 'decidir_l2'], 'Esta liquidación ya fue decidida')
  const nivel = paso === 'decidir_l2' ? 2 : 1

  // Misma regla que en las rendiciones: un id ajeno no se toca, y ningún gasto
  // pendiente puede quedar afuera — si no, la liquidación se cerraba con gastos
  // que nadie revisó. Todo se valida antes de escribir nada.
  const ids = decisions.map(d => d.itemId)
  const { data: items, error: itemsError } = await ctx.admin
    .from('petty_cash_items')
    .select('id, status')
    .eq('fund_id', fundId)
  if (itemsError) throw new Error(itemsError.message)
  const lista = items ?? []
  if (lista.filter(i => ids.includes(i.id)).length !== new Set(ids).size) {
    throw new Error('Hay gastos que no pertenecen a este fondo')
  }
  const decididos = new Set(ids)
  if (lista.some(i => i.status === 'pending' && !decididos.has(i.id))) {
    throw new Error('Debes decidir todos los gastos antes de aprobar la liquidación')
  }

  for (const d of decisions) {
    const { error } = await ctx.admin
      .from('petty_cash_items')
      .update({ status: d.action, rejection_reason: d.action === 'rejected' ? (d.reason ?? null) : null })
      .eq('id', d.itemId)
      .eq('fund_id', fundId)
    if (error) throw new Error(error.message)
  }

  const hacia = estadoTrasLiquidacion({ nivel, tieneL2: !!ctx.doc.cadena.l2 })
  if (hacia === 'pending_liquidation_l2') {
    // El N2 revisa lo que el N1 aprobó; lo rechazado sigue rechazado
    const { error } = await ctx.admin
      .from('petty_cash_items')
      .update({ status: 'pending' })
      .eq('fund_id', fundId)
      .eq('status', 'approved')
    if (error) throw new Error(error.message)
  }

  await moverFondo(ctx, ctx.fondo.status as FundStatus, hacia,
    hacia === 'settled' ? { settled_at: new Date().toISOString() } : {})
  await registrar(ctx, userId, 'liquidation_approved', { notes: notes ?? null, level: nivel })

  if (hacia === 'pending_liquidation_l2') notifyFundStep(fundId, 'decidir_l2', userId).catch(() => {})
  else notifyFundOutcome(fundId, 'settled', userId).catch(() => {})
  revalidarFondo(fundId)
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

  await audit(fundId, userId, 'settled',
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
  const { supabase, profile } = await getProfile()

  let query = supabase
    .from('petty_cash_funds')
    .select('id, name, status, amount_requested, amount_approved, currency, period_start, period_end, employee_id, manager_id, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Qué fondos ve cada uno lo decide la RLS (migración 032): los suyos, los que
  // creó, los de su cadena y los que esperan su paso en el banco. «Aprueba» ya
  // no deja ver todos los pendientes de la empresa.
  if (profile.role === 'admin') {
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

  // Un fondo en la papelera (abierto desde /admin/trash) no tiene contexto —
  // `contextoFondo` exige `deleted_at is null` — y eso no puede tumbar la
  // pantalla: sin permiso, simplemente no se puede accionar nada acá.
  let permiso: { paso: Paso | null; ok: boolean; motivo: string | null; esperandoA: string[] }
  try {
    permiso = permisoEn(await contextoFondo(fundId), fund.status, userId)
  } catch {
    permiso = { paso: null, ok: false, motivo: null, esperandoA: [] }
  }

  return {
    fund,
    items:      itemsRes.data ?? [],
    audits:     (auditsRes.data ?? []).map(a => ({ ...a, actor_name: auditorMap[a.actor_id] ?? 'Desconocido' })),
    transfers:  transfersRes.data ?? [],
    categories: categoriesRes.data ?? [],
    employee_name: userMap[fund.employee_id] ?? 'Desconocido',
    manager_name:  userMap[fund.manager_id]  ?? 'Desconocido',
    permiso,
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

/** Carga: quien tiene «carga banco» confirma la transferencia del fondo */
export async function confirmBankLoad(fundId: string, data: {
  amount:         number
  reference?:     string
  transferred_at: string
  notes?:         string
}) {
  const { userId } = await getProfile()
  const ctx = await contextoFondo(fundId)
  exigirPaso(ctx, ctx.fondo.status, userId, ['cargar_pago'], 'Este fondo ya no está esperando la carga')

  // El orden se queda así: el historial es de solo agregar, así que escribirlo
  // antes de mover el estado dejaría una «carga» registrada que quizá nunca
  // ocurrió. Si algo falla después de moverlo, la autorización queda trabada
  // por la regla «sin carga registrada nadie autoriza» (permisos.ts), no abierta.
  await moverFondo(ctx, 'pending_bank_load', 'pending_bank_auth')

  const { error } = await ctx.admin.from('petty_cash_transfers').insert({
    fund_id:        fundId,
    type:           'disbursement',
    amount:         data.amount,
    reference:      data.reference ?? null,
    transferred_at: data.transferred_at,
    registered_by:  userId,
    notes:          data.notes ?? null,
  })
  if (error) {
    console.error('[fondos] carga marcada sin transferencia registrada', fundId, error)
    throw new Error('La carga quedó marcada, pero no se pudo registrar la transferencia. Avisa al administrador: nadie podrá autorizarla hasta corregirlo')
  }

  try {
    await registrar(ctx, userId, 'bank_load_confirmed', { notes: data.reference ?? null, amount: data.amount })
  } catch (e) {
    console.error('[fondos] carga marcada sin entrada en el historial', fundId, e)
    throw new Error('La carga quedó marcada, pero no quedó en el historial. Avisa al administrador: nadie podrá autorizarla hasta corregirlo')
  }
  notifyFundStep(fundId, 'autorizar_pago', userId).catch(() => {})
  revalidarFondo(fundId)
}

/** Autorización: la plata sale. Nunca el beneficiario ni quien cargó */
export async function authorizeBank(fundId: string) {
  const { userId } = await getProfile()
  const ctx = await contextoFondo(fundId)
  exigirPaso(ctx, ctx.fondo.status, userId, ['autorizar_pago'], 'Este fondo ya no está esperando la autorización')

  await moverFondo(ctx, 'pending_bank_auth', 'funds_sent')
  await registrar(ctx, userId, 'bank_authorized')
  await registrar(ctx, userId, 'funds_sent')
  notifyFundOutcome(fundId, 'funds_sent', userId).catch(() => {})
  revalidarFondo(fundId)
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

  /* Las filas vuelven sin tipo porque la consulta pasa por
     `applyItemFilters`, que no se puede tipar sin pelearse con los genéricos
     del constructor de Supabase. Declarar la forma acá NO es cosmético: sin
     esto, un campo mal escrito —`amount_CLP`, `doc_num`— sale `undefined`
     en un informe de plata y nadie se entera. */
  type FilaItem = {
    description:      string | null
    merchant:         string | null
    date:             string
    category_id:      string | null
    amount:           number
    currency:         string
    amount_clp:       number
    doc_type:         string | null
    doc_number:       string | null
    status:           string
    rejection_reason: string | null
    notes:            string | null
  }
  type FilaReal = FilaItem & { fund_id:   string }
  type FilaHist = FilaItem & { report_id: string }

  // Consultas de ítems en paralelo
  function applyItemFilters<T extends ReturnType<typeof supabase.from>>(q: T) {
    /* Este `any` se queda a propósito. Cada `.gte()`/`.eq()` devuelve un tipo
       distinto del anterior, y acumular esa cadena en una variable no se puede
       expresar con los genéricos del constructor de Supabase sin escribir más
       tipos que código. Las filas que salen SÍ están tipadas (FilaReal /
       FilaHist más abajo), que es donde un error costaría plata. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    ...(realItems ?? []).map((i: FilaReal) => i.category_id),
    ...(histItems ?? []).map((i: FilaHist) => i.category_id),
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

  const normalizedReal = (realItems ?? []).map((i: FilaReal) => ({
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

  const normalizedHist = (histItems ?? []).map((i: FilaHist) => {
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
