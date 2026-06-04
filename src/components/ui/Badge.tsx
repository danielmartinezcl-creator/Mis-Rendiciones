import { cn } from '@/lib/utils'
import { getStatusLabel } from '@/lib/utils'
import { STATUS_COLORS, STATUS_DOT, ITEM_STATUS_ACCENT } from '@/lib/constants'
import type { ReportStatus, ItemStatus } from '@/lib/constants'

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold',
      STATUS_COLORS[status]
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[status])} />
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
