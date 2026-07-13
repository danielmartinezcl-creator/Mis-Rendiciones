'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

const BUCKET = 'approval-attachments'

async function getProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, org_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Perfil no encontrado')
  return { supabase, userId: user.id, profile }
}

export async function uploadApprovalAttachment(formData: FormData) {
  const { supabase, userId, profile } = await getProfile()

  const file        = formData.get('file') as File
  const description = (formData.get('description') as string | null)?.trim() ?? null
  const reportId    = (formData.get('report_id') as string | null) || null
  const fundId      = (formData.get('fund_id') as string | null) || null

  if (!file || file.size === 0) throw new Error('No se seleccionó ningún archivo')
  if (!reportId && !fundId) throw new Error('Debe especificar una rendición o un fondo')
  if (reportId && fundId)   throw new Error('Solo se puede vincular a una rendición o un fondo, no ambos')
  if (file.size > 10 * 1024 * 1024) throw new Error('El archivo no puede superar 10 MB')

  const ext  = file.name.split('.').pop() ?? 'bin'
  const path = `${profile.org_id}/${reportId ?? fundId}/${Date.now()}_${userId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) throw new Error(uploadError.message)

  const { error: dbError } = await supabase.from('approval_attachments').insert({
    org_id:       profile.org_id,
    report_id:    reportId,
    fund_id:      fundId,
    uploaded_by:  userId,
    storage_path: path,
    filename:     file.name,
    file_size:    file.size,
    description,
  })

  if (dbError) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(dbError.message)
  }

  if (reportId) revalidatePath(`/approvals/${reportId}`)
  if (fundId)   revalidatePath(`/petty-cash/${fundId}`)
}

export async function getApprovalAttachments(target: { reportId?: string; fundId?: string }) {
  const { supabase, profile } = await getProfile()

  let query = supabase
    .from('approval_attachments')
    .select('*')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: true })

  if (target.reportId) query = query.eq('report_id', target.reportId)
  else if (target.fundId) query = query.eq('fund_id', target.fundId)
  else return []

  const { data: attachments } = await query
  if (!attachments?.length) return []

  const uploaderIds = [...new Set(attachments.map(a => a.uploaded_by))]
  const { data: users } = await supabase
    .from('users').select('id, full_name').in('id', uploaderIds)
  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]))

  return Promise.all(attachments.map(async a => {
    const { data: signedUrl } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(a.storage_path, 3600)
    return {
      ...a,
      uploader_name: userMap[a.uploaded_by] ?? 'Desconocido',
      url: signedUrl?.signedUrl ?? null,
    }
  }))
}

export async function deleteApprovalAttachment(id: string, storagePath: string) {
  const { supabase, userId, profile } = await getProfile()

  const { data: att } = await supabase
    .from('approval_attachments')
    .select('uploaded_by, report_id, fund_id')
    .eq('id', id)
    .single()

  if (!att) throw new Error('Adjunto no encontrado')
  if (att.uploaded_by !== userId && profile.role !== 'admin') {
    throw new Error('Sin permiso para eliminar este adjunto')
  }

  await supabase.storage.from(BUCKET).remove([storagePath])
  await supabase.from('approval_attachments').delete().eq('id', id)

  if (att.report_id) revalidatePath(`/approvals/${att.report_id}`)
  if (att.fund_id)   revalidatePath(`/petty-cash/${att.fund_id}`)
}
