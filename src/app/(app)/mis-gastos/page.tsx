import { getMisGastos } from '@/actions/expenses'
import { resumenMisGastos } from '@/lib/mis-gastos'
import { fechaEnChile } from '@/lib/filtro-documentos'
import { formatCLP } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { TrendingUp, BarChart3 } from 'lucide-react'

export const dynamic = 'force-dynamic'

const NOMBRES_MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const etiquetaMes = (ym: string) => NOMBRES_MES[parseInt(ym.split('-')[1], 10) - 1]

export default async function MisGastosPage() {
  const r = resumenMisGastos(await getMisGastos(), fechaEnChile())
  const maxMes = Math.max(...Object.values(r.porMes), 1)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tor-on-gradient">Mis gastos</h1>
        <p className="tor-on-gradient-soft text-sm mt-1">Rendiciones y caja chica · últimos 12 meses</p>
      </div>

      {/* Los tres indicadores en la tarjeta de resumen, como el inicio: es lo que
          se mira; el gráfico y las tablas de abajo son lo que se lee. */}
      <Card hero>
        <div className="space-y-1.5">
          <p className="card-eyebrow text-brand-300">Total aprobado</p>
          <CurrencyAmount amount={r.totalAprobado} currency="CLP" size="xl" fit className="text-white block" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="card-label text-brand-300 mb-1">Pendiente de aprobación</p>
            <CurrencyAmount amount={r.pendiente.montoClp} currency="CLP" size="md" fit className="text-white block" />
            <p className="card-meta text-white/80 mt-0.5">
              {r.pendiente.documentos === 1 ? 'en 1 documento' : `en ${r.pendiente.documentos} documentos`}
            </p>
          </div>
          <div>
            <p className="card-label text-brand-300 mb-1">Promedio mensual</p>
            <CurrencyAmount amount={r.promedioMensual} currency="CLP" size="md" fit className="text-white block" />
            <p className="card-meta text-white/80 mt-0.5">
              {r.mesesConGastos === 1 ? '1 mes con gastos' : `${r.mesesConGastos} meses con gastos`}
            </p>
          </div>
        </div>
      </Card>

      {r.totalAprobado > 0 ? (
        <div className="hoja p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-accent-600" />
            <h2 className="text-sm font-semibold text-ink-700">Gastos por mes</h2>
          </div>
          {/* Los 12 meses entran SIN desplazamiento lateral. Antes cada etiqueta
              decía «Oct 25» con `whitespace-nowrap`, la fila medía 430 px en un
              celular de 390 y el desplazamiento arrancaba a la izquierda: se veían
              los meses viejos en cero y los recientes —los únicos con gastos—
              quedaban escondidos a la derecha. Parecía un gráfico vacío.
              Ahora el mes va en tres letras y el año solo donde cambia. */}
          <div className="flex items-end gap-1 sm:gap-1.5 h-36">
            {r.meses.map((m, i) => {
              const valor = r.porMes[m]
              const pct = (valor / maxMes) * 100
              const esEsteMes = i === r.meses.length - 1
              return (
                <div key={m} className="flex-1 min-w-0 flex flex-col items-center gap-1 group relative">
                  {valor > 0 && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-ink-800 text-white text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {formatCLP(valor)}
                    </div>
                  )}
                  <div className="w-full flex items-end" style={{ height: '96px' }}>
                    <div
                      className={`w-full rounded-t transition-all ${esEsteMes ? 'bg-accent-500' : 'bg-accent-200 group-hover:bg-accent-300'} ${valor === 0 ? 'opacity-30' : ''}`}
                      style={{ height: `${Math.max(pct, valor > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className="text-[11px] leading-tight text-ink-400 text-center">
                    {etiquetaMes(m)}
                    <span className="block h-3">{(i === 0 || m.endsWith('-01')) ? m.slice(2, 4) : ''}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="hoja p-12 text-center">
          <TrendingUp size={36} className="mx-auto mb-3 text-ink-200" />
          <p className="text-ink-400 font-medium">Sin gastos aprobados en los últimos 12 meses</p>
          <p className="text-ink-400 text-sm mt-1">Los gastos aparecen aquí una vez que el aprobador los confirma</p>
        </div>
      )}

      {r.porCategoria.length > 0 && (
        <div className="hoja overflow-hidden">
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
              {r.porCategoria.map(c => (
                <tr key={c.id ?? '__sin__'} className="border-b border-ink-50 hover:bg-ink-50/40">
                  <td className="px-5 py-3 text-ink-700 font-medium">{c.nombre}</td>
                  {/* `whitespace-nowrap`: en un teléfono la columna se angosta y
                      «$ 101.523» se partía en dos líneas, con el signo arriba */}
                  <td className="px-5 py-3 text-right font-mono-amount text-ink-700 whitespace-nowrap">{formatCLP(c.total)}</td>
                  <td className="px-5 py-3 text-right text-ink-400 text-xs">{((c.total / r.totalAprobado) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50/60">
                <td className="px-5 py-3 font-semibold text-ink-700">Total</td>
                <td className="px-5 py-3 text-right font-mono-amount font-bold text-accent-700 whitespace-nowrap">{formatCLP(r.totalAprobado)}</td>
                <td className="px-5 py-3 text-right text-ink-400 text-xs">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {r.totalAprobado > 0 && (
        <div className="hoja overflow-hidden">
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
              {r.meses.filter(m => r.porMes[m] > 0).reverse().map(m => (
                <tr key={m} className="border-b border-ink-50 hover:bg-ink-50/40">
                  <td className="px-5 py-3 text-ink-700">{etiquetaMes(m)} {m.slice(2, 4)}</td>
                  <td className="px-5 py-3 text-right font-mono-amount text-ink-700 whitespace-nowrap">{formatCLP(r.porMes[m])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
