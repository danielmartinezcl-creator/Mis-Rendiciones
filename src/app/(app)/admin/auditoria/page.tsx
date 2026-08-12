import { getAuditLog } from '@/actions/admin'
import { AuditoriaClient } from './client'

export const metadata = { title: 'Auditoría · Mi Rendición' }

export default async function AuditoriaPage() {
  const { items, total } = await getAuditLog({ limit: 50 })
  return <AuditoriaClient initial={items} total={total} />
}
