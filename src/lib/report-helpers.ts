// ─── Tipos exportados ────────────────────────────────────────────────────────

export type UnifiedItemSource = 'rendicion_new' | 'rendicion_hist' | 'caja_chica_new' | 'caja_chica_hist'

/** Movimiento del ítem. No son sumables entre sí: el adelanto es la plata que se
 *  entrega y el gasto es en qué se usó esa misma plata; sumarlos la cuenta dos
 *  veces. La devolución es dinero que vuelve. */
export type UnifiedMovement = 'expense' | 'advance' | 'return' | 'transfer'

export const MOVEMENT_LABELS: Record<UnifiedMovement, string> = {
  expense:  'Gastos',
  advance:  'Adelantos',
  return:   'Devoluciones',
  transfer: 'Traspasos',
}

export interface UnifiedReportItem {
  source:                UnifiedItemSource
  item_type:             UnifiedMovement
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
  departments?:    string[]
  employeeIds?:    string[]
  categoryIds?:    string[]
  reportIds?:      string[]   // rendición IDs específicas
  fundIds?:        string[]   // fondo IDs específicos
  reportStatuses?: string[]   // filtro sobre parent status
  itemStatuses?:   ('pending' | 'approved' | 'rejected')[]
  reimb?:          'all' | 'pending' | 'reimbursed'
  defontana?:      'all' | 'notExported' | 'exported'
  movements?:      UnifiedMovement[]
}

export interface UnifiedKpis {
  totalItems:  number
  totalCLP:    number
  approvedCLP: number
  bySource:    Record<UnifiedItemSource, { count: number; totalCLP: number }>
  /** Desglose por movimiento. `expense` es el gasto real del período; los demás
   *  son flujo de fondos y no deben sumarse al gasto. */
  byMovement:  Record<UnifiedMovement, { count: number; totalCLP: number; approvedCLP: number }>
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
  rendicion_hist:  { bg: 'bg-flare-50', text: 'text-flare-700' },
  caja_chica_new:  { bg: 'bg-accent-50',   text: 'text-accent-700'   },
  caja_chica_hist: { bg: 'bg-warning-50',  text: 'text-warning-700'  },
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

  const byMovement: UnifiedKpis['byMovement'] = {
    expense:  { count: 0, totalCLP: 0, approvedCLP: 0 },
    advance:  { count: 0, totalCLP: 0, approvedCLP: 0 },
    return:   { count: 0, totalCLP: 0, approvedCLP: 0 },
    transfer: { count: 0, totalCLP: 0, approvedCLP: 0 },
  }

  let totalCLP    = 0
  let approvedCLP = 0

  for (const i of items) {
    const approved = i.item_status === 'approved'
    totalCLP += i.amount_clp
    if (approved) approvedCLP += i.amount_clp

    bySource[i.source].count++
    bySource[i.source].totalCLP += i.amount_clp

    const mov = byMovement[i.item_type] ?? byMovement.expense
    mov.count++
    mov.totalCLP += i.amount_clp
    if (approved) mov.approvedCLP += i.amount_clp
  }

  return { totalItems: items.length, totalCLP, approvedCLP, bySource, byMovement }
}

// ─── toUnifiedMovement ───────────────────────────────────────────────────────

/** item_type de la BD → movimiento. Nulo o desconocido cuenta como gasto:
 *  los ítems de un fondo de caja chica vivo no llevan tipo y todos son gastos. */
export function toUnifiedMovement(value: string | null | undefined): UnifiedMovement {
  if (value === 'advance' || value === 'return' || value === 'transfer') return value
  return 'expense'
}
