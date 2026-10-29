import { DOC_TYPES, FUND_AUDIT_LABELS, FUND_STATUS_LABELS, STATUS_LABELS } from '@/lib/constants'
import { ETIQUETA_MOVIMIENTO } from '@/lib/fondos-por-rendir'
import { calculateFundBalance, rotuloTransferencia, transferenciaFirme } from '@/lib/petty-cash-helpers'
import { saldoDeRendicion } from '@/lib/saldo-rendicion'
import type { PettyCashItem, PettyCashTransfer } from '@/lib/supabase/types'

/**
 * El comprobante de una rendición o de un fondo de caja chica: qué se gastó, quién
 * lo aprobó y cuándo, qué plata se movió y cómo cierra.
 *
 * Pedido de Daniel el 2026-10-29, en PDF **y** Excel «para que puedan trabajar con
 * los números». Por eso esto arma UNA estructura neutra y los dos formatos la
 * dibujan (`export/comprobante-pdf.ts` y `export/comprobante-excel.ts`): si cada
 * uno sumara por su cuenta, el PDF y el Excel del mismo documento podrían decir
 * cifras distintas.
 *
 * Las cuentas NO se hacen acá. El cuadre de una rendición es `saldoDeRendicion`
 * y el de un fondo es `calculateFundBalance`, los mismos que muestran sus
 * pantallas: un comprobante que dijera otra cosa que la pantalla de la que se
 * bajó sería el peor de los casos.
 */

export type EstadoGasto = 'Aprobado' | 'Pendiente' | 'Rechazado'

export interface LineaGasto {
  fecha:         string
  comercio:      string
  descripcion:   string
  categoria:     string
  centroCosto:   string
  documento:     string
  rutProveedor:  string
  monto:         number
  estado:        EstadoGasto
  motivoRechazo: string
}

export interface PasoRecorrido {
  /** ISO con hora: el orden de dos pasos del mismo día importa. */
  fecha:   string
  accion:  string
  persona: string
  monto:   number | null
  nota:    string
}

export interface MovimientoDeFondos {
  fecha:      string
  concepto:   string
  monto:      number
  referencia: string
}

/**
 * Cada fila SUMA: la última (`total: true`) es la suma de las anteriores, y hay una
 * prueba que lo exige. Así el Excel puede escribir el saldo como una fórmula que el
 * contador ve y comprueba, en vez de un número que tiene que creer.
 */
export interface FilaCuadre {
  concepto: string
  monto:    number
  total?:   boolean
}

/**
 * Las cuatro cifras que encabezan el informe, en los dos formatos. Se eligen acá
 * y no en cada dibujo para que el PDF y el Excel destaquen las mismas.
 */
export interface Indicador {
  etiqueta: string
  monto:    number
  tono:     'neutro' | 'bueno' | 'alerta' | 'malo'
}

export interface Comprobante {
  tipo:          'rendicion' | 'caja_chica'
  titulo:        string
  /** Los últimos 8 del id: es lo que se dicta por teléfono para encontrarlo. */
  codigo:        string
  estado:        string
  empleado:      { nombre: string; rut: string; centroCosto: string }
  proyecto:      string
  /** En un fondo, el motivo que escribió quien lo pidió. */
  motivo:        string
  creado:        string
  enviado:       string | null
  gastos:        LineaGasto[]
  recorrido:     PasoRecorrido[]
  movimientos:   MovimientoDeFondos[]
  cuadre:        FilaCuadre[]
  /** La última línea del cuadre, dicha con palabras. */
  resultado:     { texto: string; monto: number }
  /** Una carga histórica no tiene recorrido en la app: el comprobante lo dice. */
  sinRecorrido:  string | null
  indicadores:   Indicador[]
}

// ── Piezas comunes ───────────────────────────────────────────────────────────

const ETIQUETA_DOC: Record<string, string> = Object.fromEntries(DOC_TYPES.map(d => [d.value, d.label]))

function documento(tipo: string | null, numero: string | null): string {
  const t = tipo ? (ETIQUETA_DOC[tipo] ?? tipo) : ''
  return [t, numero?.trim()].filter(Boolean).join(' ')
}

function estadoDeGasto(status: string | null): EstadoGasto {
  if (status === 'approved') return 'Aprobado'
  if (status === 'rejected') return 'Rechazado'
  return 'Pendiente'
}

export interface GastoDeEntrada {
  date:             string
  merchant:         string | null
  description:      string | null
  categoria:        string | null
  centroCosto:      string | null
  doc_type:         string | null
  doc_number:       string | null
  supplier_rut:     string | null
  amount_clp:       number
  status:           string | null
  rejection_reason: string | null
}

function lineaDeGasto(g: GastoDeEntrada): LineaGasto {
  return {
    fecha:         g.date,
    comercio:      g.merchant?.trim() ?? '',
    descripcion:   g.description?.trim() ?? '',
    categoria:     g.categoria ?? '',
    centroCosto:   g.centroCosto ?? '',
    documento:     documento(g.doc_type, g.doc_number),
    rutProveedor:  g.supplier_rut ?? '',
    monto:         Number(g.amount_clp ?? 0),
    estado:        estadoDeGasto(g.status),
    motivoRechazo: g.status === 'rejected' ? (g.rejection_reason?.trim() ?? '') : '',
  }
}

const porFecha = <T extends { fecha: string }>(a: T, b: T) => a.fecha.localeCompare(b.fecha)

const suma = (gastos: LineaGasto[], estado?: EstadoGasto) =>
  gastos.filter(g => !estado || g.estado === estado).reduce((s, g) => s + g.monto, 0)

function sufijoNivel(level: number | null | undefined): string {
  return level === 2 ? ' (N2)' : level === 1 ? ' (N1)' : ''
}

// ── Rendición ────────────────────────────────────────────────────────────────

export interface RendicionDeEntrada {
  id:                string
  title:             string
  status:            string
  created_at:        string
  submitted_at:      string | null
  reimbursed_amount: number | null
  is_historical_import: boolean
  proyecto:          string | null
  empleado:          { nombre: string; rut: string; centroCosto: string }
  /** Ya sin los borrados. `item_type` vacío es un gasto (anteriores a la 009). */
  items: (GastoDeEntrada & { item_type: string | null; is_transfer_payer?: boolean })[]
  /** `expense_report_approvals`, con el nombre ya resuelto. */
  historial: { action: string; level: number | null; created_at: string; notes: string | null; persona: string }[]
}

const ACCION_RENDICION: Record<string, string> = {
  approved:            'Aprobada',
  partially_approved:  'Aprobada en parte',
  rejected:            'Rechazada',
  returned_to_draft:   'Devuelta para corregir',
  bank_load_requested: 'Reembolso enviado al banco',
  bank_load_confirmed: 'Transferencia cargada en el banco',
  bank_authorized:     'Transferencia autorizada',
}

export function comprobanteDeRendicion(r: RendicionDeEntrada): Comprobante {
  const esGasto = (t: string | null) => !t || t === 'expense'
  const gastos  = r.items.filter(i => esGasto(i.item_type)).map(lineaDeGasto).sort(porFecha)

  /* Adelantos, devoluciones y traspasos de una carga histórica. No son gastos y no
     van en esa tabla: sumarlos ahí contaría dos veces la misma plata. */
  const movimientos: MovimientoDeFondos[] = r.items
    .filter(i => !esGasto(i.item_type))
    .map(i => ({
      fecha:      i.date,
      concepto:   i.item_type === 'transfer'
        ? (i.is_transfer_payer ? 'Traspaso pagado a otra caja' : 'Traspaso recibido de otra caja')
        : (ETIQUETA_MOVIMIENTO[i.item_type ?? ''] ?? i.item_type ?? ''),
      monto:      Number(i.amount_clp ?? 0),
      referencia: i.description?.trim() ?? '',
    }))
    .sort(porFecha)

  const recorrido: PasoRecorrido[] = []
  /* El envío no queda en `expense_report_approvals` —solo en `submitted_at`—, y sin
     él el recorrido empezaría por una aprobación que nadie pidió. */
  if (r.submitted_at && !r.is_historical_import) {
    recorrido.push({ fecha: r.submitted_at, accion: 'Enviada a revisión', persona: r.empleado.nombre, monto: null, nota: '' })
  }
  for (const h of r.historial) {
    const decide = ['approved', 'partially_approved', 'rejected', 'returned_to_draft'].includes(h.action)
    recorrido.push({
      fecha:   h.created_at,
      accion:  (ACCION_RENDICION[h.action] ?? h.action) + (decide ? sufijoNivel(h.level) : ''),
      persona: h.persona,
      monto:   null,
      /* En los pasos bancarios `notes` es la referencia de la transferencia. */
      nota:    h.action === 'bank_authorized' && h.notes ? `Ref. ${h.notes}` : (h.notes?.trim() ?? ''),
    })
  }
  recorrido.sort(porFecha)

  const s = saldoDeRendicion(r.items, r.reimbursed_amount)
  const rechazado        = suma(gastos, 'Rechazado')
  const sinDecidir       = suma(gastos, 'Pendiente')
  /* Lo que `saldoDeRendicion` cuenta como salida además de los gastos aprobados: los
     traspasos que este documento pagó. Se calcula por diferencia para no repetir
     su regla acá. */
  const traspasosPagados = s.salidas - suma(gastos, 'Aprobado')
  const cuadre: FilaCuadre[] = [
    { concepto: 'Gastos presentados', monto: suma(gastos) },
    ...(rechazado  ? [{ concepto: 'Menos: gastos rechazados',  monto: -rechazado }]  : []),
    ...(sinDecidir ? [{ concepto: 'Menos: gastos sin decidir', monto: -sinDecidir }] : []),
    ...(traspasosPagados ? [{ concepto: 'Más: traspasos pagados a otra caja', monto: traspasosPagados }] : []),
    ...(s.recibido ? [{ concepto: 'Menos: ya recibido por el empleado', monto: -s.recibido }] : []),
    { concepto: 'Saldo a favor del empleado', monto: s.pendiente, total: true },
  ]

  return {
    tipo:        'rendicion',
    titulo:      r.title,
    codigo:      r.id.slice(-8).toUpperCase(),
    estado:      STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status,
    empleado:    r.empleado,
    proyecto:    r.proyecto ?? 'Gastos generales',
    motivo:      '',
    creado:      r.created_at,
    enviado:     r.submitted_at,
    gastos,
    recorrido,
    movimientos,
    cuadre,
    resultado:   resultadoDe(s.pendiente),
    indicadores: [
      { etiqueta: 'Total presentado', monto: suma(gastos), tono: 'neutro' },
      { etiqueta: 'Aprobado',         monto: suma(gastos, 'Aprobado'), tono: 'bueno' },
      { etiqueta: 'Rechazado',        monto: rechazado, tono: rechazado ? 'malo' : 'neutro' },
      indicadorDeResultado(resultadoDe(s.pendiente)),
    ],
    sinRecorrido: r.is_historical_import
      ? 'Carga histórica: se aprobó fuera de la app, así que no tiene recorrido registrado.'
      : null,
  }
}

// ── Fondo de caja chica ──────────────────────────────────────────────────────

export interface FondoDeEntrada {
  id:              string
  name:            string | null
  status:          string
  description:     string | null
  created_at:      string
  amount_approved: number | null
  amount_requested: number | null
  proyecto:        string | null
  empleado:        { nombre: string; rut: string; centroCosto: string }
  items:           GastoDeEntrada[]
  transfers:       { type: string; amount: number; reference: string | null; transferred_at: string | null; created_at: string }[]
  /** `petty_cash_approvals`, con el nombre ya resuelto. */
  historial:       { action: string; level: number | null; created_at: string; notes: string | null; amount: number | null; persona: string }[]
}

export function comprobanteDeFondo(f: FondoDeEntrada): Comprobante {
  const gastos = f.items.map(lineaDeGasto).sort(porFecha)

  /* Una entrega cargada que el banco todavía no autoriza NO salió: la pantalla ya
     la rotula así (`rotuloTransferencia`), y el comprobante no puede contarla como
     entregada. */
  const movimientos: MovimientoDeFondos[] = f.transfers
    .map(t => ({
      fecha:      (t.transferred_at ?? t.created_at),
      concepto:   rotuloTransferencia(f.status, t.type),
      monto:      Number(t.amount ?? 0),
      referencia: t.reference?.trim() ?? '',
    }))
    .sort(porFecha)

  const recorrido: PasoRecorrido[] = f.historial
    .map(h => ({
      fecha:   h.created_at,
      accion:  (FUND_AUDIT_LABELS[h.action] ?? h.action)
        + (['approved', 'rejected', 'liquidation_approved'].includes(h.action) ? sufijoNivel(h.level) : ''),
      persona: h.persona,
      monto:   h.amount ?? null,
      nota:    h.notes?.trim() ?? '',
    }))
    .sort(porFecha)

  const firmes = f.transfers.filter(t => transferenciaFirme(f.status, t.type))
  const b = calculateFundBalance(
    f.amount_approved,
    f.items.map(i => ({ amount_clp: Number(i.amount_clp ?? 0), status: i.status as PettyCashItem['status'] })),
    firmes.map(t => ({ type: t.type as PettyCashTransfer['type'], amount: Number(t.amount) })),
  )
  const rechazado = suma(gastos, 'Rechazado')
  const devuelto  = firmes.filter(t => t.type === 'reimbursement_from_employee').reduce((s, t) => s + Number(t.amount), 0)
  const pagado    = firmes.filter(t => t.type === 'refund_to_employee').reduce((s, t) => s + Number(t.amount), 0)

  /* Se lee desde el lado del empleado, como el fondo: lo aprobado es plata que
     tiene en mano y cada gasto la baja. El total es `pending` de
     `calculateFundBalance`: positivo, le sobra y lo devuelve. */
  const cuadre: FilaCuadre[] = [
    { concepto: 'Fondo aprobado',     monto: b.approved },
    { concepto: 'Menos: gastos presentados', monto: -suma(gastos) },
    ...(rechazado ? [{ concepto: 'Más: gastos rechazados (no se descuentan)', monto: rechazado }] : []),
    ...(devuelto  ? [{ concepto: 'Menos: devuelto a la empresa', monto: -devuelto }] : []),
    ...(pagado    ? [{ concepto: 'Más: pagado al empleado',      monto: pagado }]    : []),
    { concepto: 'Saldo en manos del empleado', monto: b.pending, total: true },
  ]
  /* `pending` positivo lo debe el empleado; el signo de `resultadoDe` es el de la
     rendición —positivo, la empresa le debe—, así que se invierte. */
  return {
    tipo:        'caja_chica',
    titulo:      f.name?.trim() || 'Fondo de caja chica',
    codigo:      f.id.slice(-8).toUpperCase(),
    estado:      FUND_STATUS_LABELS[f.status as keyof typeof FUND_STATUS_LABELS] ?? f.status,
    empleado:    f.empleado,
    proyecto:    f.proyecto ?? 'Gastos generales',
    motivo:      f.description?.trim() ?? '',
    creado:      f.created_at,
    enviado:     f.historial.find(h => h.action === 'submitted_for_approval')?.created_at ?? null,
    gastos,
    recorrido,
    movimientos,
    cuadre,
    resultado:   resultadoDe(-b.pending),
    indicadores: [
      { etiqueta: 'Fondo aprobado', monto: b.approved, tono: 'neutro' },
      { etiqueta: 'Gastado',        monto: b.spent,    tono: 'bueno' },
      { etiqueta: devuelto || !pagado ? 'Devuelto' : 'Pagado al empleado', monto: devuelto || pagado, tono: 'neutro' },
      indicadorDeResultado(resultadoDe(-b.pending)),
    ],
    sinRecorrido: null,
  }
}

/** Positivo: la empresa le debe al empleado. Negativo: el empleado tiene que devolver. */
function indicadorDeResultado(r: Comprobante['resultado']): Indicador {
  if (r.monto === 0) return { etiqueta: 'Saldo', monto: 0, tono: 'bueno' }
  return r.texto.startsWith('La empresa')
    ? { etiqueta: 'Por reembolsar', monto: r.monto, tono: 'alerta' }
    : { etiqueta: 'Por devolver',   monto: r.monto, tono: 'alerta' }
}

function resultadoDe(pendiente: number): Comprobante['resultado'] {
  const monto = Math.round(pendiente)
  if (Math.abs(monto) < 1) return { texto: 'Saldado: no queda nada pendiente', monto: 0 }
  return monto > 0
    ? { texto: 'La empresa le debe reembolsar al empleado', monto }
    : { texto: 'El empleado debe devolver a la empresa', monto: -monto }
}

// ── Huella ───────────────────────────────────────────────────────────────────

/**
 * SHA-256 de lo que el comprobante afirma: gastos, recorrido, movimientos y cuadre.
 * Sirve para saber si dos copias son la misma o si alguien editó una: dos archivos
 * del mismo documento, sin cambios entremedio, dan la misma huella. La fecha de
 * generación queda AFUERA a propósito, o cada descarga tendría otra.
 */
export async function huellaDe(c: Comprobante): Promise<string> {
  const contenido = JSON.stringify({
    codigo: c.codigo, gastos: c.gastos, recorrido: c.recorrido,
    movimientos: c.movimientos, cuadre: c.cuadre, resultado: c.resultado,
  })
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(contenido))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function nombreDeArchivo(c: Comprobante, extension: 'pdf' | 'xlsx'): string {
  const base = c.titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
  return `Comprobante-${base || c.tipo}-${c.codigo}.${extension}`
}

// ── Fechas ───────────────────────────────────────────────────────────────────

const PARTES = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/**
 * Una marca de tiempo leída en hora de Chile, para los dos formatos. **La hora de
 * Chile y no la del servidor**: Vercel corre en UTC, y una aprobación de las 21:00
 * del 21 saldría el 22 a las 00:00 — el comprobante diría que se aprobó al día
 * siguiente. Una fecha sola (`YYYY-MM-DD`, la de un gasto) no tiene zona y se
 * toma tal cual.
 *
 * `serial` es el número de día de Excel, con la hora como fracción: así la celda
 * es una fecha de verdad, que se ordena y se filtra, y no un texto.
 */
export function fechaChile(iso: string): { fecha: string; hora: string | null; serial: number } {
  let y: number, m: number, d: number, hh = 0, mm = 0
  let hora: string | null = null
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    [y, m, d] = iso.split('-').map(Number)
  } else {
    const p = Object.fromEntries(PARTES.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
    y = Number(p.year); m = Number(p.month); d = Number(p.day); hh = Number(p.hour); mm = Number(p.minute)
    hora = `${p.hour}:${p.minute}`
  }
  const dias = (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000
  return {
    fecha:  `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
    hora,
    serial: dias + (hh * 60 + mm) / 1440,
  }
}
