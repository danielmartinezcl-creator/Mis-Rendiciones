// Las reglas de la cadena de aprobación, en un solo lugar: las usan
// setEmployeeApprovalChain (de a una persona) y la planilla de alta (en lote).
// Si la planilla las copiara, pasarían a existir en dos sitios y el día que
// cambien se desincronizarían.
//
// Módulo común, SIN 'use server'.

import { validarCadena, type Persona } from '@/lib/permisos'

export type Cadena = {
  l1: string | null; l2: string | null
  suplenteL1: string | null
  suplenteDesde: string | null; suplenteHasta: string | null
}

export function erroresDeCadena(
  empleadoId: string, cadena: Cadena, personas: Persona[],
): string[] {
  const errores = validarCadena(
    empleadoId,
    { l1: cadena.l1, l2: cadena.l2, suplenteL1: cadena.suplenteL1 },
    personas,
  )
  if (cadena.suplenteL1 && (!cadena.suplenteDesde || !cadena.suplenteHasta)) {
    errores.push('El suplente necesita fecha de inicio y de término')
  }
  if (cadena.suplenteDesde && cadena.suplenteHasta
      && cadena.suplenteDesde > cadena.suplenteHasta) {
    errores.push('La fecha de término del suplente es anterior a la de inicio')
  }
  return errores
}

// Sin suplente no hay período: las fechas se anulan aunque vengan, para que no
// quede un rango colgando de un suplente que ya no está.
export function camposDeCadena(cadena: Cadena) {
  return {
    approver_l1_id:        cadena.l1,
    approver_l2_id:        cadena.l2,
    approver_l1_backup_id: cadena.suplenteL1,
    backup_active_from:    cadena.suplenteL1 ? cadena.suplenteDesde : null,
    backup_active_until:   cadena.suplenteL1 ? cadena.suplenteHasta : null,
  }
}

/**
 * Mantiene coherentes «jefe de proyecto» y «puede aprobar».
 *
 * - Marcar jefe de proyecto otorga «puede aprobar»: `validarCadena` lo exige
 *   para estar en una cadena, así que sin eso quedaría en la lista que ve el
 *   empleado al rendir a una obra, pero sin poder aprobar nada.
 * - Quitar «puede aprobar» saca de la lista de jefes de proyecto, por lo mismo.
 * - Si llegan contradictorias, gana la restrictiva.
 *
 * Hasta el 2026-10-07 esto lo garantizaba solo la pantalla, que mandaba las dos
 * marcas juntas; una llamada directa a la acción podía dejarlas desalineadas.
 */
export function coherenciaJefeProyecto<T extends { es_jefe_proyecto?: boolean; can_approve?: boolean }>(
  cambios: T,
): T {
  if (cambios.can_approve === false) return { ...cambios, es_jefe_proyecto: false }
  if (cambios.es_jefe_proyecto === true) return { ...cambios, can_approve: true }
  return cambios
}
