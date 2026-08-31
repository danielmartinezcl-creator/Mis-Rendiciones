import { describe, it, expect } from 'vitest'
import { buildPeriodRange, computeUnifiedKpis, toUnifiedMovement } from '@/lib/report-helpers'
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
    item_type:             'expense',
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

describe('KPIs por movimiento', () => {
  // El gasto y el adelanto que lo financia son la misma plata contada dos veces
  const makeItem = (overrides: Partial<UnifiedReportItem>): UnifiedReportItem => ({
    source:                'caja_chica_hist',
    item_type:             'expense',
    employee_id:           'u1',
    employee_name:         'Ana',
    department:            null,
    parent_id:             'r1',
    parent_title:          'Caja Chica N° 174',
    parent_status:         'approved',
    defontana_exported_at: null,
    reimbursed_at:         null,
    item_id:               'i1',
    description:           'Movimiento',
    merchant:              null,
    date:                  '2026-02-24',
    category_id:           null,
    category_name:         null,
    category_color:        null,
    amount:                1000,
    currency:              'CLP',
    amount_clp:            1000,
    doc_type:              null,
    doc_number:            null,
    item_status:           'approved',
    rejection_reason:      null,
    notes:                 null,
    ...overrides,
  })

  // Caso real del fondo 174: adelantos por 281.728 y gastos por 281.728
  const fondo174 = [
    makeItem({ item_id: 'a1', item_type: 'advance', amount_clp: 200_000, date: '2026-02-24' }),
    makeItem({ item_id: 'a2', item_type: 'advance', amount_clp:  81_728, date: '2026-03-12' }),
    makeItem({ item_id: 'g1', item_type: 'expense', amount_clp: 281_728, date: '2026-03-04' }),
  ]

  it('no mezcla el gasto con el adelanto que lo financia', () => {
    const k = computeUnifiedKpis(fondo174)
    expect(k.byMovement.expense.approvedCLP).toBe(281_728)
    expect(k.byMovement.advance.totalCLP).toBe(281_728)
    // El total sigue sumando todo: por eso no sirve como cifra de gasto
    expect(k.totalCLP).toBe(563_456)
  })

  it('cuenta los ítems de cada movimiento por separado', () => {
    const k = computeUnifiedKpis(fondo174)
    expect(k.byMovement.advance.count).toBe(2)
    expect(k.byMovement.expense.count).toBe(1)
    expect(k.byMovement.return.count).toBe(0)
  })

  it('separa devoluciones y traspasos del gasto', () => {
    const k = computeUnifiedKpis([
      makeItem({ item_id: 'g', item_type: 'expense',  amount_clp: 100_000 }),
      makeItem({ item_id: 'd', item_type: 'return',   amount_clp:  30_000 }),
      makeItem({ item_id: 't', item_type: 'transfer', amount_clp:  50_000 }),
    ])
    expect(k.byMovement.expense.approvedCLP).toBe(100_000)
    expect(k.byMovement.return.totalCLP).toBe(30_000)
    expect(k.byMovement.transfer.totalCLP).toBe(50_000)
  })

  it('un ítem rechazado suma al total del movimiento pero no al aprobado', () => {
    const k = computeUnifiedKpis([
      makeItem({ item_id: 'g1', item_type: 'expense', amount_clp: 100_000 }),
      makeItem({ item_id: 'g2', item_type: 'expense', amount_clp:  40_000, item_status: 'rejected' }),
    ])
    expect(k.byMovement.expense.totalCLP).toBe(140_000)
    expect(k.byMovement.expense.approvedCLP).toBe(100_000)
  })
})

describe('toUnifiedMovement', () => {
  it('reconoce los movimientos de fondos', () => {
    expect(toUnifiedMovement('advance')).toBe('advance')
    expect(toUnifiedMovement('return')).toBe('return')
    expect(toUnifiedMovement('transfer')).toBe('transfer')
  })

  it('trata como gasto lo que viene sin tipo — los fondos vivos no lo guardan', () => {
    expect(toUnifiedMovement(null)).toBe('expense')
    expect(toUnifiedMovement(undefined)).toBe('expense')
    expect(toUnifiedMovement('otra_cosa')).toBe('expense')
  })
})
