import { getAdminReports } from '@/actions/admin'
import { AdminReportsClient } from './client'

export default async function AdminReportsPage() {
  const initialReports = await getAdminReports()
  return <AdminReportsClient initialReports={initialReports} />
}
