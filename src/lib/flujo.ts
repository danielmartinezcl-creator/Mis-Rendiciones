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
