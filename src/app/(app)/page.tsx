import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { ExpenseReportCard } from '@/components/expenses/ExpenseReportCard'
import { getMyReports } from '@/actions/expenses'
import type { ReportStatus } from '@/lib/constants'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const reports = await getMyReports()

  const pending  = reports.filter(r => r.status === 'draft')
    .reduce((s, r) => s + r.total_amount, 0)
  const inReview = reports.filter(r => ['submitted', 'pending_l2'].includes(r.status))
    .reduce((s, r) => s + r.total_amount, 0)
  const approved = reports.filter(r => ['approved', 'partially_approved'].includes(r.status))
    .reduce((s, r) => s + r.approved_amount, 0)

  const recent = reports.slice(0, 5)

  return (
    <div className="space-y-6 max-w-2xl mx-auto">

      {/* Card héroe con montos */}
      <Card hero>
        <div className="space-y-1">
          <p className="text-indigo-200 text-sm font-medium">Por cobrar (aprobado)</p>
          <CurrencyAmount amount={approved} currency="CLP" size="xl" className="text-white" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-indigo-300 text-xs">En revisión</p>
            <CurrencyAmount amount={inReview} currency="CLP" size="md" className="text-white" />
          </div>
          <div>
            <p className="text-indigo-300 text-xs">Borradores</p>
            <CurrencyAmount amount={pending} currency="CLP" size="md" className="text-white" />
          </div>
        </div>
      </Card>

      {/* CTA principal */}
      <Link href="/expenses/new">
        <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-6 rounded-[12px] text-base flex items-center justify-center gap-3 transition-colors">
          <span className="text-2xl">📷</span>
          Tomá la foto y listo
        </button>
      </Link>

      {/* Rendiciones recientes */}
      {recent.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Rendiciones recientes
          </h2>
          <div className="space-y-2">
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
            <Link href="/reimbursements" className="block text-center text-sm text-indigo-600 hover:underline">
              Ver todas ({reports.length})
            </Link>
          )}
        </div>
      )}

      {recent.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">🧾</p>
          <p className="font-medium">No tenés rendiciones aún</p>
          <p className="text-sm mt-1">Usá el botón de arriba para crear tu primera</p>
        </div>
      )}
    </div>
  )
}
