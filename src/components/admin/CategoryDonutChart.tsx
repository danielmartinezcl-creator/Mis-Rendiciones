'use client'

import { useState } from 'react'
import type { CategoryBreakdownItem } from '@/actions/admin'
import { CHART_SERIES, NEUTRAL } from '@/lib/design-tokens'

// El SVG recibe los colores como strings, así que no puede usar variables CSS.
// Por eso salen de design-tokens.ts y no de globals.css.
const PALETTE = CHART_SERIES

interface Props {
  data: CategoryBreakdownItem[]
}

function formatCLP(n: number) {
  return '$ ' + Math.round(n).toLocaleString('es-CL')
}

// Convierte un tramo del donut a path de arco SVG
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180)
  const x1 = cx + r * Math.cos(toRad(startAngle))
  const y1 = cy + r * Math.sin(toRad(startAngle))
  const x2 = cx + r * Math.cos(toRad(endAngle))
  const y2 = cy + r * Math.sin(toRad(endAngle))
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}

export function CategoryDonutChart({ data }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)

  if (!data || data.length === 0) {
    return (
      <div className="hoja p-6 flex flex-col items-center justify-center min-h-[200px] text-ink-400">
        <p className="text-sm">No hay gastos aprobados para mostrar</p>
      </div>
    )
  }

  // Limitar a top 9 + "Otros" para no saturar la leyenda
  const MAX_SLICES = 9
  let slices = data.slice(0, MAX_SLICES)
  if (data.length > MAX_SLICES) {
    const otrosAmt  = data.slice(MAX_SLICES).reduce((s, d) => s + d.amount_clp, 0)
    const otrosCnt  = data.slice(MAX_SLICES).reduce((s, d) => s + d.item_count, 0)
    const total     = data.reduce((s, d) => s + d.amount_clp, 0)
    slices = [
      ...slices,
      { category_name: 'Otros', amount_clp: otrosAmt, item_count: otrosCnt, percentage: Math.round((otrosAmt / total) * 1000) / 10 },
    ]
  }

  const total = slices.reduce((s, d) => s + d.amount_clp, 0)

  // Calcular ángulos acumulados para cada segmento
  const angles: { start: number; end: number }[] = []
  let cursor = 0
  for (const slice of slices) {
    const deg = (slice.amount_clp / total) * 360
    angles.push({ start: cursor, end: cursor + deg })
    cursor += deg
  }

  const cx = 90, cy = 90, rOuter = 78, rInner = 50

  return (
    <div className="hoja p-5 space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-ink-900">Gastos por categoría</h2>
        <p className="text-xs text-ink-400 mt-0.5">
          Año {new Date().getFullYear()} · solo gastos, sin adelantos ni devoluciones
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 items-start">
        {/* SVG donut */}
        <div className="shrink-0 relative">
          <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Gráfico de categorías">
            {slices.map((slice, i) => {
              const { start, end } = angles[i]
              // Evitar arco de 360° exactos (SVG no lo renderiza)
              const safeEnd  = end - start >= 359.9 ? start + 359.89 : end
              const isHov    = hovered === i
              // Ligeramente expandido al hover
              const scale    = isHov ? 'scale(1.04)' : 'scale(1)'
              const origin   = `${cx}px ${cy}px`
              return (
                <path
                  key={i}
                  d={`${describeArc(cx, cy, rOuter, start, safeEnd)} L ${cx + rInner * Math.cos((safeEnd - 90) * Math.PI / 180)} ${cy + rInner * Math.sin((safeEnd - 90) * Math.PI / 180)} A ${rInner} ${rInner} 0 ${safeEnd - start > 180 ? 1 : 0} 0 ${cx + rInner * Math.cos((start - 90) * Math.PI / 180)} ${cy + rInner * Math.sin((start - 90) * Math.PI / 180)} Z`}
                  fill={PALETTE[i % PALETTE.length]}
                  opacity={hovered !== null && !isHov ? 0.45 : 1}
                  style={{ transform: scale, transformOrigin: origin, transition: 'all 150ms ease' }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  className="cursor-pointer"
                />
              )
            })}
            {/* Círculo interior para el "hueco" del donut */}
            <circle cx={cx} cy={cy} r={rInner - 2} fill="white" />
            {/* Texto central */}
            <text x={cx} y={cy - 8} textAnchor="middle" className="text-[10px] fill-ink-500" style={{ fontSize: '10px', fill: NEUTRAL.axis, fontFamily: 'sans-serif' }}>
              Total aprobado
            </text>
            <text x={cx} y={cy + 9} textAnchor="middle" style={{ fontSize: '12px', fill: NEUTRAL.figure, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>
              {formatCLP(total)}
            </text>
          </svg>

          {/* Tooltip flotante al hover */}
          {hovered !== null && (
            <div className="absolute top-0 left-[188px] bg-ink-900 text-white rounded-item px-3 py-2 text-xs shadow-lg pointer-events-none whitespace-nowrap z-10">
              <p className="font-semibold">{slices[hovered].category_name}</p>
              <p className="font-mono-amount">{formatCLP(slices[hovered].amount_clp)}</p>
              <p className="text-ink-300">{slices[hovered].percentage}% · {slices[hovered].item_count} ítem{slices[hovered].item_count !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>

        {/* Leyenda */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {slices.map((slice, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 py-1 px-2 rounded-item cursor-pointer transition-colors ${hovered === i ? 'bg-ink-50' : 'hover:bg-ink-50'}`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              />
              <span className="text-sm text-ink-700 truncate flex-1 min-w-0">{slice.category_name}</span>
              <span className="text-sm font-mono-amount text-ink-500 shrink-0">{slice.percentage}%</span>
              <span className="text-sm font-mono-amount font-semibold text-ink-900 shrink-0">
                {formatCLP(slice.amount_clp)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
