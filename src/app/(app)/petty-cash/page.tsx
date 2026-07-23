import { listPettyCashFunds, getActivePettyCashCategories } from '@/actions/petty-cash'
import { getHistoricalCajaChicaImports } from '@/actions/admin'
import { getAuthProfile } from '@/lib/auth'
import { PettyCashClient } from './client'

export default async function PettyCashPage() {
  const [profile, initialFunds, initialCategories, historicalImports] = await Promise.all([
    getAuthProfile(),
    listPettyCashFunds(),
    getActivePettyCashCategories(),
    getHistoricalCajaChicaImports().catch(() => []),
  ])

  const isManager = profile?.role === 'admin' || !!profile?.can_manage_petty_cash

  return (
    <PettyCashClient
      initialFunds={initialFunds}
      initialCategories={initialCategories}
      isManager={isManager}
      historicalImports={historicalImports}
    />
  )
}
