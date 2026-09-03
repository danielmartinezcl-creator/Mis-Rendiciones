import type { PettyCashItem } from '@/lib/supabase/types'
import { FUND_STEPS, type FundStatusConst } from '@/lib/constants'

export function calculateFundBalance(approvedAmount: number | null, items: PettyCashItem[]) {
  const approved = approvedAmount ?? 0
  const spent = items
    .filter(i => i.status !== 'rejected')
    .reduce((sum, i) => sum + i.amount_clp, 0)
  const difference = approved - spent

  return {
    approved,
    spent,
    remaining: Math.max(0, difference),
    difference,
    hasRefund: difference > 0,         // empresa devuelve al empleado
    hasReimbursement: difference < 0,  // empleado reembolsa a empresa
    isBalanced: difference === 0,
  }
}

export function canEmployeeAddItems(status: string) {
  return status === 'funds_sent'
}

export function canEmployeeSubmitLiquidation(status: string, items: PettyCashItem[]) {
  return status === 'funds_sent' && items.length > 0
}

export function canManagerElevate(status: string) {
  return status === 'submitted'
}

export function canApproverActOnFund(status: string) {
  return status === 'pending_approval'
}

export function canApproverActOnLiquidation(status: string) {
  return status === 'pending_liquidation_approval'
}

export function canManagerRecordDisbursement(status: string) {
  return status === 'approved'
}

export function canManagerRecordSettlement(status: string) {
  return status === 'settled'
}

export function formatPeriod(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

// ── Tornasol · sección 7 ──────────────────────────────────────────────────────

/**
 * Los cuatro tramos de vida de un fondo.
 *
 * No son cuatro estilos de la misma tarjeta: son cuatro CONTENIDOS distintos
 * para el mismo lugar. Antes de que llegue la transferencia no hay medidor
 * porque no hay nada que medir, y esa ausencia es información.
 *
 * Diez estados entran, cuatro tramos salen. Si hace falta un quinto, cae el
 * test de `src/tests/petty-cash-helpers.test.ts` — a propósito.
 */
export const TRAMOS_FONDO = ['antes', 'con-dinero', 'cerrado', 'rechazado'] as const
export type TramoFondo = typeof TRAMOS_FONDO[number]

const TRAMO_POR_ESTADO: Record<FundStatusConst, TramoFondo> = {
  draft:                        'antes',
  pending_approval:             'antes',
  approved:                     'antes',   // autorizado, pero la plata no salió
  pending_bank_load:            'antes',
  pending_bank_auth:            'antes',
  funds_sent:                   'con-dinero',
  submitted:                    'con-dinero',
  pending_liquidation_approval: 'con-dinero',
  settled:                      'cerrado',
  rejected:                     'rechazado',
}

export function tramoDelFondo(status: FundStatusConst): TramoFondo {
  return TRAMO_POR_ESTADO[status]
}

/**
 * Qué acción del registro de auditoría marca la LLEGADA a cada paso.
 *
 * `bank_authorized` no está: comparte transición con `funds_sent`, así que no
 * tiene un paso propio. Aparece igual en el historial completo de abajo.
 */
const AUDIT_QUE_ALCANZA: Record<string, string> = {
  draft:                        'created',
  pending_approval:             'submitted_for_approval',
  approved:                     'approved',
  pending_bank_load:            'bank_load_requested',
  pending_bank_auth:            'bank_load_confirmed',
  funds_sent:                   'funds_sent',
  submitted:                    'liquidation_submitted',
  pending_liquidation_approval: 'liquidation_elevated',
  settled:                      'liquidation_approved',
}

export type EstadoPaso = 'hecho' | 'actual' | 'pendiente'

export interface PasoRecorrido {
  key:    string
  label:  string
  estado: EstadoPaso
  fecha:  string | null
}

/**
 * Fusiona los pasos canónicos con las fechas reales.
 *
 * Hasta ahora esto vivía partido en dos componentes: `VerticalTimeline` tenía
 * los pasos sin fechas y `FundTimeline` las fechas sin los pasos que faltan.
 * El diseño de Tornasol pide las dos cosas juntas, con el futuro visible.
 *
 * Tres reglas, en este orden:
 *   1. El paso del estado vigente es «actual», aunque ya tenga fecha.
 *   2. Un paso con fecha de auditoría está hecho.
 *   3. Un paso anterior al vigente está hecho aunque no haya fila que lo
 *      pruebe — las cargas históricas entran directo a un estado avanzado.
 */
export function construirRecorrido(
  status: FundStatusConst,
  audits: readonly { action: string; created_at: string }[],
): PasoRecorrido[] {
  const idx = FUND_STEPS.findIndex(s => s.key === status)

  return FUND_STEPS.map((step, i) => {
    const accion = AUDIT_QUE_ALCANZA[step.key]
    const fecha  = audits.find(a => a.action === accion)?.created_at ?? null

    const estado: EstadoPaso =
      i === idx                     ? 'actual' :
      fecha !== null                ? 'hecho'  :
      idx >= 0 && i < idx           ? 'hecho'  :
                                      'pendiente'

    return { key: step.key, label: step.label, estado, fecha }
  })
}
