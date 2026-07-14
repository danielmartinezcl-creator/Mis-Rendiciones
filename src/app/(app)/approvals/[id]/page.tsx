import { getReportForApproval } from '@/actions/approvals'
import { getApprovalAttachments } from '@/actions/approval-attachments'
import { ApprovalDetailClient } from './client'

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [initialReport, initialAttachments] = await Promise.all([
    getReportForApproval(id),
    getApprovalAttachments({ reportId: id }),
  ])
  return (
    <ApprovalDetailClient
      id={id}
      initialReport={initialReport}
      initialAttachments={initialAttachments}
    />
  )
}
