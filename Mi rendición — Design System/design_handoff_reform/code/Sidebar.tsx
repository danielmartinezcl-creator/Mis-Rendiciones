'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LogoutButton } from './LogoutButton'
import type { UserProfile } from '@/lib/supabase/types'

/**
 * REFORMA VISUAL — Cambios aplicados:
 * 1. Emoji → Lucide React icons (npm install lucide-react)
 * 2. Colores brand: indigo → teal (#0D9488)
 * 3. Sidebar bg: #0f172a → #0B1120 (ink-900, azul-negro frío)
 * 4. Hover/active states actualizados
 * 5. Logo: "R" con bg-brand-600 → monograma teal con ícono receipt
 */

import {
  LayoutDashboard,
  ScanLine,
  CheckCircle2,
  BarChart3,
  ReceiptText,
  Users,
  Settings2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Check,
} from 'lucide-react'

interface SidebarProps {
  user: UserProfile
}

const NAV_ITEMS = [
  { href: '/',                label: 'Estado',          Icon: LayoutDashboard, roles: ['admin','approver','employee'] as const },
  { href: '/expenses/new',    label: 'Nueva rendición', Icon: ScanLine,         roles: ['admin','employee'] as const },
  { href: '/approvals',       label: 'Aprobaciones',    Icon: CheckCircle2,     roles: ['admin','approver'] as const },
  { href: '/admin',           label: 'Dashboard',       Icon: BarChart3,        roles: ['admin'] as const },
  { href: '/admin/reports',   label: 'Rendiciones',     Icon: ReceiptText,      roles: ['admin'] as const },
  { href: '/admin/employees', label: 'Empleados',       Icon: Users,            roles: ['admin'] as const },
  { href: '/admin/settings',  label: 'Configuración',   Icon: Settings2,        roles: ['admin'] as const },
]

type NavItem = typeof NAV_ITEMS[number]

function orderKey(userId: string) { return `sidebar_order_${userId}` }

function applyOrder(items: NavItem[], saved: string[]): NavItem[] {
  if (!saved.length) return items
  return [...items].sort((a, b) => {
    const ia = saved.indexOf(a.href)
    const ib = saved.indexOf(b.href)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
}

function moveItem(arr: NavItem[], from: number, dir: -1 | 1): NavItem[] {
  const to = from + dir
  if (to < 0 || to >= arr.length) return arr
  const next = [...arr]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

export function Sidebar({ user }: SidebarProps) {
  const pathname   = usePathname()
  const [reordering, setReordering] = useState(false)

  const visible = NAV_ITEMS.filter(item =>
    (item.roles as readonly string[]).includes(user.role) ||
    (item.href === '/approvals' && user.can_approve)
  )

  const [items, setItems] = useState<NavItem[]>(visible)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(orderKey(user.id))
      if (raw) {
        const saved: string[] = JSON.parse(raw)
        setItems(applyOrder(visible, saved))
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  function handleMove(idx: number, dir: -1 | 1) {
    setItems(prev => {
      const next = moveItem(prev, idx, dir)
      localStorage.setItem(orderKey(user.id), JSON.stringify(next.map(i => i.href)))
      return next
    })
  }

  function handleResetOrder() {
    localStorage.removeItem(orderKey(user.id))
    setItems(visible)
    setReordering(false)
  }

  return (
    <aside className="hidden md:flex flex-col w-64 bg-sidebar min-h-screen">

      {/* ── Logo / marca ── */}
      <div className="p-5 border-b border-white/8">
        <div className="flex items-center gap-3">
          {/* Monograma: fondo degradé ink→teal con ícono */}
          <div className="w-9 h-9 rounded-item flex items-center justify-center shrink-0"
               style={{ background: 'linear-gradient(135deg, #0B1120, #0F766E)' }}>
            <ReceiptText size={18} className="text-white" />
          </div>
          <span className="font-display font-extrabold tracking-tight leading-none"
                style={{ fontSize: 17 }}>
            <span className="text-brand-300">mi</span>
            <span className="text-white"> rendición</span>
          </span>
        </div>
      </div>

      {/* ── Navegación ── */}
      <nav className="flex-1 p-3 space-y-0.5">
        {items.map((item, idx) => {
          const active = pathname === item.href && !reordering
          return (
            <div key={item.href} className="flex items-center gap-1 group/item">
              {/* Flechas de reordenación */}
              {reordering && (
                <div className="flex flex-col shrink-0">
                  <button
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0}
                    className="h-4 w-5 text-white/30 hover:text-white disabled:opacity-20 flex items-center justify-center transition-colors"
                    title="Subir"
                  >
                    <ChevronUp size={10} />
                  </button>
                  <button
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === items.length - 1}
                    className="h-4 w-5 text-white/30 hover:text-white disabled:opacity-20 flex items-center justify-center transition-colors"
                    title="Bajar"
                  >
                    <ChevronDown size={10} />
                  </button>
                </div>
              )}

              <Link
                href={reordering ? '#' : item.href}
                onClick={reordering ? e => e.preventDefault() : undefined}
                className={cn(
                  'flex-1 flex items-center gap-3 px-3 py-2.5 rounded-item text-sm font-semibold transition-all duration-150',
                  active
                    ? 'bg-brand-600 text-white shadow-brand'
                    : 'text-white/50 hover:text-white hover:bg-white/6',
                  reordering && 'cursor-grab select-none opacity-90'
                )}
              >
                <item.Icon size={17} />
                {item.label}
              </Link>
            </div>
          )
        })}
      </nav>

      {/* ── Personalizar — solo admin ── */}
      {user.role === 'admin' && (
        <div className="px-3 pb-2 space-y-1">
          <button
            onClick={() => setReordering(r => !r)}
            className={cn(
              'w-full text-xs py-1.5 px-3 rounded-item transition-colors text-left font-semibold flex items-center gap-2',
              reordering
                ? 'bg-brand-600 text-white'
                : 'text-white/30 hover:text-white/60 hover:bg-white/5'
            )}
          >
            {reordering
              ? <><Check size={12} />Listo — orden guardado</>
              : <><GripVertical size={12} />Personalizar menú</>}
          </button>
          {reordering && (
            <button
              onClick={handleResetOrder}
              className="w-full text-xs py-1 text-white/30 hover:text-white/60 transition-colors text-left px-3 flex items-center gap-2"
            >
              <RotateCcw size={11} />Restaurar orden original
            </button>
          )}
        </div>
      )}

      {/* ── Usuario ── */}
      <div className="p-4 border-t border-white/8">
        <Link
          href="/profile"
          className="flex items-center gap-3 mb-3 rounded-item px-2 py-2 hover:bg-white/8 transition-colors group"
        >
          <div className="w-8 h-8 bg-brand-800 rounded-full flex items-center justify-center text-brand-300 text-sm font-bold shrink-0">
            {user.full_name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">{user.full_name}</p>
            <p className="text-white/40 text-xs group-hover:text-white/60 transition-colors">Mi perfil</p>
          </div>
        </Link>
        <LogoutButton />
      </div>
    </aside>
  )
}
