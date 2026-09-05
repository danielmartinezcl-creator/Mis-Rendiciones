import { cn } from '@/lib/utils'
import { ITEM_STATUS_ACCENT } from '@/lib/constants'
import type { ItemStatus } from '@/lib/constants'


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
