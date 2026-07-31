import { getExpensesByCenter, getItemsWithoutCC, getCostCenters } from '@/actions/admin'
import { AnalisisClient } from './client'

export const dynamic = 'force-dynamic'

export default async function AnalisisPage() {
  const [result, itemsWithoutCC, costCenters] = await Promise.all([
    getExpensesByCenter(6),
    getItemsWithoutCC(),
    getCostCenters(),
  ])

  return <AnalisisClient result={result} itemsWithoutCC={itemsWithoutCC} costCenters={costCenters} />
}
