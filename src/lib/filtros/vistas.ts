// Las vistas guardadas: combinaciones de filtros con nombre, por pantalla.
//
// Son de la ORGANIZACIÓN y no de cada persona (decisión de Daniel,
// 2026-10-08): lo que se arma para exportar a Defontana le sirve a cualquiera
// que tenga que hacerlo. La tabla y su RLS, en la migración 040.
//
// Acá viven solo las reglas puras. Qué vistas existen lo decide cada pantalla.

import { normalizarNombre } from '@/lib/texto'
import {
  valorVacio,
  type Dimension, type ValorDimension, type Valores,
} from '@/lib/filtros/dimensiones'

export const LARGO_NOMBRE = 40

export interface Vista {
  id:         string
  nombre:     string
  filtro:     Valores
  orden:      number
  /** La sembró el sistema. No la protege —son de la empresa y la empresa las
   *  borra—: sirve para distinguirla en la auditoría. */
  de_fabrica: boolean
}

// ── Depurar ──────────────────────────────────────────────────────────────────

function depurarUno(d: Dimension, v: ValorDimension): ValorDimension {
  if (d.tipo === 'multi' && v.tipo === 'multi') {
    const existen = new Set(d.opciones.map(o => o.id))
    return { tipo: 'multi', ids: v.ids.filter(id => existen.has(id)) }
  }
  if (d.tipo === 'unico' && v.tipo === 'unico') {
    return { tipo: 'unico', id: d.opciones.some(o => o.id === v.id) ? v.id : null }
  }
  if (d.tipo === 'fecha' && v.tipo === 'fecha') return v
  if (d.tipo === 'texto' && v.tipo === 'texto') return v
  /* El tipo guardado no es el que la dimensión tiene hoy: la pantalla cambió de
     forma desde que se guardó la vista. Vale lo mismo que no traer nada. */
  return valorVacio(d)
}

/**
 * Lo que una vista guardada nombra y ya no existe se descarta **en silencio**:
 * un empleado que se fue, una categoría borrada, una clave de una versión
 * anterior de la pantalla. Romper la vista entera por un id viejo sería peor
 * que mostrarla de menos.
 *
 * Devuelve siempre las claves de `dimensiones`, ni una más: lo que no es
 * dimensión desaparece, y lo que la vista no traía queda sin poner.
 */
export function depurarVista(v: Valores, dimensiones: Dimension[]): Valores {
  return Object.fromEntries(dimensiones.map(d => {
    const actual = v[d.clave]
    return [d.clave, actual === undefined ? valorVacio(d) : depurarUno(d, actual)]
  }))
}

// ── Comparar ─────────────────────────────────────────────────────────────────

function iguales(x: ValorDimension, y: ValorDimension): boolean {
  if (x.tipo !== y.tipo) return false
  if (x.tipo === 'multi' && y.tipo === 'multi') {
    // El orden en que se marcaron las casillas no es parte de la vista.
    return x.ids.length === y.ids.length && x.ids.every(id => y.ids.includes(id))
  }
  if (x.tipo === 'unico' && y.tipo === 'unico') return x.id === y.id
  if (x.tipo === 'texto' && y.tipo === 'texto') return x.texto.trim() === y.texto.trim()
  if (x.tipo === 'fecha' && y.tipo === 'fecha') {
    return x.preset === y.preset && x.desde === y.desde && x.hasta === y.hasta
  }
  return false
}

/**
 * ¿Lo elegido es exactamente la vista? Decide si la pestaña sigue marcada o
 * aparece la línea «cambiaste X sobre la vista Y».
 *
 * Una clave ausente y una puesta en vacío son lo mismo: las dos significan «sin
 * poner», y el jsonb guardado puede traer cualquiera de las dos.
 */
export function coincideConVista(valores: Valores, vista: Valores, dimensiones: Dimension[]): boolean {
  return dimensiones.every(d =>
    iguales(valores[d.clave] ?? valorVacio(d), vista[d.clave] ?? valorVacio(d)))
}

// ── Nombrar ──────────────────────────────────────────────────────────────────

/**
 * Lo que impide guardar una vista con ese nombre.
 *
 * El repetido lo rechaza también la base, por el índice único, pero ahí el
 * error es ilegible y llega después de apretar el botón. Acá se compara como lo
 * lee una persona: sin distinguir mayúsculas, acentos ni espacios de más, para
 * que «Más de 5 días» y «Mas de 5 dias» no convivan como dos vistas distintas.
 *
 * `actual` es el nombre que la vista tiene hoy, al renombrarla: sin eso,
 * guardar sin cambiar el nombre chocaría consigo misma.
 */
export function erroresDeNombre(nombre: string, existentes: string[], actual?: string): string[] {
  const errores: string[] = []
  const n = nombre.trim()

  if (!n) {
    errores.push('Falta el nombre de la vista')
    return errores
  }
  if (n.length > LARGO_NOMBRE) {
    errores.push(`El nombre no puede pasar de ${LARGO_NOMBRE} caracteres`)
  }

  const plegado = normalizarNombre(n)
  const propio = actual === undefined ? null : normalizarNombre(actual)
  if (plegado !== propio && existentes.some(e => normalizarNombre(e) === plegado)) {
    errores.push(`Ya existe una vista que se llama «${n}»`)
  }

  return errores
}
