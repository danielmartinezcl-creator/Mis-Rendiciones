import { notFound } from 'next/navigation'
import { getRendicionParaAdmin } from '@/actions/admin'
import { RendicionAdminClient } from './client'

export default async function RendicionAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const inicial = await getRendicionParaAdmin(id)
  if (!inicial) notFound()
  return <RendicionAdminClient id={id} inicial={inicial} />
}
