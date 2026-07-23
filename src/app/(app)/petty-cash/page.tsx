import { listPettyCashFunds, getActivePettyCashCategories } from '@/actions/petty-cash'
import { getHistoricalCajaChicaImports } from '@/actions/admin'
import { getOrgFundTransfers, getOrgEmployeesSimple } from '@/actions/fund-transfers'
import { getAuthProfile } from '@/lib/auth'
import { PettyCashClient } from './client'

export default async function PettyCashPage() {
  const [profile, initialFunds, initialCategories, historicalImports, allTransfers, orgEmployees] = await Promise.all([
    getAuthProfile(),
    listPettyCashFunds(),
    getActivePettyCashCategories(),
    getHistoricalCajaChicaImports().catch(() => []),
    getOrgFundTransfers().catch(() => []),
    getOrgEmployeesSimple().catch(() => []),
  ])

  const isManager = profile?.role === 'admin' || !!profile?.can_manage_petty_cash
  const pendingTransfers = allTransfers.filter(t => !t.matched)

  return (
    <PettyCashClient
      initialFunds={initialFunds}
      initialCategories={initialCategories}
      isManager={isManager}
      historicalImports={historicalImports}
      orgEmployees={orgEmployees}
      pendingTransfers={pendingTransfers}
    />
  )
}
