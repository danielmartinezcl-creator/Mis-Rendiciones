import { cn } from '@/lib/utils'
import { formatAmount } from '@/lib/utils'
import type { Currency } from '@/lib/constants'

interface CurrencyAmountProps {
  amount: number
  currency?: Currency
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  muted?: boolean
}

const sizes = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-3xl',
}

export function CurrencyAmount({
  amount,
  currency = 'CLP',
  size = 'md',
  className,
  muted,
}: CurrencyAmountProps) {
  return (
    <span
      className={cn(
        'font-manrope font-bold tabular-nums',
        sizes[size],
        muted ? 'text-slate-400' : 'text-slate-900',
        className
      )}
    >
      {formatAmount(amount, currency)}
    </span>
  )
}
