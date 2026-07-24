import { getReportForApproval, getOrGenerateApprovalAnalysis } from '@/actions/approvals'
import { getApprovalAttachments } from '@/actions/approval-attachments'
import type { AiAnalysis } from '@/lib/approval-analysis-helpers'
import { ApprovalDetailClient } from './client'

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [initialReport, initialAttachments, analysis] = await Promise.all([
    getReportForApproval(id),
    getApprovalAttachments({ reportId: id }),
    getOrGenerateApprovalAnalysis(id).catch(() => null) as Promise<AiAnalysis | null>,
  ])
  return (
    <ApprovalDetailClient
      id={id}
      initialReport={initialReport}
      initialAttachments={initialAttachments}
      analysis={analysis}
    />
  )
}
