import { describe, it, expect } from 'vitest'
import { fechaDelComprobanteDeGastos } from '@/lib/fecha-comprobante'

describe('fechaDelComprobanteDeGastos', () => {
  it('«RENDICION CAJA CHICA 26 FD»: la fecha de la rendición, no la del snack de agosto', () => {
    const fecha = fechaDelComprobanteDeGastos(
      { submitted_at: '2026-11-05T12:00:00+00:00', approved_at: '2026-11-05T12:00:00+00:00' },
      ['2026-08-22', '2026-10-01', '2026-11-02'],
    )
    expect(fecha).toBe('2026-11-05')
  })

  it('el día del envío se lee en hora de Chile: las 22:00 del 5 no es el 6', () => {
    // 2026-11-06 01:00 UTC = 2026-11-05 22:00 en Chile (verano, UTC−3)
    expect(fechaDelComprobanteDeGastos({ submitted_at: '2026-11-06T01:00:00Z' }, [])).toBe('2026-11-05')
  })

  it('sin envío registrado, la aprobación', () => {
    expect(fechaDelComprobanteDeGastos({ submitted_at: null, approved_at: '2026-11-09T14:19:15Z' }, ['2026-10-01'])).toBe('2026-11-09')
  })

  it('sin ninguna de las dos, el gasto más antiguo: es lo único que queda', () => {
    expect(fechaDelComprobanteDeGastos({ submitted_at: null, approved_at: null }, ['2026-10-07', null, '2026-10-01'])).toBe('2026-10-01')
  })

  it('una fecha sola se toma tal cual, sin correrla de día', () => {
    expect(fechaDelComprobanteDeGastos({ submitted_at: '2026-11-05' }, [])).toBe('2026-11-05')
  })
})
