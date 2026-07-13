import { FUND_STATUS_COLORS, FUND_STATUS_LABELS } from '@/lib/constants'
import type { FundStatusConst } from '@/lib/constants'

export function FundStatusBadge({ status }: { status: string }) {
  const s = status as FundStatusConst
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${FUND_STATUS_COLORS[s] ?? 'bg-slate-100 text-slate-500'}`}>
      {FUND_STATUS_LABELS[s] ?? status}
    </span>
  )
}
