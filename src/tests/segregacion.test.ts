import { describe, it, expect } from 'vitest'
import { alertasDeSegregacion } from '@/lib/segregacion'
import type { Persona, FilaResuelta } from '@/lib/planilla-alta'

const p = (x: Partial<Persona> & { id: string }): Persona => ({
  nombre: x.id, correo: '', rut: null, activo: true,
  can_submit: true, can_approve: false, can_manage_petty_cash: false,
  can_load_bank_transfer: false, can_authorize_bank_transfer: false,
  bank_load_backup: false, bank_auth_backup: false,
  approver_l1_id: null, approver_l2_id: null,
  ...x,
})

const r = (x: Partial<FilaResuelta>): FilaResuelta => ({
  fila: 1, accion: 'actualizar', persona: null, n1: null, n2: null,
  correoNuevo: null, parche: {}, nuevo: null, errores: [],
  ...x,
})

describe('alertasDeSegregacion', () => {
  it('sin nada que alertar, no alerta', () => {
    expect(alertasDeSegregacion([p({ id: 'a' }), p({ id: 'b' })], [])).toEqual([])
  })

  it('avisa de quien carga Y autoriza pagos', () => {
    const personas = [p({ id: 'a', nombre: 'Ana', can_load_bank_transfer: true, can_authorize_bank_transfer: true })]
    const as = alertasDeSegregacion(personas, [])
    expect(as).toHaveLength(1)
    expect(as[0].tipo).toBe('banco')
    expect(as[0].personas).toEqual(['Ana'])
  })

  it('no avisa de quien tiene solo uno de los dos permisos', () => {
    expect(alertasDeSegregacion([p({ id: 'a', can_load_bank_transfer: true })], [])).toEqual([])
  })

  it('detecta a dos que ya se aprueban mutuamente en la base', () => {
    const personas = [
      p({ id: 'a', nombre: 'Ana',  approver_l1_id: 'b' }),
      p({ id: 'b', nombre: 'Beto', approver_l1_id: 'a' }),
    ]
    const as = alertasDeSegregacion(personas, [])
    expect(as.map(x => x.tipo)).toEqual(['circular'])
    expect(as[0].personas.slice().sort()).toEqual(['Ana', 'Beto'])
  })

  // Lo que la base sola no ve: el otro lado del círculo lo trae la planilla
  it('detecta la circular que crea la propia planilla', () => {
    const personas = [p({ id: 'a', nombre: 'Ana' }), p({ id: 'b', nombre: 'Beto', approver_l1_id: 'a' })]
    const resueltas = [r({ persona: personas[0], parche: { approver_l1_id: 'b' } })]
    expect(alertasDeSegregacion(personas, resueltas).map(x => x.tipo)).toEqual(['circular'])
  })

  it('no reporta el mismo par dos veces', () => {
    const personas = [
      p({ id: 'a', nombre: 'Ana',  approver_l1_id: 'b' }),
      p({ id: 'b', nombre: 'Beto', approver_l1_id: 'a' }),
    ]
    expect(alertasDeSegregacion(personas, [])).toHaveLength(1)
  })

  it('avisa cuando un N1 queda con demasiada gente', () => {
    const jefe = p({ id: 'j', nombre: 'Jefa' })
    const gente = Array.from({ length: 4 }, (_, i) => p({ id: `e${i}`, approver_l1_id: 'j' }))
    const as = alertasDeSegregacion([jefe, ...gente], [], 3)
    expect(as.map(x => x.tipo)).toEqual(['concentracion'])
    expect(as[0].texto).toContain('4')
  })

  it('no avisa justo en el tope', () => {
    const jefe = p({ id: 'j', nombre: 'Jefa' })
    const gente = Array.from({ length: 3 }, (_, i) => p({ id: `e${i}`, approver_l1_id: 'j' }))
    expect(alertasDeSegregacion([jefe, ...gente], [], 3)).toEqual([])
  })

  // Una fila con errores no se va a cargar: su cadena no debe contar
  it('no mira el parche de una fila con errores', () => {
    const personas = [p({ id: 'a', nombre: 'Ana' }), p({ id: 'b', nombre: 'Beto', approver_l1_id: 'a' })]
    const resueltas = [r({ persona: personas[0], parche: { approver_l1_id: 'b' }, errores: ['algo'] })]
    expect(alertasDeSegregacion(personas, resueltas)).toEqual([])
  })
})
