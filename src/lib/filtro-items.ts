// El filtro de «Informes»: doce dimensiones sobre los ítems ya cargados.
//
// **Corre en el navegador.** El servidor trae un período y nada más: de las
// doce, once solo DESCARTAN de lo traído, así que resolverlas allá obliga a un
// viaje por cada clic y no ahorra una sola fila. La única que decide *cuántas*
// filas viajan es el alcance, que es un control aparte.
//
// La fecha acá es la del GASTO —no la del documento, como en «Rendiciones» del
// admin—: por eso el chip se llama «Fecha del gasto».
//
// Spec: docs/superpowers/specs/2026-10-08-filtros-del-admin-design.md

import { rangoDeFecha, SIN_PROYECTO } from '@/lib/filtro-documentos'
import type { UnifiedReportItem } from '@/lib/report-helpers'
import type { Dimension, Opcion, Valores } from '@/lib/filtros/dimensiones'

export const MOVIMIENTOS: Opcion[] = [
  { id: 'expense',  etiqueta: 'Gastos' },
  { id: 'advance',  etiqueta: 'Adelantos' },
  { id: 'return',   etiqueta: 'Devoluciones' },
  { id: 'transfer', etiqueta: 'Traspasos' },
]

export const ESTADOS_ITEM: Opcion[] = [
  { id: 'pending',  etiqueta: 'Pendiente' },
  { id: 'approved', etiqueta: 'Aprobado' },
  { id: 'rejected', etiqueta: 'Rechazado' },
]

export const ESTADOS_INFORME: Opcion[] = [
  { id: 'submitted',          etiqueta: 'En revisión' },
  { id: 'pending_l2',         etiqueta: 'Revisión N2' },
  { id: 'approved',           etiqueta: 'Aprobada' },
  { id: 'partially_approved', etiqueta: 'Aprobada parcial' },
  { id: 'rejected',           etiqueta: 'Rechazada' },
  { id: 'pending_bank_load',  etiqueta: 'En banco (carga)' },
  { id: 'pending_bank_auth',  etiqueta: 'En banco (auth)' },
  { id: 'reimbursed',         etiqueta: 'Reembolsada' },
  { id: 'settled',            etiqueta: 'Liquidado' },
  { id: 'funds_sent',         etiqueta: 'Fondos enviados' },
]

export function dimensionesDeInformes(opciones: {
  empleados:     Opcion[]
  categorias:    Opcion[]
  departamentos: string[]
  proyectos:     Opcion[]
}): Dimension[] {
  const destacadas: Dimension[] = [
    { clave: 'periodo', nombre: 'Fecha del gasto', destacada: true, tipo: 'fecha' },
  ]

  /* Con el catálogo vacío el chip de Proyecto no se dibuja: su única opción
     sería «Sin proyecto». Y entonces «Estado del informe» NO sube a la barra —
     cuatro chips es el techo que esta barra aguanta sin volverse una lista. */
  if (opciones.proyectos.length > 0) {
    destacadas.push({
      clave: 'proyectos', nombre: 'Proyecto', plural: 'proyectos', destacada: true, tipo: 'multi',
      opciones: [{ id: SIN_PROYECTO, etiqueta: 'Sin proyecto' }, ...opciones.proyectos],
      buscador: true, marcadorBusqueda: 'Buscar por número o nombre',
    })
  }

  destacadas.push(
    { clave: 'empleados', nombre: 'Empleado', plural: 'empleados', destacada: true, tipo: 'multi',
      opciones: opciones.empleados, buscador: true, marcadorBusqueda: 'Buscar empleado' },
    { clave: 'categorias', nombre: 'Tipo de gasto', plural: 'tipos de gasto', destacada: true, tipo: 'multi',
      opciones: opciones.categorias },
  )

  return [
    ...destacadas,
    { clave: 'estadoInforme', nombre: 'Estado del informe', plural: 'estados', destacada: false, tipo: 'multi',
      opciones: ESTADOS_INFORME },
    { clave: 'fuente', nombre: 'Fuente', plural: 'fuentes', destacada: false, tipo: 'multi',
      opciones: [
        { id: 'rendicion',  etiqueta: 'Rendiciones' },
        { id: 'caja_chica', etiqueta: 'Caja chica' },
      ] },
    { clave: 'datos', nombre: 'Datos', destacada: false, tipo: 'unico',
      opciones: [
        { id: 'nuevos',     etiqueta: 'Solo los nuevos' },
        { id: 'historicos', etiqueta: 'Solo la carga histórica' },
      ] },
    { clave: 'departamento', nombre: 'Departamento', destacada: false, tipo: 'unico',
      opciones: opciones.departamentos.map(d => ({ id: d, etiqueta: d })) },
    { clave: 'movimiento', nombre: 'Movimiento', plural: 'movimientos', destacada: false, tipo: 'multi',
      opciones: MOVIMIENTOS },
    { clave: 'estadoItem', nombre: 'Estado del ítem', plural: 'estados', destacada: false, tipo: 'multi',
      opciones: ESTADOS_ITEM },
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
  ]
}

const multi = (v: Valores, clave: string): string[] => {
  const x = v[clave]
  return x !== undefined && x.tipo === 'multi' ? x.ids : []
}

const unico = (v: Valores, clave: string): string | null => {
  const x = v[clave]
  return x !== undefined && x.tipo === 'unico' ? x.id : null
}

export function aplicarFiltroItems(
  items: UnifiedReportItem[],
  valores: Valores,
  hoy: string,
): UnifiedReportItem[] {
  const empleados     = multi(valores, 'empleados')
  const categorias    = multi(valores, 'categorias')
  const proyectos     = multi(valores, 'proyectos')
  const estadoInforme = multi(valores, 'estadoInforme')
  const estadoItem    = multi(valores, 'estadoItem')
  const movimiento    = multi(valores, 'movimiento')
  const fuente        = multi(valores, 'fuente')
  const datos         = unico(valores, 'datos')
  const depto         = unico(valores, 'departamento')
  const reembolso     = unico(valores, 'reembolso')
  const contabiliza   = unico(valores, 'contabilizacion')

  const f = valores.periodo
  const rango = f !== undefined && f.tipo === 'fecha'
    ? rangoDeFecha({ fecha: f.preset, desde: f.desde, hasta: f.hasta }, hoy)
    : { desde: null, hasta: null }

  return items.filter(i => {
    if (empleados.length     && !empleados.includes(i.employee_id))       return false
    if (categorias.length    && !categorias.includes(i.category_id ?? '')) return false
    if (estadoInforme.length && !estadoInforme.includes(i.parent_status)) return false
    if (estadoItem.length    && !estadoItem.includes(i.item_status))      return false
    if (movimiento.length    && !movimiento.includes(i.item_type))        return false

    /* `fuente` y `datos` salen las dos del mismo `source` pero son cosas
       distintas, y se cumplen A LA VEZ: «caja chica histórica» es la
       intersección, no la unión. */
    if (fuente.length) {
      const suya = i.source.startsWith('rendicion') ? 'rendicion' : 'caja_chica'
      if (!fuente.includes(suya)) return false
    }
    if (datos === 'nuevos'     && !i.source.endsWith('_new'))  return false
    if (datos === 'historicos' && !i.source.endsWith('_hist')) return false

    if (proyectos.length && !proyectos.includes(i.proyecto_id ?? SIN_PROYECTO)) return false
    if (depto !== null && i.department !== depto) return false

    if (reembolso === 'pendiente'   &&  i.reimbursed_at) return false
    if (reembolso === 'reembolsada' && !i.reimbursed_at) return false

    if (contabiliza === 'sin'           &&  i.defontana_exported_at) return false
    if (contabiliza === 'contabilizada' && !i.defontana_exported_at) return false

    if (rango.desde && i.date < rango.desde) return false
    if (rango.hasta && i.date > rango.hasta) return false

    return true
  })
}
