// Las reglas del filtro del empleado: qué documento entra y qué suma.
//
// Las usan las dos listas (rendiciones y caja chica), la exportación y «Mis
// gastos». Si una de estas reglas aparece escrita en un componente, está mal:
// la pantalla y el Excel tienen que contar lo mismo.
//
// Spec: docs/superpowers/specs/2026-10-07-filtro-del-empleado-design.md

import {
  FAMILIA_REPORTE, FAMILIA_FONDO,
  type FamiliaEstado, type ReportStatus, type FundStatusConst,
} from '@/lib/constants'

export interface GastoFiltrable {
  categoriaId: string | null
  /** La de la boleta, YYYY-MM-DD: el filtro de fecha mira el gasto, no el documento */
  fecha:       string
  montoClp:    number
  rechazado:   boolean
}

export interface DocumentoFiltrable {
  id:             string
  proyectoId:     string | null
  familia:        FamiliaEstado
  /** Quien recibe la plata: quien rinde, o el empleado del fondo */
  beneficiarioId: string
  /** YYYY-MM-DD en Chile. Lo usa el filtro de fecha cuando el documento no tiene gastos */
  creadoEl:       string
  gastos:         GastoFiltrable[]
}

export type PresetFecha = 'este-mes' | 'mes-pasado' | 'ultimos-3' | 'este-anio' | 'elegir'

export interface Filtro {
  /** Ids de proyecto, o SIN_PROYECTO */
  proyectos:  string[]
  categorias: string[]
  fecha:      PresetFecha | null
  /** Solo con fecha = 'elegir' */
  desde:      string | null
  hasta:      string | null
  estados:    FamiliaEstado[]
  empleados:  string[]
}

export const SIN_PROYECTO = 'sin'

export const FILTRO_VACIO: Filtro = {
  proyectos: [], categorias: [], fecha: null, desde: null, hasta: null, estados: [], empleados: [],
}

export function hayFiltro(f: Filtro): boolean {
  return f.proyectos.length > 0 || f.categorias.length > 0 || f.fecha !== null
    || f.estados.length > 0 || f.empleados.length > 0
}

/** La fecha en Chile, YYYY-MM-DD. `toISOString()` daría el día siguiente después de las 21:00. */
export function fechaEnChile(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(fecha)
}

const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Último día del mes `m` (1-12): el día 0 del mes siguiente. */
const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate()

/** El rango inclusivo de un filtro de fecha. Un lado en null queda abierto. */
export function rangoDeFecha(
  f: Pick<Filtro, 'fecha' | 'desde' | 'hasta'>,
  hoy: string,
): { desde: string | null; hasta: string | null } {
  const [a, m] = hoy.split('-').map(Number)
  switch (f.fecha) {
    case null:
      return { desde: null, hasta: null }
    case 'este-mes':
      return { desde: iso(a, m, 1), hasta: iso(a, m, ultimoDia(a, m)) }
    case 'mes-pasado': {
      const [pa, pm] = m === 1 ? [a - 1, 12] : [a, m - 1]
      return { desde: iso(pa, pm, 1), hasta: iso(pa, pm, ultimoDia(pa, pm)) }
    }
    case 'ultimos-3': {
      const meses = a * 12 + (m - 1) - 2
      return { desde: iso(Math.floor(meses / 12), (meses % 12) + 1, 1), hasta: hoy }
    }
    case 'este-anio':
      return { desde: iso(a, 1, 1), hasta: hoy }
    case 'elegir':
      return { desde: f.desde, hasta: f.hasta }
  }
}

export interface Coincidencia<T> {
  doc:      T
  /** Los gastos no rechazados que cumplen tipo de gasto y fecha */
  gastos:   GastoFiltrable[]
  montoClp: number
}

export interface ResultadoFiltro<T> {
  visibles:    Coincidencia<T>[]
  totalClp:    number
  totalGastos: number
}

const enRango = (fecha: string, r: { desde: string | null; hasta: string | null }) =>
  (r.desde === null || fecha >= r.desde) && (r.hasta === null || fecha <= r.hasta)

/**
 * Qué documentos entran y cuánto suman. Entre chips, Y; dentro de un chip, O.
 *
 * Tipo de gasto y fecha miran los GASTOS, y el mismo gasto tiene que cumplir
 * los dos: combustible de agosto y comida de septiembre no es «combustible de
 * septiembre». Un gasto rechazado nunca hace entrar a un documento ni suma.
 */
export function aplicarFiltro<T extends DocumentoFiltrable>(
  docs: T[],
  filtro: Filtro,
  hoy: string,
): ResultadoFiltro<T> {
  const rango = rangoDeFecha(filtro, hoy)
  const hayFecha = rango.desde !== null || rango.hasta !== null
  const hayCategoria = filtro.categorias.length > 0

  const visibles: Coincidencia<T>[] = []
  for (const doc of docs) {
    if (filtro.proyectos.length && !filtro.proyectos.includes(doc.proyectoId ?? SIN_PROYECTO)) continue
    if (filtro.estados.length && !filtro.estados.includes(doc.familia)) continue
    if (filtro.empleados.length && !filtro.empleados.includes(doc.beneficiarioId)) continue

    const gastos = doc.gastos.filter(g =>
      !g.rechazado
      && (!hayCategoria || (g.categoriaId !== null && filtro.categorias.includes(g.categoriaId)))
      && (!hayFecha || enRango(g.fecha, rango)))

    if ((hayCategoria || hayFecha) && gastos.length === 0) {
      // Un documento SIN gastos todavía (un borrador vacío, un fondo recién
      // pedido) se juzga por su fecha de creación. Con tipo de gasto no entra:
      // sin gastos no puede tener uno.
      const vacio = doc.gastos.length === 0
      if (!(vacio && !hayCategoria && enRango(doc.creadoEl, rango))) continue
    }

    visibles.push({ doc, gastos, montoClp: gastos.reduce((s, g) => s + g.montoClp, 0) })
  }

  return {
    visibles,
    totalClp:    visibles.reduce((s, v) => s + v.montoClp, 0),
    totalGastos: visibles.reduce((s, v) => s + v.gastos.length, 0),
  }
}

/** Cuántos gastos no rechazados tiene cada categoría: el número que muestra la hoja. */
export function contarPorCategoria(docs: DocumentoFiltrable[]): Map<string, number> {
  const conteo = new Map<string, number>()
  for (const d of docs) {
    for (const g of d.gastos) {
      if (g.rechazado || g.categoriaId === null) continue
      conteo.set(g.categoriaId, (conteo.get(g.categoriaId) ?? 0) + 1)
    }
  }
  return conteo
}

/**
 * En rendiciones, solo `expense` (o nulo, en los ítems viejos) es un gasto.
 * Adelantos, devoluciones y traspasos son movimientos de fondos: sumarlos con
 * los gastos cuenta dos veces la misma plata (SKILL, «Gasto ≠ movimiento»).
 */
export function esGasto(itemType: string | null | undefined): boolean {
  return itemType === 'expense' || itemType === null || itemType === undefined
}

/**
 * La carga histórica no tiene proyecto y está cerrada (cuenta como liquidada):
 * entra en la exportación salvo que los chips de proyecto o estado la excluyan.
 */
export function historicaEntraEnExportacion(f: Filtro): boolean {
  const proyectoOk = f.proyectos.length === 0 || f.proyectos.includes(SIN_PROYECTO)
  const estadoOk = f.estados.length === 0 || f.estados.includes('resuelto')
  return proyectoOk && estadoOk
}

type FilaGasto = { category_id: string | null; date: string; amount_clp: number | null; status: string }

const aGasto = (i: FilaGasto): GastoFiltrable => ({
  categoriaId: i.category_id,
  fecha:       i.date.slice(0, 10),
  montoClp:    Number(i.amount_clp ?? 0),
  rechazado:   i.status === 'rejected',
})

export function documentoDeRendicion(
  r: { id: string; status: string; proyecto_id: string | null; submitter_id: string; created_at: string },
  items: (FilaGasto & { item_type: string | null })[],
): DocumentoFiltrable {
  return {
    id:             r.id,
    proyectoId:     r.proyecto_id,
    familia:        FAMILIA_REPORTE[r.status as ReportStatus] ?? 'neutro',
    beneficiarioId: r.submitter_id,
    creadoEl:       fechaEnChile(new Date(r.created_at)),
    gastos:         items.filter(i => esGasto(i.item_type)).map(aGasto),
  }
}

/** En caja chica todo `petty_cash_items` es gasto: los adelantos son transferencias. */
export function documentoDeFondo(
  f: { id: string; status: string; proyecto_id: string | null; employee_id: string; created_at: string },
  items: FilaGasto[],
): DocumentoFiltrable {
  return {
    id:             f.id,
    proyectoId:     f.proyecto_id,
    familia:        FAMILIA_FONDO[f.status as FundStatusConst] ?? 'neutro',
    beneficiarioId: f.employee_id,
    creadoEl:       fechaEnChile(new Date(f.created_at)),
    gastos:         items.map(aGasto),
  }
}

/** Los cuatro grupos de estado son las familias de siempre, no una clasificación nueva. */
export const ORDEN_FAMILIAS: FamiliaEstado[] = ['neutro', 'en-curso', 'resuelto', 'atencion']

export const ETIQUETAS_ESTADO: Record<'rendicion' | 'fondo', Record<FamiliaEstado, string>> = {
  // «Con rechazos» y no «Rechazadas»: incluye las aprobadas en parte
  rendicion: { neutro: 'Borradores', 'en-curso': 'En proceso', resuelto: 'Aprobadas', atencion: 'Con rechazos' },
  fondo:     { neutro: 'Borradores', 'en-curso': 'En proceso', resuelto: 'Liquidados', atencion: 'Rechazados' },
}

export interface OpcionesFiltro {
  proyectos:  { id: string; numero: string; nombre: string | null }[]
  categorias: { id: string; name: string }[]
}

export interface RendicionFiltrable extends DocumentoFiltrable {
  title:             string
  status:            ReportStatus
  total_amount:      number
  approved_amount:   number
  currency:          string | null
  submitted_at:      string | null
  created_at:        string
  reimbursed_at:     string | null
  payment_reference: string | null
}
