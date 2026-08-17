import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { ExpenseReportCard } from '@/components/expenses/ExpenseReportCard'
import { getMyReports } from '@/actions/expenses'
import { ReceiptText, AlertCircle } from 'lucide-react'
import type { ReportStatus } from '@/lib/constants'

export default async function DashboardPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const reports = await getMyReports()

  const pending  = reports.filter(r => r.status === 'draft')
    .reduce((s, r) => s + r.total_amount, 0)
  const inReview = reports.filter(r => ['submitted', 'pending_l2'].includes(r.status))
    .reduce((s, r) => s + r.total_amount, 0)
  const approved = reports.filter(r => ['approved', 'partially_approved'].includes(r.status))
    .reduce((s, r) => s + r.approved_amount, 0)

  const rejected = reports.filter(r => r.status === 'rejected')
  const recent   = reports.slice(0, 5)

  // space-y-3 (12px): la distancia entre la card de montos y "Rendiciones
  // recientes" queda igual a la separación entre una rendición y la siguiente
  return (
    <div className="space-y-3 max-w-2xl mx-auto">

      {/* Card héroe con montos */}
      <Card hero>
        {/* Interlineados y separaciones ajustados a la baja para compensar la
            subida de tamaño: la letra crece, la tarjeta no. */}
        <div className="space-y-1.5">
          <p className="card-eyebrow text-brand-300">Por cobrar (aprobado)</p>
          <CurrencyAmount amount={approved} currency="CLP" size="xl" className="text-white block" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            {/* brand-300 y no brand-400: a 17px sobre el degradé oscuro, el 400 queda flojo */}
            <p className="card-label text-brand-300 mb-1">En revisión</p>
            <CurrencyAmount amount={inReview} currency="CLP" size="md" className="text-white block" />
          </div>
          <div>
            <p className="card-label text-brand-300 mb-1">Borradores</p>
            <CurrencyAmount amount={pending} currency="CLP" size="md" className="text-white block" />
          </div>
        </div>
      </Card>

      {/* Banner de rendición rechazada */}
      {rejected.length > 0 && (
        <Link
          href={`/expenses/${rejected[0].id}`}
          className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-card p-3 hover:bg-red-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={20} className="text-red-500 shrink-0" />
            <p className="card-label font-medium text-red-700">
              {rejected.length === 1
                ? 'Una rendición fue rechazada — revisá los motivos'
                : `${rejected.length} rendiciones fueron rechazadas`}
            </p>
          </div>
          <span className="card-meta text-red-600 font-semibold shrink-0">Ver →</span>
        </Link>
      )}

      {/* El CTA "Tomá la foto y listo" se quitó a pedido. La entrada para crear
          una rendición sigue disponible en la barra inferior ("Rendir") y en /quick. */}

      {/* Rendiciones recientes */}
      {recent.length > 0 && (
        <div>
          {/* pl-1: el título arranca 4px a la derecha. Sin eso queda ópticamente
              más a la izquierda que las tarjetas, porque el radio de 14px de la
              esquina hace que su contenido parezca entrar más adentro. */}
          <h2 className="section-title text-ink-500 pl-1 mb-2">
            Rendiciones recientes
          </h2>
          {/* space-y-3: la misma separación que hay entre la card de montos y
              este bloque — un solo ritmo de 12px en toda la pantalla */}
          <div className="space-y-3">
            {recent.map(report => (
              <ExpenseReportCard
                key={report.id}
                report={{
                  ...report,
                  status:   report.status as ReportStatus,
                  currency: report.currency ?? 'CLP',
                }}
              />
            ))}
          </div>
          {reports.length > 5 && (
            <Link href="/reimbursements" className="block text-center card-label text-brand-600 hover:underline mt-3">
              Ver todas ({reports.length})
            </Link>
          )}
        </div>
      )}

      {recent.length === 0 && (
        <div className="text-center py-12 text-ink-400">
          <ReceiptText size={44} className="mx-auto mb-3 opacity-40" />
          <p className="card-eyebrow">No tenés rendiciones aún</p>
          {/* El texto apuntaba al botón "Tomá la foto y listo", que ya no está */}
          <p className="card-label mt-1">Tocá «Rendir» en la barra de abajo para crear tu primera</p>
        </div>
      )}
    </div>
  )
}
