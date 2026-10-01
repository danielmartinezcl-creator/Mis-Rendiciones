import { describe, it, expect } from 'vitest'
import { motivoBloqueoPorTraspasos, traspasosPorDocumento, traspasosDe } from '@/lib/papelera'

describe('motivoBloqueoPorTraspasos', () => {
  it('sin traspasos no bloquea', () => {
    expect(motivoBloqueoPorTraspasos('rendicion', 0)).toBeNull()
  })
  it('con traspasos dice cuántos y de qué documento', () => {
    const motivo = motivoBloqueoPorTraspasos('fondo', 3)
    expect(motivo).toContain('fondo')
    expect(motivo).toContain('3 traspasos')
  })
  it('uno solo, en singular', () => {
    expect(motivoBloqueoPorTraspasos('rendicion', 1)).toContain('un traspaso')
  })
})

describe('traspasosPorDocumento', () => {
  it('cada traspaso cuenta para cada documento que toca', () => {
    const mapa = traspasosPorDocumento([
      { payer_report_id: 'r1', receiver_report_id: null, payer_fund_id: null, receiver_fund_id: 'f1' },
      { payer_report_id: 'r1', receiver_report_id: 'r2', payer_fund_id: null, receiver_fund_id: null },
    ])
    expect(mapa.get('r1')).toBe(2)
    expect(mapa.get('r2')).toBe(1)
    expect(mapa.get('f1')).toBe(1)
    expect(mapa.get('otro')).toBeUndefined()
  })
})

// PostgREST de mentira para conteos: responde según `tabla?columna=eq.valor`
function conteoFalso(conteos: Record<string, number | { error: string }>) {
  return {
    from: (tabla: string) => ({
      select: () => ({
        eq: async (columna: string, valor: string) => {
          const r = conteos[`${tabla}?${columna}=eq.${valor}`] ?? 0
          return typeof r === 'number' ? { count: r, error: null } : { count: null, error: { message: r.error } }
        },
      }),
    }),
  } as never
}

describe('traspasosDe', () => {
  it('rendición: suma donde paga y donde recibe', async () => {
    const admin = conteoFalso({
      'fund_transfers?payer_report_id=eq.rend-1':    1,
      'fund_transfers?receiver_report_id=eq.rend-1': 2,
    })
    expect(await traspasosDe(admin, { tipo: 'rendicion', id: 'rend-1' })).toBe(3)
  })
  it('fondo: mira las columnas del fondo', async () => {
    const admin = conteoFalso({ 'fund_transfers?receiver_fund_id=eq.fondo-1': 1 })
    expect(await traspasosDe(admin, { tipo: 'fondo', id: 'fondo-1' })).toBe(1)
  })
  it('si la consulta falla, lanza', async () => {
    const admin = conteoFalso({ 'fund_transfers?payer_fund_id=eq.fondo-1': { error: 'statement timeout' } })
    await expect(traspasosDe(admin, { tipo: 'fondo', id: 'fondo-1' })).rejects.toThrow('statement timeout')
  })
})
