// Carga de empleados desde un Excel: crea a quien no está y completa a quien sí.
// Helpers puros: los usa la vista previa en el navegador Y la acción del
// servidor, que vuelve a resolver todo antes de escribir — el navegador no es
// fuente de verdad. Módulo común, SIN 'use server'.
//
// Spec: docs/superpowers/specs/2026-10-01-planilla-de-alta-design.md

// Para COMPARAR. En la base los 55 RUT están con puntos y 5 con la k en
// minúscula, así que sin normalizar los dos lados no se encuentra nada.
export function normalizarRut(rut: string): string {
  const limpio = rut.trim().toUpperCase().replace(/[^0-9K]/g, '')
  if (limpio.length < 2) return ''
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`
}

// Para GUARDAR: con puntos, el formato que ya tienen los 55 y el que espera el
// export a Defontana (toSheetRut).
export function formatearRut(rut: string): string {
  const n = normalizarRut(rut)
  if (!n) return ''
  const [cuerpo, dv] = n.split('-')
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

// `\p{Diacritic}` y no un rango de caracteres combinantes escrito a mano: un
// rango literal se ve como basura en el editor y cualquier normalización del
// archivo lo rompe en silencio.
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().trim().replace(/\s+/g, ' ')
}

// ── Personas ─────────────────────────────────────────────────────────────────

export type Persona = {
  id: string; nombre: string; correo: string; rut: string | null
  activo: boolean; can_approve: boolean
  can_load_bank_transfer: boolean; can_authorize_bank_transfer: boolean
  approver_l1_id: string | null; approver_l2_id: string | null
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
export type ParcheEmpleado = Partial<{
  approver_l1_id: string; approver_l2_id: string
  rut: string; department: string; cost_center_id: string; role: string
  bank_name: string; bank_account_type: string; bank_account: string
}>

export const ROLES = ['admin', 'approver', 'employee'] as const

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
  if (rol)    parche.role              = rol.toLowerCase()
  if (banco)  parche.bank_name         = banco
  if (tipo)   parche.bank_account_type = tipo
  if (numero) parche.bank_account      = numero

  return parche
}
