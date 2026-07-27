import { describe, it, expect } from 'vitest'
import { buildPeriodRange, computeUnifiedKpis } from '@/lib/report-helpers'
import type { UnifiedReportItem } from '@/lib/report-helpers'

describe('buildPeriodRange', () => {
  it('retorna null para tipo custom', () => {
    expect(buildPeriodRange({ type: 'custom' })).toBeNull()
  })

  it('retorna rango completo para año 2024', () => {
    const r = buildPeriodRange({ type: 'year', year: 2024 })
    expect(r).toEqual({ dateFrom: '2024-01-01', dateTo: '2024-12-31' })
  })

  it('primer semestre 2025', () => {
    const r = buildPeriodRange({ type: 'semester', year: 2025, half: 1 })
    expect(r).toEqual({ dateFrom: '2025-01-01', dateTo: '2025-06-30' })
  })

  it('segundo semestre 2025', () => {
    const r = buildPeriodRange({ type: 'semester', year: 2025, half: 2 })
    expect(r).toEqual({ dateFrom: '2025-07-01', dateTo: '2025-12-31' })
  })
})

describe('computeUnifiedKpis', () => {
  const makeItem = (overrides: Partial<UnifiedReportItem>): UnifiedReportItem => ({
    source:                'rendicion_new',
    employee_id:           'u1',
    employee_name:         'Ana',
    department:            null,
    parent_id:             'r1',
    parent_title:          'Rendición 1',
    parent_status:         'approved',
    defontana_exported_at: null,
    reimbursed_at:         null,
    item_id:               'i1',
    description:           'Taxi',
    merchant:              null,
    date:                  '2025-01-15',
    category_id:           'c1',
    category_name:         'Transporte',
    category_color:        '#10B981',
    amount:                5000,
    currency:              'CLP',
    amount_clp:            5000,
    doc_type:              'boleta',
    doc_number:            null,
    item_status:           'approved',
    rejection_reason:      null,
    notes:                 null,
    ...overrides,
  })

  it('items vacíos retorna ceros', () => {
    const kpis = computeUnifiedKpis([])
    expect(kpis.totalItems).toBe(0)
    expect(kpis.totalCLP).toBe(0)
    expect(kpis.approvedCLP).toBe(0)
  })

  it('suma totalCLP correctamente', () => {
    const items = [
      makeItem({ amount_clp: 10000, source: 'rendicion_new' }),
      makeItem({ amount_clp: 5000,  source: 'caja_chica_new' }),
    ]
    const kpis = computeUnifiedKpis(items)
    expect(kpis.totalCLP).toBe(15000)
    expect(kpis.totalItems).toBe(2)
  })

  it('approvedCLP solo suma ítems aprobados', () => {
    const items = [
      makeItem({ amount_clp: 10000, item_status: 'approved' }),
      makeItem({ amount_clp: 5000,  item_status: 'rejected' }),
      makeItem({ amount_clp: 3000,  item_status: 'pending'  }),
    ]
    expect(computeUnifiedKpis(items).approvedCLP).toBe(10000)
  })

  it('bySource acumula por fuente', () => {
    const items = [
      makeItem({ source: 'rendicion_new',   amount_clp: 1000 }),
      makeItem({ source: 'rendicion_new',   amount_clp: 2000 }),
      makeItem({ source: 'caja_chica_hist', amount_clp: 500  }),
    ]
    const kpis = computeUnifiedKpis(items)
    expect(kpis.bySource.rendicion_new.count).toBe(2)
    expect(kpis.bySource.rendicion_new.totalCLP).toBe(3000)
    expect(kpis.bySource.caja_chica_hist.count).toBe(1)
    expect(kpis.bySource.caja_chica_new.count).toBe(0)
  })
})
