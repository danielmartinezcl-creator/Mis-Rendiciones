import { getOrgCategories, getOrgEmployees, getCostCenters, getHistoricalRendicionImports } from '@/actions/admin'
import { HistoricalImportClient } from './client'

export default async function CargaHistoricaPage() {
  const [categories, employeesRes, costCenters, historicalImports] = await Promise.all([
    getOrgCategories(),
    getOrgEmployees(),
    getCostCenters(),
    getHistoricalRendicionImports(),
  ])

  return (
    <HistoricalImportClient
      categories={categories}
      employees={employeesRes}
      costCenters={costCenters}
      historicalImports={historicalImports}
    />
  )
}
