// Carga de empleados desde un Excel: crea a quien no está y completa a quien sí.
// Helpers puros: los usa la vista previa en el navegador Y la acción del
// servidor, que vuelve a resolver todo antes de escribir — el navegador no es
// fuente de verdad. Módulo común, SIN 'use server'.
//
// Spec: docs/superpowers/specs/2026-10-01-planilla-de-alta-design.md

import { validateRut } from '@/lib/validators'
// El RUT vive en su propio módulo: lo necesita también `alta-repetida`, y si
// estuviera acá las dos se importarían en círculo.
import { normalizarRut, formatearRut } from '@/lib/rut'
import { normalizarNombre } from '@/lib/texto'
import { validarCadena, type Persona as PersonaPermisos } from '@/lib/permisos'
import { cuentaQueChoca, motivoDeChoque, type EstadoCuenta } from '@/lib/alta-repetida'

// ── Personas ─────────────────────────────────────────────────────────────────

// EXTIENDE la de permisos en vez de repetir sus campos: validarCadena() recibe
// esta misma lista, así que si las dos se escribieran por separado bastaría con
// que permisos sumara un campo para que dejaran de encajar, y el error saldría
// lejos de acá. Así el compilador lo avisa en el momento.
export type Persona = PersonaPermisos & {
  correo: string
  rut: string | null
  approver_l1_id: string | null
  approver_l2_id: string | null
  /** Dónde está la ficha. `activo` dice solo que no se puede usar; esto dice
   *  por qué, que es lo único que permite explicar un alta rechazada y decir
   *  qué hacer. Quien construye una Persona lo deriva de acá, no al revés. */
  estado: EstadoCuenta
}

// Un valor que coincide con varias NO elige una: devuelve las candidatas para
// que la fila quede en error con sus nombres. Elegir sería apuntar la cadena de
// aprobación a quien quizá no corresponde, y eso recién se nota cuando alguien
// aprueba lo que no debía.
export function resolverPersona(
  valor: string,
  personas: Persona[],
  por: 'rut' | 'correo' | 'nombre',
): { persona: Persona | null; ambiguas: Persona[] } {
  const buscado = por === 'rut' ? normalizarRut(valor)
                : por === 'correo' ? valor.trim().toLowerCase()
                : normalizarNombre(valor)
  if (!buscado) return { persona: null, ambiguas: [] }

  const coinciden = personas.filter(x => x.activo).filter(x =>
    por === 'rut'    ? x.rut !== null && normalizarRut(x.rut) === buscado
  : por === 'correo' ? x.correo.trim().toLowerCase() === buscado
  :                    normalizarNombre(x.nombre) === buscado)

  if (coinciden.length === 1) return { persona: coinciden[0], ambiguas: [] }
  return { persona: null, ambiguas: coinciden.length > 1 ? coinciden : [] }
}

// Quien arma la planilla escribe lo que tiene a mano: el correo es inequívoco,
// el nombre es cómodo. Se decide por el arroba.
export function resolverAprobador(
  valor: string, personas: Persona[],
): { persona: Persona | null; ambiguas: Persona[] } {
  const v = valor.trim()
  if (!v) return { persona: null, ambiguas: [] }
  return resolverPersona(v, personas, v.includes('@') ? 'correo' : 'nombre')
}

// ── Centro de costo ──────────────────────────────────────────────────────────

export type CentroCosto = { id: string; codigo: string; nombre: string }

// Acepta el código o el nombre. Sin coincidencia exacta, devuelve los que
// contienen lo escrito, para que el error pueda sugerir en vez de solo negar.
export function resolverCentroCosto(
  valor: string, centros: CentroCosto[],
): { centro: CentroCosto | null; parecidos: CentroCosto[] } {
  const v = valor.trim()
  if (!v) return { centro: null, parecidos: [] }

  const porCodigo = centros.find(c => c.codigo.replace(/\./g, '') === v.replace(/\./g, ''))
  if (porCodigo) return { centro: porCodigo, parecidos: [] }

  const buscado = normalizarNombre(v)
  const exacto = centros.find(c => normalizarNombre(c.nombre) === buscado)
  if (exacto) return { centro: exacto, parecidos: [] }

  return {
    centro: null,
    parecidos: centros.filter(c => normalizarNombre(c.nombre).includes(buscado)).slice(0, 5),
  }
}

// ── El parche de una fila ────────────────────────────────────────────────────

export type FilaPlanilla = {
  nombre: string; rut: string; correo: string
  cargo: string; centroCosto: string; rol: string
  n1: string; n2: string
  banco: string; tipoCuenta: string; numeroCuenta: string
}

// Solo las claves que la fila trae con valor. Una clave ausente y una clave en
// null son cosas distintas, y acá la segunda no existe: así «vacío nunca borra»
// lo hace cumplir el tipo y no la disciplina de quien escribe.
export const ROLES = ['admin', 'approver', 'employee'] as const
export type Rol = typeof ROLES[number]

export function esRol(v: string): v is Rol {
  return (ROLES as readonly string[]).includes(v)
}

// `role` va tipado con la unión y no como string: la columna de la base es esa
// unión, así que un string suelto no compila — y es correcto que no compile.
export type ParcheEmpleado = Partial<{
  approver_l1_id: string; approver_l2_id: string
  rut: string; department: string; cost_center_id: string; role: Rol
  bank_name: string; bank_account_type: string; bank_account: string
}>

// `persona` es null cuando la fila CREA a alguien: ahí todo el parche entra,
// incluido el RUT, porque no hay nada previo que respetar. Sin este null, una
// cuenta nueva nacería sin cargo, sin banco y sin aprobadores.
export function parcheDeFila(
  fila: FilaPlanilla,
  persona: Persona | null,
  n1: Persona | null,
  n2: Persona | null,
  centro: CentroCosto | null,
): ParcheEmpleado {
  const parche: ParcheEmpleado = {}
  const texto = (v: string) => { const t = v.trim(); return t === '' ? null : t }

  if (n1) parche.approver_l1_id = n1.id
  if (n2) parche.approver_l2_id = n2.id
  if (centro) parche.cost_center_id = centro.id

  // El RUT identifica: se graba solo a quien no lo tenía, nunca se reescribe.
  if (!persona?.rut && texto(fila.rut)) parche.rut = formatearRut(fila.rut)

  // `nombre` NO entra: renombrar es otra operación (spec).
  const cargo  = texto(fila.cargo)
  const rol    = texto(fila.rol)
  const banco  = texto(fila.banco)
  const tipo   = texto(fila.tipoCuenta)
  const numero = texto(fila.numeroCuenta)
  if (cargo)  parche.department        = cargo
  // Un rol desconocido NO entra al parche: resolverPlanilla ya marca la fila en
  // error, y así no hay forma de escribir en la columna algo que no es un rol.
  if (rol && esRol(rol.toLowerCase())) parche.role = rol.toLowerCase() as Rol
  if (banco)  parche.bank_name         = banco
  if (tipo)   parche.bank_account_type = tipo
  if (numero) parche.bank_account      = numero

  return parche
}

// ── La planilla entera ───────────────────────────────────────────────────────

export type FilaResuelta = {
  fila: number
  accion: 'crear' | 'actualizar' | 'ninguna'
  persona: Persona | null
  n1: Persona | null; n2: Persona | null
  correoNuevo: string | null
  parche: ParcheEmpleado
  nuevo: { nombre: string; correo: string; rut: string } | null
  errores: string[]
}

// Los errores NO cortan en el primero: se juntan todos, para que quien corrige
// el Excel no tenga que hacerlo en varias pasadas.
export function resolverPlanilla(
  filas: FilaPlanilla[],
  personas: Persona[],
  centros: CentroCosto[],
  permisosPorOtorgar: Set<string> = new Set(),
): FilaResuelta[] {
  // Los duplicados DENTRO de la planilla se cuentan primero: una fila no puede
  // saber sola que otra trae su mismo RUT.
  const vecesRut    = new Map<string, number>()
  const vecesCorreo = new Map<string, number>()
  for (const f of filas) {
    const r = normalizarRut(f.rut); if (r) vecesRut.set(r, (vecesRut.get(r) ?? 0) + 1)
    const c = f.correo.trim().toLowerCase(); if (c) vecesCorreo.set(c, (vecesCorreo.get(c) ?? 0) + 1)
  }

  // Un permiso por otorgar ya cuenta como dado: así el botón «Darles el
  // permiso» saca las filas del error sin volver a subir el archivo.
  const conPermisos = personas.map(x =>
    permisosPorOtorgar.has(x.id) ? { ...x, can_approve: true } : x)

  // Las que no se ven en la nómina y aun así bloquean un alta.
  const fueraDeNomina = personas
    .filter(x => x.estado !== 'activa')
    .map(x => ({ id: x.id, nombre: x.nombre, correo: x.correo, rut: x.rut, estado: x.estado }))

  return filas.map((f, i) => {
    const errores: string[] = []
    const rutNorm = normalizarRut(f.rut)
    const correo  = f.correo.trim().toLowerCase()

    if (rutNorm && (vecesRut.get(rutNorm) ?? 0) > 1)   errores.push('Dos filas traen el mismo RUT')
    if (correo  && (vecesCorreo.get(correo) ?? 0) > 1) errores.push('Dos filas traen el mismo correo')

    // ── A quién le escribimos ───────────────────────────────────────────────
    let persona: Persona | null = null
    let crear = false
    if (!f.rut.trim()) {
      errores.push('Falta el RUT, que es lo que identifica a la persona')
    } else if (!validateRut(f.rut)) {
      errores.push(`RUT inválido "${f.rut.trim()}" — revisa el dígito verificador`)
    } else {
      const porRut = resolverPersona(f.rut, conPermisos, 'rut')
      if (porRut.ambiguas.length > 1) {
        errores.push(`Ese RUT lo tienen ${porRut.ambiguas.length} personas: ${porRut.ambiguas.map(x => x.nombre).join(', ')}`)
      } else if (porRut.persona) {
        persona = porRut.persona
      } else if (correo) {
        const porCorreo = resolverPersona(correo, conPermisos, 'correo')
        if (porCorreo.persona?.rut && normalizarRut(porCorreo.persona.rut) !== rutNorm) {
          errores.push(`${porCorreo.persona.nombre} está registrada con otro RUT (${porCorreo.persona.rut})`)
        } else if (porCorreo.persona) {
          persona = porCorreo.persona
        } else {
          crear = true
        }
      } else {
        crear = true
      }
      if (crear && (!f.nombre.trim() || !correo)) {
        errores.push('Para crear a alguien hacen falta su nombre y su correo')
      }

      /* No se puede crear a quien ya existe fuera de la nómina: su correo
         sigue tomado en el sistema de acceso, que es global, así que Auth
         rechaza el alta y el motivo no dice de quién era. Acá se nombra a la
         persona y se dice qué hacer con ella. `resolverPersona` no la
         encuentra a propósito: solo mira a las activas, para no actualizar en
         silencio la ficha de alguien que un admin dio de baja. */
      if (crear) {
        const choque = cuentaQueChoca({ correo, rut: f.rut }, fueraDeNomina)
        if (choque) errores.push(motivoDeChoque(choque))
      }
    }

    // ── Aprobadores, centro y rol ───────────────────────────────────────────
    const r1 = resolverAprobador(f.n1, conPermisos)
    const r2 = resolverAprobador(f.n2, conPermisos)
    for (const [celda, r, rol] of [[f.n1, r1, 'N1'], [f.n2, r2, 'N2']] as const) {
      if (!celda.trim()) continue
      if (r.ambiguas.length > 1) {
        errores.push(`El aprobador ${rol} "${celda.trim()}" coincide con ${r.ambiguas.length} personas: ${r.ambiguas.map(x => x.nombre).join(', ')}`)
      } else if (!r.persona) {
        errores.push(`No se encontró al aprobador ${rol} "${celda.trim()}"`)
      }
    }

    const rc = resolverCentroCosto(f.centroCosto, centros)
    if (f.centroCosto.trim() && !rc.centro) {
      errores.push(rc.parecidos.length
        ? `No existe el centro de costo "${f.centroCosto.trim()}". ¿Quisiste decir ${rc.parecidos.map(c => c.nombre).join(', ')}?`
        : `No existe el centro de costo "${f.centroCosto.trim()}"`)
    }

    const rol = f.rol.trim().toLowerCase()
    if (rol && !esRol(rol)) {
      errores.push(`Rol "${f.rol.trim()}" desconocido: usa admin, approver o employee`)
    }

    // ── El correo nuevo ─────────────────────────────────────────────────────
    let correoNuevo: string | null = null
    if (persona && correo && correo !== persona.correo.trim().toLowerCase()) {
      const actual = persona
      const otro = conPermisos.find(x => x.id !== actual.id && x.correo.trim().toLowerCase() === correo)
      if (otro) errores.push(`Ese correo ya lo usa ${otro.nombre}`)
      else      correoNuevo = correo
    }

    // ── Las reglas de la cadena, las mismas que /admin/employees ────────────
    if (persona) {
      errores.push(...validarCadena(
        persona.id,
        { l1: r1.persona?.id ?? null, l2: r2.persona?.id ?? null, suplenteL1: null },
        conPermisos,
      ))
    }

    // Al crear se arma igual, con persona = null: la cuenta nueva necesita su
    // cargo, su banco y sus aprobadores desde el primer momento.
    const parche = (persona || crear)
      ? parcheDeFila(f, persona, r1.persona, r2.persona, rc.centro)
      : {}
    const accion: FilaResuelta['accion'] =
      crear ? 'crear'
    : persona && (Object.keys(parche).length > 0 || correoNuevo) ? 'actualizar'
    : 'ninguna'

    return {
      fila: i + 1, accion, persona,
      n1: r1.persona, n2: r2.persona,
      correoNuevo, parche,
      nuevo: crear ? { nombre: f.nombre.trim(), correo, rut: formatearRut(f.rut) } : null,
      errores,
    }
  })
}

// Los nombrados como N1 o N2 que todavía no pueden aprobar, sin repetir.
export function sinPermisoAprobar(resueltas: FilaResuelta[]): Persona[] {
  const vistos = new Map<string, Persona>()
  for (const r of resueltas) {
    for (const x of [r.n1, r.n2]) {
      if (x && !x.can_approve && !vistos.has(x.id)) vistos.set(x.id, x)
    }
  }
  return [...vistos.values()]
}

// ── Los encabezados del Excel ────────────────────────────────────────────────
//
// Viven acá y no en el componente —donde estaban— porque sin pruebas nadie vio
// esto: la plantilla que la app hace descargar traía `N° de Cuenta`, y el
// lector solo aceptaba `n de cuenta`. El `°` NO es un acento, así que
// `\p{Diacritic}` no lo saca, y la columna se ignoraba **en silencio**: en la
// carga real del 2026-10-08 entraron el banco y el tipo de cuenta de 58
// personas y el número de cuenta de ninguna.

export const CABECERAS = [
  'Apellido y nombre', 'RUT', 'Correo', 'Cargo', 'Centro de costo', 'Rol',
  'Aprobador 1er Nivel (N1)', 'Aprobador 2do Nivel (N2)',
  'Banco', 'Tipo de Cuenta', 'N° de Cuenta',
] as const

/* N1 y N2 van VACÍOS en el ejemplo, a propósito (2026-10-07). Con el aprobador
   por proyecto, quien no tiene jefe propio va al aprobador por defecto de la
   organización, así que llenar esa columna es declarar una EXCEPCIÓN. Un
   ejemplo que las trae llenas invita a completarlas para los 57, y cada una
   apaga el aprobador por defecto de esa persona sin que se note. */
export const EJEMPLO = [
  'Contreras Pía', '11.111.111-1', 'pia.contreras@penta.cl',
  'Jefa de Obra', 'Administración', 'employee',
  '', '',
  'Banco de Chile', 'Cuenta Corriente', '00012345678',
] as const

/**
 * Deja un encabezado comparable: sin mayúsculas, sin acentos, sin espacios de
 * más y **sin los símbolos que la gente mete en los títulos** — `°`, `º`, `.`,
 * `#`, `:` y los paréntesis. Eso último es lo que faltaba: un `°` sobrevivía a
 * la limpieza y rompía la coincidencia sin que nada lo dijera.
 */
export function normalizarEncabezado(h: string): string {
  return h
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[°º#:.()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const COLUMNAS: [keyof FilaPlanilla, string[]][] = [
  ['nombre',       ['apellido y nombre', 'nombre y apellido', 'nombre', 'nombre completo']],
  ['rut',          ['rut', 'r u t', 'rut empleado']],
  ['correo',       ['correo', 'email', 'e-mail', 'correo electronico']],
  ['cargo',        ['cargo', 'puesto', 'departamento', 'area']],
  ['centroCosto',  ['centro de costo', 'centro costo', 'cc', 'centro']],
  ['rol',          ['rol', 'role', 'perfil']],
  ['n1',           ['aprobador 1er nivel n1', 'aprobador 1er nivel', 'aprobador n1', 'n1']],
  ['n2',           ['aprobador 2do nivel n2', 'aprobador 2do nivel', 'aprobador n2', 'n2']],
  ['banco',        ['banco']],
  ['tipoCuenta',   ['tipo de cuenta', 'tipo cuenta']],
  ['numeroCuenta', ['n de cuenta', 'no de cuenta', 'numero de cuenta', 'nro de cuenta', 'cuenta']],
]

/** Qué columna de la planilla es ese encabezado. `null` si no es ninguna. */
export function mapHeader(h: string): keyof FilaPlanilla | null {
  const s = normalizarEncabezado(h)
  return COLUMNAS.find(([, nombres]) => nombres.includes(s))?.[0] ?? null
}
