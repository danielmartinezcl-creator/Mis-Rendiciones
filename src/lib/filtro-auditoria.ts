// El filtro de la bitácora.
//
// **Es el único que sigue resolviéndose en el SERVIDOR**, y a propósito: la
// bitácora crece sin techo —una fila por cada cosa que pasa en la app— y se
// pagina de a 50. Traerla entera al navegador para filtrarla ahí sería traer
// justo lo que no se va a mirar.
//
// Acá viven las dimensiones y la traducción de lo elegido a la consulta.
//
// Spec: docs/superpowers/specs/2026-10-08-filtros-del-admin-design.md

import { rangoDeFecha } from '@/lib/filtro-documentos'
import type { Dimension, Opcion, Valores } from '@/lib/filtros/dimensiones'

/** Los nombres crudos de la base, en castellano. El desplegable mostraba
 *  `expense_report` y `config_changed` tal cual. */
export const ENTIDADES: Opcion[] = [
  { id: 'user',                        etiqueta: 'Empleado' },
  { id: 'expense_report',              etiqueta: 'Rendición' },
  { id: 'expense_item',                etiqueta: 'Gasto' },
  { id: 'petty_cash_fund',             etiqueta: 'Fondo de caja chica' },
  { id: 'petty_cash_item',             etiqueta: 'Gasto de caja chica' },
  { id: 'category',                    etiqueta: 'Categoría' },
  { id: 'cost_center',                 etiqueta: 'Centro de costo' },
  { id: 'cost_center_assignment',      etiqueta: 'Asignación de centro de costo' },
  { id: 'approver_assignment',         etiqueta: 'Cadena de aprobación' },
  { id: 'vista_filtro',                etiqueta: 'Vista de filtro' },
  { id: 'policy',                      etiqueta: 'Política de gasto' },
  { id: 'travel_policy',               etiqueta: 'Política de viáticos' },
  { id: 'defontana_settings',          etiqueta: 'Configuración Defontana' },
  { id: 'defontana_supplier',          etiqueta: 'Proveedor Defontana' },
  { id: 'defontana_export',            etiqueta: 'Exportación Defontana' },
  { id: 'defontana_export_petty_cash', etiqueta: 'Exportación Defontana (caja chica)' },
  { id: 'webhook',                     etiqueta: 'Webhook' },
]

export const ACCIONES: Opcion[] = [
  { id: 'created',             etiqueta: 'Creado' },
  { id: 'updated',             etiqueta: 'Modificado' },
  { id: 'bulk_updated',        etiqueta: 'Modificado en lote' },
  { id: 'config_changed',      etiqueta: 'Configuración cambiada' },
  { id: 'deleted',             etiqueta: 'Eliminado' },
  { id: 'permanently_deleted', etiqueta: 'Eliminado definitivamente' },
  { id: 'restored',            etiqueta: 'Restaurado' },
  { id: 'submitted',           etiqueta: 'Enviado' },
  { id: 'approved',            etiqueta: 'Aprobado' },
  { id: 'rejected',            etiqueta: 'Rechazado' },
  { id: 'exported',            etiqueta: 'Exportado' },
  { id: 'reverted',            etiqueta: 'Revertido' },
]

/**
 * Cuatro dimensiones y **ninguna escondida**: con cuatro no hay «Más filtros»
 * que justificar.
 */
export function dimensionesDeAuditoria(): Dimension[] {
  return [
    { clave: 'busca', nombre: 'Buscar', destacada: true, tipo: 'texto',
      marcador: 'Actor, entidad o notas…' },
    { clave: 'fecha', nombre: 'Fecha', destacada: true, tipo: 'fecha' },
    { clave: 'entidad', nombre: 'Qué', plural: 'tipos', destacada: true, tipo: 'multi',
      opciones: ENTIDADES, buscador: true, marcadorBusqueda: 'Buscar tipo' },
    { clave: 'accion', nombre: 'Acción', plural: 'acciones', destacada: true, tipo: 'multi',
      opciones: ACCIONES, buscador: true, marcadorBusqueda: 'Buscar acción' },
  ]
}

export interface ConsultaAuditoria {
  search?:     string
  entityType?: string[]
  action?:     string[]
  from?:       string
  to?:         string
}

/**
 * Lo elegido, traducido a la consulta. Lo que está sin poner no viaja: una
 * lista vacía o un texto en blanco se omiten, para que la consulta no lleve
 * condiciones que no filtran nada.
 */
export function consultaDeAuditoria(valores: Valores, hoy: string): ConsultaAuditoria {
  const q: ConsultaAuditoria = {}

  const busca = valores.busca
  if (busca !== undefined && busca.tipo === 'texto' && busca.texto.trim()) {
    q.search = busca.texto.trim()
  }

  const entidad = valores.entidad
  if (entidad !== undefined && entidad.tipo === 'multi' && entidad.ids.length) {
    q.entityType = entidad.ids
  }

  const accion = valores.accion
  if (accion !== undefined && accion.tipo === 'multi' && accion.ids.length) {
    q.action = accion.ids
  }

  const f = valores.fecha
  if (f !== undefined && f.tipo === 'fecha' && f.preset !== null) {
    const r = rangoDeFecha({ fecha: f.preset, desde: f.desde, hasta: f.hasta }, hoy)
    if (r.desde) q.from = r.desde
    if (r.hasta) q.to = r.hasta
  }

  return q
}
