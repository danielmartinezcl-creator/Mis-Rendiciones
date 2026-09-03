import Link from 'next/link'
import { InsigniaEstado } from '@/components/ui/InsigniaEstado'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { formatDate, formatDisplayTitle, getStatusLabel, isLongStatusLabel } from '@/lib/utils'
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

  // Los estados bancarios tienen etiquetas de 24 y 31 caracteres. Como el badge
  // lleva shrink-0, en la misma fila le dejaban 61px al título — se apilaba casi
  // letra por letra. Cuando la etiqueta es larga, baja a su propia fila.
  const statusIsLong = isLongStatusLabel(getStatusLabel(report.status))

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
          ? 'border border-l-4 border-ink-200 border-l-warning-400 hover:shadow-[0_4px_12px_rgba(251,191,36,.25)]'
          : 'border border-ink-200 hover:shadow-md',
      ].join(' ')}>
        {/* p-3.5 y no p-4: la letra subió, el padding baja, la tarjeta queda igual */}
        <div className="p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {/* Sin truncate: el título se ve entero aunque ocupe dos líneas.
                  16px y no 19 para que pese menos, pero sigue por encima de la
                  fecha (15px) y del badge de estado (14px) — la jerarquía se mantiene.
                  formatDisplayTitle saca el TODO EN MAYÚSCULAS, que era lo que le
                  daba el protagonismo visual. */}
              <p className="text-[16px] leading-snug font-semibold text-ink-800">
                {formatDisplayTitle(report.title)}
              </p>
              <p className="card-meta text-ink-400 mt-0.5">{dateLabel}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {!statusIsLong && <InsigniaEstado tipo="reporte" estado={report.status} />}
              <CurrencyAmount amount={report.total_amount} currency="CLP" size="sm" fit />
            </div>
          </div>

          {/* Fila propia para las etiquetas largas: el título recupera el ancho
              completo de la tarjeta (de 61px a 285px en el peor caso) */}
          {statusIsLong && (
            <div className="mt-2.5 flex justify-end">
              <InsigniaEstado tipo="reporte" estado={report.status} />
            </div>
          )}

          {report.status === 'partially_approved' && report.approved_amount > 0 && (
            <div className="mt-2 card-meta text-ink-500">
              Aprobado:{' '}
              <span className="font-[Manrope] tabular-nums font-bold text-success-600">
                $ {report.approved_amount.toLocaleString('es-CL')}
              </span>{' '}
              de $ {report.total_amount.toLocaleString('es-CL')}
            </div>
          )}
        </div>

        {/* Strip de acción para borradores */}
        {isDraft && (
          <div className="px-4 py-2.5 bg-warning-50 border-t border-warning-100 flex items-center justify-between gap-2">
            <span className="card-meta text-warning-700 font-medium">
              ✏️ Borrador — podés seguir agregando gastos
            </span>
            <span className="card-meta font-bold text-warning-600 shrink-0">
              Abrir →
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}
