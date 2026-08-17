import Link from 'next/link'
import { ReportStatusBadge } from '@/components/ui/Badge'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { formatDate } from '@/lib/utils'
import type { ReportStatus } from '@/lib/constants'

interface ExpenseReportCardProps {
  report: {
    id:              string
    title:           string
    status:          ReportStatus
    total_amount:    number
    approved_amount: number
    currency:        string
    submitted_at:    string | null
    created_at:      string
  }
}

export function ExpenseReportCard({ report }: ExpenseReportCardProps) {
  const isDraft = report.status === 'draft'

  const dateLabel = report.submitted_at
    ? `Enviada ${formatDate(report.submitted_at.split('T')[0])}`
    : `Creada el ${formatDate(report.created_at.split('T')[0])}`

  return (
    <Link href={`/expenses/${report.id}`}>
      {/* Borde visible + separación: sobre el fondo con degradé, la sombra sola
          no marcaba dónde termina una rendición y empieza la siguiente.
          rounded-item en vez del 12px hardcodeado — es el token del design system. */}
      <div className={[
        'bg-white rounded-item shadow-[0_1px_4px_rgba(0,0,0,.08)] overflow-hidden transition-shadow',
        isDraft
          ? 'border border-l-4 border-ink-200 border-l-amber-400 hover:shadow-[0_4px_12px_rgba(251,191,36,.25)]'
          : 'border border-ink-200 hover:shadow-md',
      ].join(' ')}>
        {/* p-3.5 y no p-4: la letra subió, el padding baja, la tarjeta queda igual */}
        <div className="p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {/* Sin truncate: el título se ve entero aunque ocupe dos líneas.
                  17px y no 19 para que pese menos, pero sigue por encima de la
                  fecha (15px) y del badge de estado (14px) — la jerarquía se mantiene. */}
              <p className="text-[17px] leading-snug font-semibold text-slate-800">{report.title}</p>
              <p className="card-meta text-slate-400 mt-0.5">{dateLabel}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <ReportStatusBadge status={report.status} />
              <CurrencyAmount amount={report.total_amount} currency="CLP" size="sm" />
            </div>
          </div>

          {report.status === 'partially_approved' && report.approved_amount > 0 && (
            <div className="mt-2 card-meta text-slate-500">
              Aprobado:{' '}
              <span className="font-[Manrope] tabular-nums font-bold text-emerald-600">
                $ {report.approved_amount.toLocaleString('es-CL')}
              </span>{' '}
              de $ {report.total_amount.toLocaleString('es-CL')}
            </div>
          )}
        </div>

        {/* Strip de acción para borradores */}
        {isDraft && (
          <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 flex items-center justify-between gap-2">
            <span className="card-meta text-amber-700 font-medium">
              ✏️ Borrador — podés seguir agregando gastos
            </span>
            <span className="card-meta font-bold text-amber-600 shrink-0">
              Abrir →
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}
