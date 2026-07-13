import { listPettyCashFunds } from '@/actions/petty-cash'
import { FundStatusBadge } from '@/components/petty-cash/FundStatusBadge'
import { formatPeriod } from '@/lib/petty-cash-helpers'
import Link from 'next/link'
import { Wallet, Plus } from 'lucide-react'

function fmtCLP(n: number) {
  return '$ ' + Math.round(n).toLocaleString('es-CL')
}

export default async function PettyCashPage() {
  const funds = await listPettyCashFunds()

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink-900">Caja Chica</h1>
          <p className="text-sm text-ink-500 mt-1">{funds.length} fondo{funds.length !== 1 ? 's' : ''} registrado{funds.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/petty-cash/new"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item transition-all shadow-sm hover:shadow-md active:scale-[.97]"
          style={{ background: 'linear-gradient(130deg, #12152E 0%, #3B4090 100%)' }}
        >
          <Plus size={14} />
          Nuevo fondo
        </Link>
      </div>

      {funds.length === 0 ? (
        <div className="text-center py-16 text-ink-400">
          <Wallet size={40} className="mx-auto mb-4 opacity-25" />
          <p className="text-sm font-medium">Sin fondos de caja chica</p>
          <p className="text-xs mt-1 text-ink-300">Los fondos aparecerán aquí una vez creados</p>
          <Link
            href="/petty-cash/new"
            className="inline-flex items-center gap-2 mt-4 text-brand-600 text-sm font-semibold hover:underline"
          >
            <Plus size={14} />
            Crear primer fondo
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {funds.map(f => (
            <Link
              key={f.id}
              href={`/petty-cash/${f.id}`}
              className="block bg-white rounded-card shadow-card p-4 hover:shadow-md transition-shadow border-l-4 border-l-brand-600"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-ink-900 truncate">{f.name}</p>
                    <FundStatusBadge status={f.status} />
                  </div>
                  <p className="text-xs text-ink-500 mt-1">
                    Empleado: <span className="font-medium text-ink-700">{f.employee_name}</span>
                    {' · '}
                    EFF: <span className="font-medium text-ink-700">{f.manager_name}</span>
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">{formatPeriod(f.period_start, f.period_end)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono-amount font-bold text-ink-900">{fmtCLP(f.amount_approved ?? f.amount_requested)}</p>
                  {f.amount_approved != null && f.amount_approved !== f.amount_requested && (
                    <p className="text-xs text-ink-400">Solicitado: {fmtCLP(f.amount_requested)}</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
