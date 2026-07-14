import { listPettyCashFunds, getActivePettyCashCategories } from '@/actions/petty-cash'
import { createClient } from '@/lib/supabase/server'
import { PettyCashClient } from './client'

export default async function PettyCashPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [initialFunds, initialCategories, profileRes] = await Promise.all([
    listPettyCashFunds(),
    getActivePettyCashCategories(),
    user
      ? supabase.from('users').select('role, can_manage_petty_cash').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
  ])

  const profile   = profileRes.data
  const isManager = profile?.role === 'admin' || !!profile?.can_manage_petty_cash

  return (
    <PettyCashClient
      initialFunds={initialFunds}
      initialCategories={initialCategories}
      isManager={isManager}
    />
  )
}
