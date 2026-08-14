import { redirect } from 'next/navigation'
import { getBankQueue } from '@/actions/admin'
import { BancoClient } from './client'

export const metadata = { title: 'Cola Bancaria — Mi rendición' }

export default async function BancoPage() {
  const queue = await getBankQueue()

  if (!queue.isAdmin && !queue.canLoad && !queue.canAuth) {
    redirect('/')
  }

  return <BancoClient queue={queue} />
}
