import type { ReportStatus } from '@/lib/constants'

export function computeReportStatus(items: { status: string }[]): ReportStatus {
  if (items.length === 0) return 'submitted'
  const allApproved = items.every(i => i.status === 'approved')
  const allRejected  = items.every(i => i.status === 'rejected')
  if (allApproved) return 'approved'
  if (allRejected)  return 'rejected'
  return 'partially_approved'
}

export function computeApprovedAmount(items: { status: string; amount_clp: number }[]): number {
  return items
    .filter(i => i.status === 'approved')
    .reduce((sum, i) => sum + i.amount_clp, 0)
}
