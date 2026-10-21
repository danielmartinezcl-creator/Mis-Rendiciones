/**
 * «Ya tenés uno con este nombre» — el aviso al crear un fondo o una rendición.
 *
 * Pedido de Daniel el 2026-10-21: «hay personas que solicitan fondos siempre por
 * la misma razón, entonces seguramente se repetirán nombres».
 *
 * **Avisa, nunca bloquea**, y la distinción no es cosmética: repetir un nombre
 * es legítimo y ya es la norma. Medido ese día en producción: **16 nombres
 * repetidos sobre 156 documentos**, y «CAJA CHICA N°18 FD» aparece tres veces.
 * Una restricción de unicidad rompería las cargas históricas —que parten un
 * mismo fondo en varios documentos— y los fondos mensuales que se llaman igual
 * todos los meses. Nada interno depende del nombre: todo se referencia por `id`
 * y la carga histórica agrupa por `fund_number`.
 *
 * Lo que el aviso evita es que una PERSONA se equivoque de documento al verlo en
 * una lista: al vincular un traspaso, en la bandeja de aprobaciones o entre dos
 * archivos de Defontana que se llaman casi igual.
 */

import { normalizarNombre } from '@/lib/texto'

export type ClaseDocumento = 'fondo' | 'rendicion'

/**
 * Los estados en que un documento ya terminó su camino.
 *
 * Solo se avisa por los que siguen EN CURSO. Avisar por uno ya cerrado sería
 * ruido garantizado: el caso típico —un fondo mensual que se llama igual todos
 * los meses— dispararía el aviso siempre, y un aviso que salta siempre se
 * aprende a ignorar, incluso cuando dice algo.
 */
const CERRADOS: Record<ClaseDocumento, readonly string[]> = {
  fondo:     ['settled', 'rejected'],
  rendicion: ['reimbursed', 'rejected'],
}

export function enCurso(clase: ClaseDocumento, estado: string): boolean {
  return !CERRADOS[clase].includes(estado)
}

/** ¿Es el mismo nombre? Se compara normalizado —sin tildes, sin mayúsculas, sin
 *  espacios de más— porque lo escribe una persona y «Caja Chica Obra Norte» y
 *  «caja chica obra  norte» son el mismo nombre para cualquiera menos para un
 *  `=`. Es la misma función que usan la nómina y las vistas de filtro. */
export function mismoNombre(a: string, b: string): boolean {
  const x = normalizarNombre(a)
  return x.length > 0 && x === normalizarNombre(b)
}

export interface Coincidencia {
  id:     string
  nombre: string
  /** `created_at` del documento, en ISO. */
  desde:  string
  estado: string
}

/**
 * El texto del aviso, o null si no hay nada que avisar.
 *
 * Vive acá y no en el componente para que las dos pantallas que lo muestran
 * —fondo nuevo y rendición nueva— digan lo mismo.
 */
export function textoDeAviso(clase: ClaseDocumento, coincidencias: Coincidencia[]): string | null {
  if (!coincidencias.length) return null

  const sustantivo = clase === 'fondo' ? 'fondo' : 'rendición'
  const plural     = clase === 'fondo' ? 'fondos' : 'rendiciones'

  if (coincidencias.length > 1) {
    return `Ya tenés ${coincidencias.length} ${plural} sin cerrar con este nombre.`
  }

  const fecha = new Date(coincidencias[0].desde).toLocaleDateString('es-CL', {
    day: 'numeric', month: 'long',
  })
  const articulo = clase === 'fondo' ? 'un' : 'una'
  return `Ya tenés ${articulo} ${sustantivo} sin cerrar con este nombre, del ${fecha}.`
}
