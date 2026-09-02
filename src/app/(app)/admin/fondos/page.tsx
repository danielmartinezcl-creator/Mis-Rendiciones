import Link from 'next/link'
import { getActiveFundsSummary } from '@/actions/admin'
import { formatCLP } from '@/lib/utils'
import { Wallet, Clock, AlertTriangle, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  funds_sent:                  'Fondos enviados',
  submitted:                   'En liquidación',
  pending_liquidation_approval: 'Aprobando liquidación',
}

export default async function FondosPage() {
  const funds = await getActiveFundsSummary()

  const totalBalance  = funds.reduce((s, f) => s + f.balance, 0)
  const totalExpense  = funds.reduce((s, f) => s + f.expense, 0)
  const lowFunds      = funds.filter(f => f.balancePct <= 10)
  const inactiveFunds = funds.filter(f => f.daysSinceActivity >= 7)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Cabecera */}
      <div>
        <h1 className="text-2xl font-display font-bold text-ink-800">Saldos de Caja Chica</h1>
        <p className="text-ink-500 text-sm mt-1">Fondos activos con dinero en circulación</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4">
          <p className="text-xs text-ink-400 mb-1">Fondos activos</p>
          <p className="text-2xl font-mono-amount font-bold text-ink-800">{funds.length}</p>
        </div>
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4">
          <p className="text-xs text-ink-400 mb-1">Saldo disponible total</p>
          <p className="text-lg font-mono-amount font-bold text-accent-700">{formatCLP(totalBalance)}</p>
        </div>
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4">
          <p className="text-xs text-ink-400 mb-1">Total gastado</p>
          <p className="text-lg font-mono-amount font-bold text-ink-800">{formatCLP(totalExpense)}</p>
        </div>
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4">
          <p className="text-xs text-ink-400 mb-1">Con saldo bajo (≤10%)</p>
          <p className={`text-2xl font-mono-amount font-bold ${lowFunds.length > 0 ? 'text-danger-600' : 'text-ink-800'}`}>
            {lowFunds.length}
          </p>
        </div>
      </div>

      {/* Alertas */}
      {(lowFunds.length > 0 || inactiveFunds.length > 0) && (
        <div className="space-y-2">
          {lowFunds.length > 0 && (
            <div className="flex items-center gap-2 bg-danger-50 border border-danger-200 rounded-item px-4 py-2.5">
              <AlertTriangle size={15} className="text-danger-500 shrink-0" />
              <p className="text-sm text-danger-700">
                {lowFunds.length === 1
                  ? `1 fondo tiene saldo bajo (≤10%): ${lowFunds[0].employeeName}`
                  : `${lowFunds.length} fondos tienen saldo bajo (≤10%)`}
              </p>
            </div>
          )}
          {inactiveFunds.length > 0 && (
            <div className="flex items-center gap-2 bg-warning-50 border border-warning-200 rounded-item px-4 py-2.5">
              <Clock size={15} className="text-warning-500 shrink-0" />
              <p className="text-sm text-warning-700">
                {inactiveFunds.length === 1
                  ? `1 fondo sin actividad por ≥7 días: ${inactiveFunds[0].employeeName}`
                  : `${inactiveFunds.length} fondos sin actividad por ≥7 días`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tabla de fondos */}
      {funds.length === 0 ? (
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-12 text-center">
          <Wallet size={36} className="mx-auto mb-3 text-ink-300" />
          <p className="text-ink-400 font-medium">Sin fondos activos en circulación</p>
          <p className="text-ink-400 text-sm mt-1">
            Los fondos aparecen aquí cuando están en estado &quot;Fondos enviados&quot;
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100">
                <th className="text-left px-4 py-3 font-semibold text-ink-600">Empleado</th>
                <th className="text-left px-4 py-3 font-semibold text-ink-600">Fondo</th>
                <th className="text-right px-4 py-3 font-semibold text-ink-600">Adelanto</th>
                <th className="text-right px-4 py-3 font-semibold text-ink-600">Gastado</th>
                <th className="text-right px-4 py-3 font-semibold text-ink-600">Saldo</th>
                <th className="text-center px-4 py-3 font-semibold text-ink-600">Estado</th>
                <th className="text-center px-4 py-3 font-semibold text-ink-600">Inactividad</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {funds
                .sort((a, b) => a.balancePct - b.balancePct)
                .map(f => (
                  <tr key={f.id} className="border-b border-ink-50 hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-800">{f.employeeName}</p>
                      {f.department && (
                        <p className="text-xs text-ink-400">{f.department}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-600 max-w-[160px] truncate" title={f.name}>
                      {f.name}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-amount text-ink-600 text-xs">
                      {formatCLP(f.advance)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-amount text-ink-600 text-xs">
                      {formatCLP(f.expense)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-col items-end">
                        <span className={`font-mono-amount font-semibold text-xs ${f.balancePct <= 10 ? 'text-danger-600' : 'text-accent-700'}`}>
                          {formatCLP(f.balance)}
                        </span>
                        <span className={`text-[10px] ${f.balancePct <= 10 ? 'text-danger-400' : 'text-ink-400'}`}>
                          {f.balancePct}% restante
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs bg-ink-100 text-ink-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {STATUS_LABEL[f.status] ?? f.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium ${f.daysSinceActivity >= 7 ? 'text-warning-600' : 'text-ink-400'}`}>
                        {f.daysSinceActivity}d
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/petty-cash/${f.id}`}
                        className="text-accent-600 hover:text-accent-800 transition-colors"
                      >
                        <ArrowRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
