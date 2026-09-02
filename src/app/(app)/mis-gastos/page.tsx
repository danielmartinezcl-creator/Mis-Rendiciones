import { getMyMonthlySummary } from '@/actions/expenses'
import { formatCLP } from '@/lib/utils'
import { TrendingUp, BarChart3 } from 'lucide-react'

export const dynamic = 'force-dynamic'

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[parseInt(m, 10) - 1]} ${y.slice(2)}`
}

export default async function MisGastosPage() {
  const { rows, months } = await getMyMonthlySummary()

  // Totales por mes
  const monthTotals = Object.fromEntries(months.map(m => [m, 0]))
  for (const r of rows) { if (monthTotals[r.month] !== undefined) monthTotals[r.month] += r.total_clp }

  // Totales por categoría (over full period)
  const catTotals = new Map<string, { name: string; total: number }>()
  for (const r of rows) {
    const key  = r.category_id ?? '__none__'
    const name = r.category_name ?? 'Sin categoría'
    const cur  = catTotals.get(key) ?? { name, total: 0 }
    catTotals.set(key, { name, total: cur.total + r.total_clp })
  }
  const sortedCats = Array.from(catTotals.entries()).sort((a, b) => b[1].total - a[1].total)

  const grandTotal    = Object.values(monthTotals).reduce((s, v) => s + v, 0)
  const maxMonth      = Math.max(...Object.values(monthTotals), 1)
  const activeMonths  = Object.values(monthTotals).filter(v => v > 0).length

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Cabecera */}
      <div>
        <h1 className="text-2xl font-display font-bold text-ink-800">Mis gastos</h1>
        <p className="text-ink-500 text-sm mt-1">Ítems aprobados de los últimos 12 meses</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4">
          <p className="text-xs text-ink-400 mb-1">Total aprobado</p>
          <p className="font-mono-amount font-bold text-accent-700 text-lg leading-tight">{formatCLP(grandTotal)}</p>
          <p className="text-[11px] text-ink-300 mt-0.5">12 meses</p>
        </div>
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4">
          <p className="text-xs text-ink-400 mb-1">Promedio mensual</p>
          <p className="font-mono-amount font-bold text-ink-700 text-lg leading-tight">
            {formatCLP(activeMonths > 0 ? grandTotal / activeMonths : 0)}
          </p>
          <p className="text-[11px] text-ink-300 mt-0.5">{activeMonths} mes{activeMonths !== 1 ? 'es' : ''} con gastos</p>
        </div>
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4">
          <p className="text-xs text-ink-400 mb-1">Categoría principal</p>
          <p className="font-semibold text-ink-700 text-sm leading-tight truncate">
            {sortedCats[0]?.[1]?.name ?? '—'}
          </p>
          {sortedCats[0] && (
            <p className="text-[11px] text-ink-300 mt-0.5 font-mono-amount">
              {formatCLP(sortedCats[0][1].total)}
            </p>
          )}
        </div>
      </div>

      {/* Gráfico de barras por mes */}
      {grandTotal > 0 ? (
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-accent-600" />
            <h2 className="text-sm font-semibold text-ink-700">Gastos por mes</h2>
          </div>
          <div className="flex items-end gap-1.5 h-32">
            {months.map(m => {
              const val  = monthTotals[m]
              const pct  = maxMonth > 0 ? (val / maxMonth) * 100 : 0
              const isThisMonth = m === months[months.length - 1]
              return (
                <div key={m} className="flex-1 flex flex-col items-center gap-1 group relative">
                  {val > 0 && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-ink-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {formatCLP(val)}
                    </div>
                  )}
                  <div className="w-full flex items-end" style={{ height: '96px' }}>
                    <div
                      className={`w-full rounded-t transition-all ${
                        isThisMonth ? 'bg-accent-500' : 'bg-accent-200 group-hover:bg-accent-300'
                      } ${val === 0 ? 'opacity-30' : ''}`}
                      style={{ height: `${Math.max(pct, val > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-ink-400 whitespace-nowrap">{monthLabel(m)}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-12 text-center">
          <TrendingUp size={36} className="mx-auto mb-3 text-ink-200" />
          <p className="text-ink-400 font-medium">Sin gastos aprobados en los últimos 12 meses</p>
          <p className="text-ink-400 text-sm mt-1">Los ítems aparecen aquí una vez que el aprobador los confirma</p>
        </div>
      )}

      {/* Tabla por categoría */}
      {sortedCats.length > 0 && (
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-100">
            <h2 className="text-sm font-semibold text-ink-700">Por categoría</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-50">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-ink-400">Categoría</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-ink-400">Total</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-ink-400">% del total</th>
              </tr>
            </thead>
            <tbody>
              {sortedCats.map(([key, { name, total }]) => {
                const pct = grandTotal > 0 ? ((total / grandTotal) * 100).toFixed(1) : '0.0'
                return (
                  <tr key={key} className="border-b border-ink-50 hover:bg-ink-50/40">
                    <td className="px-5 py-3 text-ink-700 font-medium">{name}</td>
                    <td className="px-5 py-3 text-right font-mono-amount text-ink-700">{formatCLP(total)}</td>
                    <td className="px-5 py-3 text-right text-ink-400 text-xs">{pct}%</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50/60">
                <td className="px-5 py-3 font-semibold text-ink-700">Total</td>
                <td className="px-5 py-3 text-right font-mono-amount font-bold text-accent-700">{formatCLP(grandTotal)}</td>
                <td className="px-5 py-3 text-right text-ink-400 text-xs">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Detalle mes a mes (si hay datos) */}
      {grandTotal > 0 && (
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-100">
            <h2 className="text-sm font-semibold text-ink-700">Detalle mensual</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-50">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-ink-400">Mes</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-ink-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {months.filter(m => monthTotals[m] > 0).reverse().map(m => (
                <tr key={m} className="border-b border-ink-50 hover:bg-ink-50/40">
                  <td className="px-5 py-3 text-ink-700">{monthLabel(m)}</td>
                  <td className="px-5 py-3 text-right font-mono-amount text-ink-700">{formatCLP(monthTotals[m])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
