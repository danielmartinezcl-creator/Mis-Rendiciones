import { describe, it, expect } from 'vitest'
import { resumenMisGastos, ultimosDoceMeses, esperaDecision, type GastoMio } from '@/lib/mis-gastos'

const HOY = '2026-10-07'
const gm = (over: Partial<GastoMio>): GastoMio => ({
  documentoId: 'd1', fecha: '2026-09-10', montoClp: 1000, categoriaId: 'comb', categoriaNombre: 'Combustible',
  aprobado: true, esperandoDecision: false, ...over,
})

describe('ultimosDoceMeses', () => {
  it('termina en el mes de hoy y cruza el año', () => {
    const m = ultimosDoceMeses(HOY)
    expect(m).toHaveLength(12)
    expect(m[0]).toBe('2025-11')
    expect(m[11]).toBe('2026-10')
  })
})

describe('resumenMisGastos', () => {
  it('total aprobado y promedio por mes con gastos', () => {
    const r = resumenMisGastos([gm({ fecha: '2026-09-10', montoClp: 1000 }), gm({ fecha: '2026-08-10', montoClp: 500 })], HOY)
    expect(r.totalAprobado).toBe(1500)
    expect(r.mesesConGastos).toBe(2)
    expect(r.promedioMensual).toBe(750)
    expect(r.porMes['2026-09']).toBe(1000)
  })

  it('lo aprobado de hace más de 12 meses no cuenta', () => {
    expect(resumenMisGastos([gm({ fecha: '2025-10-31' })], HOY).totalAprobado).toBe(0)
  })

  it('sin gastos, promedio 0 y no divide por cero', () => {
    expect(resumenMisGastos([], HOY).promedioMensual).toBe(0)
  })

  it('pendiente: suma lo que espera decisión y cuenta documentos distintos', () => {
    const r = resumenMisGastos([
      gm({ aprobado: false, esperandoDecision: true, documentoId: 'a', montoClp: 100 }),
      gm({ aprobado: false, esperandoDecision: true, documentoId: 'a', montoClp: 50 }),
      gm({ aprobado: false, esperandoDecision: true, documentoId: 'b', montoClp: 10 }),
    ], HOY)
    expect(r.pendiente).toEqual({ montoClp: 160, documentos: 2 })
    expect(r.totalAprobado).toBe(0)
  })

  it('un gasto sin aprobar de un documento que no se envió no es pendiente', () => {
    expect(resumenMisGastos([gm({ aprobado: false, esperandoDecision: false })], HOY).pendiente)
      .toEqual({ montoClp: 0, documentos: 0 })
  })

  it('por categoría, de mayor a menor, con «Sin categoría»', () => {
    const r = resumenMisGastos([
      gm({ categoriaId: 'comb', categoriaNombre: 'Combustible', montoClp: 100 }),
      gm({ categoriaId: null, categoriaNombre: null, montoClp: 300 }),
      gm({ categoriaId: 'comb', categoriaNombre: 'Combustible', montoClp: 50 }),
    ], HOY)
    expect(r.porCategoria).toEqual([
      { id: null, nombre: 'Sin categoría', total: 300 },
      { id: 'comb', nombre: 'Combustible', total: 150 },
    ])
  })
})

describe('esperaDecision', () => {
  it('rendición enviada sí; borrador no', () => {
    expect(esperaDecision('rendicion', 'submitted')).toBe(true)
    expect(esperaDecision('rendicion', 'pending_l2')).toBe(true)
    expect(esperaDecision('rendicion', 'draft')).toBe(false)
  })
  it('fondo presentado a liquidar sí; activo o pedido, no', () => {
    expect(esperaDecision('fondo', 'pending_liquidation_approval')).toBe(true)
    expect(esperaDecision('fondo', 'pending_liquidation_l2')).toBe(true)
    expect(esperaDecision('fondo', 'funds_sent')).toBe(false)
    // Un pedido de fondo no es un gasto
    expect(esperaDecision('fondo', 'pending_approval')).toBe(false)
  })
})
