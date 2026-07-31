import { cn } from '@/lib/utils'
import { getStatusLabel } from '@/lib/utils'
import { STATUS_COLORS, STATUS_DOT, ITEM_STATUS_ACCENT } from '@/lib/constants'
import type { ReportStatus, ItemStatus } from '@/lib/constants'

/**
 * REFORMA VISUAL — Cambios aplicados:
 * 1. ReportStatusBadge: agrega un dot de color sólido antes del label (patrón del design system)
 * 2. STATUS_DOT importado desde constants.ts (nuevo export)
 * 3. rounded-full se mantiene para pills
 * 4. SIN cambios en la interfaz pública — drop-in replacement
 */

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold',
      STATUS_COLORS[status]
    )}>
      {/* Dot de color sólido */}
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
