import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ExpenseReportCard } from '@/components/expenses/ExpenseReportCard'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import type { ReportStatus } from '@/lib/constants'

export default async function ReimbursementsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: reports } = await supabase
    .from('expense_reports')
    .select('id, title, status, total_amount, approved_amount, currency, submitted_at, created_at, reimbursed_at, payment_reference')
    .eq('submitter_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const all             = reports ?? []
  const reimbursed      = all.filter(r => r.status === 'reimbursed')
  const totalReimbursed = reimbursed.reduce((s, r) => s + r.approved_amount, 0)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-slate-800">Mis rendiciones</h1>

      {/* KPI total reembolsado */}
      {reimbursed.length > 0 && (
        <div className="bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4">
          <p className="text-sm text-slate-500">Total reembolsado</p>
          <CurrencyAmount amount={totalReimbursed} currency="CLP" size="lg" />
        </div>
      )}

      {/* Lista completa */}
      <div className="space-y-2">
        {all.map(report => (
          <div key={report.id}>
            <ExpenseReportCard
              report={{
                ...report,
                status:   report.status as ReportStatus,
                currency: report.currency ?? 'CLP',
              }}
            />
            {report.status === 'reimbursed' && report.payment_reference && (
              <p className="text-xs text-slate-400 ml-2 mt-1">
                Ref: {report.payment_reference}
                {report.reimbursed_at && ` · ${new Date(report.reimbursed_at).toLocaleDateString('es-CL')}`}
              </p>
            )}
          </div>
        ))}
      </div>

      {all.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">🧾</p>
          <p className="font-medium">Sin rendiciones aún</p>
        </div>
      )}
    </div>
  )
}
