import { getReportFilterOptions } from '@/actions/reports'
import { InformesClient } from './client'

export const dynamic = 'force-dynamic'

export default async function InformesPage() {
  const filterOptions = await getReportFilterOptions()
  return <InformesClient filterOptions={filterOptions} />
}
