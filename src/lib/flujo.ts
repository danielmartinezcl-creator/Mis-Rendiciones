// Qué estado sigue a cada decisión. Spec §2.
// La aprobación final lleva directo a la carga bancaria (D4): el paso
// «Iniciar proceso bancario» no tenía a nadie a quien avisarle y sobraba.
import type { ReportStatus } from '@/lib/constants'

export type ResultadoDecision = 'approved' | 'partially_approved' | 'rejected'

export function estadoTrasDecisionReporte(p: {
  nivel:       1 | 2
  tieneL2:     boolean
  resultado:   ResultadoDecision
  montoAPagar: number
}): ReportStatus {
  if (p.resultado === 'rejected') return 'rejected'
  // Con N2, la última palabra es del N2, también si el N1 aprobó solo una parte
  if (p.nivel === 1 && p.tieneL2) return 'pending_l2'
  return p.montoAPagar > 0 ? 'pending_bank_load' : p.resultado
}

export function estadoTrasAprobacionFondo(p: { nivel: 1 | 2; tieneL2: boolean }): 'pending_approval_l2' | 'pending_bank_load' {
  return p.nivel === 1 && p.tieneL2 ? 'pending_approval_l2' : 'pending_bank_load'
}

export function estadoTrasLiquidacion(p: { nivel: 1 | 2; tieneL2: boolean }): 'pending_liquidation_l2' | 'settled' {
  return p.nivel === 1 && p.tieneL2 ? 'pending_liquidation_l2' : 'settled'
}

/**
 * A dónde vuelve un documento que se devuelve para corregir.
 *
 * **No siempre es «borrador», y confundirlo sería grave.** Un fondo que todavía
 * espera aprobación vuelve a `draft`: no se entregó nada y quien lo pidió puede
 * rehacerlo entero. Pero una LIQUIDACIÓN que se devuelve vuelve a `funds_sent`,
 * porque la plata ya está en manos del empleado: mandarla a `draft` diría que el
 * fondo nunca se entregó, y perdería el paso bancario que sí ocurrió.
 *
 * Nace de lo que mostró el uso real (2026-10-21): de los tres rechazos de ese
 * día, los tres eran «corregí y volvé a mandar» —«especificar epp», «Monto se
 * fusionó con otra caja chica», «Se amplió el presupuesto»—. Como un rechazo es
 * terminal, el empleado creaba un fondo nuevo cada vez: cuatro fondos con el
 * mismo nombre en un día.
 */
export function estadoAlDevolver(etapa: 'fondo' | 'liquidacion'): 'draft' | 'funds_sent' {
  return etapa === 'liquidacion' ? 'funds_sent' : 'draft'
}
