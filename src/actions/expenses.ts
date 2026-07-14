'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { calculateReportTotal, validateExpenseItem } from '@/lib/expense-helpers'
import type { Json } from '@/lib/supabase/types'

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
    ocr_raw?: Json | null
    ocr_confidence?: number | null
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
      ocr_raw:              item.ocr_raw ?? null,
      ocr_confidence:       item.ocr_confidence ?? null,
      status:               'pending',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  const { data: allItems } = await supabase
    .from('expense_items')
    .select('amount_clp')
    .eq('report_id', reportId)

  const total = calculateReportTotal(allItems ?? [])

  await supabase
    .from('expense_reports')
    .update({ total_amount: total })
    .eq('id', reportId)

  revalidatePath(`/expenses/${reportId}`)
  return newItem?.id
}

export async function deleteExpenseItem(itemId: string, reportId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('expense_items')
    .delete()
    .eq('id', itemId)

  if (error) throw new Error(error.message)

  const { data: allItems } = await supabase
    .from('expense_items')
    .select('amount_clp')
    .eq('report_id', reportId)

  const total = calculateReportTotal(allItems ?? [])
  await supabase
    .from('expense_reports')
    .update({ total_amount: total })
    .eq('id', reportId)

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

  if (!count || count === 0) {
    throw new Error('La rendición debe tener al menos un ítem')
  }

  const { error } = await supabase
    .from('expense_reports')
    .update({
      status:       'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .eq('submitter_id', user.id)
    .eq('status', 'draft')

  if (error) throw new Error(error.message)

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
    .order('created_at', { ascending: false })
    .limit(20)

  return data ?? []
}

// ── Detección de documentos duplicados ───────────────────────────────────────

export async function checkItemDuplicate(params: {
  doc_type:       string
  doc_number:     string
  excludeItemId?: string
}) {
  if (!params.doc_type || !params.doc_number?.trim()) return null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()
  if (!profile) return null

  const docNum = params.doc_number.trim()

  // Buscar en ítems de rendiciones
  const { data: expItems } = await supabase
    .from('expense_items')
    .select('id, description, amount_clp, date, report_id')
    .eq('org_id', profile.org_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq('doc_type', params.doc_type as any)
    .eq('doc_number', docNum)
    .limit(1)

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
  const { data: pcItems } = await supabase
    .from('petty_cash_items')
    .select('id, description, amount_clp, date, fund_id')
    .eq('org_id', profile.org_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq('doc_type', params.doc_type as any)
    .eq('doc_number', docNum)
    .limit(1)

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

export async function getReportWithItems(reportId: string) {
  const supabase = await createClient()

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

export async function uploadAttachment(
  itemId: string,
  orgId: string,
  file: File
): Promise<string> {
  const supabase = await createClient()

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${orgId}/${itemId}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('expense-attachments')
    .upload(path, file, { contentType: file.type })

  if (uploadError) throw new Error(uploadError.message)

  const fileType = file.type.startsWith('image/') ? 'image' : 'pdf'

  await supabase
    .from('attachments')
    .insert({
      item_id:      itemId,
      org_id:       orgId,
      storage_path: path,
      file_type:    fileType as 'image' | 'pdf',
      file_size:    file.size,
    })

  return path
}
