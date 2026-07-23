'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import Anthropic from '@anthropic-ai/sdk'
import { parseExcelBuffer, type ParsedHistoricalImport } from '@/lib/historical-import/parser'
import { buildCategorizerPrompt, parseCategorizeResponse, type CategorySuggestion } from '@/lib/historical-import/categorizer'

export interface HistoricalGridRow {
  employeeName:  string
  description:   string
  date:          string
  amountCLP:     number
  categoryId:    string | null
  costCenterId:  string
  docType:       'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro'
  docNumber:     string | null
  supplierRut:   string | null
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('users').select('org_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') throw new Error('Solo administradores')
  return { supabase, userId: user.id, orgId: profile.org_id }
}

/** Recibe el FormData con el archivo y retorna la estructura parseada */
export async function parseUploadedExcel(formData: FormData): Promise<ParsedHistoricalImport> {
  await requireAdmin()  // verifica que sea admin antes de procesar
  const file = formData.get('file') as File | null
  if (!file) throw new Error('No se recibió ningún archivo')
  const buffer = await file.arrayBuffer()
  return parseExcelBuffer(buffer)
}

/** Llama a Claude para sugerir categorías de los ítems */
export async function categorizeItems(
  items: Array<{ description: string; merchantHint?: string }>,
): Promise<CategorySuggestion[]> {
  const { supabase, orgId } = await requireAdmin()

  // Cargar categorías de la org
  const { data: cats } = await supabase
    .from('expense_categories')
    .select('id, name')
    .or(`org_id.eq.${orgId},org_id.is.null`)
    .eq('is_active', true)

  if (!cats?.length) return []

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const prompt = buildCategorizerPrompt(items, cats)

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',  // Haiku es suficiente y más barato para clasificación
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return parseCategorizeResponse(text)
  } catch (err) {
    console.error('[CATEGORIZE] Error:', err)
    return []
  }
}

/** Crea el expense_report + expense_items en estado aprobado */
export async function commitHistoricalImport(data: {
  title:              string
  responsibleUserId:  string
  approvedDate:       string  // YYYY-MM-DD — fecha de rendición del documento fuente
  rows:               HistoricalGridRow[]
  docType?:           'rendicion' | 'caja_chica'
  fundNumber?:        string
}): Promise<{ reportId: string }> {
  const { supabase, orgId } = await requireAdmin()

  if (!data.rows.length) throw new Error('No hay ítems para importar')
  if (!data.approvedDate) throw new Error('La fecha de rendición es obligatoria')

  const totalAmount = data.rows.reduce((s, r) => s + r.amountCLP, 0)

  // 1. Crear el expense_report directamente en estado 'approved'
  const { data: report, error: repErr } = await supabase
    .from('expense_reports')
    .insert({
      org_id:               orgId,
      submitter_id:         data.responsibleUserId,
      title:                data.title.trim(),
      status:               'approved' as const,
      current_level:        1,
      total_amount:         totalAmount,
      approved_amount:      totalAmount,
      currency:             'CLP',
      submitted_at:         data.approvedDate + 'T12:00:00Z',
      approved_at:          data.approvedDate + 'T12:00:00Z',
      is_historical_import: true,
      historical_type:      data.docType ?? null,
      fund_number:          data.fundNumber || null,
    })
    .select('id')
    .single()

  if (repErr) throw new Error(`Error creando reporte: ${repErr.message}`)
  const reportId = report.id

  // 2. Crear los ítems en estado 'approved'
  const itemInserts = data.rows.map(row => ({
    report_id:            reportId,
    org_id:               orgId,
    description:          row.description.trim(),
    amount:               row.amountCLP,
    currency:             'CLP',
    exchange_rate:        1,
    exchange_rate_source: 'manual' as const,
    amount_clp:           row.amountCLP,
    date:                 row.date,
    category_id:          row.categoryId,
    cost_center_id:       row.costCenterId || null,
    doc_type:             row.docType,
    doc_number:           row.docNumber || null,
    supplier_rut:         row.supplierRut || null,
    merchant:             row.employeeName || null,  // empleado como merchant para trazabilidad
    status:               'approved' as const,
  }))

  const { error: itemErr } = await supabase.from('expense_items').insert(itemInserts)
  if (itemErr) {
    // Rollback: borrar el report si falla la inserción de ítems
    await supabase.from('expense_reports').delete().eq('id', reportId)
    throw new Error(`Error creando ítems: ${itemErr.message}`)
  }

  revalidatePath('/admin/reports')
  revalidatePath('/admin/carga-historica')
  return { reportId }
}
