import { describe, it, expect } from 'vitest'
import { normalizarRut, formatearRut, normalizarNombre } from '@/lib/planilla-alta'

describe('normalizarRut', () => {
  it('quita los puntos y deja el guión', () => {
    expect(normalizarRut('11.111.111-1')).toBe('11111111-1')
  })
  it('acepta el RUT sin puntos', () => {
    expect(normalizarRut('11111111-1')).toBe('11111111-1')
  })
  it('acepta el RUT sin guión', () => {
    expect(normalizarRut('111111111')).toBe('11111111-1')
  })
  // Los 5 RUT con k minúscula de la base no se encontrarían sin esto
  it('pasa la k a mayúscula', () => {
    expect(normalizarRut('12.345.678-k')).toBe('12345678-K')
  })
  it('tolera espacios alrededor', () => {
    expect(normalizarRut('  11.111.111-1  ')).toBe('11111111-1')
  })
  it('una cadena vacía no es un RUT', () => {
    expect(normalizarRut('')).toBe('')
    expect(normalizarRut('   ')).toBe('')
  })
})

describe('formatearRut', () => {
  it('guarda con puntos y el DV en mayúscula, como los 55 que ya están', () => {
    expect(formatearRut('11111111-1')).toBe('11.111.111-1')
    expect(formatearRut('12345678-k')).toBe('12.345.678-K')
  })
  it('da la vuelta completa sin perder nada', () => {
    expect(normalizarRut(formatearRut('11.111.111-1'))).toBe('11111111-1')
  })
  it('un RUT corto también se formatea', () => {
    expect(formatearRut('1234567-4')).toBe('1.234.567-4')
  })
})

describe('normalizarNombre', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalizarNombre('Pía MÉNDEZ')).toBe('pia mendez')
  })
  it('colapsa los espacios de más', () => {
    expect(normalizarNombre('  Rodrigo   Salas ')).toBe('rodrigo salas')
  })
})

// ── Tarea 2: resolver a una persona ──────────────────────────────────────────

import { resolverPersona, resolverAprobador, type Persona } from '@/lib/planilla-alta'

export const p = (x: Partial<Persona> & { id: string }): Persona => ({
  nombre: '', correo: '', rut: null, activo: true, can_approve: false,
  can_load_bank_transfer: false, can_authorize_bank_transfer: false,
  approver_l1_id: null, approver_l2_id: null,
  ...x,
})

const PERSONAS: Persona[] = [
  p({ id: 'u1', nombre: 'Salas Rodrigo',  correo: 'rodrigo.salas@penta.cl', rut: '11.111.111-1', can_approve: true }),
  p({ id: 'u2', nombre: 'Méndez Carla',   correo: 'carla.mendez@penta.cl',  rut: '12.345.678-k' }),
  p({ id: 'u3', nombre: 'Pérez Soto Ana', correo: 'ana.perez@penta.cl',     rut: '22.222.222-2' }),
  p({ id: 'u4', nombre: 'Pérez Soto Ana', correo: 'a.perez@penta.cl' }),
  p({ id: 'u5', nombre: 'Rojas Inactivo', correo: 'rojas@penta.cl', rut: '66.666.666-6', activo: false, can_approve: true }),
]

describe('resolverPersona por rut', () => {
  it('encuentra aunque el formato difiera entre el Excel y la base', () => {
    expect(resolverPersona('11111111-1', PERSONAS, 'rut').persona?.id).toBe('u1')
  })
  it('encuentra con la k en minúscula', () => {
    expect(resolverPersona('12.345.678-K', PERSONAS, 'rut').persona?.id).toBe('u2')
  })
  it('sin coincidencia devuelve null', () => {
    expect(resolverPersona('99.999.990-5', PERSONAS, 'rut').persona).toBeNull()
  })
})

describe('resolverPersona por nombre', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(resolverPersona('MENDEZ CARLA', PERSONAS, 'nombre').persona?.id).toBe('u2')
  })
  it('dos personas con el mismo nombre no se eligen: se devuelven ambas', () => {
    const r = resolverPersona('Pérez Soto Ana', PERSONAS, 'nombre')
    expect(r.persona).toBeNull()
    expect(r.ambiguas.map(x => x.id)).toEqual(['u3', 'u4'])
  })
  it('no considera a los inactivos', () => {
    expect(resolverPersona('Rojas Inactivo', PERSONAS, 'nombre').persona).toBeNull()
  })
})

describe('resolverAprobador', () => {
  it('con arroba busca por correo', () => {
    expect(resolverAprobador('rodrigo.salas@penta.cl', PERSONAS).persona?.id).toBe('u1')
  })
  it('el correo no distingue mayúsculas', () => {
    expect(resolverAprobador('Rodrigo.Salas@PENTA.cl', PERSONAS).persona?.id).toBe('u1')
  })
  it('sin arroba busca por nombre', () => {
    expect(resolverAprobador('Salas Rodrigo', PERSONAS).persona?.id).toBe('u1')
  })
  it('una celda vacía no resuelve a nadie y no es ambigua', () => {
    const r = resolverAprobador('   ', PERSONAS)
    expect(r.persona).toBeNull()
    expect(r.ambiguas).toEqual([])
  })
})

// ── Tarea 3: centro de costo ─────────────────────────────────────────────────

import { resolverCentroCosto, type CentroCosto } from '@/lib/planilla-alta'

const CENTROS: CentroCosto[] = [
  { id: 'c1', codigo: '45103010013', nombre: 'Administración' },
  { id: 'c2', codigo: '45103010020', nombre: 'Operaciones Norte' },
  { id: 'c3', codigo: '45103010021', nombre: 'Operaciones Sur' },
]

describe('resolverCentroCosto', () => {
  it('encuentra por código', () => {
    expect(resolverCentroCosto('45103010013', CENTROS).centro?.id).toBe('c1')
  })
  it('encuentra por nombre, sin tildes ni mayúsculas', () => {
    expect(resolverCentroCosto('ADMINISTRACION', CENTROS).centro?.id).toBe('c1')
  })
  it('una celda vacía no resuelve nada y no es un error', () => {
    const r = resolverCentroCosto('  ', CENTROS)
    expect(r.centro).toBeNull()
    expect(r.parecidos).toEqual([])
  })
  // Para que el error diga «¿quisiste decir…?» en vez de solo «no existe»
  it('sin coincidencia sugiere los parecidos', () => {
    const r = resolverCentroCosto('Operaciones', CENTROS)
    expect(r.centro).toBeNull()
    expect(r.parecidos.map(c => c.id)).toEqual(['c2', 'c3'])
  })
})

// ── Tarea 4: el parche ───────────────────────────────────────────────────────

import { parcheDeFila, type FilaPlanilla } from '@/lib/planilla-alta'

const VACIA: FilaPlanilla = {
  nombre: '', rut: '', correo: '', cargo: '', centroCosto: '', rol: '',
  n1: '', n2: '', banco: '', tipoCuenta: '', numeroCuenta: '',
}
const CON_RUT = p({ id: 'x1', nombre: 'Con Rut', correo: 'c@p.cl', rut: '11.111.111-1' })
const SIN_RUT = p({ id: 'x2', nombre: 'Sin Rut', correo: 's@p.cl' })

describe('parcheDeFila: vacío nunca borra', () => {
  it('una planilla toda vacía no cambia nada', () => {
    expect(parcheDeFila(VACIA, CON_RUT, null, null, null)).toEqual({})
  })
  it('solo entra lo que viene con valor', () => {
    const fila = { ...VACIA, banco: 'Banco de Chile', numeroCuenta: '00012345678', cargo: 'Jefe de Obra' }
    expect(parcheDeFila(fila, CON_RUT, null, null, null)).toEqual({
      bank_name: 'Banco de Chile', bank_account: '00012345678', department: 'Jefe de Obra',
    })
  })
  it('una celda con solo espacios cuenta como vacía', () => {
    expect(parcheDeFila({ ...VACIA, banco: '   ' }, CON_RUT, null, null, null)).toEqual({})
  })
  it('los aprobadores y el centro entran por id, no por lo que diga la celda', () => {
    const fila = { ...VACIA, n1: 'Salas Rodrigo', centroCosto: 'Administración' }
    const n1 = p({ id: 'u1', nombre: 'Salas Rodrigo', can_approve: true })
    const centro: CentroCosto = { id: 'c1', codigo: '45103010013', nombre: 'Administración' }
    expect(parcheDeFila(fila, CON_RUT, n1, null, centro)).toEqual({
      approver_l1_id: 'u1', cost_center_id: 'c1',
    })
  })
  it('el RUT se graba solo a quien no lo tenía, y con puntos', () => {
    expect(parcheDeFila({ ...VACIA, rut: '22222222-2' }, SIN_RUT, null, null, null))
      .toEqual({ rut: '22.222.222-2' })
  })
  it('a quien ya tiene RUT no se le reescribe', () => {
    expect(parcheDeFila({ ...VACIA, rut: '11.111.111-1' }, CON_RUT, null, null, null)).toEqual({})
  })
  // Una planilla de RR.HH. con el nombre escrito distinto no debe renombrar a nadie
  it('el nombre NUNCA entra al actualizar', () => {
    expect(parcheDeFila({ ...VACIA, nombre: 'Otro Nombre' }, CON_RUT, null, null, null)).toEqual({})
  })
  it('el rol se normaliza a minúsculas', () => {
    expect(parcheDeFila({ ...VACIA, rol: 'Approver' }, CON_RUT, null, null, null))
      .toEqual({ role: 'approver' })
  })
  // Sin esto una cuenta nueva nacería vacía: sin cargo, sin banco y sin jefe
  it('con persona null (al crear) todo entra, incluido el RUT', () => {
    const fila = { ...VACIA, rut: '22222222-2', cargo: 'Prevencionista', banco: 'BCI' }
    expect(parcheDeFila(fila, null, null, null, null)).toEqual({
      rut: '22.222.222-2', department: 'Prevencionista', bank_name: 'BCI',
    })
  })
})
