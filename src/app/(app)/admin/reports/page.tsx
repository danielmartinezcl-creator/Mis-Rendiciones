import { getAllReports } from '@/actions/admin'
import { ReportStatusBadge } from '@/components/ui/Badge'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { formatDate } from '@/lib/utils'
import type { Currency } from '@/lib/constants'
import { ReimbursedButton } from './ReimbursedButton'
import Link from 'next/link'

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function AdminReportsPage({ searchParams }: PageProps) {
  const { status } = await searchParams
  const reports = await getAllReports(status)

  const statuses = [
    { value: '',             label: 'Todas' },
    { value: 'submitted',    label: 'En revisión' },
    { value: 'approved',     label: 'Aprobadas' },
    { value: 'partially_approved', label: 'Parcial' },
    { value: 'rejected',     label: 'Rechazadas' },
    { value: 'reimbursed',   label: 'Reembolsadas' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800">Rendiciones</h1>
        <span className="text-sm text-slate-500">{reports.length} resultado{reports.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map(s => (
          <Link
            key={s.value}
            href={s.value ? `/admin/reports?status=${s.value}` : '/admin/reports'}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              (status ?? '') === s.value
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300',
            ].join(' ')}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {reports.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <p>No hay rendiciones{status ? ` con estado "${status}"` : ''}.</p>
        </div>
      )}

      {/* Tabla */}
      <div className="space-y-2">
        {reports.map(report => (
          <div
            key={report.id}
            className="bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{report.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Creada {formatDate(report.created_at.split('T')[0])}
                  {report.submitted_at && ` · Enviada ${formatDate(report.submitted_at.split('T')[0])}`}
                  {report.reimbursed_at && ` · Reembolsada ${formatDate(report.reimbursed_at.split('T')[0])}`}
                </p>
                {report.payment_reference && (
                  <p className="text-xs text-slate-400">Ref: {report.payment_reference}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <CurrencyAmount
                    amount={report.total_amount}
                    currency={(report.currency as Currency) ?? 'CLP'}
                    size="sm"
                  />
                  {report.approved_amount > 0 && report.approved_amount !== report.total_amount && (
                    <p className="text-xs text-emerald-600 mt-0.5">
                      Aprobado: {report.approved_amount.toLocaleString('es-CL')}
                    </p>
                  )}
                </div>
                <ReportStatusBadge status={report.status as any} />
              </div>
            </div>

            {/* Acción de reembolso */}
            {(report.status === 'approved' || report.status === 'partially_approved') && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <ReimbursedButton reportId={report.id} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
