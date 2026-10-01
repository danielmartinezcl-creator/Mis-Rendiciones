import { describe, it, expect } from 'vitest'
import { erroresDeCadena, camposDeCadena } from '@/lib/cadena-aprobacion'
import type { Persona } from '@/lib/permisos'

const q = (id: string, nombre: string): Persona => ({
  id, nombre, activo: true,
  can_submit: true, can_approve: true, can_manage_petty_cash: false,
  can_load_bank_transfer: false, can_authorize_bank_transfer: false,
  bank_load_backup: false, bank_auth_backup: false,
})

const PERSONAS = [q('a', 'Ana'), q('b', 'Beto')]
const SIN_SUPLENTE = { l1: 'a', l2: 'b', suplenteL1: null, suplenteDesde: null, suplenteHasta: null }

describe('erroresDeCadena', () => {
  it('una cadena correcta no da errores', () => {
    expect(erroresDeCadena('x', SIN_SUPLENTE, PERSONAS)).toEqual([])
  })
  it('un suplente sin fechas da error', () => {
    const e = erroresDeCadena('x', { ...SIN_SUPLENTE, l2: null, suplenteL1: 'b' }, PERSONAS)
    expect(e.join(' ')).toContain('fecha de inicio')
  })
  it('la fecha de término anterior a la de inicio da error', () => {
    const e = erroresDeCadena('x', {
      ...SIN_SUPLENTE, l2: null, suplenteL1: 'b',
      suplenteDesde: '2026-10-10', suplenteHasta: '2026-10-01',
    }, PERSONAS)
    expect(e.join(' ')).toContain('anterior')
  })
})

describe('camposDeCadena', () => {
  it('sin suplente, las fechas quedan en null aunque vengan', () => {
    expect(camposDeCadena({ ...SIN_SUPLENTE, suplenteDesde: '2026-10-01' })).toEqual({
      approver_l1_id: 'a', approver_l2_id: 'b', approver_l1_backup_id: null,
      backup_active_from: null, backup_active_until: null,
    })
  })
})
