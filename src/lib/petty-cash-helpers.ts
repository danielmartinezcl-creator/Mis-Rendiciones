import type { PettyCashItem } from '@/lib/supabase/types'

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
