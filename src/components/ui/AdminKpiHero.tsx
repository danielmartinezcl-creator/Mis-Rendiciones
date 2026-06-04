/**
 * AdminKpiHero — Componente hero con degradé ink→teal
 *
 * Uso en el dashboard admin y en la pantalla de rendiciones para mostrar
 * métricas clave con el look "ink → teal" del design system reformado.
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

const colorMap: Record<NonNullable<SecondaryMetric['color']>, string> = {
  teal:    '#5EEAD4',
  amber:   '#FCD34D',
  emerald: '#6EE7B7',
  sky:     '#7DD3FC',
  rose:    '#FDA4AF',
  violet:  '#C4B5FD',
  white:   '#FFFFFF',
}

function fmtCLP(n: number): string {
  return '$ ' + Math.round(n).toLocaleString('es-CL')
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
      style={{ background: 'linear-gradient(130deg, #0B1120 0%, #0F766E 100%)' }}
    >
      {/* Glow radial sutil en esquina derecha */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 280, height: 280, borderRadius: '50%',
          right: -60, top: -100,
          background: 'radial-gradient(circle, rgba(94,234,212,.15), transparent 65%)',
        }}
      />

      <div className="relative flex items-center justify-between gap-6 flex-wrap p-6">
        {/* Total principal */}
        <div>
          <p className="text-xs font-semibold tracking-wider uppercase"
             style={{ color: '#5EEAD4', marginBottom: 6 }}>
            {title}
          </p>
          <p className="font-mono-amount text-white"
             style={{ fontSize: 32, letterSpacing: '-0.025em' }}>
            {fmtCLP(total)}
          </p>
        </div>

        {/* Métricas secundarias */}
        {secondary.length > 0 && (
          <div className="flex gap-8">
            {secondary.map((s, i) => (
              <div key={i}>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,.45)', marginBottom: 4 }}>
                  {s.label}
                </p>
                <p className="font-mono-amount" style={{
                  fontSize: 18,
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
