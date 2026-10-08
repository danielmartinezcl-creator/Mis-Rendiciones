import { listPettyCashFunds } from '@/actions/petty-cash'
import { getHistoricalCajaChicaImports } from '@/actions/admin'
import { getOrgFundTransfers, getOrgEmployeesSimple } from '@/actions/fund-transfers'
import { getAuthProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { cargarOpcionesFiltro } from '@/lib/opciones-filtro'
import { fechaEnChile } from '@/lib/filtro-documentos'
import { leerFiltro, paramsDePagina } from '@/lib/filtro-url'
import { PettyCashClient } from './client'

export default async function PettyCashPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [profile, initialFunds, historicalImports, allTransfers, orgEmployees, params] = await Promise.all([
    getAuthProfile(),
    listPettyCashFunds(),
    getHistoricalCajaChicaImports().catch(() => []),
    getOrgFundTransfers().catch(() => []),
    getOrgEmployeesSimple().catch(() => []),
    searchParams,
  ])
  const opciones = await cargarOpcionesFiltro(await createClient(), initialFunds)

  const isManager = profile?.role === 'admin' || !!profile?.can_manage_petty_cash
  const pendingTransfers = allTransfers.filter(t => !t.matched)

  return (
    <PettyCashClient
      initialFunds={initialFunds}
      isManager={isManager}
      historicalImports={historicalImports}
      orgEmployees={orgEmployees}
      pendingTransfers={pendingTransfers}
      opciones={opciones}
      filtroInicial={leerFiltro(paramsDePagina(params))}
      hoy={fechaEnChile()}
    />
  )
}
