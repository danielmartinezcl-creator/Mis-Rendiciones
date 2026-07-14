import { getFundDetail } from '@/actions/petty-cash'
import { FundDetailClient } from './client'

export default async function FundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const initialDetail = await getFundDetail(id)
  return <FundDetailClient id={id} initialDetail={initialDetail} />
}
