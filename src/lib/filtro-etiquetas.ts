// Los textos del filtro: qué dice cada chip, la línea de resultado y la de
// cada tarjeta. Separados de los componentes para poder probarlos.

import type { Filtro } from '@/lib/filtro-documentos'
// Los textos de la fecha viven en el módulo genérico: los usan las seis
// pantallas que filtran, no solo las dos del empleado.
import { ETIQUETA_PRESET, fechaCorta } from '@/lib/filtros/dimensiones'
import { formatCLP } from '@/lib/utils'

export type ClaveChip = 'proyectos' | 'categorias' | 'fecha' | 'estados' | 'empleados'

export interface Opcion {
  id:       string
  etiqueta: string
}

const NOMBRE: Record<ClaveChip, string> = {
  proyectos: 'Proyecto', categorias: 'Tipo de gasto', fecha: 'Fecha', estados: 'Estado', empleados: 'Empleado',
}

const PLURAL: Record<Exclude<ClaveChip, 'fecha'>, string> = {
  proyectos: 'proyectos', categorias: 'tipos de gasto', estados: 'estados', empleados: 'empleados',
}


export const nombreDeChip = (c: ClaveChip) => NOMBRE[c]

export function chipActivo(c: ClaveChip, f: Filtro): boolean {
  return c === 'fecha' ? f.fecha !== null : f[c].length > 0
}

export function quitarChip(c: ClaveChip, f: Filtro): Filtro {
  return c === 'fecha' ? { ...f, fecha: null, desde: null, hasta: null } : { ...f, [c]: [] }
}

/** Sin nada elegido, el nombre del chip; con algo, lo elegido. */
export function etiquetaDeChip(c: ClaveChip, f: Filtro, opciones: Opcion[]): string {
  if (c === 'fecha') {
    if (!f.fecha) return NOMBRE.fecha
    if (f.fecha !== 'elegir') return ETIQUETA_PRESET[f.fecha]
    if (f.desde && f.hasta) return `${fechaCorta(f.desde)} – ${fechaCorta(f.hasta)}`
    if (f.desde) return `Desde ${fechaCorta(f.desde)}`
    if (f.hasta) return `Hasta ${fechaCorta(f.hasta)}`
    return ETIQUETA_PRESET.elegir
  }
  const elegidos: string[] = f[c]
  if (elegidos.length === 0) return NOMBRE[c]
  if (elegidos.length > 1) return `${elegidos.length} ${PLURAL[c]}`
  return opciones.find(o => o.id === elegidos[0])?.etiqueta ?? NOMBRE[c]
}

export function etiquetaDeProyecto(p: { numero: string; nombre: string | null }): string {
  return p.nombre ? `${p.numero} · ${p.nombre}` : p.numero
}

const nombreDeCategoria = (f: Filtro, categorias: Opcion[]) =>
  categorias.find(c => c.id === f.categorias[0])?.etiqueta ?? 'ese tipo de gasto'

/** La línea bajo los chips: «3 de 12 · $ 97.300 en Combustible». */
export function textoResumen(
  r: { visibles: number; total: number; totalClp: number },
  f: Filtro,
  categorias: Opcion[],
): string {
  const base = `${r.visibles} de ${r.total} · ${formatCLP(r.totalClp)}`
  if (f.categorias.length === 1) return `${base} en ${nombreDeCategoria(f, categorias)}`
  if (f.categorias.length > 1) return `${base} en ${f.categorias.length} tipos de gasto`
  return base
}

/** La línea de una tarjeta con tipo de gasto elegido: «2 gastos de Combustible · $ 38.400». */
export function textoCoincidencia(
  c: { gastos: number; montoClp: number },
  f: Filtro,
  categorias: Opcion[],
): string {
  const gastos = c.gastos === 1 ? '1 gasto' : `${c.gastos} gastos`
  const de = f.categorias.length === 1 ? ` de ${nombreDeCategoria(f, categorias)}` : ''
  return `${gastos}${de} · ${formatCLP(c.montoClp)}`
}
