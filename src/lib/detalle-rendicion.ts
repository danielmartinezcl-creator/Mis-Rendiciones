import type { PasoRecorrido, EstadoPaso } from '@/lib/petty-cash-helpers'

/**
 * Las reglas de la página de detalle de una rendición (`/admin/reports/[id]`),
 * la que copia la estructura del detalle de un fondo de caja chica.
 *
 * El recorrido NO sale de `REPORT_STEPS`. Esa lista fija tiene un paso «Revisión
 * nivel 2» que la pantalla vieja marcaba como hecho en toda rendición que hubiera
 * pasado por él en la lista, la tuviera o no: «Rendición octubre» (2026-11) se
 * veía con dos niveles teniendo solo el N1. Acá el N2 aparece solo si la cadena
 * congelada lo tiene, o si el historial prueba que alguien firmó en ese nivel.
 */

export interface EntradaHistorial {
  action:     string
  level:      number | null
  created_at: string
}

export interface DatosRecorrido {
  status:      string
  createdAt:   string
  submittedAt: string | null
  reimbursedAt: string | null
  /** La cadena congelada trae N2. */
  cadenaConN2: boolean
  historial:   readonly EntradaHistorial[]
}

/** La última vez que pasó: tras una devolución para corregir, vale la vuelta nueva. */
function ultima(historial: readonly EntradaHistorial[], cumple: (e: EntradaHistorial) => boolean): string | null {
  const hechas = historial.filter(cumple)
  return hechas.length ? hechas[hechas.length - 1].created_at : null
}

const esAprobacion = (e: EntradaHistorial) => e.action === 'approved' || e.action === 'partially_approved'

export function construirRecorridoRendicion(d: DatosRecorrido): PasoRecorrido[] {
  const conN2 = d.cadenaConN2 || d.historial.some(e => esAprobacion(e) && e.level === 2)
  const rechazada = d.status === 'rejected'
  // Aprobada sin nada que pagar (o carga histórica): el recorrido termina en la aprobación
  const sinBanco = rechazada || d.status === 'approved' || d.status === 'partially_approved'

  type Def = { key: string; label: string; fecha: string | null }
  const pasos: Def[] = [
    { key: 'draft',     label: 'Borrador creado',    fecha: d.createdAt },
    { key: 'submitted', label: 'Enviada a revisión', fecha: d.submittedAt },
    {
      key: 'n1',
      label: conN2 ? 'Aprobada · nivel 1' : 'Aprobada',
      fecha: ultima(d.historial, e => esAprobacion(e) && (e.level ?? 1) === 1),
    },
  ]
  if (conN2) {
    pasos.push({ key: 'n2', label: 'Aprobada · nivel 2', fecha: ultima(d.historial, e => esAprobacion(e) && e.level === 2) })
  }
  if (!sinBanco) {
    pasos.push(
      { key: 'carga',        label: 'Carga en banco',        fecha: ultima(d.historial, e => e.action === 'bank_load_confirmed') },
      { key: 'autorizacion', label: 'Autorización bancaria', fecha: ultima(d.historial, e => e.action === 'bank_authorized') },
      { key: 'reembolsada',  label: 'Reembolsada',           fecha: d.reimbursedAt },
    )
  }

  // El paso que se está esperando. -1: no espera nada, todo quedó hecho.
  const indice = (key: string) => pasos.findIndex(p => p.key === key)
  let actual: number
  switch (d.status) {
    case 'draft':             actual = indice('draft'); break
    case 'submitted':         actual = indice('n1'); break
    case 'pending_l2':        actual = indice('n2'); break
    case 'pending_bank_load': actual = indice('carga'); break
    case 'pending_bank_auth': actual = indice('autorizacion'); break
    case 'rejected': {
      // Se rechaza en un nivel de decisión: ese paso pasa a decir «Rechazada» y ahí termina
      const enN2 = conN2 && d.historial.some(e => e.action === 'rejected' && e.level === 2)
      actual = indice(enN2 ? 'n2' : 'n1')
      pasos[actual] = { ...pasos[actual], label: 'Rechazada', fecha: ultima(d.historial, e => e.action === 'rejected') }
      pasos.splice(actual + 1)
      break
    }
    default:                  actual = -1
  }

  return pasos.map((p, i) => {
    const estado: EstadoPaso =
      actual === -1 ? 'hecho'     :
      i < actual    ? 'hecho'     :
      i === actual  ? 'actual'    :
                      'pendiente'
    // Lo que se espera todavía no ocurrió: ni el paso actual ni uno futuro llevan la
    // fecha de una vuelta anterior. Salvo el borrador, que existe desde que se creó,
    // y el rechazo, que ES el hecho que cierra el recorrido.
    const fecha =
      estado === 'pendiente' ? null :
      estado === 'actual' && p.key !== 'draft' && p.label !== 'Rechazada' ? null :
      p.fecha
    return { key: p.key, label: p.label, estado, fecha }
  })
}

export interface GastoConCategoria {
  id:          string
  item_type:   string | null
  category_id: string | null
}

/**
 * Los gastos que no tienen categoría. Solo los GASTOS: un adelanto, una
 * devolución o un traspaso no se imputan a una cuenta de gasto, así que no
 * llevan categoría y avisar por ellos sería un falso positivo.
 */
export function gastosSinCategoria<T extends GastoConCategoria>(items: readonly T[]): T[] {
  return items.filter(i => (i.item_type === null || i.item_type === 'expense') && !i.category_id)
}

/** Lo que dice cada entrada del historial de aprobaciones, sin el nombre de quien la dio. */
export function etiquetaDeHistorial(action: string, level: number | null): string {
  const n2 = level === 2
  switch (action) {
    case 'approved':            return n2 ? 'Aprobada · nivel 2' : 'Aprobada · nivel 1'
    case 'partially_approved':  return n2 ? 'Aprobada en parte · nivel 2' : 'Aprobada en parte · nivel 1'
    case 'rejected':            return n2 ? 'Rechazada · nivel 2' : 'Rechazada'
    case 'returned_to_draft':   return 'Devuelta para corregir'
    case 'bank_load_requested': return 'Proceso bancario iniciado'
    case 'bank_load_confirmed': return 'Carga bancaria confirmada'
    case 'bank_authorized':     return 'Transferencia autorizada'
    default:                    return action
  }
}
