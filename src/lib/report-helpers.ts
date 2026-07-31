// ─── Tipos exportados ────────────────────────────────────────────────────────

export type UnifiedItemSource = 'rendicion_new' | 'rendicion_hist' | 'caja_chica_new' | 'caja_chica_hist'

export interface UnifiedReportItem {
  source:                UnifiedItemSource
  employee_id:           string
  employee_name:         string
  department:            string | null
  parent_id:             string
  parent_title:          string
  parent_status:         string
  defontana_exported_at: string | null
  reimbursed_at:         string | null
  item_id:               string
  description:           string
  merchant:              string | null
  date:                  string
  category_id:           string | null
  category_name:         string | null
  category_color:        string | null
  amount:                number
  currency:              string
  amount_clp:            number
  doc_type:              string | null
  doc_number:            string | null
  item_status:           'pending' | 'approved' | 'rejected'
  rejection_reason:      string | null
  notes:                 string | null
}

export interface UnifiedReportFilters {
  sourceTypes:     ('rendicion' | 'caja_chica')[]
  dataAge:         'new' | 'historical' | 'all'
  dateFrom?:       string
  dateTo?:         string
  department?:     string
  employeeIds?:    string[]
  categoryIds?:    string[]
  reportIds?:      string[]   // rendición IDs específicas
  fundIds?:        string[]   // fondo IDs específicos
  reportStatuses?: string[]   // filtro sobre parent status
  itemStatuses?:   ('pending' | 'approved' | 'rejected')[]
  reimb?:          'all' | 'pending' | 'reimbursed'
  defontana?:      'all' | 'notExported' | 'exported'
}

export interface UnifiedKpis {
  totalItems:  number
  totalCLP:    number
  approvedCLP: number
  bySource:    Record<UnifiedItemSource, { count: number; totalCLP: number }>
}

export interface ReportFilterOptions {
  employees:   { id: string; name: string; department: string | null }[]
  categories:  { id: string; name: string; color: string | null }[]
  departments: string[]
  rendiciones: { id: string; title: string }[]
  fondos:      { id: string; name: string }[]
}

export type PeriodPreset =
  | { type: 'year';     year: number }
  | { type: 'semester'; year: number; half: 1 | 2 }
  | { type: 'custom' }

// ─── Labels y colores de fuente ──────────────────────────────────────────────

export const SOURCE_LABELS: Record<UnifiedItemSource, string> = {
  rendicion_new:   'Rendición',
  rendicion_hist:  'Rendición hist.',
  caja_chica_new:  'Caja Chica',
  caja_chica_hist: 'Caja Chica hist.',
}

export const SOURCE_COLORS: Record<UnifiedItemSource, { bg: string; text: string }> = {
  rendicion_new:   { bg: 'bg-brand-50',  text: 'text-brand-700'  },
  rendicion_hist:  { bg: 'bg-violet-50', text: 'text-violet-700' },
  caja_chica_new:  { bg: 'bg-teal-50',   text: 'text-teal-700'   },
  caja_chica_hist: { bg: 'bg-amber-50',  text: 'text-amber-700'  },
}

// ─── buildPeriodRange ────────────────────────────────────────────────────────

export function buildPeriodRange(preset: PeriodPreset): { dateFrom: string; dateTo: string } | null {
  if (preset.type === 'custom') return null
  if (preset.type === 'year') {
    return {
      dateFrom: `${preset.year}-01-01`,
      dateTo:   `${preset.year}-12-31`,
    }
  }
  // semester
  const from = preset.half === 1 ? `${preset.year}-01-01` : `${preset.year}-07-01`
  const to   = preset.half === 1 ? `${preset.year}-06-30` : `${preset.year}-12-31`
  return { dateFrom: from, dateTo: to }
}

// ─── computeUnifiedKpis ──────────────────────────────────────────────────────

export function computeUnifiedKpis(items: UnifiedReportItem[]): UnifiedKpis {
  const bySource: UnifiedKpis['bySource'] = {
    rendicion_new:   { count: 0, totalCLP: 0 },
    rendicion_hist:  { count: 0, totalCLP: 0 },
    caja_chica_new:  { count: 0, totalCLP: 0 },
    caja_chica_hist: { count: 0, totalCLP: 0 },
  }

  let totalCLP    = 0
  let approvedCLP = 0

  for (const i of items) {
    totalCLP += i.amount_clp
    if (i.item_status === 'approved') approvedCLP += i.amount_clp
    bySource[i.source].count++
    bySource[i.source].totalCLP += i.amount_clp
  }

  return { totalItems: items.length, totalCLP, approvedCLP, bySource }
}
