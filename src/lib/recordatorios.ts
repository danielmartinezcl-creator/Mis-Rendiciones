// Recordatorios del cron (src/app/api/cron/reminders/route.ts): qué recordar,
// a quién y con qué clave. Funciones puras, como permisos.ts: el cron arma el
// contexto con contexto-permisos.ts y el envío lo hace avisos.ts.
//
// «A quién le toca» NO se decide acá: sale de `destinatarios()`, la misma
// función que decide el aviso del momento. Así un recordatorio no puede ir a
// otra persona que el aviso original (D8, titulares del banco, inactivos).
//
// La clave es la dedup_key de `notifications`, que tiene un índice único en
// (org_id, dedup_key). Lleva la tanda —el número de recordatorio— y no la
// fecha: dos días de la misma tanda son el mismo recordatorio y no se repite.

import { destinatarios, pasoSegunEstado, type Documento, type Paso, type Persona, type TipoDocumento } from '@/lib/permisos'
import { calculateFundBalance } from '@/lib/petty-cash-helpers'
import { escaparHtml } from '@/lib/avisos-helpers'
import type { Database, PettyCashItem, PettyCashTransfer } from '@/lib/supabase/types'

export const UMBRAL_DIAS          = 3
export const CADA_DIAS            = 3
export const BORRADOR_UMBRAL_DIAS = 7
export const BORRADOR_CADA_DIAS   = 7
export const SALDO_BAJO           = 0.2

const DIA = 86_400_000

export interface Recordatorio {
  orgId:    string
  userId:   string
  reportId: string | null
  fundId:   string | null
  clave:    string          // dedup_key
  texto:    string          // texto plano: el correo lo escapa
  link:     string          // ruta dentro de la app
  dias:     number | null   // días de espera; null en el de saldo
}

// El número de recordatorio que corresponde a `dias` de espera: ninguno antes
// del umbral, el 1 desde el umbral, y uno más cada `cada` días.
export function tanda(dias: number, umbral: number, cada: number): number | null {
  if (!Number.isFinite(dias) || dias < umbral) return null
  return Math.floor((dias - umbral) / cada) + 1
}

export function diasEsperando(desde: string, ahora: Date): number {
  return Math.floor((ahora.getTime() - Date.parse(desde)) / DIA)
}

// La marca más reciente entre el envío y las entradas del historial. Se
// comparan instantes: dos marcas con distinto huso no se ordenan como texto.
export function esperandoDesde(marcas: (string | null | undefined)[]): string | null {
  let ultima: string | null = null
  for (const m of marcas) {
    if (m && (ultima === null || Date.parse(m) > Date.parse(ultima))) ultima = m
  }
  return ultima
}

const nombreDe = (personas: Persona[], id: string | null) =>
  personas.find(p => p.id === id)?.nombre ?? 'un empleado'
const estaActivo = (personas: Persona[], id: string) =>
  personas.some(p => p.id === id && p.activo)

// ── Te toca actuar ────────────────────────────────────────────────────────────

const DOCUMENTO: Record<TipoDocumento, { el: string; del: string }> = {
  rendicion:   { el: 'la rendición',   del: 'de la rendición' },
  fondo:       { el: 'el fondo',       del: 'del fondo' },
  liquidacion: { el: 'la liquidación', del: 'de la liquidación' },
}

const ACCION: Record<Paso, (d: { el: string; del: string }) => string> = {
  decidir_l1:     d => `Aprobar ${d.el}`,
  decidir_l2:     d => `Revisión N2 ${d.del}`,
  cargar_pago:    d => `Cargar el pago ${d.del}`,
  autorizar_pago: d => `Autorizar el pago ${d.del}`,
}

// Los mismos destinos que los avisos de avisos.ts: rendiciones a la bandeja o
// a la cola del banco; fondos y liquidaciones, siempre al fondo.
function linkDe(tipo: TipoDocumento, paso: Paso, docId: string): string {
  if (tipo !== 'rendicion') return `/petty-cash/${docId}`
  return paso === 'cargar_pago' || paso === 'autorizar_pago' ? '/banco' : `/approvals/${docId}`
}

export interface DocumentoEsperando {
  orgId:  string
  docId:  string
  estado: string
  titulo: string
  desde:  string     // desde cuándo espera en este paso (esperandoDesde)
  doc:    Documento  // el de contextoRendicion / contextoFondo
}

export function recordatoriosDePaso(d: DocumentoEsperando, personas: Persona[], ahora: Date): Recordatorio[] {
  const paso = pasoSegunEstado(d.doc.tipo, d.estado)
  const dias = diasEsperando(d.desde, ahora)
  const n    = tanda(dias, UMBRAL_DIAS, CADA_DIAS)
  if (!paso || n === null) return []

  const esRendicion = d.doc.tipo === 'rendicion'
  const texto = `${ACCION[paso](DOCUMENTO[d.doc.tipo])} de ${nombreDe(personas, d.doc.beneficiarioId)}: ${d.titulo}`
  // El día en que entró al paso va en la clave: si el documento vuelve al mismo
  // paso (revertir un reembolso), sus recordatorios empiezan de nuevo.
  const entro = new Date(d.desde).toISOString().slice(0, 10)

  return destinatarios(paso, d.doc, personas).map(userId => ({
    orgId:    d.orgId,
    userId,
    reportId: esRendicion ? d.docId : null,
    fundId:   esRendicion ? null : d.docId,
    clave:    `rec:${d.docId}:${paso}:${entro}:${n}:${userId}`,
    texto,
    link:     linkDe(d.doc.tipo, paso, d.docId),
    dias,
  }))
}

// ── Borrador sin enviar ───────────────────────────────────────────────────────

export interface Borrador {
  orgId:    string
  reportId: string
  titulo:   string
  userId:   string | null   // submitter_id
  creado:   string
}

export function recordatoriosDeBorrador(b: Borrador, personas: Persona[], ahora: Date): Recordatorio[] {
  const dias = diasEsperando(b.creado, ahora)
  const n    = tanda(dias, BORRADOR_UMBRAL_DIAS, BORRADOR_CADA_DIAS)
  if (n === null || !b.userId || !estaActivo(personas, b.userId)) return []
  return [{
    orgId:    b.orgId,
    userId:   b.userId,
    reportId: b.reportId,
    fundId:   null,
    clave:    `rec:${b.reportId}:borrador:${n}:${b.userId}`,
    texto:    `Enviar tu rendición «${b.titulo}», que sigue en borrador`,
    link:     `/expenses/${b.reportId}`,
    dias,
  }]
}

// ── Saldo bajo en un fondo vivo ───────────────────────────────────────────────

export interface FondoVivo {
  orgId:          string
  fundId:         string
  nombre:         string
  beneficiarioId: string | null   // employee_id: quien gasta el fondo
  managerId:      string | null   // manager_id: el EFF que lo creó
  aprobado:       number | null
  items:          Pick<PettyCashItem, 'amount_clp' | 'status'>[]
  transferencias: Pick<PettyCashTransfer, 'type' | 'amount'>[]
}

// A quién avisarle que el fondo se está quedando sin saldo: solo al
// beneficiario, que es quien lo gasta y quien lo liquida. Decisión de Daniel
// (2026-09-25): el EFF (`managerId`) se suma si en la práctica hace falta; el
// texto de recordatoriosDeSaldo ya distingue a quien no es el beneficiario.
export function destinatariosSaldoBajo(
  beneficiarioId: string | null, managerId: string | null, personas: Persona[],
): string[] {
  return beneficiarioId && estaActivo(personas, beneficiarioId) ? [beneficiarioId] : []
}

export function recordatoriosDeSaldo(f: FondoVivo, personas: Persona[]): Recordatorio[] {
  if (!f.aprobado) return []
  // El mismo saldo que muestra la pantalla del fondo
  const { remaining } = calculateFundBalance(f.aprobado, f.items, f.transferencias)
  const fraccion = remaining / f.aprobado
  if (fraccion >= SALDO_BAJO) return []

  const saldo = `${Math.round(fraccion * 100)} % de saldo disponible`
  return destinatariosSaldoBajo(f.beneficiarioId, f.managerId, personas).map(userId => ({
    orgId:    f.orgId,
    userId,
    reportId: null,
    fundId:   f.fundId,
    // Sin fecha ni tanda: una sola vez por fondo y persona
    clave:    `rec:${f.fundId}:saldo:${userId}`,
    texto:    userId === f.beneficiarioId
      ? `Tu fondo «${f.nombre}» tiene ${saldo}`
      : `El fondo «${f.nombre}» de ${nombreDe(personas, f.beneficiarioId)} tiene ${saldo}`,
    link:     `/petty-cash/${f.fundId}`,
    dias:     null,
  }))
}

// ── Fila ──────────────────────────────────────────────────────────────────────

// `notifications` no guarda texto ni link: solo el tipo y a qué documento
// apunta. El texto en vivo lo arma textoNotificacion(); el del correo,
// correoDeRecordatorios(). Tipada con el Insert: una columna que no existe no compila.
export function filaDeRecordatorio(r: Recordatorio): Database['public']['Tables']['notifications']['Insert'] {
  return {
    org_id:    r.orgId,
    user_id:   r.userId,
    type:      'reminder',
    report_id: r.reportId,
    fund_id:   r.fundId,
    read:      false,
    dedup_key: r.clave,
  }
}

// ── Correo ────────────────────────────────────────────────────────────────────

// Un correo por persona con todo lo suyo, no uno por documento.
export function correoDeRecordatorios(lista: Recordatorio[], appUrl: string): { asunto: string; html: string } {
  const n = lista.length
  const items = lista.map(r => {
    const espera = r.dias === null ? '' : ` — hace ${r.dias} ${r.dias === 1 ? 'día' : 'días'}`
    return `<li><a href="${appUrl}${r.link}">${escaparHtml(r.texto)}</a>${espera}</li>`
  })
  return {
    asunto: `Tienes ${n} ${n === 1 ? 'pendiente' : 'pendientes'} en Mi Rendición`,
    html:   `<p>Esto es lo que tienes pendiente en Mi Rendición:</p>\n<ul>\n${items.join('\n')}\n</ul>`,
  }
}
