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
        'rounded-card shadow-card',
        hero
          // p-3.5 en el hero: sus 4 líneas de texto subieron de tamaño, el padding
          // baja para compensar. OJO: cn() es un join, no twMerge — pasar un `p-*`
          // por className NO anula este, quedan las dos clases y gana la que
          // Tailwind emita después. Si hace falta otro padding, es un prop.
          ? 'bg-card-hero text-white p-3.5'
          : 'bg-white border border-ink-200 p-4',
        className
      )}
    >
      {children}
    </div>
  )
}
