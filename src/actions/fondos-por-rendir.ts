'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logAudit } from '@/lib/audit'
import {
  afectaLaCuenta, sentidoDeItem, SENTIDO_TRANSFERENCIA, type MovimientoFxR,
} from '@/lib/fondos-por-rendir'

/**
 * La cuenta Fondos por Rendir: los movimientos crudos, para que la pantalla
 * arme el saldo con `src/lib/fondos-por-rendir.ts` — el mismo módulo que cubren
 * las pruebas y que usa la exportación. Agregar acá y de nuevo allá sería tener
 * dos implementaciones que pueden decir cifras distintas.
 *
 * Se mandan los movimientos y no el resumen porque el Excel necesita el detalle
 * para trazar una diferencia. Medido el 2026-10-23: 674 movimientos ≈ 100 KB.
 * A 6.000 al año serían ~900 KB, aceptable para un informe que se mira una vez
 * al mes; si creciera más, el detalle tendría que pedirse aparte.
 */

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('users').select('org_id, role, full_name').eq('id', user.id).single()
  if (!perfil || perfil.role !== 'admin') throw new Error('Acceso restringido a administradores')
  return { supabase, userId: user.id, orgId: perfil.org_id, actorName: perfil.full_name }
}

export interface PersonaFxR {
  id:            string
  nombre:        string
  rut:           string | null
  saldoInicial:  number | null
}

export interface DatosFxR {
  movimientos: MovimientoFxR[]
  personas:    PersonaFxR[]
  fechaCorte:  string | null
}

export async function getFondosPorRendir(): Promise<DatosFxR> {
  const { orgId } = await requireAdmin()
  const admin = createAdminClient()

  const [usuarios, organizacion, reportes, items, traspasos, fondos, transferencias, gastosFondo] =
    await Promise.all([
      admin.from('users').select('id, full_name, rut, saldo_inicial_fxr_clp').eq('org_id', orgId),
      admin.from('organizations').select('fxr_fecha_corte').eq('id', orgId).maybeSingle(),
      admin.from('expense_reports').select('id, submitter_id, title, deleted_at, defontana_exported_at').eq('org_id', orgId),
      admin.from('expense_items').select('report_id, date, item_type, amount_clp, defontana_exported_at, transfer_id, description, deleted_at, status'),
      admin.from('fund_transfers').select('id, payer_report_id'),
      admin.from('petty_cash_funds').select('id, employee_id, name, deleted_at').eq('org_id', orgId),
      admin.from('petty_cash_transfers').select('fund_id, type, amount, transferred_at, defontana_exported_at, reference'),
      admin.from('petty_cash_items').select('fund_id, date, amount_clp, defontana_exported_at, description, status'),
    ])

  const reportePor = new Map((reportes.data ?? []).map(r => [r.id, r]))
  const fondoPor   = new Map((fondos.data   ?? []).map(f => [f.id, f]))
  const pagadorDe  = new Map((traspasos.data ?? []).map(t => [t.id, t.payer_report_id]))

  const movimientos: MovimientoFxR[] = []
  const sumar = (m: MovimientoFxR) => { if (m.monto) movimientos.push(m) }

  /* LA PAPELERA QUEDA FUERA (Daniel, 2026-10-23). Además de ser su decisión es
     lo correcto: «9 FD ESPECIAL» tiene sus $830.000 dos veces —como
     transferencia del fondo borrado y como adelanto de su carga histórica
     viva—, así que incluirla los contaría dos veces. */
  for (const i of items.data ?? []) {
    const r = reportePor.get(i.report_id)
    if (!r || r.deleted_at || i.deleted_at) continue
    if (!afectaLaCuenta(i.item_type, i.status)) continue
    const sentido = sentidoDeItem(i.item_type, pagadorDe.get(i.transfer_id ?? '') === r.id)
    if (!sentido) continue
    sumar({
      personaId: r.submitter_id, fecha: i.date, documento: r.title,
      tipo: i.item_type, glosa: i.description ?? '',
      monto: sentido * Number(i.amount_clp ?? 0),
      /* La marca propia O LA DE LA CABECERA: 28 cargas tienen la marca solo
         arriba (el estado «legacy» del panel de Defontana), y mirar solo la
         propia desviaba el total en $76.583. */
      contabilizado: !!(i.defontana_exported_at || r.defontana_exported_at),
    })
  }

  for (const t of transferencias.data ?? []) {
    const f = fondoPor.get(t.fund_id)
    if (!f || f.deleted_at) continue
    sumar({
      personaId: f.employee_id, fecha: t.transferred_at, documento: f.name,
      tipo: t.type, glosa: t.reference ?? '',
      monto: (SENTIDO_TRANSFERENCIA[t.type] ?? 0) * Number(t.amount ?? 0),
      contabilizado: !!t.defontana_exported_at,
    })
  }

  for (const g of gastosFondo.data ?? []) {
    const f = fondoPor.get(g.fund_id)
    if (!f || f.deleted_at) continue
    if (!afectaLaCuenta('expense', g.status)) continue
    sumar({
      personaId: f.employee_id, fecha: g.date, documento: f.name,
      tipo: 'expense', glosa: g.description ?? '',
      monto: -Number(g.amount_clp ?? 0),
      contabilizado: !!g.defontana_exported_at,
    })
  }

  return {
    movimientos,
    personas: (usuarios.data ?? []).map(u => ({
      id: u.id, nombre: u.full_name ?? '(sin nombre)', rut: u.rut,
      saldoInicial: u.saldo_inicial_fxr_clp === null ? null : Number(u.saldo_inicial_fxr_clp),
    })),
    fechaCorte: organizacion.data?.fxr_fecha_corte ?? null,
  }
}

/**
 * Carga el saldo inicial de una persona, o la fecha de corte de la cuenta.
 *
 * Devuelve el motivo como dato y no lo lanza: en producción Next redacta el
 * mensaje de cualquier `throw` del servidor y acá hay motivos que la persona
 * tiene que entender.
 */
export async function guardarSaldoInicial(
  personaId: string,
  monto: number | null,
): Promise<{ error?: string }> {
  const { orgId, userId, actorName } = await requireAdmin()
  if (monto !== null && !Number.isFinite(monto)) return { error: 'El saldo inicial tiene que ser un número' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('users')
    .update({ saldo_inicial_fxr_clp: monto })
    .eq('id', personaId)
    .eq('org_id', orgId)   // nunca a alguien de otra organización
    .select('full_name')
  if (error) throw new Error(error.message)
  if (!data?.length) return { error: 'No se encontró a esa persona' }

  await logAudit({
    orgId, actorId: userId, actorName,
    action: 'updated', entityType: 'user', entityId: personaId,
    entityLabel: data[0].full_name ?? personaId,
    notes: `Saldo inicial de Fondos por Rendir: ${monto === null ? 'sin cargar' : monto}`,
  })

  revalidatePath('/admin/fondos-por-rendir')
  return {}
}

export async function guardarFechaDeCorte(fecha: string | null): Promise<{ error?: string }> {
  const { orgId, userId, actorName } = await requireAdmin()
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'La fecha de corte no es válida' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('organizations').update({ fxr_fecha_corte: fecha }).eq('id', orgId)
  if (error) throw new Error(error.message)

  await logAudit({
    orgId, actorId: userId, actorName,
    action: 'updated', entityType: 'organization', entityId: orgId,
    entityLabel: 'Fondos por Rendir',
    notes: `Fecha de corte del saldo inicial: ${fecha ?? 'sin definir'}`,
  })

  revalidatePath('/admin/fondos-por-rendir')
  return {}
}
