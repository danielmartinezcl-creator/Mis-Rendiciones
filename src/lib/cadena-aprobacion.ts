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
