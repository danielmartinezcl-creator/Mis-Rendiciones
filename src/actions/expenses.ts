'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  calculateReportTotal, validateExpenseItem, puedeCambiarGastos, puedeCambiarAdjuntos,
  type DocumentoDelGasto,
} from '@/lib/expense-helpers'
import { notifyReportApprovers, notifyAdminsMissingApprover } from '@/lib/avisos'
import { contextoRendicion } from '@/lib/contexto-permisos'
import { puedeEnviar } from '@/lib/permisos'
import { normalizeMerchant, type DuplicateMatch } from '@/lib/duplicate-detection'
import type { Json } from '@/lib/supabase/types'
import { logAudit } from '@/lib/audit'
import { validateRut } from '@/lib/validators'
import { classifyAttachment, MAX_ATTACHMENT_BYTES } from '@/lib/attachment-types'

export async function createExpenseReport(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('Perfil no encontrado')

  const title = formData.get('title') as string
  const description = formData.get('description') as string

  if (!title?.trim()) throw new Error('El título es obligatorio')

  const { data, error } = await supabase
    .from('expense_reports')
    .insert({
      org_id:          profile.org_id,
      submitter_id:    user.id,
      title:           title.trim(),
      description:     description?.trim() || null,
      status:          'draft',
      current_level:   0,
      total_amount:    0,
      approved_amount: 0,
      currency:        'CLP',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  redirect(`/expenses/${data.id}`)
}

export async function addExpenseItem(
  reportId: string,
  item: {
    description: string
    amount: number
    currency: string
    exchange_rate: number
    exchange_rate_source: 'api' | 'manual'
    amount_clp: number
    date: string
    category_id?: string | null
    merchant?: string | null
    doc_type?: 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro' | null
    doc_number?: string | null
    notes?: string | null
    cost_center_id?: string | null
    supplier_rut?: string | null
    ocr_raw?: Json | null
    ocr_confidence?: number | null
    policy_justification?: string | null
    policy_violations?:    Json | null
    mileage_km?:   number | null
    mileage_rate?: number | null
  }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('Perfil no encontrado')

  const errors = validateExpenseItem(item)
  if (errors.length > 0) throw new Error(errors.join(', '))

  // Solo quien rinde, y solo en borrador: enviada la rendición, el aprobador ya
  // la está revisando. Ni el admin agrega gastos a la rendición de otra persona.
  const { data: reporte } = await supabase
    .from('expense_reports').select('status, submitter_id').eq('id', reportId).single()
  if (!reporte) throw new Error('Rendición no encontrada')
  const permiso = puedeCambiarGastos(reporte, user.id)
  if (!permiso.ok) throw new Error(permiso.motivo)

  // Validar RUT de proveedor server-side — si es inválido, limpiar (no bloquear)
  let supplierRut = item.supplier_rut ?? null
  if (supplierRut && (item.doc_type === 'factura' || item.doc_type === 'factura_exenta')) {
    const normalized = supplierRut.trim().toUpperCase().replace(/\./g, '')
    if (!validateRut(normalized)) {
      supplierRut = null
    }
  }

  // Verificar límite de monto por ítem
  const { data: org } = await supabase
    .from('organizations')
    .select('max_item_amount_clp')
    .eq('id', profile.org_id)
    .single()
  if (org?.max_item_amount_clp && item.amount_clp > org.max_item_amount_clp) {
    const limit = org.max_item_amount_clp.toLocaleString('es-CL')
    throw new Error(`El monto excede el límite máximo por ítem ($${limit} CLP). Contacta al administrador.`)
  }

  const { data: newItem, error } = await supabase
    .from('expense_items')
    .insert({
      report_id:            reportId,
      org_id:               profile.org_id,
      description:          item.description.trim(),
      amount:               item.amount,
      currency:             item.currency,
      exchange_rate:        item.exchange_rate,
      exchange_rate_source: item.exchange_rate_source,
      amount_clp:           item.amount_clp,
      date:                 item.date,
      category_id:          item.category_id ?? null,
      merchant:             item.merchant ?? null,
      doc_type:             item.doc_type ?? null,
      doc_number:           item.doc_number ?? null,
      notes:                item.notes ?? null,
      cost_center_id:       item.cost_center_id ?? null,
      supplier_rut:         supplierRut,
      ocr_raw:              item.ocr_raw ?? null,
      ocr_confidence:       item.ocr_confidence ?? null,
      policy_justification: item.policy_justification ?? null,
      policy_violations:    item.policy_violations    ?? null,
      mileage_km:           item.mileage_km   ?? null,
      mileage_rate:         item.mileage_rate ?? null,
      status:               'pending',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  const { data: allItems } = await supabase
    .from('expense_items')
    .select('amount_clp')
    .eq('report_id', reportId)
    .is('deleted_at', null)

  const total = calculateReportTotal(allItems ?? [])

  await supabase
    .from('expense_reports')
    .update({ total_amount: total })
    .eq('id', reportId)

  // Invalidar análisis IA cacheado — el reporte cambió
  await supabase
    .from('expense_reports')
    .update({ ai_analysis: null, ai_analysis_at: null })
    .eq('id', reportId)

  revalidatePath(`/expenses/${reportId}`)
  return newItem?.id
}

export async function deleteExpenseItem(itemId: string, reportId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: profile } = await supabase
    .from('users')
    .select('role, org_id, full_name')
    .eq('id', user.id)
    .single()

  const { data: report } = await supabase
    .from('expense_reports')
    .select('submitter_id, status, is_historical_import')
    .eq('id', reportId)
    .single()

  if (!report) throw new Error('Rendición no encontrada')
  // Quien rinde, en su borrador. El admin, además, corrige cargas históricas
  // (HistoricalSection); en una rendición viva de otra persona, ya no.
  const permiso = puedeCambiarGastos(report, user.id, profile?.role === 'admin')
  if (!permiso.ok) throw new Error(permiso.motivo)

  // Capture item before soft delete
  const { data: item } = await supabase
    .from('expense_items')
    .select('description, amount_clp')
    .eq('id', itemId)
    .single()

  const { error } = await supabase
    .from('expense_items')
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq('id', itemId)
    .eq('report_id', reportId)

  if (error) throw new Error(error.message)

  const { data: allItems } = await supabase
    .from('expense_items')
    .select('amount_clp')
    .eq('report_id', reportId)
    .is('deleted_at', null)

  const total = calculateReportTotal(allItems ?? [])
  await supabase
    .from('expense_reports')
    .update({ total_amount: total })
    .eq('id', reportId)

  // Invalidar análisis IA cacheado — el reporte cambió
  await supabase
    .from('expense_reports')
    .update({ ai_analysis: null, ai_analysis_at: null })
    .eq('id', reportId)

  await logAudit({
    orgId:       profile?.org_id ?? '',
    actorId:     user.id,
    actorName:   profile?.full_name ?? null,
    action:      'deleted',
    entityType:  'expense_item',
    entityId:    itemId,
    entityLabel: item?.description ?? itemId,
    oldValue:    item as unknown as Record<string, unknown>,
  })

  revalidatePath(`/expenses/${reportId}`)
}

export async function submitExpenseReport(reportId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { count } = await supabase
    .from('expense_items')
    .select('*', { count: 'exact', head: true })
    .eq('report_id', reportId)
    .is('deleted_at', null)

  if (!count || count === 0) {
    throw new Error('La rendición debe tener al menos un ítem')
  }

  const ctx = await contextoRendicion(reportId)
  if (ctx.reporte.submitter_id !== user.id) throw new Error('Solo quien rinde puede enviar su rendición')
  if (ctx.reporte.status !== 'draft') throw new Error('Esta rendición ya fue enviada')

  const yo = ctx.personas.find(p => p.id === user.id)
  if (!yo) throw new Error('Rendición no encontrada')

  const envio = puedeEnviar('rendicion', yo, ctx.doc.cadena)
  if (!envio.ok) {
    if (!ctx.doc.cadena.l1) {
      notifyAdminsMissingApprover(ctx.reporte.org_id, yo.nombre, 'una rendición').catch(() => {})
    }
    throw new Error(envio.motivo)
  }

  const { data: enviada, error } = await ctx.admin
    .from('expense_reports')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', reportId)
    .eq('status', 'draft')
    .select('id')
  if (error || !enviada?.length) throw new Error('No se pudo enviar la rendición. Intenta de nuevo')

  notifyReportApprovers(reportId, 'decidir_l1', user.id).catch(() => {})

  revalidatePath(`/expenses/${reportId}`)
  revalidatePath('/')
}

export async function getMyReports() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('expense_reports')
    .select(`
      id, title, status, total_amount, approved_amount,
      submitted_at, created_at, currency
    `)
    .eq('submitter_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(20)

  return data ?? []
}

// ── Detección de documentos duplicados ───────────────────────────────────────

export async function checkItemDuplicate(params: {
  doc_type:       string
  doc_number:     string
  supplier_rut?:  string   // para facturas: (RUT + folio) es la clave única SII
  excludeItemId?: string
}) {
  if (!params.doc_type || !params.doc_number?.trim()) return null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()
  if (!profile) return null

  const docNum  = params.doc_number.trim()
  const isFactura = params.doc_type === 'factura' || params.doc_type === 'factura_exenta'
  const rutLimpio = params.supplier_rut?.trim() ?? ''

  // Buscar en ítems de rendiciones
  let expQuery = supabase
    .from('expense_items')
    .select('id, description, amount_clp, date, report_id')
    .eq('org_id', profile.org_id)
    .eq('doc_number', docNum)

  if (isFactura && rutLimpio) {
    // Factura: clave única = (RUT emisor + folio) — ignora doc_type para no fallar si alguien marcó exenta vs no exenta
    expQuery = expQuery.eq('supplier_rut', rutLimpio)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expQuery = expQuery.eq('doc_type', params.doc_type as any)
  }

  const { data: expItems } = await expQuery.limit(1)

  if (expItems?.length) {
    const item = expItems[0]
    const { data: report } = await supabase
      .from('expense_reports')
      .select('title')
      .eq('id', item.report_id)
      .single()
    return {
      found:        true as const,
      source:       'rendición' as const,
      description:  item.description,
      amount_clp:   item.amount_clp,
      date:         item.date,
      context:      report?.title ?? 'rendición',
    }
  }

  // Buscar en ítems de caja chica
  let pcQuery = supabase
    .from('petty_cash_items')
    .select('id, description, amount_clp, date, fund_id')
    .eq('org_id', profile.org_id)
    .eq('doc_number', docNum)

  if (isFactura && rutLimpio) {
    pcQuery = pcQuery.eq('supplier_rut', rutLimpio)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pcQuery = pcQuery.eq('doc_type', params.doc_type as any)
  }

  const { data: pcItems } = await pcQuery.limit(1)

  if (pcItems?.length) {
    const item = pcItems[0]
    const { data: fund } = await supabase
      .from('petty_cash_funds')
      .select('name')
      .eq('id', item.fund_id)
      .single()
    return {
      found:       true as const,
      source:      'caja chica' as const,
      description: item.description,
      amount_clp:  item.amount_clp,
      date:        item.date,
      context:     fund?.name ?? 'caja chica',
    }
  }

  return null
}

// ── Detección de ítems duplicados por merchant + monto + fecha (±7 días) ────

export async function checkDuplicateExpenseItem(params: {
  amountClp: number
  merchant:  string
  date:      string
}): Promise<DuplicateMatch | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Derivar identidad del servidor — nunca del cliente
  const { data: profile } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()
  if (!profile) return null

  const submitterId = user.id

  const rangeFrom = new Date(new Date(params.date).getTime() - 7 * 86400000).toISOString().split('T')[0]
  const rangeTo   = new Date(new Date(params.date).getTime() + 7 * 86400000).toISOString().split('T')[0]

  const { data: items } = await supabase
    .from('expense_items')
    .select('id, merchant, amount_clp, date, expense_reports!inner(id, title, submitter_id)')
    .gte('date', rangeFrom)
    .lte('date', rangeTo)
    .eq('amount_clp', params.amountClp)
    .is('deleted_at', null)

  if (!items?.length) return null

  const normTarget = normalizeMerchant(params.merchant)

  for (const item of items) {
    const report = (item.expense_reports as unknown as { id: string; title: string; submitter_id: string } | null)
    if (!report || report.submitter_id !== submitterId) continue
    if (normalizeMerchant(item.merchant ?? '') === normTarget) {
      return {
        reportId:    report.id,
        reportTitle: report.title,
        itemId:      item.id,
        date:        item.date,
        amount:      item.amount_clp,
        merchant:    item.merchant ?? '',
      }
    }
  }
  return null
}

// ── Eliminar rendición (empleado — solo borradores propios) ──────────────────

export async function deleteExpenseReport(reportId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: report } = await supabase
    .from('expense_reports')
    .select('id, status, submitter_id, org_id, title')
    .eq('id', reportId)
    .single()

  if (!report) throw new Error('Rendición no encontrada')
  if (report.submitter_id !== user.id) throw new Error('Solo podés eliminar tus propias rendiciones')
  if (report.status !== 'draft') throw new Error('Solo se pueden eliminar rendiciones en borrador')

  // Fetch actor name for audit
  const { data: actorProfile } = await supabase
    .from('users').select('full_name').eq('id', user.id).single()

  // `.select()` para saber cuántas filas cayeron: si RLS no deja borrar, Supabase
  // no devuelve error sino 0 filas, y sin esta verificación se auditaba un borrado
  // que no había ocurrido (migración 025).
  const { data: deleted, error } = await supabase
    .from('expense_reports')
    .delete()
    .eq('id', reportId)
    .eq('submitter_id', user.id)
    .select('id')

  if (error) throw new Error(error.message)
  if (!deleted?.length) throw new Error('No se pudo eliminar la rendición')

  await logAudit({
    orgId:       report.org_id,
    actorId:     user.id,
    actorName:   actorProfile?.full_name ?? null,
    action:      'deleted',
    entityType:  'expense_report',
    entityId:    reportId,
    entityLabel: report.title,
  })

  revalidatePath('/')
}

// ── Eliminar rendición (admin — cualquier estado) ─────────────────────────────

export async function adminDeleteExpenseReport(reportId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role, org_id, full_name').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') throw new Error('Solo administradores')

  // Capture before state
  const { data: report } = await supabase
    .from('expense_reports').select('title').eq('id', reportId).single()

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('expense_reports')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', reportId)
    .eq('org_id', profile.org_id)

  if (error) throw new Error(error.message)

  await logAudit({
    orgId:       profile.org_id,
    actorId:     user.id,
    actorName:   profile.full_name,
    action:      'deleted',
    entityType:  'expense_report',
    entityId:    reportId,
    entityLabel: report?.title ?? reportId,
  })

  revalidatePath('/admin/reports')
  revalidatePath('/admin/trash')
}

// ── Eliminar TODAS las rendiciones de la org (admin — para testing) ───────────

export async function adminDeleteAllReports() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role, org_id, full_name').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') throw new Error('Solo administradores')

  // Contar antes de borrar para el log
  const { count } = await supabase
    .from('expense_reports')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', profile.org_id)
    .is('deleted_at', null)

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('expense_reports')
    .update({ deleted_at: new Date().toISOString() })
    .eq('org_id', profile.org_id)
    .is('deleted_at', null)

  if (error) throw new Error(error.message)

  try {
    await logAudit({
      orgId:       profile.org_id,
      actorId:     user.id,
      actorName:   profile.full_name,
      action:      'deleted',
      entityType:  'expense_report',
      entityId:    'bulk',
      entityLabel: 'Borrado masivo de rendiciones',
      notes:       `${count ?? 0} rendiciones eliminadas`,
    })
  } catch { /* silent */ }

  revalidatePath('/admin/reports')
  revalidatePath('/admin/trash')
}

export async function getReportWithItems(reportId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: report } = await supabase
    .from('expense_reports')
    .select(`
      *,
      expense_items (
        *,
        expense_categories (name, icon, color),
        attachments (id, storage_path, file_type, thumbnail_path)
      )
    `)
    .eq('id', reportId)
    .single()

  return report
}

// ── Adjuntos de un gasto ─────────────────────────────────────────────────────
// Un comprobante se sube o se borra solo si se puede cambiar su gasto
// (`puedeCambiarAdjuntos`). El gasto se lee con la sesión — si la RLS no lo
// deja ver, para esta persona no existe — y se escribe con la llave de
// servicio: desde la migración 035 ninguna sesión escribe en `attachments` ni
// en el bucket. La ruta y la organización salen de la fila del gasto, nunca
// del navegador (antes una acción recibía el `orgId` como argumento).

const BUCKET_COMPROBANTES = 'expense-attachments'

type TipoGasto = 'expense_item' | 'petty_cash_item'

async function exigirCambioDeAdjuntos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tipo: TipoGasto,
  itemId: string,
): Promise<{ orgId: string }> {
  let orgId: string
  let doc: DocumentoDelGasto

  if (tipo === 'expense_item') {
    const { data: item } = await supabase
      .from('expense_items').select('org_id, report_id').eq('id', itemId).is('deleted_at', null).maybeSingle()
    if (!item) throw new Error('Gasto no encontrado')
    const { data: reporte } = await supabase
      .from('expense_reports').select('status, submitter_id, is_historical_import').eq('id', item.report_id).maybeSingle()
    if (!reporte) throw new Error('Rendición no encontrada')
    orgId = item.org_id
    doc   = { tipo: 'rendicion', ...reporte }
  } else {
    const { data: item } = await supabase
      .from('petty_cash_items').select('org_id, fund_id').eq('id', itemId).maybeSingle()
    if (!item) throw new Error('Gasto no encontrado')
    const { data: fondo } = await supabase
      .from('petty_cash_funds').select('status, employee_id, is_historical_import').eq('id', item.fund_id).maybeSingle()
    if (!fondo) throw new Error('Fondo no encontrado')
    orgId = item.org_id
    doc   = { tipo: 'fondo', ...fondo }
  }

  const { data: perfil } = await supabase.from('users').select('role').eq('id', userId).single()
  const permiso = puedeCambiarAdjuntos(doc, userId, perfil?.role === 'admin')
  if (!permiso.ok) throw new Error(permiso.motivo)
  return { orgId }
}

async function subirAdjunto(tipo: TipoGasto, itemId: string, file: File): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { orgId } = await exigirCambioDeAdjuntos(supabase, user.id, tipo, itemId)

  // El tipo sale de la extensión (ver attachment-types): Windows entrega los
  // .msg de Outlook sin tipo y el bucket los rechazaría.
  const clase = classifyAttachment(file.name)
  if (!clase) throw new Error('Tipo de archivo no admitido. Sube una foto, un PDF o un correo (.eml / .msg)')
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('El archivo no puede superar 10 MB')

  const ext   = file.name.split('.').pop()!.toLowerCase()
  const path  = `${orgId}/${itemId}/${Date.now()}.${ext}`
  const admin = createAdminClient()

  // Con un File, supabase-js ignora `contentType` y manda el tipo del archivo
  // (verificado contra el bucket): hay que re-tiparlo o el .msg sin tipo rebota.
  const { error: errorArchivo } = await admin.storage
    .from(BUCKET_COMPROBANTES)
    .upload(path, new Blob([file], { type: clase.contentType }), { contentType: clase.contentType })
  if (errorArchivo) throw new Error(errorArchivo.message)

  const { error } = await admin.from('attachments').insert({
    item_id:            tipo === 'expense_item'    ? itemId : null,
    petty_cash_item_id: tipo === 'petty_cash_item' ? itemId : null,
    org_id:             orgId,
    storage_path:       path,
    file_type:          clase.kind,
    file_size:          file.size,
  })
  if (error) {
    // Sin su fila, el archivo no lo vería nadie: se retira
    await admin.storage.from(BUCKET_COMPROBANTES).remove([path])
    throw new Error(error.message)
  }
  return path
}

export async function addExpenseItemAttachment(itemId: string, file: File): Promise<string> {
  return subirAdjunto('expense_item', itemId, file)
}

export async function addPettyCashItemAttachment(itemId: string, file: File): Promise<string> {
  return subirAdjunto('petty_cash_item', itemId, file)
}

// Borra un adjunto de cualquier gasto. La ruta del archivo sale de la fila:
// antes llegaba del navegador y se borraba lo que mandara, fuera o no de este
// adjunto.
export async function deleteItemAttachment(attachmentId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: adjunto } = await supabase
    .from('attachments')
    .select('id, storage_path, item_id, petty_cash_item_id')
    .eq('id', attachmentId)
    .maybeSingle()
  if (!adjunto) throw new Error('Adjunto no encontrado')

  // La base exige exactamente uno de los dos (chk_attachments_one_parent)
  const tipo: TipoGasto = adjunto.item_id ? 'expense_item' : 'petty_cash_item'
  await exigirCambioDeAdjuntos(supabase, user.id, tipo, (adjunto.item_id ?? adjunto.petty_cash_item_id)!)

  // Primero la fila y después el archivo: si falla el archivo queda un huérfano
  // que nadie ve, nunca un adjunto sin archivo. `.select` porque un borrado que
  // no afecta filas no da error (la lección de la 025).
  const admin = createAdminClient()
  const { data: borrado, error } = await admin
    .from('attachments').delete().eq('id', adjunto.id).select('id')
  if (error) throw new Error(error.message)
  if (!borrado?.length) throw new Error('No se pudo eliminar el adjunto')

  const { error: errorArchivo } = await admin.storage.from(BUCKET_COMPROBANTES).remove([adjunto.storage_path])
  if (errorArchivo) console.error('[adjuntos] se borró la fila pero no el archivo', adjunto.storage_path, errorArchivo)
}

// ── Resumen mensual del empleado (R6) ────────────────────────────────────────

export type MonthlyCategoryRow = {
  month:         string   // YYYY-MM
  category_id:   string | null
  category_name: string | null
  total_clp:     number
}

export async function getMyMonthlySummary(): Promise<{
  rows:   MonthlyCategoryRow[]
  months: string[]
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { rows: [], months: [] }

  const dateFrom = new Date()
  dateFrom.setMonth(dateFrom.getMonth() - 11)
  dateFrom.setDate(1)
  const dateFromStr = dateFrom.toISOString().split('T')[0]

  const { data: items } = await supabase
    .from('expense_items')
    .select(`
      amount_clp, date,
      category_id,
      expense_categories (name),
      expense_reports!inner (submitter_id, deleted_at)
    `)
    .eq('status', 'approved')
    .eq('expense_reports.submitter_id', user.id)
    .is('expense_reports.deleted_at', null)
    .gte('date', dateFromStr)

  if (!items) return { rows: [], months: [] }

  // Build last 12 months list
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  type RawItem = { amount_clp: number; date: string; category_id: string|null; expense_categories: { name: string }|null }

  // Aggregate by (month, category)
  const agg = new Map<string, MonthlyCategoryRow>()
  for (const raw of items) {
    const item  = raw as unknown as RawItem
    const month = item.date.slice(0, 7)
    if (!months.includes(month)) continue
    const key   = `${month}|${item.category_id ?? '__none__'}`
    if (!agg.has(key)) {
      agg.set(key, {
        month,
        category_id:   item.category_id,
        category_name: item.expense_categories?.name ?? null,
        total_clp:     0,
      })
    }
    agg.get(key)!.total_clp += item.amount_clp
  }

  return { rows: Array.from(agg.values()), months }
}

// ── Timeline completo de una rendición (R-04) ────────────────────────────────

export type TimelineEvent = {
  label:  string
  date:   string
  type:   'neutral' | 'success' | 'warning' | 'error'
}

export async function getReportTimeline(reportId: string): Promise<TimelineEvent[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Ownership check: employees can only see their own report's timeline
  const { data: report } = await supabase
    .from('expense_reports')
    .select('submitter_id')
    .eq('id', reportId)
    .single()

  if (!report) return []

  const { data: profile } = await supabase
    .from('users')
    .select('role, can_approve')
    .eq('id', user.id)
    .single()

  if (!profile) return []
  if (profile.role === 'employee' && !profile.can_approve && report.submitter_id !== user.id) return []

  const { data: entries } = await supabase
    .from('expense_report_approvals')
    .select('approver_id, action, created_at, notes, level')
    .eq('report_id', reportId)
    .order('created_at', { ascending: true })

  if (!entries?.length) return []

  const approverIds = [...new Set(entries.map(e => e.approver_id))]
  const { data: users } = await supabase.from('users').select('id, full_name').in('id', approverIds)
  const nameMap = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]))

  return entries.map(e => {
    const name = nameMap[e.approver_id] ?? 'Aprobador'
    const lvl  = e.level ?? 1
    switch (e.action) {
      case 'approved':
        return { label: lvl === 2 ? `Aprobada L2 por ${name}` : `Aprobada por ${name}`, date: e.created_at, type: 'success' as const }
      case 'partially_approved':
        return { label: `Aprobada parcialmente por ${name}`, date: e.created_at, type: 'warning' as const }
      case 'rejected':
        return { label: `Rechazada por ${name}`, date: e.created_at, type: 'error' as const }
      case 'returned_to_draft':
        return { label: `Devuelta a borrador por ${name}`, date: e.created_at, type: 'warning' as const }
      case 'bank_load_requested':
        return { label: 'Proceso de reembolso iniciado', date: e.created_at, type: 'neutral' as const }
      case 'bank_load_confirmed':
        return { label: 'Transferencia bancaria cargada', date: e.created_at, type: 'neutral' as const }
      case 'bank_authorized':
        return { label: `Transferencia autorizada${e.notes ? ` · Ref: ${e.notes}` : ''}`, date: e.created_at, type: 'success' as const }
      default:
        return { label: e.action, date: e.created_at, type: 'neutral' as const }
    }
  })
}

// ── Historial de aprobaciones de una rendición (R17) ─────────────────────────

export type ReportApproval = {
  approver_name: string
  action:        string
  created_at:    string
  notes:         string | null
}

export async function getReportApprovals(reportId: string): Promise<ReportApproval[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Ownership check: employees can only see approvals for their own reports
  const { data: report } = await supabase
    .from('expense_reports')
    .select('submitter_id')
    .eq('id', reportId)
    .single()

  if (!report) return []

  const { data: profile } = await supabase
    .from('users')
    .select('role, can_approve')
    .eq('id', user.id)
    .single()

  if (!profile) return []
  if (profile.role === 'employee' && !profile.can_approve && report.submitter_id !== user.id) return []

  const { data: approvals } = await supabase
    .from('expense_report_approvals')
    .select('approver_id, action, created_at, notes')
    .eq('report_id', reportId)
    .in('action', ['approved', 'partially_approved'])
    .order('created_at', { ascending: true })

  if (!approvals?.length) return []

  const approverIds = [...new Set(approvals.map(a => a.approver_id))]
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name')
    .in('id', approverIds)

  const nameMap = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]))

  return approvals.map(a => ({
    approver_name: nameMap[a.approver_id] ?? 'Aprobador',
    action:        a.action,
    created_at:    a.created_at,
    notes:         a.notes ?? null,
  }))
}
