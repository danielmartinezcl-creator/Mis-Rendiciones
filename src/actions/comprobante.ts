'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportWithItems } from '@/actions/expenses'
import { getFundDetail } from '@/actions/petty-cash'
import {
  comprobanteDeFondo, comprobanteDeRendicion, huellaDe, type Comprobante,
} from '@/lib/comprobante-cierre'

/**
 * Los datos del comprobante de una rendición o de un fondo.
 *
 * **Quién lo puede bajar lo decide la RLS, no esta función**: el documento se lee
 * primero con la sesión (`getReportWithItems` / `getFundDetail`), y si no vuelve,
 * para esta persona no existe. Recién con eso a la vista se usa la llave de
 * servicio, y solo para NOMBRES —quién aprobó, el RUT y el centro de costo de quien
 * rindió, el proyecto—, que la RLS de `users` no siempre deja leer a un empleado y
 * sin los cuales el comprobante no sirve.
 *
 * Devuelve `{ error }` en vez de lanzar: en producción Next redacta el mensaje de
 * un `throw`, y la persona leería un párrafo en inglés.
 */
export async function getComprobante(
  tipo: 'rendicion' | 'caja_chica',
  id: string,
): Promise<{ comprobante: Comprobante; huella: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' }

  try {
    const comprobante = tipo === 'rendicion' ? await deRendicion(id) : await deFondo(id)
    if (!comprobante) return { error: 'No encontramos el documento, o no tenés acceso a él.' }
    return { comprobante, huella: await huellaDe(comprobante) }
  } catch (e) {
    console.error('[comprobante]', tipo, id, e)
    return { error: 'No se pudo armar el comprobante. Probá de nuevo en un momento.' }
  }
}

async function fichaDe(userId: string) {
  const admin = createAdminClient()
  const { data: u } = await admin
    .from('users').select('full_name, rut, cost_center_id').eq('id', userId).single()
  let centroCosto = ''
  if (u?.cost_center_id) {
    const { data: cc } = await admin.from('cost_centers').select('descripcion').eq('id', u.cost_center_id).single()
    centroCosto = cc?.descripcion ? `${u.cost_center_id} · ${cc.descripcion}` : u.cost_center_id
  }
  return { nombre: u?.full_name ?? 'Desconocido', rut: u?.rut ?? '', centroCosto }
}

async function nombresDe(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))]
  if (!unicos.length) return {}
  const { data } = await createAdminClient().from('users').select('id, full_name').in('id', unicos)
  return Object.fromEntries((data ?? []).map(u => [u.id, u.full_name]))
}

async function centrosDe(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))]
  if (!unicos.length) return {}
  const { data } = await createAdminClient().from('cost_centers').select('id, descripcion').in('id', unicos)
  return Object.fromEntries((data ?? []).map(c => [c.id, c.descripcion]))
}

const proyectoTexto = (p: { numero: string; nombre: string | null } | null | undefined) =>
  p ? [p.numero, p.nombre].filter(Boolean).join(' · ') : null

async function deRendicion(id: string): Promise<Comprobante | null> {
  const report = await getReportWithItems(id)
  if (!report || report.deleted_at) return null

  type Item = {
    id: string; date: string; merchant: string | null; description: string | null
    amount_clp: number; status: string | null; rejection_reason: string | null
    doc_type: string | null; doc_number: string | null; supplier_rut: string | null
    cost_center_id: string | null; item_type: string | null; transfer_id: string | null
    deleted_at: string | null; expense_categories: { name: string } | null
  }
  const items = ((report.expense_items ?? []) as unknown as Item[]).filter(i => !i.deleted_at)

  const admin = createAdminClient()
  const [historialRes, pagadosRes, empleado, centros] = await Promise.all([
    admin.from('expense_report_approvals')
      .select('approver_id, action, level, created_at, notes')
      .eq('report_id', id).order('created_at', { ascending: true }),
    /* La dirección de un traspaso no es una columna: se resuelve contra quién lo
       pagó, igual que `is_transfer_payer` en el export a Defontana. */
    admin.from('fund_transfers').select('id').eq('payer_report_id', id),
    fichaDe(report.submitter_id),
    centrosDe(items.map(i => i.cost_center_id)),
  ])
  const historial = historialRes.data ?? []
  const nombres   = await nombresDe(historial.map(h => h.approver_id))
  const pagados   = new Set((pagadosRes.data ?? []).map(t => t.id))

  return comprobanteDeRendicion({
    id:                report.id,
    title:             report.title,
    status:            report.status,
    created_at:        report.created_at,
    submitted_at:      report.submitted_at,
    reimbursed_amount: report.reimbursed_amount,
    is_historical_import: report.is_historical_import,
    proyecto:          proyectoTexto(report.proyectos as { numero: string; nombre: string | null } | null),
    empleado,
    items: items.map(i => ({
      date: i.date, merchant: i.merchant, description: i.description,
      categoria: i.expense_categories?.name ?? null,
      centroCosto: i.cost_center_id ? (centros[i.cost_center_id] ?? i.cost_center_id) : null,
      doc_type: i.doc_type, doc_number: i.doc_number, supplier_rut: i.supplier_rut,
      amount_clp: Number(i.amount_clp), status: i.status, rejection_reason: i.rejection_reason,
      item_type: i.item_type,
      is_transfer_payer: !!i.transfer_id && pagados.has(i.transfer_id),
    })),
    historial: historial.map(h => ({
      action: h.action, level: h.level, created_at: h.created_at, notes: h.notes,
      persona: nombres[h.approver_id] ?? 'Aprobador',
    })),
  })
}

async function deFondo(id: string): Promise<Comprobante | null> {
  const detalle = await getFundDetail(id)
  if (!detalle || detalle.fund.deleted_at) return null
  const { fund, items, transfers, audits } = detalle

  const admin = createAdminClient()
  const categoriaIds = [...new Set(items.map(i => i.category_id).filter((x): x is string => !!x))]
  const [empleado, categoriasRes, proyectoRes] = await Promise.all([
    fichaDe(fund.employee_id),
    /* No `detalle.categories`: esas son solo las activas, y un gasto viejo puede
       tener una categoría que después se retiró. */
    categoriaIds.length
      ? admin.from('expense_categories').select('id, name').in('id', categoriaIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    fund.proyecto_id
      ? admin.from('proyectos').select('numero, nombre').eq('id', fund.proyecto_id).single()
      : Promise.resolve({ data: null }),
  ])
  const categorias = Object.fromEntries((categoriasRes.data ?? []).map(c => [c.id, c.name]))

  return comprobanteDeFondo({
    id:               fund.id,
    name:             fund.name,
    status:           fund.status,
    description:      fund.description,
    created_at:       fund.created_at,
    amount_approved:  fund.amount_approved,
    amount_requested: fund.amount_requested,
    proyecto:         proyectoTexto(proyectoRes.data),
    empleado,
    items: items.map(i => ({
      date: i.date, merchant: i.merchant, description: i.description,
      categoria: i.category_id ? (categorias[i.category_id] ?? null) : null,
      centroCosto: null,
      doc_type: i.doc_type, doc_number: i.doc_number, supplier_rut: i.supplier_rut,
      amount_clp: Number(i.amount_clp), status: i.status, rejection_reason: i.rejection_reason,
    })),
    transfers: transfers.map(t => ({
      type: t.type, amount: Number(t.amount), reference: t.reference,
      transferred_at: t.transferred_at, created_at: t.created_at,
    })),
    historial: audits.map(a => ({
      action: a.action, level: a.level, created_at: a.created_at, notes: a.notes,
      amount: a.amount == null ? null : Number(a.amount), persona: a.actor_name,
    })),
  })
}
