import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  hero?: boolean
}

export function Card({ children, className, hero }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card shadow-card p-4',
        hero
          ? 'bg-card-hero text-white'
          : 'bg-white border border-slate-100',
        className
      )}
    >
      {children}
    </div>
  )
}
