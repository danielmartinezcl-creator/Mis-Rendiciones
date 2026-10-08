// El filtro de «Rendiciones» del admin: qué documento entra.
//
// Siete dimensiones, cuatro a la vista y tres en «Más filtros». Corre en el
// navegador, sobre lo que la pantalla ya cargó.
//
// **La fecha es la de ENVÍO**, no la del gasto. Es al revés que en el filtro
// del empleado y es correcto: una rendición enviada el 2 de septiembre puede
// traer gastos de agosto, y acá se pregunta por cuándo llegó a revisión. Por
// eso el chip se llama «Fecha de envío» y nunca «Fecha» a secas.
//
// Spec: docs/superpowers/specs/2026-10-08-filtros-del-admin-design.md

import { rangoDeFecha, SIN_PROYECTO } from '@/lib/filtro-documentos'
import type { Dimension, Opcion, Valores } from '@/lib/filtros/dimensiones'

/** Lo que el filtro necesita de una rendición. No es la fila entera. */
export interface RendicionAdmin {
  id:            string
  status:        string
  /** `YYYY-MM-DD` o el ISO completo. null en un borrador sin enviar. */
  submittedAt:   string | null
  empleadoId:    string
  departamento:  string | null
  /** null en toda carga histórica. */
  proyectoId:    string | null
  contabilizada: boolean
  reembolsada:   boolean
}

export const ESTADOS_RENDICION: Opcion[] = [
  { id: 'submitted',          etiqueta: 'En revisión' },
  { id: 'pending_l2',         etiqueta: 'Revisión N2' },
  { id: 'approved',           etiqueta: 'Aprobada' },
  { id: 'partially_approved', etiqueta: 'Aprobada parcial' },
  { id: 'rejected',           etiqueta: 'Rechazada' },
  { id: 'pending_bank_load',  etiqueta: 'En banco (carga)' },
  { id: 'pending_bank_auth',  etiqueta: 'En banco (auth)' },
  { id: 'reimbursed',         etiqueta: 'Reembolsada' },
]

/**
 * Las dimensiones de esta pantalla. **El chip de Proyecto no existe si el
 * catálogo está vacío**: su única opción sería «Sin proyecto», que ocupa lugar
 * y no filtra nada. Aparece solo cuando alguien rinda a una obra.
 */
export function dimensionesDeRendiciones(opciones: {
  empleados:     Opcion[]
  departamentos: string[]
  proyectos:     Opcion[]
}): Dimension[] {
  const dims: Dimension[] = [
    { clave: 'empleados', nombre: 'Empleado', plural: 'empleados', destacada: true, tipo: 'multi',
      opciones: opciones.empleados, buscador: true, marcadorBusqueda: 'Buscar empleado' },
    { clave: 'estados', nombre: 'Estado', plural: 'estados', destacada: true, tipo: 'multi',
      opciones: ESTADOS_RENDICION },
    { clave: 'fecha', nombre: 'Fecha de envío', destacada: true, tipo: 'fecha' },
  ]

  if (opciones.proyectos.length > 0) {
    dims.push({
      clave: 'proyectos', nombre: 'Proyecto', plural: 'proyectos', destacada: true, tipo: 'multi',
      // «Sin proyecto» primero: es lo que tiene toda carga histórica, y pedirlo
      // es tan legítimo como pedir una obra.
      opciones: [{ id: SIN_PROYECTO, etiqueta: 'Sin proyecto' }, ...opciones.proyectos],
      buscador: true, marcadorBusqueda: 'Buscar por número o nombre',
    })
  }

  dims.push(
    { clave: 'departamento', nombre: 'Departamento', destacada: false, tipo: 'unico',
      opciones: opciones.departamentos.map(d => ({ id: d, etiqueta: d })) },
    { clave: 'reembolso', nombre: 'Reembolso', destacada: false, tipo: 'unico',
      opciones: [
        { id: 'pendiente',   etiqueta: 'Pendiente de reembolso' },
        { id: 'reembolsada', etiqueta: 'Reembolsadas' },
      ] },
    { clave: 'contabilizacion', nombre: 'Contabilización', destacada: false, tipo: 'unico',
      opciones: [
        { id: 'sin',           etiqueta: 'Sin contabilizar' },
        { id: 'contabilizada', etiqueta: 'Contabilizadas' },
      ] },
  )

  return dims
}

const multi = (v: Valores, clave: string): string[] => {
  const x = v[clave]
  return x !== undefined && x.tipo === 'multi' ? x.ids : []
}

const unico = (v: Valores, clave: string): string | null => {
  const x = v[clave]
  return x !== undefined && x.tipo === 'unico' ? x.id : null
}

export function aplicarFiltroRendiciones(
  filas: RendicionAdmin[],
  valores: Valores,
  hoy: string,
): RendicionAdmin[] {
  const empleados   = multi(valores, 'empleados')
  const estados     = multi(valores, 'estados')
  const proyectos   = multi(valores, 'proyectos')
  const depto       = unico(valores, 'departamento')
  const reembolso   = unico(valores, 'reembolso')
  const contabiliza = unico(valores, 'contabilizacion')

  const f = valores.fecha
  const rango = f !== undefined && f.tipo === 'fecha'
    ? rangoDeFecha({ fecha: f.preset, desde: f.desde, hasta: f.hasta }, hoy)
    : { desde: null, hasta: null }
  const hayFecha = rango.desde !== null || rango.hasta !== null

  return filas.filter(r => {
    if (empleados.length && !empleados.includes(r.empleadoId)) return false
    if (estados.length   && !estados.includes(r.status))       return false

    if (proyectos.length) {
      const suyo = r.proyectoId ?? SIN_PROYECTO
      if (!proyectos.includes(suyo)) return false
    }

    if (depto !== null && r.departamento !== depto) return false

    if (reembolso === 'pendiente'   && r.reembolsada)  return false
    if (reembolso === 'reembolsada' && !r.reembolsada) return false

    if (contabiliza === 'sin'           && r.contabilizada)  return false
    if (contabiliza === 'contabilizada' && !r.contabilizada) return false

    if (hayFecha) {
      /* Un borrador no tiene fecha de envío, así que queda fuera de cualquier
         rango. Hasta el 2026-10-08 pasaba cualquiera, porque la condición se
         salteaba al no haber fecha: si se pregunta por lo enviado en agosto,
         algo que nunca se envió no es una respuesta. */
      if (!r.submittedAt) return false
      const dia = r.submittedAt.slice(0, 10)
      if (rango.desde && dia < rango.desde) return false
      if (rango.hasta && dia > rango.hasta) return false
    }

    return true
  })
}
