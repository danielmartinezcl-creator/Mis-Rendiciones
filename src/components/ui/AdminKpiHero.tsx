import { ON_DARK, BRAND } from '@/lib/design-tokens'

/**
 * AdminKpiHero — Componente hero con degradé violeta PENTA
 *
 * Uso en el dashboard admin y en la pantalla de rendiciones para mostrar
 * métricas clave con el look "violeta oscuro → violeta PENTA" del brand.
 */

interface SecondaryMetric {
  label: string
  value: number
  /** Color del valor. 'teal' | 'amber' | 'emerald' | 'sky' | 'rose' | 'violet' | 'white' */
  color?: 'teal' | 'amber' | 'emerald' | 'sky' | 'rose' | 'violet' | 'white'
}

interface AdminKpiHeroProps {
  title?: string
  total: number
  secondary?: SecondaryMetric[]
  className?: string
}

// Se aplican como `style={{ color }}` desde JS, así que salen de
// design-tokens.ts y no de globals.css.
const colorMap: Record<NonNullable<SecondaryMetric['color']>, string> = ON_DARK

function fmtCLP(n: number): string {
  /* Espacio DURO entre el signo y las cifras. Con el espacio normal, en un
     teléfono de 390 px el navegador partía «$ 1.662.564» en dos renglones:
     el signo arriba y el número abajo. Un espacio normal es un punto de
     corte válido; éste no lo es. */
  return '$ ' + Math.round(n).toLocaleString('es-CL')
}

export function AdminKpiHero({
  title = 'Movimiento total del mes',
  total,
  secondary = [],
  className = '',
}: AdminKpiHeroProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl shadow-md ${className}`}
      style={{ background: 'var(--cta-brand)' }}
    >
      {/* Glow radial sutil en esquina derecha */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 280, height: 280, borderRadius: '50%',
          right: -60, top: -100,
          background: 'radial-gradient(circle, rgba(148,150,223,.18), transparent 65%)',
        }}
      />

      <div className="relative flex items-center justify-between gap-6 flex-wrap p-6">
        {/* Total principal */}
        <div>
          <p className="card-eyebrow"
             style={{ color: BRAND.primarySoft, marginBottom: 6 }}>
            {title}
          </p>
          <p className="font-mono-amount text-white"
             style={{ fontSize: 40, letterSpacing: '-0.025em' }}>
            {fmtCLP(total)}
          </p>
        </div>

        {/* Métricas secundarias. `flex-wrap`: si las dos no entran lado a
            lado, se apilan. Apilar es siempre mejor que apretar una cifra
            hasta romperla, que es lo que pasaba en 390 px. */}
        {secondary.length > 0 && (
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            {secondary.map((s, i) => (
              <div key={i}>
                <p className="card-label" style={{ color: 'rgba(255,255,255,.55)', marginBottom: 4 }}>
                  {s.label}
                </p>
                <p className="font-mono-amount" style={{
                  fontSize: 24,
                  color: colorMap[s.color ?? 'white'],
                }}>
                  {fmtCLP(s.value)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
