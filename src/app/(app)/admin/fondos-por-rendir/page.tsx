import { FondosPorRendirClient } from './client'
import { getFondosPorRendir } from '@/actions/fondos-por-rendir'

export const metadata = { title: 'Fondos por Rendir — Mi Rendición' }

export default async function FondosPorRendirPage() {
  const datos = await getFondosPorRendir()
  return <FondosPorRendirClient inicial={datos} />
}
