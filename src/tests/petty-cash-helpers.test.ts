import { describe, it, expect } from 'vitest'
import { tramoDelFondo, construirRecorrido, TRAMOS_FONDO, calculateFundBalance } from '@/lib/petty-cash-helpers'
import type { PettyCashItem, PettyCashTransfer } from '@/lib/supabase/types'
import { FUND_STATUSES, FUND_STEPS } from '@/lib/constants'

/**
 * Los cuatro tramos de la sección 7 de Tornasol.
 *
 * La tarjeta héroe CAMBIA DE SIGNIFICADO según el tramo: antes del dinero no
 * hay medidor porque no hay nada que medir. Estos tests fijan ese mapeo y, en
 * el último, impiden que aparezca un quinto tramo — el mismo candado que ya
 * tienen las cuatro familias de estado.
 */
describe('tramoDelFondo', () => {
  it('pone los cinco estados previos a la transferencia en «antes»', () => {
    expect(tramoDelFondo('draft')).toBe('antes')
    expect(tramoDelFondo('pending_approval')).toBe('antes')
    expect(tramoDelFondo('approved')).toBe('antes')
    expect(tramoDelFondo('pending_bank_load')).toBe('antes')
    expect(tramoDelFondo('pending_bank_auth')).toBe('antes')
  })

  it('pone en «con-dinero» los tres estados en que el fondo tiene saldo', () => {
    expect(tramoDelFondo('funds_sent')).toBe('con-dinero')
    expect(tramoDelFondo('submitted')).toBe('con-dinero')
    expect(tramoDelFondo('pending_liquidation_approval')).toBe('con-dinero')
  })

  it('separa liquidado y rechazado en sus propios tramos', () => {
    expect(tramoDelFondo('settled')).toBe('cerrado')
    expect(tramoDelFondo('rejected')).toBe('rechazado')
  })

  it('no deja ningún estado del fondo sin tramo', () => {
    for (const estado of FUND_STATUSES) {
      expect(TRAMOS_FONDO).toContain(tramoDelFondo(estado))
    }
  })

  /**
   * El candado. Si alguien agrega un tramo, este test cae y obliga a discutir
   * la sección 7 en vez de sumar una quinta variante en silencio.
   */
  it('usa exactamente cuatro tramos, ni uno más', () => {
    const usados = new Set(FUND_STATUSES.map(tramoDelFondo))
    expect(usados.size).toBe(4)
    expect(TRAMOS_FONDO).toHaveLength(4)
  })
})

/**
 * El recorrido fusiona dos fuentes que hoy viven en componentes distintos:
 * los pasos canónicos de FUND_STEPS (que incluyen el futuro) y las fechas
 * reales del registro de auditoría (que solo tiene el pasado).
 */
describe('construirRecorrido', () => {
  const auditsHastaFondosEnviados = [
    { action: 'created',                created_at: '2026-08-04T09:12:00Z' },
    { action: 'submitted_for_approval', created_at: '2026-08-04T15:40:00Z' },
    { action: 'approved',               created_at: '2026-08-04T18:02:00Z' },
    { action: 'bank_load_requested',    created_at: '2026-08-05T10:05:00Z' },
    { action: 'bank_load_confirmed',    created_at: '2026-08-05T13:31:00Z' },
    { action: 'bank_authorized',        created_at: '2026-08-05T16:22:00Z' },
    { action: 'funds_sent',             created_at: '2026-08-06T08:30:00Z' },
  ]

  it('devuelve un paso por cada paso canónico del fondo', () => {
    const pasos = construirRecorrido('funds_sent', auditsHastaFondosEnviados)
    expect(pasos).toHaveLength(FUND_STEPS.length)
    expect(pasos.map(p => p.key)).toEqual(FUND_STEPS.map(s => s.key))
  })

  it('marca como «actual» el paso del estado vigente, aunque ya tenga fecha', () => {
    const pasos = construirRecorrido('funds_sent', auditsHastaFondosEnviados)
    const actual = pasos.find(p => p.estado === 'actual')
    expect(actual?.key).toBe('funds_sent')
    expect(actual?.fecha).toBe('2026-08-06T08:30:00Z')
  })

  it('cuelga de cada paso pasado la fecha de la auditoría que lo alcanzó', () => {
    const pasos = construirRecorrido('funds_sent', auditsHastaFondosEnviados)
    const porKey = Object.fromEntries(pasos.map(p => [p.key, p]))
    expect(porKey.draft.fecha).toBe('2026-08-04T09:12:00Z')
    expect(porKey.approved.fecha).toBe('2026-08-04T18:02:00Z')
    expect(porKey.pending_bank_auth.fecha).toBe('2026-08-05T13:31:00Z')
    expect(porKey.draft.estado).toBe('hecho')
  })

  it('deja los pasos futuros pendientes y sin fecha', () => {
    const pasos = construirRecorrido('funds_sent', auditsHastaFondosEnviados)
    const futuros = pasos.slice(pasos.findIndex(p => p.key === 'funds_sent') + 1)
    expect(futuros.length).toBeGreaterThan(0)
    for (const paso of futuros) {
      expect(paso.estado).toBe('pendiente')
      expect(paso.fecha).toBeNull()
    }
  })

  /**
   * Un fondo rechazado sale del carril: `rejected` no es un paso de FUND_STEPS.
   * Los pasos que alcanzó a dar siguen siendo pasado, pero ninguno es «actual»
   * — el fondo no está avanzando por ahí.
   */
  it('en un fondo rechazado marca lo recorrido y no señala ningún paso actual', () => {
    const pasos = construirRecorrido('rejected', [
      { action: 'created',                created_at: '2026-08-04T09:12:00Z' },
      { action: 'submitted_for_approval', created_at: '2026-08-04T15:40:00Z' },
      { action: 'rejected',               created_at: '2026-08-04T17:55:00Z' },
    ])
    expect(pasos.filter(p => p.estado === 'actual')).toHaveLength(0)
    expect(pasos.find(p => p.key === 'draft')?.estado).toBe('hecho')
    expect(pasos.find(p => p.key === 'pending_approval')?.estado).toBe('hecho')
    expect(pasos.find(p => p.key === 'approved')?.estado).toBe('pendiente')
  })

  /**
   * Las cargas históricas entran directo a un estado avanzado sin dejar el
   * rastro de auditoría de cada paso. El paso anterior igual está hecho: lo
   * dice el estado del fondo, aunque no haya fila que lo pruebe.
   */
  it('da por hecho un paso anterior al estado vigente aunque no tenga auditoría', () => {
    const pasos = construirRecorrido('submitted', [
      { action: 'created',                created_at: '2026-08-04T09:12:00Z' },
      { action: 'liquidation_submitted',  created_at: '2026-08-20T11:00:00Z' },
    ])
    const aprobado = pasos.find(p => p.key === 'approved')
    expect(aprobado?.estado).toBe('hecho')
    expect(aprobado?.fecha).toBeNull()
  })

  it('sin ninguna auditoría deja el primer paso como actual', () => {
    const pasos = construirRecorrido('draft', [])
    expect(pasos[0].key).toBe('draft')
    expect(pasos[0].estado).toBe('actual')
    expect(pasos[0].fecha).toBeNull()
  })
})

/**
 * La dirección de la plata al liquidar.
 *
 * El empleado recibe el fondo ANTES de gastar: si gastó menos, lo que sobra
 * lo tiene él y lo devuelve; si gastó más, puso de su bolsillo y la empresa
 * le paga la diferencia. Hasta el 2026-09-24 las dos marcas estaban
 * invertidas: con $89.340 gastados de $300.000 la app decía «la empresa te
 * devolverá $210.660» y precargaba una transferencia que en Defontana sale
 * como adelanto — plata que SALE, cuando tenía que entrar.
 */
describe('calculateFundBalance — quién le debe a quién', () => {
  const item = (amount_clp: number, status = 'pending') => ({ amount_clp, status }) as PettyCashItem
  const transfer = (type: PettyCashTransfer['type'], amount: number) => ({ type, amount }) as PettyCashTransfer

  it('si sobró plata, la devuelve el empleado', () => {
    const b = calculateFundBalance(300_000, [item(89_340)])
    expect(b.pending).toBe(210_660)
    expect(b.employeeOwes).toBe(true)
    expect(b.companyOwes).toBe(false)
    expect(b.settlementType).toBe('reimbursement_from_employee')
  })

  it('si gastó de más, la empresa le paga la diferencia', () => {
    const b = calculateFundBalance(300_000, [item(250_000), item(80_000)])
    expect(b.pending).toBe(-30_000)
    expect(b.companyOwes).toBe(true)
    expect(b.employeeOwes).toBe(false)
    expect(b.settlementType).toBe('refund_to_employee')
  })

  it('cuadrado no pide ninguna transferencia', () => {
    const b = calculateFundBalance(300_000, [item(300_000)])
    expect(b.isBalanced).toBe(true)
    expect(b.settlementType).toBeNull()
  })

  it('los gastos rechazados no cuentan como gastados', () => {
    const b = calculateFundBalance(300_000, [item(100_000), item(50_000, 'rejected')])
    expect(b.spent).toBe(100_000)
    expect(b.pending).toBe(200_000)
  })

  it('una devolución ya registrada salda la diferencia: no se pide dos veces', () => {
    const b = calculateFundBalance(300_000, [item(89_340)], [
      transfer('disbursement', 300_000),
      transfer('reimbursement_from_employee', 210_660),
    ])
    expect(b.pending).toBe(0)
    expect(b.settlementType).toBeNull()
  })

  it('un pago ya registrado al empleado salda el exceso', () => {
    const b = calculateFundBalance(300_000, [item(330_000)], [transfer('refund_to_employee', 30_000)])
    expect(b.pending).toBe(0)
    expect(b.settlementType).toBeNull()
  })

  it('una devolución parcial deja pendiente solo el resto', () => {
    const b = calculateFundBalance(300_000, [item(89_340)], [transfer('reimbursement_from_employee', 200_000)])
    expect(b.pending).toBe(10_660)
    expect(b.settlementType).toBe('reimbursement_from_employee')
  })
})
