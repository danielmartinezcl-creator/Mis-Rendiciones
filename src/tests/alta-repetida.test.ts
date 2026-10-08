import { describe, it, expect } from 'vitest'
import {
  estadoDeCuenta, cuentaQueChoca, motivoDeChoque, seRecupera,
  type CuentaExistente,
} from '@/lib/alta-repetida'

const base = { id: 'x', nombre: 'Nadie', correo: 'nadie@penta.cl', rut: null }

function cuenta(p: Partial<CuentaExistente>): CuentaExistente {
  return { ...base, estado: 'activa', ...p }
}

describe('estadoDeCuenta', () => {
  it('la papelera gana sobre el bloqueo y sobre la desactivación', () => {
    expect(estadoDeCuenta({ is_active: false, deleted_at: '2026-10-08', blocked_at: '2026-10-08' }))
      .toBe('papelera')
  })
  it('bloqueada cuando no está en la papelera', () => {
    expect(estadoDeCuenta({ is_active: false, deleted_at: null, blocked_at: '2026-10-08' }))
      .toBe('bloqueada')
  })
  it('desactivada es distinto de eliminada: sigue en la nómina', () => {
    expect(estadoDeCuenta({ is_active: false, deleted_at: null, blocked_at: null })).toBe('inactiva')
  })
  it('activa', () => {
    expect(estadoDeCuenta({ is_active: true, deleted_at: null, blocked_at: null })).toBe('activa')
  })
})

describe('cuentaQueChoca', () => {
  const julian = cuenta({
    id: 'jt', nombre: 'Torres Julián', correo: 'jtorres@pentaingenieros.cl',
    rut: '19.639.969-0', estado: 'papelera',
  })

  it('encuentra por correo aunque la cuenta esté en la papelera — Auth igual lo rechaza', () => {
    const r = cuentaQueChoca({ correo: 'jtorres@pentaingenieros.cl' }, [julian])
    expect(r?.cuenta.id).toBe('jt')
    expect(r?.por).toBe('correo')
  })

  it('el correo no distingue mayúsculas ni espacios', () => {
    expect(cuentaQueChoca({ correo: '  JTorres@PentaIngenieros.CL ' }, [julian])?.cuenta.id).toBe('jt')
  })

  it('encuentra por RUT con otro formato: la base los guarda con puntos', () => {
    const r = cuentaQueChoca({ correo: 'otro@penta.cl', rut: '196399690' }, [julian])
    expect(r?.cuenta.id).toBe('jt')
    expect(r?.por).toBe('rut')
  })

  it('el correo manda sobre el RUT: es lo que impide crear la cuenta', () => {
    const otra = cuenta({ id: 'ot', nombre: 'Otra', correo: 'x@penta.cl', rut: '19.639.969-0' })
    expect(cuentaQueChoca({ correo: 'jtorres@pentaingenieros.cl', rut: '19.639.969-0' }, [otra, julian])?.por)
      .toBe('correo')
  })

  it('sin choque devuelve null', () => {
    expect(cuentaQueChoca({ correo: 'nuevo@penta.cl', rut: '11.111.111-1' }, [julian])).toBeNull()
  })

  it('un RUT vacío no choca con las fichas sin RUT', () => {
    const sinRut = cuenta({ id: 'sr', correo: 'sr@penta.cl', rut: null })
    expect(cuentaQueChoca({ correo: 'nuevo@penta.cl', rut: '' }, [sinRut])).toBeNull()
  })
})

describe('motivoDeChoque', () => {
  function motivo(estado: CuentaExistente['estado'], por: 'correo' | 'rut' = 'correo') {
    return motivoDeChoque({ cuenta: cuenta({ nombre: 'Torres Julián', estado }), por })
  }

  it('nombra a la persona, siempre: un correo tomado sin nombre no se puede resolver', () => {
    for (const estado of ['activa', 'inactiva', 'papelera', 'bloqueada'] as const) {
      expect(motivo(estado)).toContain('Torres Julián')
    }
  })
  it('la papelera dice dónde está y que se restaura', () => {
    expect(motivo('papelera')).toContain('papelera')
    expect(motivo('papelera')).toMatch(/restaur/i)
  })
  it('bloqueada manda a habilitar, no a restaurar', () => {
    expect(motivo('bloqueada')).toMatch(/habilit/i)
  })
  it('inactiva manda a reactivar: nunca se fue de la nómina', () => {
    expect(motivo('inactiva')).toMatch(/reactiv/i)
  })
  it('activa no propone nada: no hay nada que recuperar', () => {
    expect(motivo('activa')).toMatch(/ya (está|lo usa|lo tiene)/i)
  })
  it('dice por qué choca: el RUT no es el correo', () => {
    expect(motivo('activa', 'rut')).toContain('RUT')
  })
})

describe('seRecupera', () => {
  it('la cuenta que se puede volver a poner en pie ofrece el botón', () => {
    expect(seRecupera('papelera')).toBe(true)
    expect(seRecupera('bloqueada')).toBe(true)
    expect(seRecupera('inactiva')).toBe(true)
  })
  it('una cuenta activa no se recupera: hay que usar otro correo', () => {
    expect(seRecupera('activa')).toBe(false)
  })
})
