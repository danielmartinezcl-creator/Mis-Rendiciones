import { getOrgCategories, getOrgEmployees, getCostCenters } from '@/actions/admin'
import { HistoricalImportClient } from './client'

export default async function CargaHistoricaPage() {
  const [categories, employeesRes, costCenters] = await Promise.all([
    getOrgCategories(),
    getOrgEmployees(),
    getCostCenters(),
  ])

  return (
    <HistoricalImportClient
      categories={categories}
      employees={employeesRes}
      costCenters={costCenters}
    />
  )
}
