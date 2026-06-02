import { cn } from '@/lib/utils'
import { getStatusLabel } from '@/lib/utils'
import { STATUS_COLORS, ITEM_STATUS_ACCENT } from '@/lib/constants'
import type { ReportStatus, ItemStatus } from '@/lib/constants'

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', STATUS_COLORS[status])}>
      {getStatusLabel(status)}
    </span>
  )
}

export function ItemStatusAccent({ status, children, className }: {
  status: ItemStatus
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('pl-3', ITEM_STATUS_ACCENT[status], className)}>
      {children}
    </div>
  )
}
