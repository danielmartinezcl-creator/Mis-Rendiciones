// El filtro de la nómina.
//
// Hasta el 2026-10-08 esta pantalla tenía un solo campo de texto. Con 57
// personas, «mostrame solo los activos» y «a quién le faltan los datos del
// banco» son preguntas que un buscador no sabe contestar.
//
// Spec: docs/superpowers/specs/2026-10-08-filtros-del-admin-design.md

import { sinTildes } from '@/lib/texto'
import type { EstadoCuenta } from '@/lib/alta-repetida'
import type { Dimension, Valores } from '@/lib/filtros/dimensiones'

/** Lo que el filtro necesita de una persona. No es la ficha entera. */
export interface EmpleadoFiltrable {
  id:            string
  nombre:        string
  correo:        string
  rut:           string | null
  departamento:  string | null
  estado:        EstadoCuenta
  banco:         string | null
  numeroCuenta:  string | null
}

/**
 * Las cuatro dimensiones. Ninguna escondida: con cuatro no hay «Más filtros»
 * que justificar.
 *
 * **El estado NO ofrece «en la papelera»**: la lista no la trae
 * (`getOrgEmployees` filtra `deleted_at`), y un filtro cuya respuesta siempre
 * es cero enseña a desconfiar del filtro. Esa gente vive en Papelera.
 */
export function dimensionesDeEmpleados(departamentos: string[]): Dimension[] {
  return [
    { clave: 'busca', nombre: 'Buscar', destacada: true, tipo: 'texto',
      marcador: 'Nombre, correo, RUT o departamento…' },
    { clave: 'estado', nombre: 'Estado', destacada: true, tipo: 'unico',
      opciones: [
        { id: 'activa',    etiqueta: 'Activos' },
        { id: 'inactiva',  etiqueta: 'Desactivados' },
        { id: 'bloqueada', etiqueta: 'Bloqueados' },
      ] },
    { clave: 'departamento', nombre: 'Departamento', destacada: true, tipo: 'unico',
      opciones: departamentos.map(d => ({ id: d, etiqueta: d })) },
    /* Una dimensión de respuestas ya cocinadas, no un campo de la ficha: «le
       faltan los datos del banco» es un predicado sobre dos columnas, y sin
       esto la vista «Sin datos bancarios» no se podría guardar. */
    { clave: 'banco', nombre: 'Datos bancarios', destacada: true, tipo: 'unico',
      opciones: [
        { id: 'faltan',    etiqueta: 'Les faltan' },
        { id: 'completos', etiqueta: 'Completos' },
      ] },
  ]
}

/** Sin banco o sin número de cuenta: con uno de los dos no se puede pagar. */
export function faltanDatosBancarios(e: EmpleadoFiltrable): boolean {
  return !e.banco?.trim() || !e.numeroCuenta?.trim()
}

const unico = (v: Valores, clave: string): string | null => {
  const x = v[clave]
  return x !== undefined && x.tipo === 'unico' ? x.id : null
}

export function aplicarFiltroEmpleados(
  gente: EmpleadoFiltrable[],
  valores: Valores,
): EmpleadoFiltrable[] {
  const t = valores.busca
  const q = t !== undefined && t.tipo === 'texto' ? sinTildes(t.texto.trim()) : ''
  const estado = unico(valores, 'estado')
  const depto  = unico(valores, 'departamento')
  const banco  = unico(valores, 'banco')

  return gente.filter(e => {
    if (estado !== null && e.estado !== estado) return false
    if (depto  !== null && e.departamento !== depto) return false
    if (banco === 'faltan'    && !faltanDatosBancarios(e)) return false
    if (banco === 'completos' &&  faltanDatosBancarios(e)) return false

    if (q) {
      // Los mismos cuatro campos de siempre: nombre, correo, RUT y departamento.
      const campos = [e.nombre, e.correo, e.rut ?? '', e.departamento ?? '']
      if (!campos.some(c => sinTildes(String(c)).includes(q))) return false
    }

    return true
  })
}
