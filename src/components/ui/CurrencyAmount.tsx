import { cn } from '@/lib/utils'
import { formatAmount, fitAmountFontSize } from '@/lib/utils'
import type { Currency } from '@/lib/constants'

interface CurrencyAmountProps {
  amount: number
  currency?: Currency
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  muted?: boolean
  /**
   * Achica la cifra por tramos cuando es larga, en vez de dejar que se corte
   * contra el borde de su columna. Usar en columnas angostas y de ancho fijo
   * — el card de montos del inicio es el caso típico.
   */
  fit?: boolean
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
  fit,
}: CurrencyAmountProps) {
  const formatted = formatAmount(amount, currency)

  return (
    <span
      className={cn(
        // leading-none: un monto es una sola línea, el interlineado por defecto
        // le suma ~20% de alto muerto y engorda la tarjeta sin agrandar la cifra
        'font-manrope font-bold tabular-nums leading-none',
        // con fit el tamaño va por style; sin fit, la clase de siempre
        !fit && sizes[size],
        muted ? 'text-ink-400' : 'text-ink-900',
        className
      )}
      style={fit ? { fontSize: fitAmountFontSize(formatted, size) } : undefined}
    >
      {formatted}
    </span>
  )
}
