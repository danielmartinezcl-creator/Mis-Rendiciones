import { describe, it, expect } from 'vitest'
import { normalizarRut, formatearRut } from '@/lib/rut'
import { normalizarNombre } from '@/lib/texto'

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

/* `activo` sale del estado y no se escribe aparte: son el mismo hecho, y un
   fixture que los contradiga prueba algo que la base no puede producir. Un
   `activo: false` suelto se lee como «desactivado». */
export const p = (x: Partial<Persona> & { id: string }): Persona => {
  const estado = x.estado ?? (x.activo === false ? 'inactiva' : 'activa')
  return {
    nombre: '', correo: '', rut: null,
    can_submit: true, can_approve: false, can_manage_petty_cash: false,
    can_load_bank_transfer: false, can_authorize_bank_transfer: false,
    bank_load_backup: false, bank_auth_backup: false,
    approver_l1_id: null, approver_l2_id: null,
    ...x,
    estado,
    activo: estado === 'activa',
  }
}

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

// ── Tarea 5: la planilla entera ──────────────────────────────────────────────

import { resolverPlanilla, sinPermisoAprobar, mapHeader, CABECERAS, EJEMPLO } from '@/lib/planilla-alta'

const fila = (x: Partial<FilaPlanilla>): FilaPlanilla => ({ ...VACIA, ...x })
const resolver = (fs: FilaPlanilla[], permisos?: Set<string>) =>
  resolverPlanilla(fs, PERSONAS, CENTROS, permisos)

describe('resolverPlanilla: crear o actualizar', () => {
  it('un RUT que está en la base actualiza', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', banco: 'BCI' })])
    expect(r.accion).toBe('actualizar')
    expect(r.persona?.id).toBe('u1')
    expect(r.parche).toEqual({ bank_name: 'BCI' })
    expect(r.errores).toEqual([])
  })

  it('un RUT que no está, con nombre y correo, crea', () => {
    const [r] = resolver([fila({ rut: '99.999.990-5', nombre: 'Nueva Persona', correo: 'nueva@penta.cl' })])
    expect(r.accion).toBe('crear')
    expect(r.nuevo).toEqual({ nombre: 'Nueva Persona', correo: 'nueva@penta.cl', rut: '99.999.990-5' })
    expect(r.errores).toEqual([])
  })

  it('al crear, el parche trae TODO lo de la fila', () => {
    const [r] = resolver([fila({
      rut: '99.999.990-5', nombre: 'Nueva Persona', correo: 'nueva@penta.cl',
      cargo: 'Prevencionista', centroCosto: '45103010013',
      n1: 'rodrigo.salas@penta.cl', banco: 'BCI', numeroCuenta: '123',
    })])
    expect(r.accion).toBe('crear')
    expect(r.parche).toEqual({
      department: 'Prevencionista', cost_center_id: 'c1',
      approver_l1_id: 'u1', bank_name: 'BCI', bank_account: '123',
      rut: '99.999.990-5',
    })
  })

  it('crear sin nombre o sin correo es error', () => {
    const [sinNombre] = resolver([fila({ rut: '99.999.990-5', correo: 'x@penta.cl' })])
    expect(sinNombre.errores.join(' ')).toContain('nombre y su correo')
    const [sinCorreo] = resolver([fila({ rut: '99.999.990-5', nombre: 'X' })])
    expect(sinCorreo.errores.join(' ')).toContain('nombre y su correo')
  })

  it('un RUT con el dígito verificador malo no busca a nadie', () => {
    const [r] = resolver([fila({ rut: '11.111.111-9' })])
    expect(r.errores.join(' ')).toContain('dígito verificador')
  })

  it('si el RUT no está, el correo lo encuentra igual y actualiza', () => {
    const [r] = resolver([fila({ rut: '99.999.990-5', correo: 'a.perez@penta.cl' })])
    expect(r.accion).toBe('actualizar')
    expect(r.persona?.id).toBe('u4')
    expect(r.parche.rut).toBe('99.999.990-5')
  })

  it('una persona con OTRO rut es error, no una corrección', () => {
    const [r] = resolver([fila({ rut: '99.999.990-5', correo: 'carla.mendez@penta.cl' })])
    expect(r.errores.join(' ')).toContain('otro RUT')
  })

  it('un aprobador ambiguo nombra a las candidatas', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', n1: 'Pérez Soto Ana' })])
    expect(r.errores.join(' ')).toContain('coincide con 2 personas')
  })

  it('un centro de costo que no existe sugiere los parecidos', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', centroCosto: 'Operaciones' })])
    expect(r.errores.join(' ')).toContain('Operaciones Norte')
  })

  it('un rol desconocido es error', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', rol: 'jefazo' })])
    expect(r.errores.join(' ')).toContain('Rol')
  })

  it('un aprobador sin el permiso aprueba da error', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', n1: 'carla.mendez@penta.cl' })])
    expect(r.errores.join(' ')).toContain('aprueba')
  })

  it('y deja de darlo cuando su permiso está por otorgarse', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', n1: 'carla.mendez@penta.cl' })], new Set(['u2']))
    expect(r.errores).toEqual([])
    expect(r.parche.approver_l1_id).toBe('u2')
  })

  it('una fila mala no contamina a las buenas', () => {
    const rs = resolver([fila({ rut: '11.111.111-9' }), fila({ rut: '11.111.111-1', banco: 'BCI' })])
    expect(rs[0].errores.length).toBeGreaterThan(0)
    expect(rs[1].errores).toEqual([])
  })

  it('el mismo RUT en dos filas marca las dos', () => {
    const rs = resolver([fila({ rut: '11.111.111-1' }), fila({ rut: '11111111-1' })])
    expect(rs[0].errores.join(' ')).toContain('Dos filas')
    expect(rs[1].errores.join(' ')).toContain('Dos filas')
  })

  it('un correo distinto del actual se marca como cambio de acceso', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', correo: 'nuevo@penta.cl' })])
    expect(r.correoNuevo).toBe('nuevo@penta.cl')
    expect(r.errores).toEqual([])
  })

  it('un correo que ya usa otra persona es error', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', correo: 'carla.mendez@penta.cl' })])
    expect(r.errores.join(' ')).toContain('ya lo usa')
  })

  it('una fila sin nada que cambiar no hace nada', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1' })])
    expect(r.accion).toBe('ninguna')
  })
})

describe('sinPermisoAprobar', () => {
  it('junta a los aprobadores sin permiso, sin repetirlos', () => {
    const rs = resolver([
      fila({ rut: '11.111.111-1', n1: 'carla.mendez@penta.cl' }),
      fila({ rut: '22.222.222-2', n1: 'carla.mendez@penta.cl' }),
    ])
    expect(sinPermisoAprobar(rs).map(x => x.id)).toEqual(['u2'])
  })
})

/* Una fila que crea a alguien que YA existe pero está fuera de la nómina —en la
   papelera, bloqueado o desactivado— no se puede crear: su correo sigue tomado
   en el sistema de acceso. Hasta el 2026-10-08 la fila llegaba al servidor, Auth
   la rechazaba y el motivo era «no se pudo crear la cuenta». */
describe('resolverPlanilla: la persona ya existe, fuera de la nómina', () => {
  const FUERA: Persona[] = [
    ...PERSONAS,
    p({ id: 'u6', nombre: 'Torres Julián', correo: 'jtorres@penta.cl', rut: '19.639.969-0',
        activo: false, estado: 'papelera' }),
    p({ id: 'u7', nombre: 'Soto Bloqueado', correo: 'bloq@penta.cl', rut: '13.333.333-5',
        activo: false, estado: 'bloqueada' }),
  ]
  const resolverFuera = (fs: FilaPlanilla[]) => resolverPlanilla(fs, FUERA, CENTROS)

  it('el correo de alguien en la papelera no crea: dice quién es y que se restaura', () => {
    const [r] = resolverFuera([fila({
      rut: '99.999.990-5', nombre: 'Julián Torres', correo: 'jtorres@penta.cl',
    })])
    expect(r.errores.join(' ')).toContain('Torres Julián')
    expect(r.errores.join(' ')).toContain('papelera')
  })

  it('el RUT de alguien en la papelera tampoco: es lo que identifica a la persona', () => {
    const [r] = resolverFuera([fila({
      rut: '19.639.969-0', nombre: 'Julián Torres', correo: 'otro.correo@penta.cl',
    })])
    expect(r.errores.join(' ')).toContain('Torres Julián')
  })

  it('bloqueado manda a habilitar, no a restaurar', () => {
    const [r] = resolverFuera([fila({
      rut: '99.999.990-5', nombre: 'Soto', correo: 'bloq@penta.cl',
    })])
    expect(r.errores.join(' ')).toMatch(/habilit/i)
  })

  it('una fila que de verdad es nueva sigue creando', () => {
    const [r] = resolverFuera([fila({
      rut: '99.999.990-5', nombre: 'Nueva Persona', correo: 'nueva@penta.cl',
    })])
    expect(r.errores).toEqual([])
    expect(r.accion).toBe('crear')
  })

  /* Una fila que ACTUALIZA a alguien activo no pasa por acá: el choque solo
     mira a quien quedó fuera de la nómina. */
  it('actualizar a alguien activo no se ve afectado', () => {
    const [r] = resolverFuera([fila({ rut: '11.111.111-1', banco: 'BCI' })])
    expect(r.errores).toEqual([])
    expect(r.accion).toBe('actualizar')
  })
})

/* Los encabezados del Excel. Esta batería existe por un defecto real: la
   plantilla que la app hacía descargar traía `N° de Cuenta` y el lector solo
   aceptaba `n de cuenta`, así que la columna se ignoraba EN SILENCIO. En la
   carga del 2026-10-08 entraron banco y tipo de cuenta de 58 personas y el
   número de cuenta de ninguna. Vivía en un componente, sin pruebas. */
describe('los encabezados de la planilla', () => {
  /* La prueba que importa: la plantilla que la app genera tiene que poder
     leerse con el lector de la app. Si alguien cambia un encabezado y se
     olvida del otro lado, esto se pone rojo. */
  it('TODO encabezado de la plantilla descargable lo reconoce el lector', () => {
    const sinReconocer = CABECERAS.filter(h => mapHeader(h) === null)
    expect(sinReconocer).toEqual([])
  })

  it('la plantilla tiene una columna por cada campo de la fila', () => {
    const campos = CABECERAS.map(mapHeader)
    expect(new Set(campos).size).toBe(CABECERAS.length)   // ninguna repetida
    expect(campos).toEqual(Object.keys(VACIA))            // ni falta ninguna
  })

  it('el ejemplo trae un valor por columna', () => {
    expect(EJEMPLO).toHaveLength(CABECERAS.length)
  })

  /* El `°` no es un acento: `\p{Diacritic}` no lo saca, y ahí estuvo el error. */
  it('el símbolo de grado no rompe la coincidencia', () => {
    expect(mapHeader('N° de Cuenta')).toBe('numeroCuenta')
    expect(mapHeader('Nº de Cuenta')).toBe('numeroCuenta')
    expect(mapHeader('N.º de cuenta')).toBe('numeroCuenta')
  })

  it('tolera mayúsculas, acentos y espacios de más', () => {
    expect(mapHeader('  CORREO ELECTRÓNICO  ')).toBe('correo')
    expect(mapHeader('Centro De Costo')).toBe('centroCosto')
  })

  it('los paréntesis de los aprobadores no estorban', () => {
    expect(mapHeader('Aprobador 1er Nivel (N1)')).toBe('n1')
    expect(mapHeader('Aprobador 2do Nivel (N2)')).toBe('n2')
  })

  it('una columna que no es de la planilla no se confunde con otra', () => {
    expect(mapHeader('Observaciones')).toBeNull()
    expect(mapHeader('')).toBeNull()
  })
})
