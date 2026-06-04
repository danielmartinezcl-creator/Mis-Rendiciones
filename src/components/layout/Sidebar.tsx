'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LogoutButton } from './LogoutButton'
import type { UserProfile } from '@/lib/supabase/types'

interface SidebarProps {
  user: UserProfile
}

const NAV_ITEMS = [
  { href: '/',                label: 'Estado',          icon: '🏠', roles: ['admin','approver','employee'] as const },
  { href: '/expenses/new',    label: 'Nueva rendición', icon: '📷', roles: ['admin','employee'] as const },
  { href: '/approvals',       label: 'Aprobaciones',    icon: '✅', roles: ['admin','approver'] as const },
  { href: '/admin',           label: 'Dashboard Admin', icon: '📊', roles: ['admin'] as const },
  { href: '/admin/reports',   label: 'Rendiciones',     icon: '📋', roles: ['admin'] as const },
  { href: '/admin/employees', label: 'Empleados',       icon: '👥', roles: ['admin'] as const },
  { href: '/admin/settings',  label: 'Configuración',   icon: '⚙️', roles: ['admin'] as const },
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

  // Cargar orden guardado del usuario
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
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
            R
          </div>
          <span className="text-white font-semibold">Rindegastos</span>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 p-4 space-y-0.5">
        {items.map((item, idx) => (
          <div key={item.href} className="flex items-center gap-1 group/item">
            {/* Flechas de reordenación */}
            {reordering && (
              <div className="flex flex-col shrink-0">
                <button
                  onClick={() => handleMove(idx, -1)}
                  disabled={idx === 0}
                  className="h-4 w-5 text-slate-400 hover:text-white disabled:opacity-20 text-[9px] flex items-center justify-center transition-colors"
                  title="Subir"
                >▲</button>
                <button
                  onClick={() => handleMove(idx, 1)}
                  disabled={idx === items.length - 1}
                  className="h-4 w-5 text-slate-400 hover:text-white disabled:opacity-20 text-[9px] flex items-center justify-center transition-colors"
                  title="Bajar"
                >▼</button>
              </div>
            )}

            <Link
              href={reordering ? '#' : item.href}
              onClick={reordering ? e => e.preventDefault() : undefined}
              className={cn(
                'flex-1 flex items-center gap-3 px-3 py-2.5 rounded-item text-sm font-medium transition-colors',
                pathname === item.href && !reordering
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/10',
                reordering && 'cursor-grab select-none opacity-90'
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          </div>
        ))}
      </nav>

      {/* Botón personalizar — solo visible para admin */}
      {user.role === 'admin' && (
        <div className="px-4 pb-2 space-y-1">
          <button
            onClick={() => setReordering(r => !r)}
            className={cn(
              'w-full text-xs py-1.5 px-3 rounded-[8px] transition-colors text-left font-medium',
              reordering
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            )}
          >
            {reordering ? '✓ Listo — orden guardado' : '⠿ Personalizar menú'}
          </button>
          {reordering && (
            <button
              onClick={handleResetOrder}
              className="w-full text-xs py-1 text-slate-500 hover:text-slate-300 transition-colors text-left px-3"
            >
              ↺ Restaurar orden original
            </button>
          )}
        </div>
      )}

      {/* Usuario + perfil */}
      <div className="p-4 border-t border-white/10">
        <Link href="/profile" className="flex items-center gap-3 mb-3 rounded-item px-1 py-1 hover:bg-white/10 transition-colors group">
          <div className="w-8 h-8 bg-brand-600/30 rounded-full flex items-center justify-center text-brand-100 text-sm font-semibold shrink-0">
            {user.full_name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{user.full_name}</p>
            <p className="text-slate-400 text-xs group-hover:text-slate-300">Mi perfil</p>
          </div>
        </Link>
        <LogoutButton />
      </div>
    </aside>
  )
}
