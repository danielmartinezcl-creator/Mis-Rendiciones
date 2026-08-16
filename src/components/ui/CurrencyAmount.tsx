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

/* Escala de montos (2026-08-16) — subida para que se lean en un celular.
   Antes: 14 / 16 / 20 / 30px. */
const sizes = {
  sm: 'text-[19px]',
  md: 'text-[24px]',
  lg: 'text-[28px]',
  xl: 'text-[40px]',
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
