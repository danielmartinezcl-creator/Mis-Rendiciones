'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LogoutButton } from './LogoutButton'
import type { UserProfile } from '@/lib/supabase/types'

interface SidebarProps {
  user: UserProfile
}

const navItems = [
  { href: '/',                label: 'Inicio',          icon: '🏠', roles: ['admin','approver','employee'] as const },
  { href: '/expenses/new',    label: 'Nueva rendición', icon: '📷', roles: ['admin','employee'] as const },
  { href: '/approvals',       label: 'Aprobaciones',    icon: '✅', roles: ['admin','approver'] as const },
  { href: '/admin',           label: 'Dashboard Admin', icon: '📊', roles: ['admin'] as const },
  { href: '/admin/reports',   label: 'Rendiciones',     icon: '📋', roles: ['admin'] as const },
  { href: '/admin/employees', label: 'Empleados',       icon: '👥', roles: ['admin'] as const },
  { href: '/admin/settings',  label: 'Configuración',   icon: '⚙️', roles: ['admin'] as const },
]

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()

  const visible = navItems.filter(item =>
    (item.roles as readonly string[]).includes(user.role) ||
    (item.href === '/approvals' && user.can_approve)
  )

  return (
    <aside className="hidden md:flex flex-col w-64 bg-sidebar min-h-screen">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
            R
          </div>
          <span className="text-white font-semibold">Rindegastos</span>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {visible.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-item text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-brand-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-brand-600/30 rounded-full flex items-center justify-center text-brand-100 text-sm font-semibold">
            {user.full_name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{user.full_name}</p>
            <p className="text-slate-400 text-xs capitalize">{user.role}</p>
          </div>
        </div>
        <LogoutButton />
      </div>
    </aside>
  )
}
