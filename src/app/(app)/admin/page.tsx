import { getAdminKpis } from '@/actions/admin'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import Link from 'next/link'

export default async function AdminPage() {
  const kpis = await getAdminKpis()

  const cards = [
    {
      label:   'Pendientes de aprobación',
      count:   kpis.pendingCount,
      amount:  kpis.pendingAmount,
      color:   'border-t-amber-400',
      href:    '/admin/reports?status=submitted',
      icon:    '⏳',
    },
    {
      label:   'Aprobadas (sin reembolsar)',
      count:   kpis.approvedCount,
      amount:  kpis.approvedAmount,
      color:   'border-t-emerald-400',
      href:    '/admin/reports?status=approved',
      icon:    '✅',
    },
    {
      label:   'Reembolsadas',
      count:   kpis.reimbursedCount,
      amount:  kpis.reimbursedAmount,
      color:   'border-t-blue-400',
      href:    '/admin/reports?status=reimbursed',
      icon:    '💸',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Dashboard Administrador</h1>
        <p className="text-sm text-slate-500 mt-1">Vista general de rendiciones de la organización</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map(card => (
          <Link
            key={card.label}
            href={card.href}
            className={`bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] border-t-[3px] ${card.color} p-5 hover:shadow-[0_2px_8px_rgba(0,0,0,.10)] transition-shadow`}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{card.icon}</span>
              <p className="text-xs font-medium text-slate-500 leading-tight">{card.label}</p>
            </div>
            <p className="text-2xl font-bold text-slate-800 mb-0.5">{card.count}</p>
            <CurrencyAmount amount={card.amount} currency="CLP" size="sm" muted />
          </Link>
        ))}
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { href: '/admin/reports',   label: 'Todas las rendiciones', icon: '📋' },
          { href: '/admin/employees', label: 'Gestionar empleados',   icon: '👥' },
          { href: '/admin/settings',  label: 'Categorías y políticas',icon: '⚙️' },
        ].map(link => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4 hover:bg-slate-50 transition-colors"
          >
            <span className="text-2xl">{link.icon}</span>
            <span className="text-sm font-medium text-slate-700">{link.label}</span>
            <span className="ml-auto text-slate-300">→</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
