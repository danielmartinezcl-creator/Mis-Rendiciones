'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, ScanLine, CheckCircle2, BarChart3 } from 'lucide-react'
import type { UserProfile } from '@/lib/supabase/types'

interface MobileNavProps {
  user: UserProfile
}

const mobileItems = [
  { href: '/',             label: 'Estado', Icon: LayoutDashboard, requiresSubmit: false, requiresApprove: false, requiresAdmin: false },
  { href: '/expenses/new', label: 'Rendir', Icon: ScanLine,        requiresSubmit: true,  requiresApprove: false, requiresAdmin: false },
  { href: '/approvals',    label: 'Aprobar',Icon: CheckCircle2,    requiresSubmit: false, requiresApprove: true,  requiresAdmin: false },
  { href: '/admin',        label: 'Admin',  Icon: BarChart3,       requiresSubmit: false, requiresApprove: false, requiresAdmin: true  },
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
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-ink-200 z-50">
      <div className="flex">
        {visible.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex-1 flex flex-col items-center py-3 text-xs font-semibold transition-colors gap-1',
              pathname === item.href ? 'text-brand-600' : 'text-ink-400'
            )}
          >
            <item.Icon size={20} />
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
