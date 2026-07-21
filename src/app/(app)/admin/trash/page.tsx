import { getTrashItems } from '@/actions/admin'
import { TrashClient } from './client'

export default async function TrashPage() {
  const items = await getTrashItems()
  return <TrashClient initialItems={items} />
}
