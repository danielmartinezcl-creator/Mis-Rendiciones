import { getExpensesByCenter } from '@/actions/admin'
import { getCostCenters } from '@/actions/admin'
import { AnalisisClient } from './client'

export const dynamic = 'force-dynamic'

export default async function AnalisisPage() {
  const [result, costCenters] = await Promise.all([
    getExpensesByCenter(6),
    getCostCenters(),
  ])

  return <AnalisisClient result={result} costCenters={costCenters} />
}
