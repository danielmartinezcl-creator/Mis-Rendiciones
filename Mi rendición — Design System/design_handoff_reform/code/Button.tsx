import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

/**
 * REFORMA VISUAL — Cambios aplicados:
 * 1. Primary: bg-brand-600 (antes indigo, ahora teal #0D9488) — automático via globals.css
 * 2. font-semibold → font-bold (botones más definidos)
 * 3. rounded-item: 8px → 14px — automático via globals.css
 * 4. Primary tiene shadow-brand (glow teal sutil)
 * 5. Transición mejorada: duration-150 → duration-[180ms]
 * 6. Secondary: border-ink-200, hover bg-ink-50 (antes slate)
 * 7. Ghost: hover:bg-ink-100
 *
 * SIN cambios en la interfaz pública — drop-in replacement.
 */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

const variants = {
  primary:   'bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-brand',
  secondary: 'bg-white hover:bg-ink-50 text-ink-800 border border-ink-200 hover:border-ink-300',
  danger:    'bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white',
  ghost:     'hover:bg-ink-100 text-ink-500 hover:text-ink-800',
}

const sizes = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2.5',
  lg: 'text-base px-6 py-3',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-bold rounded-item transition-all duration-[180ms]',
        'active:scale-[.97]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
)
Button.displayName = 'Button'
