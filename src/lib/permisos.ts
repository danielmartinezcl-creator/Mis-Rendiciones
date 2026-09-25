// Quién puede dar cada paso sobre una rendición, un fondo o una liquidación, y
// a quién se le avisa. Spec: docs/superpowers/specs/2026-09-24-permisos-y-flujo-de-aprobacion-design.md
//
// Funciones puras: no leen la base. El servidor arma el contexto
// (src/lib/contexto-permisos.ts) y pregunta acá. El botón que ve cada persona
// y el correo que recibe salen de estas mismas funciones: por eso no pueden
// contradecirse, que era el problema de antes (el correo iba a «todos los que
// tienen el permiso» y el permiso lo decidía otra consulta).
//
// Las cinco reglas:
//   1. Nadie aprueba lo propio.
//   2. Nadie autoriza el pago de lo propio.
//   3. Quien cargó un pago no lo autoriza.
//   4. Aprobar en N2 y autorizar el mismo pago está permitido.
//   5. Cargar el pago propio está permitido (lo autoriza otra persona).
// «Lo propio» es lo que recibe uno mismo: en un fondo, el beneficiario.

export type TipoDocumento = 'rendicion' | 'fondo' | 'liquidacion'
export type Paso = 'decidir_l1' | 'decidir_l2' | 'cargar_pago' | 'autorizar_pago'

export interface Persona {
  id:                          string
  nombre:                      string
  activo:                      boolean
  can_submit:                  boolean
  can_approve:                 boolean
  can_manage_petty_cash:       boolean
  can_load_bank_transfer:      boolean
  can_authorize_bank_transfer: boolean
  bank_load_backup:            boolean
  bank_auth_backup:            boolean
}

export interface Cadena {
  l1:                string | null
  l2:                string | null
  suplenteL1Vigente: string | null
}

export interface EntradaHistorial {
  actorId: string
  accion:  string
  nivel:   number | null
}

export interface Documento {
  tipo:           TipoDocumento
  beneficiarioId: string
  cadena:         Cadena
  historial:      EntradaHistorial[]
}

export type Resultado = { ok: true } | { ok: false; motivo: string }

export interface ConfigCadena {
  l1:         string | null
  l2:         string | null
  suplenteL1: string | null
}

const OK: Resultado = { ok: true }
const no = (motivo: string): Resultado => ({ ok: false, motivo })

// El suplente vale entre las dos fechas, ambas incluidas (YYYY-MM-DD).
export function suplenteVigente(
  suplenteId: string | null, desde: string | null, hasta: string | null, hoy: string,
): string | null {
  if (!suplenteId || !desde || !hasta) return null
  return desde <= hoy && hoy <= hasta ? suplenteId : null
}

const PASO_POR_ESTADO: Record<TipoDocumento, Record<string, Paso>> = {
  rendicion: {
    submitted:         'decidir_l1',
    pending_l2:        'decidir_l2',
    pending_bank_load: 'cargar_pago',
    pending_bank_auth: 'autorizar_pago',
  },
  fondo: {
    pending_approval:    'decidir_l1',
    pending_approval_l2: 'decidir_l2',
    pending_bank_load:   'cargar_pago',
    pending_bank_auth:   'autorizar_pago',
  },
  liquidacion: {
    // `submitted` era el estado que esperaba «elevar»; ese paso se eliminó (D6)
    // y lo que haya quedado ahí lo decide el N1.
    submitted:                    'decidir_l1',
    pending_liquidation_approval: 'decidir_l1',
    pending_liquidation_l2:       'decidir_l2',
  },
}

export function pasoSegunEstado(tipo: TipoDocumento, estado: string): Paso | null {
  return PASO_POR_ESTADO[tipo][estado] ?? null
}

const ESTADOS_DE_LIQUIDACION = new Set(['submitted', 'pending_liquidation_approval', 'pending_liquidation_l2', 'settled'])

export function tipoDeFondo(estado: string): 'fondo' | 'liquidacion' {
  return ESTADOS_DE_LIQUIDACION.has(estado) ? 'liquidacion' : 'fondo'
}

// Aprobar un fondo y aprobar su liquidación son dos acciones distintas, aunque
// los dos pasos se llamen «decidir». Sin esta guarda, `approveFund` sobre una
// liquidación volvía a mandar el fondo al banco, y `approveLiquidation` sobre un
// fondo recién enviado lo daba por liquidado.
export function enEtapa(doc: Documento, esperada: TipoDocumento): Resultado {
  return doc.tipo === esperada ? OK : no('Este fondo no está en esa etapa')
}

// Un aprobador que ya no está activo (o que no es de la organización) cuenta
// como «sin aprobador»: así el envío se bloquea y el admin recibe el aviso, en
// vez de quedar el documento esperando a alguien que nunca va a entrar.
export function cadenaActiva(cadena: Cadena, personas: Persona[]): Cadena {
  const vigente = (id: string | null) =>
    id && personas.some(p => p.id === id && p.activo) ? id : null
  return {
    l1:                vigente(cadena.l1),
    l2:                vigente(cadena.l2),
    suplenteL1Vigente: vigente(cadena.suplenteL1Vigente),
  }
}

// La carga más reciente: una reversa de reembolso vuelve a pasar por carga.
function ultimoCargador(historial: EntradaHistorial[]): string | null {
  for (let i = historial.length - 1; i >= 0; i--) {
    if (historial[i].accion === 'bank_load_confirmed') return historial[i].actorId
  }
  return null
}

function esSuplente(p: Persona, paso: Paso): boolean {
  if (paso === 'cargar_pago')    return p.bank_load_backup
  if (paso === 'autorizar_pago') return p.bank_auth_backup
  return false
}

// Por qué esta persona no puede dar el paso, o null si puede.
function bloqueo(persona: Persona, paso: Paso, doc: Documento, personas: Persona[]): string | null {
  if (!persona.activo) return 'Tu usuario no está activo'
  const esBeneficiario = persona.id === doc.beneficiarioId

  switch (paso) {
    case 'decidir_l1': {
      if (esBeneficiario) return 'No puedes aprobar lo tuyo'
      const { l1, suplenteL1Vigente } = doc.cadena
      return persona.id === l1 || persona.id === suplenteL1Vigente
        ? null
        : 'No eres el aprobador de nivel 1 de esta persona'
    }
    case 'decidir_l2': {
      if (esBeneficiario) return 'No puedes aprobar lo tuyo'
      return persona.id === doc.cadena.l2 ? null : 'No eres el aprobador de nivel 2 de esta persona'
    }
    case 'cargar_pago': {
      if (!persona.can_load_bank_transfer) return 'No tienes el permiso «carga banco»'
      // Nunca trabado: si carga esta persona, alguien más tiene que poder autorizar
      const quedaQuienAutorice = personas.some(p =>
        p.activo && p.can_authorize_bank_transfer &&
        p.id !== doc.beneficiarioId && p.id !== persona.id)
      return quedaQuienAutorice ? null : 'Si cargas tú, nadie podrá autorizar este pago'
    }
    case 'autorizar_pago': {
      if (!persona.can_authorize_bank_transfer) return 'No tienes el permiso «autoriza banco»'
      if (esBeneficiario) return 'No puedes autorizar el pago de lo tuyo'
      // Sin la carga en el historial no se sabe quién cargó, y la regla 3 no se
      // puede comprobar: si la entrada no se guardó, nadie autoriza hasta aclararlo.
      const cargador = ultimoCargador(doc.historial)
      if (cargador === null) return 'Todavía no hay una carga registrada para este pago'
      if (cargador === persona.id) return 'Tú cargaste este pago'
      return null
    }
  }
}

// Todas las personas que pueden dar el paso; los titulares del banco primero.
export function elegibles(paso: Paso, doc: Documento, personas: Persona[]): Persona[] {
  return personas
    .filter(p => bloqueo(p, paso, doc, personas) === null)
    .sort((a, b) => Number(esSuplente(a, paso)) - Number(esSuplente(b, paso)))
}

function listar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} o ${nombres[nombres.length - 1]}`
}

export function puedeActuar(persona: Persona, paso: Paso, doc: Documento, personas: Persona[]): Resultado {
  const motivo = bloqueo(persona, paso, doc, personas)
  if (motivo === null) return OK
  const otros = elegibles(paso, doc, personas).filter(p => p.id !== persona.id).map(p => p.nombre)
  return no(otros.length ? `${motivo}. Lo puede hacer ${listar(otros)}` : motivo)
}

// A quién le toca el paso. Mientras un suplente N1 está vigente, solo a él (D8).
// En el banco, a los titulares que pueden; si no queda ninguno, a los suplentes
// que pueden. `excluir` es quien acaba de actuar: nunca se le avisa.
export function destinatarios(paso: Paso, doc: Documento, personas: Persona[], excluir: string[] = []): string[] {
  const candidatos = elegibles(paso, doc, personas).filter(p => !excluir.includes(p.id))

  if (paso === 'decidir_l1') {
    const suplente = doc.cadena.suplenteL1Vigente
    if (suplente && candidatos.some(p => p.id === suplente)) return [suplente]
  }
  if (paso === 'cargar_pago' || paso === 'autorizar_pago') {
    const titulares = candidatos.filter(p => !esSuplente(p, paso))
    if (titulares.length) return titulares.map(p => p.id)
  }
  return candidatos.map(p => p.id)
}

// Avisos que solo informan (rechazo, pago hecho, liquidación cerrada).
export function destinatariosInformativos(enviadoPor: string, beneficiarioId: string, excluir: string[] = []): string[] {
  return [...new Set([enviadoPor, beneficiarioId])].filter(id => !excluir.includes(id))
}

export function puedeEnviar(tipo: TipoDocumento, actor: Persona, cadena: Cadena): Resultado {
  if (!actor.activo) return no('Tu usuario no está activo')
  if (tipo === 'rendicion' && !actor.can_submit) return no('No tienes el permiso «rinde»')
  if (tipo === 'fondo' && !actor.can_manage_petty_cash) return no('No tienes el permiso «EFF»')
  if (!cadena.l1) {
    return no(tipo === 'fondo'
      ? 'Esta persona no tiene aprobador asignado. Ya le avisamos al administrador'
      : 'No tienes aprobador asignado. Ya le avisamos al administrador')
  }
  return OK
}

export function validarCadena(empleadoId: string, config: ConfigCadena, personas: Persona[]): string[] {
  const errores: string[] = []
  const { l1, l2, suplenteL1 } = config

  if (l1 === empleadoId || l2 === empleadoId || suplenteL1 === empleadoId) {
    errores.push('Nadie puede ser su propio aprobador')
  }
  if (l2 && !l1) errores.push('Para tener aprobador N2 hay que tener N1')
  if (l1 && l1 === l2) errores.push('N1 y N2 no pueden ser la misma persona')
  if (suplenteL1 && suplenteL1 === l1) errores.push('El suplente no puede ser el mismo aprobador N1')
  if (suplenteL1 && suplenteL1 === l2) errores.push('El suplente de N1 no puede ser el aprobador N2: decidiría los dos niveles')

  const roles: [string | null, string][] = [[l1, 'N1'], [l2, 'N2'], [suplenteL1, 'suplente']]
  for (const [id, rol] of roles) {
    if (!id || id === empleadoId) continue
    const p = personas.find(x => x.id === id)
    if (!p) { errores.push(`El aprobador ${rol} no pertenece a esta organización`); continue }
    if (!p.activo)      errores.push(`${p.nombre} (${rol}) no está activo`)
    if (!p.can_approve) errores.push(`${p.nombre} (${rol}) no tiene el permiso «aprueba»`)
  }
  return errores
}

// Nombres de quienes tienen a esta persona en su cadena (N1, N2 o suplente).
export function dependientesDe(
  aprobadorId: string,
  empleados: { id: string; nombre: string; l1: string | null; l2: string | null; suplenteL1: string | null }[],
): string[] {
  return empleados
    .filter(e => e.id !== aprobadorId && (e.l1 === aprobadorId || e.l2 === aprobadorId || e.suplenteL1 === aprobadorId))
    .map(e => e.nombre)
}
