'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ScanLine, CheckCircle2, BarChart3, Wallet,
  Lightbulb, Clock, MoreHorizontal, TrendingUp, BarChart2,
  WalletCards, PieChart, ReceiptText, Users, Settings2,
  Trash2, Zap, X, User,
} from 'lucide-react'
import type { UserProfile } from '@/lib/supabase/types'

interface MobileNavProps {
  user: UserProfile
}

type NavSection = 'personal' | 'reports' | 'admin'

interface NavItemDef {
  href:            string
  label:           string
  shortLabel:      string
  Icon:            React.ComponentType<{ size?: number; className?: string }>
  roles:           readonly ('admin' | 'approver' | 'employee')[]
  section:         NavSection | 'primary'
  requiresSubmit?: boolean
  requiresApprove?: boolean
}

// Lista completa — section 'primary' = candidata a tab principal
const ALL_ITEMS: NavItemDef[] = [
  { href: '/',                      label: 'Estado',          shortLabel: 'Estado',   Icon: LayoutDashboard, roles: ['admin','approver','employee'], section: 'primary' },
  { href: '/expenses/new',          label: 'Nueva rendición', shortLabel: 'Rendir',   Icon: ScanLine,        roles: ['admin','employee'],           section: 'primary', requiresSubmit: true },
  { href: '/quick',                 label: 'Gasto rápido',    shortLabel: 'Rápido',   Icon: Zap,             roles: ['admin','approver','employee'], section: 'primary' },
  { href: '/petty-cash',            label: 'Caja Chica',      shortLabel: 'C. Chica', Icon: Wallet,          roles: ['admin','approver','employee'], section: 'primary' },
  { href: '/approvals',             label: 'Aprobaciones',    shortLabel: 'Aprobar',  Icon: CheckCircle2,    roles: ['admin','approver'],           section: 'primary', requiresApprove: true },
  { href: '/mis-gastos',            label: 'Mis gastos',      shortLabel: 'Gastos',   Icon: TrendingUp,      roles: ['admin','approver','employee'], section: 'personal' },
  { href: '/suggestions',           label: 'Sugerencias',     shortLabel: 'Ideas',    Icon: Lightbulb,       roles: ['admin','approver','employee'], section: 'personal' },
  { href: '/profile',               label: 'Mi perfil',       shortLabel: 'Perfil',   Icon: User,            roles: ['admin','approver','employee'], section: 'personal' },
  { href: '/informes',              label: 'Informes',         shortLabel: 'Informes', Icon: BarChart2,       roles: ['admin','approver'],           section: 'reports' },
  { href: '/admin',                 label: 'Dashboard',        shortLabel: 'Admin',    Icon: BarChart3,       roles: ['admin'],                     section: 'admin' },
  { href: '/admin/fondos',          label: 'Saldos CC',        shortLabel: 'Fondos',   Icon: WalletCards,     roles: ['admin'],                     section: 'admin' },
  { href: '/admin/analisis',        label: 'Análisis CC',      shortLabel: 'Análisis', Icon: PieChart,        roles: ['admin'],                     section: 'admin' },
  { href: '/admin/reports',         label: 'Rendiciones',      shortLabel: 'Rendición',Icon: ReceiptText,     roles: ['admin'],                     section: 'admin' },
  { href: '/admin/employees',       label: 'Empleados',        shortLabel: 'Empleados',Icon: Users,           roles: ['admin'],                     section: 'admin' },
  { href: '/admin/settings',        label: 'Configuración',    shortLabel: 'Config.',  Icon: Settings2,       roles: ['admin'],                     section: 'admin' },
  { href: '/admin/trash',           label: 'Papelera',         shortLabel: 'Papelera', Icon: Trash2,          roles: ['admin'],                     section: 'admin' },
  { href: '/admin/carga-historica', label: 'Carga Histórica',  shortLabel: 'Historial',Icon: Clock,           roles: ['admin'],                     section: 'admin' },
]

const SECTION_LABELS: Record<NavSection, string> = {
  personal: 'Mis cosas',
  reports:  'Reportes',
  admin:    'Administración',
}

function isVisible(item: NavItemDef, user: UserProfile): boolean {
  if (!(item.roles as readonly string[]).includes(user.role)) return false
  if (item.requiresSubmit  && !user.can_submit)                               return false
  if (item.requiresApprove && !user.can_approve && user.role !== 'admin')     return false
  return true
}

// 4 hrefs prioritarios según rol — el resto va al sheet "Más"
function getPrimaryHrefs(user: UserProfile): string[] {
  if (user.role === 'admin')    return ['/', '/admin/reports', '/petty-cash', '/approvals']
  if (user.role === 'approver') return ['/', '/approvals', '/petty-cash', user.can_submit ? '/expenses/new' : '/quick']
  // employee
  const tabs: string[] = ['/']
  if (user.can_submit) tabs.push('/expenses/new')
  tabs.push('/quick', '/petty-cash')
  return tabs.slice(0, 4)
}

export function MobileNav({ user }: MobileNavProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Cerrar el sheet al navegar
  useEffect(() => { setOpen(false) }, [pathname])

  // Bloquear scroll del body mientras el sheet está abierto
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const primaryHrefs  = getPrimaryHrefs(user)
  const allVisible    = ALL_ITEMS.filter(i => isVisible(i, user))
  const primaryItems  = primaryHrefs
    .map(href => allVisible.find(i => i.href === href))
    .filter(Boolean) as NavItemDef[]
  const moreItems     = allVisible.filter(i => !primaryHrefs.includes(i.href))

  // Agrupar ítems del sheet por sección
  // Los items de sección 'primary' que no caben en la barra van bajo "Acciones"
  const sheetSections = [
    { key: 'actions', label: 'Acciones',       items: moreItems.filter(i => i.section === 'primary') },
    { key: 'personal', label: 'Mis cosas',     items: moreItems.filter(i => i.section === 'personal') },
    { key: 'reports',  label: 'Reportes',      items: moreItems.filter(i => i.section === 'reports') },
    { key: 'admin',    label: 'Administración',items: moreItems.filter(i => i.section === 'admin') },
  ].filter(s => s.items.length > 0)

  // ¿Algún ítem del sheet está activo? → resaltar botón "Más"
  const moreIsActive = moreItems.some(i => pathname === i.href)

  return (
    <>
      {/* ── Barra inferior ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-ink-200"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* h-16 = 64px, la altura original: la barra no debe crecer. Lo que crece
            es el contenido — ícono 28 (antes 21) y rótulo 13px (antes 10). Entran
            justos: 28 + 4 de gap + 13 = 45px, con ~9px de aire arriba y abajo.
            El padding inferior de <main> en layout.tsx (pb-20) está calculado
            contra esta altura — si cambia una, cambiar la otra. */}
        <div className="flex h-16">
          {primaryItems.map(item => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-1 transition-colors',
                  active ? 'text-brand-600' : 'text-ink-400'
                )}
              >
                <item.Icon size={28} />
                <span className="text-[13px] font-semibold leading-none">{item.shortLabel}</span>
              </Link>
            )
          })}

          {/* Botón "Más" */}
          <button
            onClick={() => setOpen(v => !v)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1.5 transition-colors',
              open || moreIsActive ? 'text-brand-600' : 'text-ink-400'
            )}
          >
            <MoreHorizontal size={28} />
            <span className="text-[13px] font-semibold leading-none">Más</span>
          </button>
        </div>
      </nav>

      {/* ── Sheet "Más" ── */}
      <div
        className={cn(
          'md:hidden fixed inset-0 z-50 flex flex-col justify-end transition-all duration-300',
          open ? 'visible' : 'invisible pointer-events-none',
        )}
      >
        {/* Fondo oscuro */}
        <div
          className={cn(
            'absolute inset-0 bg-black/50 transition-opacity duration-300',
            open ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setOpen(false)}
        />

        {/* Hoja */}
        <div
          className={cn(
            'relative bg-white rounded-t-[22px] max-h-[82vh] flex flex-col',
            'shadow-[0_-4px_40px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-out',
            open ? 'translate-y-0' : 'translate-y-full',
          )}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3">
            <div className="w-9 h-1 bg-ink-200 rounded-full" />
          </div>

          {/* Cabecera */}
          <div className="flex items-center justify-between px-5 pt-3 pb-3">
            <span className="font-display font-bold text-ink-900 text-[19px]">Menú</span>
            <button
              onClick={() => setOpen(false)}
              className="w-10 h-10 rounded-full bg-ink-100 flex items-center justify-center text-ink-500 transition-colors hover:bg-ink-200"
              aria-label="Cerrar menú"
            >
              <X size={18} />
            </button>
          </div>

          {/* Contenido scrollable */}
          <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">
            {sheetSections.map(section => (
              <div key={section.key}>
                <p className="card-label font-bold text-ink-400 px-3 mb-2">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map(item => {
                    const active = pathname === item.href
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-3.5 rounded-item text-[17px] font-semibold transition-colors',
                          active
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-ink-700 hover:bg-ink-50',
                        )}
                      >
                        <div className={cn(
                          'w-11 h-11 rounded-item flex items-center justify-center shrink-0 transition-colors',
                          active ? 'bg-brand-100' : 'bg-ink-100',
                        )}>
                          <item.Icon
                            size={22}
                            className={active ? 'text-brand-600' : 'text-ink-500'}
                          />
                        </div>
                        <span className="flex-1">{item.label}</span>
                        {active && (
                          <div className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
