'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { UserProfile } from '@/lib/supabase/types'

interface MobileNavProps {
  user: UserProfile
}

const mobileItems = [
  { href: '/',             label: 'Estado', icon: '🏠', requiresSubmit: false, requiresApprove: false, requiresAdmin: false },
  { href: '/expenses/new', label: 'Rendir', icon: '📷', requiresSubmit: true,  requiresApprove: false, requiresAdmin: false },
  { href: '/approvals',    label: 'Aprobar',icon: '✅', requiresSubmit: false, requiresApprove: true,  requiresAdmin: false },
  { href: '/admin',        label: 'Admin',  icon: '📊', requiresSubmit: false, requiresApprove: false, requiresAdmin: true  },
]

export function MobileNav({ user }: MobileNavProps) {
  const pathname = usePathname()

  const visible = mobileItems.filter(item => {
    if (item.requiresSubmit && !user.can_submit) return false
    if (item.requiresApprove && !user.can_approve && user.role !== 'admin') return false
    if (item.requiresAdmin && user.role !== 'admin') return false
    return true
  })

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 z-50">
      <div className="flex">
        {visible.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex-1 flex flex-col items-center py-3 text-xs font-medium transition-colors',
              pathname === item.href ? 'text-brand-600' : 'text-slate-400'
            )}
          >
            <span className="text-xl mb-1">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
