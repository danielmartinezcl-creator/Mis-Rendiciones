'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { classifyRespaldo, MAX_ATTACHMENT_BYTES } from '@/lib/attachment-types'
import {
  destinoDelRespaldo, puedeSubirRespaldo, puedeBorrarRespaldo, type DestinoRespaldo,
} from '@/lib/respaldos'
import { BUCKET_RESPALDOS as BUCKET } from '@/lib/archivos'

// Adjuntos de respaldo de una rendición o un fondo. Las reglas viven en
// src/lib/respaldos.ts. El documento se lee con la sesión —si la RLS no se lo
// deja ver, para esta persona no existe— y todo lo demás se escribe y se firma
// con la llave de servicio: desde la migración 037 ninguna sesión escribe en
// `approval_attachments` ni toca el bucket. La organización y las rutas salen de
// las filas, nunca del navegador.

type Sesion = Awaited<ReturnType<typeof createClient>>

async function getSession() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, userId: user.id }
}

async function documentoVisible(supabase: Sesion, destino: DestinoRespaldo) {
  const { data } = destino.tipo === 'rendicion'
    ? await supabase.from('expense_reports').select('id, org_id, deleted_at').eq('id', destino.id).maybeSingle()
    : await supabase.from('petty_cash_funds').select('id, org_id, deleted_at').eq('id', destino.id).maybeSingle()
  return data
}

// Las fechas del historial del documento (ver `puedeBorrarRespaldo`). Con la
// llave de servicio: la regla tiene que ver TODOS los pasos, no solo los que la
// RLS le muestra a quien pregunta.
async function pasosDelDocumento(destino: DestinoRespaldo): Promise<(string | null)[]> {
  const admin = createAdminClient()
  if (destino.tipo === 'fondo') {
    const { data, error } = await admin
      .from('petty_cash_approvals').select('created_at').eq('fund_id', destino.id)
    if (error) throw new Error(error.message)
    return (data ?? []).map(p => p.created_at)
  }
  const [reporte, log] = await Promise.all([
    admin.from('expense_reports').select('submitted_at').eq('id', destino.id).maybeSingle(),
    admin.from('expense_report_approvals').select('created_at').eq('report_id', destino.id),
  ])
  if (reporte.error || log.error) throw new Error((reporte.error ?? log.error)!.message)
  return [reporte.data?.submitted_at ?? null, ...(log.data ?? []).map(a => a.created_at)]
}

function revalidar(destino: DestinoRespaldo) {
  revalidatePath(destino.tipo === 'rendicion' ? `/approvals/${destino.id}` : `/petty-cash/${destino.id}`)
}

export async function uploadApprovalAttachment(formData: FormData) {
  const { supabase, userId } = await getSession()

  const file        = formData.get('file') as File | null
  const description = (formData.get('description') as string | null)?.trim() || null
  const destino     = destinoDelRespaldo(
    (formData.get('report_id') as string | null) || null,
    (formData.get('fund_id') as string | null) || null,
  )

  if (!file || file.size === 0) throw new Error('No se seleccionó ningún archivo')
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('El archivo no puede superar 10 MB')

  const contentType = classifyRespaldo(file.name)
  if (!contentType) throw new Error('Tipo de archivo no admitido. Sube un PDF, una foto, un correo (.eml / .msg) o un Excel')

  const doc = await documentoVisible(supabase, destino)
  if (!doc) throw new Error(destino.tipo === 'rendicion' ? 'Rendición no encontrada' : 'Fondo no encontrado')
  const permiso = puedeSubirRespaldo(doc)
  if (!permiso.ok) throw new Error(permiso.motivo)

  const ext   = file.name.split('.').pop()!.toLowerCase()
  const path  = `${doc.org_id}/${doc.id}/${Date.now()}_${userId}.${ext}`
  const admin = createAdminClient()

  // Re-tipado: con un File, supabase-js ignora `contentType` y un .msg de Windows
  // llega sin tipo, que el bucket rechaza
  const { error: errorArchivo } = await admin.storage
    .from(BUCKET)
    .upload(path, new Blob([file], { type: contentType }), { contentType, upsert: false })
  if (errorArchivo) throw new Error(errorArchivo.message)

  const { error } = await admin.from('approval_attachments').insert({
    org_id:       doc.org_id,
    report_id:    destino.tipo === 'rendicion' ? doc.id : null,
    fund_id:      destino.tipo === 'fondo'     ? doc.id : null,
    uploaded_by:  userId,
    storage_path: path,
    filename:     file.name,
    file_size:    file.size,
    description,
  })
  if (error) {
    // Sin su fila, el archivo no lo vería nadie: se retira
    await admin.storage.from(BUCKET).remove([path])
    throw new Error(error.message)
  }

  revalidar(destino)
}

export async function getApprovalAttachments(target: { reportId?: string; fundId?: string }) {
  const { supabase, userId } = await getSession()

  let destino: DestinoRespaldo
  try {
    destino = destinoDelRespaldo(target.reportId ?? null, target.fundId ?? null)
  } catch {
    return []
  }
  // Quien no ve el documento no ve sus respaldos (la 037 lo impone también en la base)
  if (!await documentoVisible(supabase, destino)) return []

  const { data: attachments } = await supabase
    .from('approval_attachments')
    .select('*')
    .eq(destino.tipo === 'rendicion' ? 'report_id' : 'fund_id', destino.id)
    .order('created_at', { ascending: true })
  if (!attachments?.length) return []

  const uploaderIds = [...new Set(attachments.map(a => a.uploaded_by).filter(Boolean))]
  const [{ data: users }, firmas, pasos] = await Promise.all([
    supabase.from('users').select('id, full_name').in('id', uploaderIds),
    // Firma el servidor: ninguna sesión lee el bucket
    createAdminClient().storage.from(BUCKET).createSignedUrls(attachments.map(a => a.storage_path), 3600),
    // Sin los pasos no se sabe si se puede borrar: ante la duda, no se ofrece
    pasosDelDocumento(destino).catch(() => null),
  ])
  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]))
  const urlMap  = Object.fromEntries((firmas.data ?? []).map(f => [f.path, f.signedUrl]))

  return attachments.map(a => ({
    ...a,
    uploader_name: userMap[a.uploaded_by] ?? 'Desconocido',
    url:           urlMap[a.storage_path] ?? null,
    puede_borrar:  pasos !== null && puedeBorrarRespaldo(a, pasos, userId).ok,
  }))
}

export async function deleteApprovalAttachment(id: string) {
  const { supabase, userId } = await getSession()

  // La ruta del archivo sale de la fila: antes llegaba del navegador y se
  // borraba lo que mandara, fuera o no de este respaldo
  const { data: att } = await supabase
    .from('approval_attachments')
    .select('id, uploaded_by, created_at, storage_path, report_id, fund_id')
    .eq('id', id)
    .maybeSingle()
  if (!att) throw new Error('Adjunto no encontrado')

  const destino = destinoDelRespaldo(att.report_id, att.fund_id)
  const permiso = puedeBorrarRespaldo(att, await pasosDelDocumento(destino), userId)
  if (!permiso.ok) throw new Error(permiso.motivo)

  // Primero la fila y después el archivo: si falla el archivo queda un huérfano
  // que nadie ve, nunca un respaldo sin archivo. `.select` porque un borrado que
  // no afecta filas no da error (la lección de la 025).
  const admin = createAdminClient()
  const { data: borrado, error } = await admin
    .from('approval_attachments').delete().eq('id', att.id).select('id')
  if (error) throw new Error(error.message)
  if (!borrado?.length) throw new Error('No se pudo eliminar el adjunto')

  const { error: errorArchivo } = await admin.storage.from(BUCKET).remove([att.storage_path])
  if (errorArchivo) console.error('[respaldos] se borró la fila pero no el archivo', att.storage_path, errorArchivo)

  revalidar(destino)
}
