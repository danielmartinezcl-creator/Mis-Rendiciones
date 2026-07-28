// Datos en tiempo real — no cachear en el Router Cache de Next.js
export const dynamic = 'force-dynamic'

import {
  getAdminKpis,
  getPendingToRenderList,
  getPendingApprovalList,
  getPendingReimbursementList,
  getExpenseCategoryBreakdown,
} from '@/actions/admin'
import { AdminKpiHero }              from '@/components/ui/AdminKpiHero'
import { PendingApprovalPanel }      from '@/components/admin/PendingApprovalPanel'
import { PendingReimbursementPanel } from '@/components/admin/PendingReimbursementPanel'
import { PendingToRenderPanel }      from '@/components/admin/PendingToRenderPanel'
import { CategoryDonutChart }        from '@/components/admin/CategoryDonutChart'
import { ReceiptText, Users, Settings2, ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default async function AdminPage() {
  const [kpis, pendingList, approvalList, reimbursementList, categoryBreakdown] = await Promise.all([
    getAdminKpis(),
    getPendingToRenderList(),
    getPendingApprovalList(),
    getPendingReimbursementList(),
    getExpenseCategoryBreakdown(),
  ])

  // Totales combinados (rendiciones + caja chica)
  const approvalCount  = kpis.pendingCount  + kpis.pcPendingCount
  const approvalAmount = kpis.pendingAmount + kpis.pcPendingAmount

  // Solo rendiciones aprobadas sin reembolsar (cajas chicas históricas ya excluidas del KPI)
  const reimbursementCount  = kpis.approvedCount
  const reimbursementAmount = kpis.approvedAmount

  // Reembolsadas: rendiciones reembolsadas + cajas chicas liquidadas (settled)
  const completedCount  = kpis.reimbursedCount  + kpis.pcApprovedCount
  const completedAmount = kpis.reimbursedAmount + kpis.pcApprovedAmount

  // Pendiente de rendición: suma directa desde la lista (incluye históricas con adelanto)
  const toRenderAmount =
    pendingList.pettyCashFunds.reduce((s, f) => s + f.amount, 0) +
    pendingList.historicalImports.reduce((s, h) => s + h.amount, 0)

  // Hero: lo que la empresa debe a empleados − lo que empleados deben rendir
  const heroTotal = reimbursementAmount - toRenderAmount

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-extrabold text-3xl tracking-tight text-ink-900">Dashboard Admin</h1>
        <p className="text-base text-ink-500 mt-1">Vista general de rendiciones y caja chica</p>
      </div>

      {/* Hero KPI — saldo neto: cuánto debe la empresa a empleados menos lo pendiente de rendir */}
      <AdminKpiHero
        title="Saldo neto empresa ↔ empleados"
        total={heroTotal}
        secondary={[
          { label: 'A reembolsar a empleados', value: reimbursementAmount, color: 'emerald' },
          { label: 'Pendiente de rendir',      value: toRenderAmount,      color: 'amber'   },
        ]}
      />

      {/* KPI cards — todas expandibles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PendingApprovalPanel
          count={approvalCount}
          amount={approvalAmount}
          list={approvalList}
        />

        <PendingReimbursementPanel
          count={reimbursementCount}
          amount={reimbursementAmount}
          list={reimbursementList}
        />

        {/* Reembolsadas — rendiciones pagadas + cajas chicas liquidadas */}
        <Link
          href="/admin/reports?status=reimbursed"
          className="bg-white rounded-card shadow-card border-t-[3px] border-t-sky-400 p-5 hover:shadow-md transition-shadow"
        >
          <p className="text-base font-medium text-ink-500 leading-tight mb-3">Reembolsadas</p>
          <p className="text-3xl font-bold text-ink-900 mb-0.5">{completedCount}</p>
          <p className="text-base font-mono-amount font-semibold text-sky-600">
            {'$ ' + Math.round(completedAmount).toLocaleString('es-CL')}
          </p>
        </Link>

        <PendingToRenderPanel list={pendingList} />
      </div>

      {/* Gráfico de gastos por categoría */}
      <CategoryDonutChart data={categoryBreakdown} />

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { href: '/admin/reports',   label: 'Todas las rendiciones',  Icon: ReceiptText },
          { href: '/admin/employees', label: 'Gestionar empleados',     Icon: Users },
          { href: '/admin/settings',  label: 'Categorías y políticas',  Icon: Settings2 },
        ].map(link => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 bg-white rounded-card shadow-card p-5 hover:bg-ink-50 transition-colors"
          >
            <link.Icon size={20} className="text-brand-600 shrink-0" />
            <span className="text-base font-medium text-ink-800">{link.label}</span>
            <ChevronRight size={16} className="ml-auto text-ink-300" />
          </Link>
        ))}
      </div>
    </div>
  )
}
