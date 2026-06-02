import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { LogoutButton } from '@/components/layout/LogoutButton'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  return (
    <div className="flex min-h-screen">
      <Sidebar user={profile} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden bg-sidebar px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
            R
          </div>
          <span className="text-white font-semibold text-sm">Rindegastos</span>
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>
      <MobileNav user={profile} />
    </div>
  )
}
