// El filtro vive en la dirección de la página: recargar, volver atrás o
// compartir el enlace lo conserva. `?proyecto=…&tipo=…&fecha=este-anio&estado=en-curso`
//
// Las páginas lo leen del `searchParams` del servidor (una Promise en Next 16)
// y la pantalla lo escribe con `window.history.replaceState`, que se integra
// con el router sin volver a pedir la página.

import { FILTRO_VACIO, SIN_PROYECTO, type Filtro, type PresetFecha } from '@/lib/filtro-documentos'
import type { FamiliaEstado } from '@/lib/constants'

const PRESETS: PresetFecha[] = ['este-mes', 'mes-pasado', 'ultimos-3', 'este-anio', 'elegir']
const FAMILIAS: FamiliaEstado[] = ['neutro', 'en-curso', 'resuelto', 'atencion']
const FECHA = /^\d{4}-\d{2}-\d{2}$/

const lista = (v: string | null) => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : [])

export function leerFiltro(params: URLSearchParams): Filtro {
  const crudo = params.get('fecha')
  const fecha = PRESETS.includes(crudo as PresetFecha) ? (crudo as PresetFecha) : null
  const punta = (v: string | null) => (fecha === 'elegir' && v && FECHA.test(v) ? v : null)
  return {
    ...FILTRO_VACIO,
    proyectos:  lista(params.get('proyecto')),
    categorias: lista(params.get('tipo')),
    fecha,
    desde:      punta(params.get('desde')),
    hasta:      punta(params.get('hasta')),
    estados:    lista(params.get('estado')).filter((e): e is FamiliaEstado => FAMILIAS.includes(e as FamiliaEstado)),
    empleados:  lista(params.get('empleado')),
  }
}

export function escribirFiltro(f: Filtro): string {
  const p = new URLSearchParams()
  if (f.proyectos.length)  p.set('proyecto', f.proyectos.join(','))
  if (f.categorias.length) p.set('tipo', f.categorias.join(','))
  if (f.fecha)             p.set('fecha', f.fecha)
  if (f.fecha === 'elegir' && f.desde) p.set('desde', f.desde)
  if (f.fecha === 'elegir' && f.hasta) p.set('hasta', f.hasta)
  if (f.estados.length)    p.set('estado', f.estados.join(','))
  if (f.empleados.length)  p.set('empleado', f.empleados.join(','))
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Saca lo que ya no existe —un proyecto borrado, una categoría que la persona
 * ya no tiene, un empleado que no le toca ver—. Sin esto, un enlace viejo
 * dejaría la lista vacía sin que se entienda por qué.
 */
export function depurarFiltro(
  f: Filtro,
  validos: { proyectos: string[]; categorias: string[]; empleados: string[] },
): Filtro {
  return {
    ...f,
    proyectos:  f.proyectos.filter(p => p === SIN_PROYECTO || validos.proyectos.includes(p)),
    categorias: f.categorias.filter(c => validos.categorias.includes(c)),
    empleados:  f.empleados.filter(e => validos.empleados.includes(e)),
  }
}

/** Del `searchParams` que recibe una página de servidor a URLSearchParams. */
export function paramsDePagina(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const p = new URLSearchParams()
  for (const [clave, valor] of Object.entries(sp)) {
    if (typeof valor === 'string') p.set(clave, valor)
    else if (Array.isArray(valor) && valor.length) p.set(clave, valor[valor.length - 1])
  }
  return p
}
