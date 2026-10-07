import { describe, it, expect } from 'vitest'
import { erroresDeCadena, camposDeCadena, coherenciaJefeProyecto } from '@/lib/cadena-aprobacion'
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

/* Hasta acá la coherencia la garantizaba SOLO la pantalla, que mandaba las dos
   marcas juntas. Una llamada directa a updateEmployee podía dejar a alguien en
   la lista de jefes que ve el empleado sin poder aprobar nada. */
describe('coherenciaJefeProyecto', () => {
  it('marcar jefe de proyecto otorga «puede aprobar»', () => {
    expect(coherenciaJefeProyecto({ es_jefe_proyecto: true }))
      .toEqual({ es_jefe_proyecto: true, can_approve: true })
  })

  it('quitar «puede aprobar» saca de la lista de jefes de proyecto', () => {
    expect(coherenciaJefeProyecto({ can_approve: false }))
      .toEqual({ can_approve: false, es_jefe_proyecto: false })
  })

  it('dejar de ser jefe de proyecto no le quita «puede aprobar»', () => {
    expect(coherenciaJefeProyecto({ es_jefe_proyecto: false })).toEqual({ es_jefe_proyecto: false })
  })

  it('cambios que no tocan ninguna de las dos pasan igual', () => {
    // Tipado como lo recibe updateEmployee: con las dos marcas opcionales
    const cambios: { full_name?: string; es_jefe_proyecto?: boolean; can_approve?: boolean } = { full_name: 'Ana' }
    expect(coherenciaJefeProyecto(cambios)).toEqual({ full_name: 'Ana' })
  })

  // Si llegan contradictorias, gana la restrictiva: un error de más deja a
  // alguien sin firmar, que se nota y se corrige; uno de menos deja una lista
  // con gente que no puede aprobar, que nadie ve hasta el primer envío trabado.
  it('si llegan contradictorias, gana la restrictiva', () => {
    expect(coherenciaJefeProyecto({ es_jefe_proyecto: true, can_approve: false }))
      .toEqual({ es_jefe_proyecto: false, can_approve: false })
  })
})
