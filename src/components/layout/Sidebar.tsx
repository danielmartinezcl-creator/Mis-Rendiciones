'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LogoutButton } from './LogoutButton'
import type { UserProfile } from '@/lib/supabase/types'

import {
  LayoutDashboard,
  ScanLine,
  CheckCircle2,
  BarChart3,
  ReceiptText,
  Users,
  Settings2,
  GripVertical,
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

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const [reordering, setReordering] = useState(false)

  const visible = NAV_ITEMS.filter(item =>
    (item.roles as readonly string[]).includes(user.role) ||
    (item.href === '/approvals' && user.can_approve)
  )

  const [items, setItems] = useState<NavItem[]>(visible)

  /* ── Drag state ── */
  const dragFrom = useRef<number | null>(null)
  const [dragIdx,  setDragIdx]  = useState<number | null>(null)   // item siendo arrastrado (visual)
  const [overIdx,  setOverIdx]  = useState<number | null>(null)   // posición destino (indicador)

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

  function handleDragStart(e: React.DragEvent, idx: number) {
    dragFrom.current = idx
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    /* fantasma transparente — el item en sí muestra el estado visual */
    const ghost = document.createElement('div')
    ghost.style.position = 'absolute'
    ghost.style.top = '-9999px'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => document.body.removeChild(ghost), 0)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragFrom.current !== idx) setOverIdx(idx)
  }

  function handleDrop(e: React.DragEvent, idx: number) {
    e.preventDefault()
    const from = dragFrom.current
    if (from === null || from === idx) { cleanDrag(); return }

    setItems(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(idx, 0, moved)
      localStorage.setItem(orderKey(user.id), JSON.stringify(next.map(i => i.href)))
      return next
    })
    cleanDrag()
  }

  function handleDragEnd() { cleanDrag() }

  function cleanDrag() {
    dragFrom.current = null
    setDragIdx(null)
    setOverIdx(null)
  }

  function handleResetOrder() {
    localStorage.removeItem(orderKey(user.id))
    setItems(visible)
    setReordering(false)
  }

  return (
    <aside className="hidden md:flex flex-col w-64 bg-sidebar min-h-screen select-none">

      {/* ── Logo / marca ── */}
      <div className="p-5 border-b border-white/8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-item flex items-center justify-center shrink-0"
               style={{ background: 'linear-gradient(135deg, #12152E, #3B4090)' }}>
            <ReceiptText size={18} className="text-white" />
          </div>
          <span className="font-display font-extrabold tracking-tight leading-none"
                style={{ fontSize: 17 }}>
            <span style={{ color: '#3DBAB5' }}>Penta</span>
            <span className="text-white"> Rend</span>
          </span>
        </div>
      </div>

      {/* ── Navegación ── */}
      <nav className="flex-1 p-3 space-y-0.5">
        {items.map((item, idx) => {
          const active    = pathname === item.href && !reordering
          const isDragged = reordering && dragIdx === idx
          const isOver    = reordering && overIdx === idx && dragIdx !== idx

          return (
            <div
              key={item.href}
              draggable={reordering}
              onDragStart={reordering ? e => handleDragStart(e, idx) : undefined}
              onDragOver={reordering  ? e => handleDragOver(e, idx)  : undefined}
              onDrop={reordering      ? e => handleDrop(e, idx)      : undefined}
              onDragEnd={reordering   ? handleDragEnd                : undefined}
              className={cn(
                'relative',
                reordering && (isDragged ? 'cursor-grabbing' : 'cursor-grab'),
              )}
            >
              {/* Indicador de posición destino */}
              {isOver && (
                <span className="absolute -top-px inset-x-2 h-0.5 rounded-full bg-brand-400 pointer-events-none z-10" />
              )}

              <Link
                href={reordering ? '#' : item.href}
                onClick={reordering ? e => e.preventDefault() : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-item text-sm font-semibold transition-all duration-150',
                  active
                    ? 'bg-brand-600 text-white shadow-brand'
                    : 'text-white/50 hover:text-white hover:bg-white/6',
                  isDragged && 'opacity-30 scale-[.97]',
                  isOver && 'bg-white/8',
                )}
              >
                {reordering
                  ? <GripVertical size={15} className="shrink-0 text-white/40" />
                  : <item.Icon size={17} className="shrink-0" />
                }
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
            onClick={() => { setReordering(r => !r); cleanDrag() }}
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
