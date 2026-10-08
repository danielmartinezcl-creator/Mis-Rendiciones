// Las dimensiones de un filtro, sin dominio adentro.
//
// La barra de chips sirve a seis pantallas que filtran cosas distintas:
// rendiciones y fondos (el empleado), rendiciones del admin, ítems de informes,
// registros de bitácora y personas. Una sola unión de claves no da para todas,
// así que acá vive **la forma** de un filtro —qué dimensiones hay, de qué tipo,
// cuáles van a la vista— y en cada pantalla vive **qué pasa el filtro**.
//
// Si en este archivo aparece la palabra «rendición», «fondo» o «gasto», está
// mal puesto: esto no sabe qué se está filtrando.
//
// Spec: docs/superpowers/specs/2026-10-08-filtros-del-admin-design.md

import type { PresetFecha } from '@/lib/filtro-documentos'

export type { PresetFecha }

export interface Opcion {
  id:       string
  etiqueta: string
  /** Segunda línea en la hoja de opciones (el nombre de una obra, un correo). */
  detalle?: string
}

/**
 * Una dimensión del filtro. `destacada` decide dónde se dibuja: `true` es un
 * chip en la barra, `false` va dentro de «Más filtros». Ninguna pantalla
 * debería tener más de cuatro destacadas — con once chips a la vista hay que
 * leerlos todos para saber qué está puesto, que es el problema que este
 * rediseño vino a resolver.
 */
/**
 * Un buscador dentro de la hoja de opciones. **Es por dimensión y no una regla
 * de largo**: hoy lo ofrecen solo Proyecto y Empleado, y solo con más de seis
 * opciones. Si bastara el largo, las categorías de PENTA lo estrenarían sin que
 * nadie lo haya pedido y la pantalla del empleado cambiaría sola.
 */
interface ConBuscador {
  buscador?: boolean
  /** Por omisión, «Buscar…». */
  marcadorBusqueda?: string
}

export type Dimension =
  | (ConBuscador & {
      clave: string; nombre: string; destacada: boolean
      tipo: 'multi'
      /** Cómo se nombra el conjunto: «2 empleados», «2 tipos de gasto». */
      plural: string
      opciones: Opcion[]
    })
  | (ConBuscador & { clave: string; nombre: string; destacada: boolean; tipo: 'unico'; opciones: Opcion[] })
  | { clave: string; nombre: string; destacada: boolean; tipo: 'fecha' }
  | { clave: string; nombre: string; destacada: boolean; tipo: 'texto'; marcador: string }

export type ValorDimension =
  | { tipo: 'multi'; ids: string[] }
  | { tipo: 'unico'; id: string | null }
  | { tipo: 'fecha'; preset: PresetFecha | null; desde: string | null; hasta: string | null }
  | { tipo: 'texto'; texto: string }

/** Lo elegido, por clave de dimensión. */
export type Valores = Record<string, ValorDimension>

// ── Los textos de la fecha ───────────────────────────────────────────────────
// Viven acá, en el módulo genérico, y no en `filtro-etiquetas` —que es el del
// empleado— porque los usan las seis pantallas. `filtro-etiquetas` los importa
// de acá.

export const ETIQUETA_PRESET: Record<PresetFecha, string> = {
  'este-mes': 'Este mes', 'mes-pasado': 'Mes pasado', 'ultimos-3': 'Últimos 3 meses',
  'este-anio': 'Este año', elegir: 'Elegir fechas',
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** `2026-08-01` → `1 ago`. */
export function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MESES[Number(m) - 1]}`
}

// ── Operaciones ──────────────────────────────────────────────────────────────

export function valorVacio(d: Dimension): ValorDimension {
  switch (d.tipo) {
    case 'multi': return { tipo: 'multi', ids: [] }
    case 'unico': return { tipo: 'unico', id: null }
    case 'fecha': return { tipo: 'fecha', preset: null, desde: null, hasta: null }
    case 'texto': return { tipo: 'texto', texto: '' }
  }
}

/** Sin nada puesto. Es también «limpiar todo»: no hay dos funciones para eso. */
export function valoresVacios(dimensiones: Dimension[]): Valores {
  return Object.fromEntries(dimensiones.map(d => [d.clave, valorVacio(d)]))
}

/**
 * ¿Esta dimensión está filtrando algo?
 *
 * Dos casos que no son obvios: un texto de solo espacios no filtra nada, y
 * `elegir` sin ninguna fecha tampoco — el preset está elegido pero el rango
 * todavía está vacío, así que la lista no se achicó.
 */
export function hayValor(v: ValorDimension): boolean {
  switch (v.tipo) {
    case 'multi': return v.ids.length > 0
    case 'unico': return v.id !== null
    case 'texto': return v.texto.trim() !== ''
    case 'fecha': return v.preset !== null && (v.preset !== 'elegir' || v.desde !== null || v.hasta !== null)
  }
}

/**
 * Las claves que están filtrando, **en el orden de las dimensiones** y no en el
 * de las claves del objeto: así la misma selección se lee siempre igual.
 */
export function clavesPuestas(dimensiones: Dimension[], valores: Valores): string[] {
  return dimensiones.filter(d => {
    const v = valores[d.clave]
    return v !== undefined && hayValor(v)
  }).map(d => d.clave)
}

/** El número del botón «Más filtros»: cuántas de las escondidas están puestas. */
export function ocultasPuestas(dimensiones: Dimension[], valores: Valores): number {
  return clavesPuestas(dimensiones.filter(d => !d.destacada), valores).length
}

/** Vacía una dimensión sin tocar las demás. Una clave desconocida no hace nada. */
export function quitar(dimensiones: Dimension[], valores: Valores, clave: string): Valores {
  const d = dimensiones.find(x => x.clave === clave)
  if (!d) return valores
  return { ...valores, [clave]: valorVacio(d) }
}

/**
 * Lo que dice el chip: sin nada elegido, el nombre de la dimensión; con algo,
 * lo elegido.
 *
 * Un id que ya no está entre las opciones cae al nombre en vez de imprimirse
 * crudo: una vista guardada puede apuntar a alguien que se fue de la empresa, y
 * un chip que dice `a3f0-…` no le sirve a nadie.
 */
export function etiquetaDe(d: Dimension, v: ValorDimension): string {
  if (d.tipo === 'multi' && v.tipo === 'multi') {
    if (v.ids.length === 0) return d.nombre
    if (v.ids.length > 1) return `${v.ids.length} ${d.plural}`
    return d.opciones.find(o => o.id === v.ids[0])?.etiqueta ?? d.nombre
  }
  if (d.tipo === 'unico' && v.tipo === 'unico') {
    if (v.id === null) return d.nombre
    return d.opciones.find(o => o.id === v.id)?.etiqueta ?? d.nombre
  }
  if (d.tipo === 'texto' && v.tipo === 'texto') {
    return v.texto.trim() === '' ? d.nombre : `«${v.texto.trim()}»`
  }
  if (d.tipo === 'fecha' && v.tipo === 'fecha') {
    if (!v.preset) return d.nombre
    if (v.preset !== 'elegir') return ETIQUETA_PRESET[v.preset]
    if (v.desde && v.hasta) return `${fechaCorta(v.desde)} – ${fechaCorta(v.hasta)}`
    if (v.desde) return `Desde ${fechaCorta(v.desde)}`
    if (v.hasta) return `Hasta ${fechaCorta(v.hasta)}`
    return ETIQUETA_PRESET.elegir
  }
  return d.nombre
}

/**
 * La línea que nombra todo lo puesto, escondido o no: «Lobos Claudia ·
 * Pendiente de reembolso». Es lo que hace que «Más filtros» no esconda nada de
 * verdad.
 *
 * **No es la línea del empleado**, que dice cuánto queda y cuánta plata
 * (`textoResumen` de `filtro-etiquetas.ts`). La barra recibe su resumen por
 * props justamente para que cada pantalla arme el suyo.
 */
export function resumen(dimensiones: Dimension[], valores: Valores): string | null {
  const partes = dimensiones
    .filter(d => {
      const v = valores[d.clave]
      return v !== undefined && hayValor(v)
    })
    .map(d => etiquetaDe(d, valores[d.clave]))
  return partes.length ? partes.join(' · ') : null
}
