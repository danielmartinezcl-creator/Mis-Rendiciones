import { describe, it, expect } from 'vitest'
import { estadoTrasDecisionReporte, estadoTrasAprobacionFondo, estadoTrasLiquidacion } from '@/lib/flujo'
import { ESTADOS_APROBADOS, ESTADOS_POR_PAGAR } from '@/lib/constants'

describe('estadoTrasDecisionReporte', () => {
  it('N1 aprueba y hay N2: pasa al N2', () => {
    expect(estadoTrasDecisionReporte({ nivel: 1, tieneL2: true, resultado: 'approved', montoAPagar: 5000 }))
      .toBe('pending_l2')
  })

  it('N1 aprueba parcialmente y hay N2: también pasa al N2 — la última palabra es del N2', () => {
    expect(estadoTrasDecisionReporte({ nivel: 1, tieneL2: true, resultado: 'partially_approved', montoAPagar: 3000 }))
      .toBe('pending_l2')
  })

  it('aprobación final con monto: directo a la carga bancaria (D4)', () => {
    expect(estadoTrasDecisionReporte({ nivel: 2, tieneL2: true, resultado: 'approved', montoAPagar: 5000 }))
      .toBe('pending_bank_load')
    expect(estadoTrasDecisionReporte({ nivel: 1, tieneL2: false, resultado: 'approved', montoAPagar: 5000 }))
      .toBe('pending_bank_load')
    expect(estadoTrasDecisionReporte({ nivel: 2, tieneL2: true, resultado: 'partially_approved', montoAPagar: 3000 }))
      .toBe('pending_bank_load')
  })

  it('aprobación final sin nada que pagar: queda aprobada y no entra al banco', () => {
    expect(estadoTrasDecisionReporte({ nivel: 2, tieneL2: true, resultado: 'approved', montoAPagar: 0 }))
      .toBe('approved')
    expect(estadoTrasDecisionReporte({ nivel: 1, tieneL2: false, resultado: 'partially_approved', montoAPagar: -200 }))
      .toBe('partially_approved')
  })

  it('rechazo total, en cualquier nivel, termina en rechazada', () => {
    expect(estadoTrasDecisionReporte({ nivel: 1, tieneL2: true, resultado: 'rejected', montoAPagar: 0 })).toBe('rejected')
    expect(estadoTrasDecisionReporte({ nivel: 2, tieneL2: true, resultado: 'rejected', montoAPagar: 0 })).toBe('rejected')
  })
})

describe('fondos', () => {
  it('aprobación: N1 con N2 espera al N2; la final va directo al banco', () => {
    expect(estadoTrasAprobacionFondo({ nivel: 1, tieneL2: true })).toBe('pending_approval_l2')
    expect(estadoTrasAprobacionFondo({ nivel: 1, tieneL2: false })).toBe('pending_bank_load')
    expect(estadoTrasAprobacionFondo({ nivel: 2, tieneL2: true })).toBe('pending_bank_load')
  })

  it('liquidación: N1 con N2 espera al N2; la final liquida el fondo', () => {
    expect(estadoTrasLiquidacion({ nivel: 1, tieneL2: true })).toBe('pending_liquidation_l2')
    expect(estadoTrasLiquidacion({ nivel: 1, tieneL2: false })).toBe('settled')
    expect(estadoTrasLiquidacion({ nivel: 2, tieneL2: true })).toBe('settled')
  })
})

describe('grupos de estados', () => {
  it('toda rendición por pagar es una rendición aprobada', () => {
    for (const e of ESTADOS_POR_PAGAR) expect(ESTADOS_APROBADOS).toContain(e)
  })

  it('las etapas del banco cuentan como aprobadas y por pagar; reembolsada solo como aprobada', () => {
    expect(ESTADOS_POR_PAGAR).toEqual(expect.arrayContaining(['pending_bank_load', 'pending_bank_auth']))
    expect(ESTADOS_APROBADOS).toContain('reimbursed')
    expect(ESTADOS_POR_PAGAR).not.toContain('reimbursed')
  })
})
