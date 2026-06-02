import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

const variants = {
  primary:   'bg-brand-600 hover:bg-brand-700 text-white',
  secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200',
  danger:    'bg-red-500 hover:bg-red-600 text-white',
  ghost:     'hover:bg-slate-100 text-slate-600',
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
        'inline-flex items-center justify-center font-semibold rounded-item transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
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
