'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { computeUnifiedKpis } from '@/lib/report-helpers'
import type {
  UnifiedReportItem,
  UnifiedReportFilters,
  UnifiedItemSource,
  UnifiedKpis,
  ReportFilterOptions,
} from '@/lib/report-helpers'

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function requireAdminOrApprover() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('org_id, role, can_approve')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'admin' && !profile.can_approve)) {
    throw new Error('Acceso restringido a administradores y aprobadores')
  }

  return { supabase, orgId: profile.org_id }
}

// ─── Enriquecedor de categorías (reutilizado por los 4 fetchers) ─────────────

async function enrichCategories(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryIds: string[]
): Promise<Record<string, { name: string; color: string | null }>> {
  if (!categoryIds.length) return {}
  const { data } = await supabase
    .from('expense_categories')
    .select('id, name, color')
    .in('id', categoryIds)
    .is('deleted_at', null)
  return Object.fromEntries((data ?? []).map(c => [c.id, { name: c.name, color: c.color ?? null }]))
}

// ─── Fetcher 1: Rendiciones (nueva + histórica) ───────────────────────────────

async function fetchRendicionItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  filters: UnifiedReportFilters,
  isHistorical: boolean
): Promise<UnifiedReportItem[]> {
  const source: UnifiedItemSource = isHistorical ? 'rendicion_hist' : 'rendicion_new'

  let q = supabase
    .from('expense_reports')
    .select('id, title, status, reimbursed_at, defontana_exported_at, submitter_id')
    .eq('org_id', orgId)
    .is('deleted_at', null)

  if (isHistorical) {
    q = q.eq('is_historical_import', true).eq('historical_type', 'rendicion')
  } else {
    q = q.or('is_historical_import.is.null,is_historical_import.eq.false').is('historical_type', null)
  }

  if (filters.reportStatuses?.length) q = q.in('status', filters.reportStatuses as never[])
  if (filters.reportIds?.length)      q = q.in('id', filters.reportIds)
  if (filters.employeeIds?.length)    q = q.in('submitter_id', filters.employeeIds)

  if (filters.reimb === 'pending') {
    q = q.is('reimbursed_at', null)
  } else if (filters.reimb === 'reimbursed') {
    q = q.not('reimbursed_at', 'is', null)
  }

  if (filters.defontana === 'notExported') q = q.is('defontana_exported_at', null)
  if (filters.defontana === 'exported')    q = q.not('defontana_exported_at', 'is', null)

  const { data: reports } = await q
  if (!reports?.length) return []

  // Enriquecer con datos de usuario (para filtro por departamento)
  const submitterIds = [...new Set(reports.map(r => r.submitter_id))]
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, department')
    .in('id', submitterIds)
  const userMap = Object.fromEntries(
    (users ?? []).map(u => [u.id, { name: u.full_name, department: u.department ?? null }])
  )

  const filteredReports = reports.filter(r => {
    if (filters.departments?.length && !filters.departments.includes(userMap[r.submitter_id]?.department ?? '')) return false
    return true
  })
  if (!filteredReports.length) return []

  const reportMap = Object.fromEntries(filteredReports.map(r => [r.id, r]))
  const reportIds = filteredReports.map(r => r.id)

  // Ítems
  let itemsQ = supabase
    .from('expense_items')
    .select('id, report_id, description, amount, currency, amount_clp, date, category_id, merchant, doc_type, doc_number, notes, status, rejection_reason')
    .in('report_id', reportIds)
    .is('deleted_at', null)
    .order('date', { ascending: true })

  if (filters.dateFrom)              itemsQ = itemsQ.gte('date', filters.dateFrom)
  if (filters.dateTo)                itemsQ = itemsQ.lte('date', filters.dateTo)
  if (filters.itemStatuses?.length)  itemsQ = itemsQ.in('status', filters.itemStatuses)
  if (filters.categoryIds?.length)   itemsQ = itemsQ.in('category_id', filters.categoryIds)

  const { data: items } = await itemsQ
  if (!items?.length) return []

  const catIds = [...new Set(items.map(i => i.category_id).filter(Boolean))] as string[]
  const catMap = await enrichCategories(supabase, catIds)

  return items.map(i => {
    const r    = reportMap[i.report_id]
    const user = userMap[r.submitter_id]
    return {
      source,
      employee_id:           r.submitter_id,
      employee_name:         user?.name          ?? 'Desconocido',
      department:            user?.department     ?? null,
      parent_id:             i.report_id,
      parent_title:          r.title,
      parent_status:         r.status,
      defontana_exported_at: r.defontana_exported_at,
      reimbursed_at:         r.reimbursed_at,
      item_id:               i.id,
      description:           i.description,
      merchant:              i.merchant,
      date:                  i.date,
      category_id:           i.category_id,
      category_name:         i.category_id ? (catMap[i.category_id]?.name  ?? null) : null,
      category_color:        i.category_id ? (catMap[i.category_id]?.color ?? null) : null,
      amount:                i.amount,
      currency:              i.currency,
      amount_clp:            i.amount_clp,
      doc_type:              i.doc_type,
      doc_number:            i.doc_number,
      item_status:           i.status as 'pending' | 'approved' | 'rejected',
      rejection_reason:      i.rejection_reason,
      notes:                 i.notes,
    }
  })
}

// ─── Fetcher 2: Caja Chica nueva (petty_cash_funds → petty_cash_items) ────────

async function fetchCajaChicaNewItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  filters: UnifiedReportFilters
): Promise<UnifiedReportItem[]> {
  let fundsQ = supabase
    .from('petty_cash_funds')
    .select('id, name, status, employee_id, defontana_exported_at')
    .eq('org_id', orgId)

  if (filters.reportStatuses?.length) fundsQ = fundsQ.in('status', filters.reportStatuses as never[])
  if (filters.fundIds?.length)        fundsQ = fundsQ.in('id', filters.fundIds)
  if (filters.employeeIds?.length)    fundsQ = fundsQ.in('employee_id', filters.employeeIds)

  const { data: funds } = await fundsQ
  if (!funds?.length) return []

  const empIds = [...new Set(funds.map(f => f.employee_id))]
  const { data: users } = await supabase
    .from('users').select('id, full_name, department').in('id', empIds)
  const userMap = Object.fromEntries(
    (users ?? []).map(u => [u.id, { name: u.full_name, department: u.department ?? null }])
  )

  const filteredFunds = funds.filter(f => {
    if (filters.departments?.length && !filters.departments.includes(userMap[f.employee_id]?.department ?? '')) return false
    return true
  })
  if (!filteredFunds.length) return []

  const fundMap = Object.fromEntries(filteredFunds.map(f => [f.id, f]))
  const fundIds = filteredFunds.map(f => f.id)

  let itemsQ = supabase
    .from('petty_cash_items')
    .select('id, fund_id, description, amount, currency, amount_clp, date, category_id, merchant, doc_type, doc_number, notes, status, rejection_reason')
    .in('fund_id', fundIds)
    .order('date', { ascending: true })

  if (filters.dateFrom)              itemsQ = itemsQ.gte('date', filters.dateFrom)
  if (filters.dateTo)                itemsQ = itemsQ.lte('date', filters.dateTo)
  if (filters.itemStatuses?.length)  itemsQ = itemsQ.in('status', filters.itemStatuses)
  if (filters.categoryIds?.length)   itemsQ = itemsQ.in('category_id', filters.categoryIds)

  const { data: items } = await itemsQ
  if (!items?.length) return []

  const catIds = [...new Set(items.map(i => i.category_id).filter(Boolean))] as string[]
  const catMap = await enrichCategories(supabase, catIds)

  return items.map(i => {
    const fund = fundMap[i.fund_id]
    const user = userMap[fund.employee_id]
    return {
      source:                'caja_chica_new' as const,
      employee_id:           fund.employee_id,
      employee_name:         user?.name         ?? 'Desconocido',
      department:            user?.department    ?? null,
      parent_id:             i.fund_id,
      parent_title:          fund.name,
      parent_status:         fund.status,
      defontana_exported_at: fund.defontana_exported_at,
      reimbursed_at:         null,
      item_id:               i.id,
      description:           i.description,
      merchant:              i.merchant,
      date:                  i.date,
      category_id:           i.category_id,
      category_name:         i.category_id ? (catMap[i.category_id]?.name  ?? null) : null,
      category_color:        i.category_id ? (catMap[i.category_id]?.color ?? null) : null,
      amount:                i.amount,
      currency:              i.currency,
      amount_clp:            i.amount_clp,
      doc_type:              i.doc_type,
      doc_number:            i.doc_number,
      item_status:           i.status as 'pending' | 'approved' | 'rejected',
      rejection_reason:      i.rejection_reason,
      notes:                 i.notes,
    }
  })
}

// ─── Fetcher 3: Caja Chica histórica (expense_reports → expense_items) ────────

async function fetchCajaChicaHistItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  filters: UnifiedReportFilters
): Promise<UnifiedReportItem[]> {
  let q = supabase
    .from('expense_reports')
    .select('id, title, status, submitter_id, defontana_exported_at')
    .eq('org_id', orgId)
    .eq('is_historical_import', true)
    .eq('historical_type', 'caja_chica')
    .is('deleted_at', null)

  if (filters.reportStatuses?.length) q = q.in('status', filters.reportStatuses as never[])
  if (filters.fundIds?.length)        q = q.in('id', filters.fundIds)  // fundIds ≡ report IDs para históricas
  if (filters.employeeIds?.length)    q = q.in('submitter_id', filters.employeeIds)

  const { data: reports } = await q
  if (!reports?.length) return []

  const submitterIds = [...new Set(reports.map(r => r.submitter_id))]
  const { data: users } = await supabase
    .from('users').select('id, full_name, department').in('id', submitterIds)
  const userMap = Object.fromEntries(
    (users ?? []).map(u => [u.id, { name: u.full_name, department: u.department ?? null }])
  )

  const filteredReports = reports.filter(r => {
    if (filters.departments?.length && !filters.departments.includes(userMap[r.submitter_id]?.department ?? '')) return false
    return true
  })
  if (!filteredReports.length) return []

  const reportMap = Object.fromEntries(filteredReports.map(r => [r.id, r]))
  const reportIds = filteredReports.map(r => r.id)

  let itemsQ = supabase
    .from('expense_items')
    .select('id, report_id, description, amount, currency, amount_clp, date, category_id, merchant, doc_type, doc_number, notes, status, rejection_reason')
    .in('report_id', reportIds)
    .is('deleted_at', null)
    .order('date', { ascending: true })

  if (filters.dateFrom)              itemsQ = itemsQ.gte('date', filters.dateFrom)
  if (filters.dateTo)                itemsQ = itemsQ.lte('date', filters.dateTo)
  if (filters.itemStatuses?.length)  itemsQ = itemsQ.in('status', filters.itemStatuses)
  if (filters.categoryIds?.length)   itemsQ = itemsQ.in('category_id', filters.categoryIds)

  const { data: items } = await itemsQ
  if (!items?.length) return []

  const catIds = [...new Set(items.map(i => i.category_id).filter(Boolean))] as string[]
  const catMap = await enrichCategories(supabase, catIds)

  return items.map(i => {
    const r    = reportMap[i.report_id]
    const user = userMap[r.submitter_id]
    return {
      source:                'caja_chica_hist' as const,
      employee_id:           r.submitter_id,
      employee_name:         user?.name         ?? 'Desconocido',
      department:            user?.department    ?? null,
      parent_id:             i.report_id,
      parent_title:          r.title,
      parent_status:         r.status,
      defontana_exported_at: r.defontana_exported_at,
      reimbursed_at:         null,
      item_id:               i.id,
      description:           i.description,
      merchant:              i.merchant,
      date:                  i.date,
      category_id:           i.category_id,
      category_name:         i.category_id ? (catMap[i.category_id]?.name  ?? null) : null,
      category_color:        i.category_id ? (catMap[i.category_id]?.color ?? null) : null,
      amount:                i.amount,
      currency:              i.currency,
      amount_clp:            i.amount_clp,
      doc_type:              i.doc_type,
      doc_number:            i.doc_number,
      item_status:           i.status as 'pending' | 'approved' | 'rejected',
      rejection_reason:      i.rejection_reason,
      notes:                 i.notes,
    }
  })
}

// ─── Exported: opciones para filtros ─────────────────────────────────────────

export async function getReportFilterOptions(): Promise<ReportFilterOptions> {
  const { supabase, orgId } = await requireAdminOrApprover()

  const [usersRes, catsRes, rendRes, fondosRes] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, department')
      .eq('org_id', orgId),
    supabase
      .from('expense_categories')
      .select('id, name, color')
      .or(`org_id.eq.${orgId},org_id.is.null`)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('expense_reports')
      .select('id, title')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .or('historical_type.is.null,historical_type.eq.rendicion')
      .order('title'),
    supabase
      .from('petty_cash_funds')
      .select('id, name')
      .eq('org_id', orgId)
      .order('name'),
  ])

  const employees = (usersRes.data ?? [])
    .map(u => ({ id: u.id, name: u.full_name, department: u.department ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const departments = [...new Set(
    employees.map(e => e.department).filter(Boolean) as string[]
  )].sort()

  return {
    employees,
    categories:  (catsRes.data  ?? []).map(c => ({ id: c.id, name: c.name, color: c.color ?? null })),
    departments,
    rendiciones: (rendRes.data  ?? []).map(r => ({ id: r.id, title: r.title })),
    fondos:      (fondosRes.data ?? []).map(f => ({ id: f.id, name: f.name })),
  }
}

// ─── Exported: consulta principal ────────────────────────────────────────────

export async function getUnifiedReportItems(
  filters: UnifiedReportFilters
): Promise<{ items: UnifiedReportItem[] } & UnifiedKpis> {
  const { supabase, orgId } = await requireAdminOrApprover()

  const includeRend = filters.sourceTypes.includes('rendicion')
  const includeCC   = filters.sourceTypes.includes('caja_chica')
  const includeNew  = filters.dataAge !== 'historical'
  const includeHist = filters.dataAge !== 'new'

  const promises: Promise<UnifiedReportItem[]>[] = []

  if (includeRend && includeNew)  promises.push(fetchRendicionItems(supabase, orgId, filters, false))
  if (includeRend && includeHist) promises.push(fetchRendicionItems(supabase, orgId, filters, true))
  if (includeCC   && includeNew)  promises.push(fetchCajaChicaNewItems(supabase, orgId, filters))
  if (includeCC   && includeHist) promises.push(fetchCajaChicaHistItems(supabase, orgId, filters))

  if (!promises.length) {
    return {
      items: [],
      totalItems: 0,
      totalCLP: 0,
      approvedCLP: 0,
      bySource: {
        rendicion_new:   { count: 0, totalCLP: 0 },
        rendicion_hist:  { count: 0, totalCLP: 0 },
        caja_chica_new:  { count: 0, totalCLP: 0 },
        caja_chica_hist: { count: 0, totalCLP: 0 },
      },
    }
  }

  const results = await Promise.all(promises)
  const items   = results.flat().sort((a, b) => a.date.localeCompare(b.date))
  const kpis    = computeUnifiedKpis(items)

  return { items, ...kpis }
}
