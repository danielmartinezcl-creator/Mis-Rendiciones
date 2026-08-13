import type { ReportStatus } from '@/lib/constants'

export function computeReportStatus(items: { status: string }[]): ReportStatus {
  if (items.length === 0) return 'submitted'
  const allApproved = items.every(i => i.status === 'approved')
  const allRejected  = items.every(i => i.status === 'rejected')
  if (allApproved) return 'approved'
  if (allRejected)  return 'rejected'
  return 'partially_approved'
}

// NET: expense items add, advance and return items subtract.
// advance = money company already gave employee upfront (reduces what's still owed)
// return  = money employee returns to company (reduces what company must reimburse)
// transfer = internal movement, ignored
export function computeApprovedAmount(
  items: { status: string; amount_clp: number; item_type?: string }[]
): number {
  return items
    .filter(i => i.status === 'approved')
    .reduce((sum, i) => {
      const type = i.item_type ?? 'expense'
      if (type === 'advance' || type === 'return') return sum - i.amount_clp
      if (type === 'transfer') return sum
      return sum + i.amount_clp
    }, 0)
}
