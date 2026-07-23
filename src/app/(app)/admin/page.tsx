import { getAdminKpis, getPendingToRenderList } from '@/actions/admin'
import { AdminKpiHero }          from '@/components/ui/AdminKpiHero'
import { CurrencyAmount }        from '@/components/ui/CurrencyAmount'
import { PendingToRenderPanel }  from '@/components/admin/PendingToRenderPanel'
import { ReceiptText, Users, Settings2, ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default async function AdminPage() {
  const [kpis, pendingList] = await Promise.all([
    getAdminKpis(),
    getPendingToRenderList(),
  ])

  // Tarjetas combinadas (rendiciones + caja chica)
  const cards = [
    {
      label:  'Pendientes de aprobación',
      count:  kpis.pendingCount  + kpis.pcPendingCount,
      amount: kpis.pendingAmount + kpis.pcPendingAmount,
      color:  'border-t-amber-400',
      href:   '/admin/reports?status=submitted',
    },
    {
      label:  'Aprobadas / Liquidadas (sin reembolsar)',
      count:  kpis.approvedCount  + kpis.pcApprovedCount,
      amount: kpis.approvedAmount + kpis.pcApprovedAmount,
      color:  'border-t-emerald-400',
      href:   '/admin/reports?status=approved',
    },
    {
      label:  'Reembolsadas',
      count:  kpis.reimbursedCount,
      amount: kpis.reimbursedAmount,
      color:  'border-t-sky-400',
      href:   '/admin/reports?status=reimbursed',
    },
  ]

  const totalAmount = kpis.pendingAmount + kpis.approvedAmount + kpis.reimbursedAmount
    + kpis.pcPendingAmount + kpis.pcApprovedAmount + kpis.pendingToRenderAmount

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink-900">Dashboard Admin</h1>
        <p className="text-sm text-ink-500 mt-1">Vista general de rendiciones y caja chica</p>
      </div>

      {/* Hero KPI */}
      <AdminKpiHero
        title="Movimiento total"
        total={totalAmount}
        secondary={[
          { label: 'Por aprobar',      value: kpis.pendingAmount  + kpis.pcPendingAmount,  color: 'amber' },
          { label: 'Sin reembolsar',   value: kpis.approvedAmount + kpis.pcApprovedAmount, color: 'emerald' },
        ]}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => (
          <Link
            key={card.label}
            href={card.href}
            className={`bg-white rounded-card shadow-card border-t-[3px] ${card.color} p-5 hover:shadow-md transition-shadow`}
          >
            <p className="text-xs font-medium text-ink-500 leading-tight mb-3">{card.label}</p>
            <p className="text-2xl font-bold text-ink-900 mb-0.5">{card.count}</p>
            <CurrencyAmount amount={card.amount} currency="CLP" size="sm" muted />
          </Link>
        ))}

        {/* Tarjeta especial — Pendiente de Rendición (expandible) */}
        <PendingToRenderPanel
          count={kpis.pendingToRenderCount}
          amount={kpis.pendingToRenderAmount}
          list={pendingList}
        />
      </div>

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
            className="flex items-center gap-3 bg-white rounded-card shadow-card p-4 hover:bg-ink-50 transition-colors"
          >
            <link.Icon size={18} className="text-brand-600 shrink-0" />
            <span className="text-sm font-medium text-ink-800">{link.label}</span>
            <ChevronRight size={14} className="ml-auto text-ink-300" />
          </Link>
        ))}
      </div>
    </div>
  )
}
