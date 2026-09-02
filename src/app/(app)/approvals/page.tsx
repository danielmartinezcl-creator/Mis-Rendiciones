import Link from 'next/link'
import { getPendingApprovals } from '@/actions/approvals'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { formatDate, formatDisplayTitle } from '@/lib/utils'
import { CheckCircle2 } from 'lucide-react'
import type { Currency } from '@/lib/constants'

export default async function ApprovalsPage() {
  const reports = await getPendingApprovals()

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink-900">Bandeja de aprobaciones</h1>
        <p className="card-label text-ink-500 mt-1">
          {reports.length > 0
            ? `${reports.length} rendición${reports.length !== 1 ? 'es' : ''} esperando tu decisión`
            : 'No hay rendiciones pendientes'}
        </p>
      </div>

      {reports.length === 0 && (
        <div className="text-center py-16 text-ink-400">
          <CheckCircle2 size={44} className="mx-auto mb-3 opacity-40" />
          <p className="card-eyebrow">Todo al día</p>
          <p className="card-label mt-1">No hay rendiciones pendientes de aprobación.</p>
        </div>
      )}

      <div className="space-y-3">
        {reports.map(report => (
          <Link
            key={report.id}
            href={`/approvals/${report.id}`}
            className="block bg-white rounded-item shadow-[0_1px_4px_rgba(0,0,0,.08)] border border-l-4 border-ink-200 border-l-warning-400 p-3.5 hover:shadow-[0_2px_8px_rgba(0,0,0,.12)] transition-shadow"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[16px] leading-snug font-semibold text-slate-800">
                  {formatDisplayTitle(report.title)}
                </p>
                {report.submitted_at && (
                  <p className="card-meta text-slate-400 mt-0.5">
                    Enviada el {formatDate(report.submitted_at.split('T')[0])}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <CurrencyAmount
                  amount={report.total_amount}
                  currency={(report.currency as Currency) ?? 'CLP'}
                  size="md"
                />
                <span className="block text-[14px] bg-warning-100 text-warning-700 px-2.5 py-1 rounded-full mt-1 font-medium">
                  En revisión
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
