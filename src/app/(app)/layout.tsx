import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getAuthUser, getAuthProfile } from '@/lib/auth'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { LogoutButton } from '@/components/layout/LogoutButton'

// Mueve las funciones a São Paulo — reduce latencia Chile → DC (170ms) a Chile → GRU (30ms)
export const preferredRegion = 'gru1'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, profile] = await Promise.all([
    getAuthUser(),
    getAuthProfile(),
  ])

  if (!user || !profile) redirect('/login')

  return (
    <div className="flex min-h-screen">
      <Sidebar user={profile} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden bg-sidebar px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
            P
          </div>
          <span className="text-white font-semibold text-sm">Penta Rend</span>
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
          <Suspense fallback={<PageSkeleton />}>
            {children}
          </Suspense>
        </main>
      </div>
      <MobileNav user={profile} />
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-32 bg-ink-100 rounded-card" />
      <div className="h-12 bg-ink-100 rounded-card" />
      <div className="space-y-2">
        <div className="h-16 bg-ink-100 rounded-card" />
        <div className="h-16 bg-ink-100 rounded-card" />
        <div className="h-16 bg-ink-100 rounded-card" />
      </div>
    </div>
  )
}
