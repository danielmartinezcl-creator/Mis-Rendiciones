'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getReportForApproval, submitApprovalDecision } from '@/actions/approvals'
import { notifySubmitterOfDecision } from '@/actions/notifications'
import { getApprovalAttachments } from '@/actions/approval-attachments'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { ReportStatusBadge } from '@/components/ui/Badge'
import { ApprovalAttachments } from '@/components/approvals/ApprovalAttachments'
import { formatDate } from '@/lib/utils'
import { DOC_TYPES } from '@/lib/constants'
import type { ExpenseItem, ExpenseCategory, Attachment, ApprovalAttachment } from '@/lib/supabase/types'

type ItemWithRelations = ExpenseItem & {
  expense_categories: Pick<ExpenseCategory, 'name' | 'icon' | 'color'> | null
  attachments:        Pick<Attachment, 'id' | 'storage_path' | 'file_type'>[]
}

type ReportData = Awaited<ReturnType<typeof getReportForApproval>>

type Decision = { action: 'approve' | 'reject' | null; reason: string }

interface Props {
  id: string
  initialReport: ReportData
  initialAttachments: (ApprovalAttachment & { uploader_name: string; url: string | null })[]
}

export function ApprovalDetailClient({ id, initialReport, initialAttachments }: Props) {
  const router = useRouter()

  const [report,    setReport]    = useState<ReportData>(initialReport)
  const [attachments, setAttachments] = useState(initialAttachments)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]     = useState<string | null>(null)
  const [notes,      setNotes]     = useState('')

  // Initialize decisions from initialReport using lazy initializer
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() => {
    if (!initialReport?.expense_items) return {}
    const initial: Record<string, Decision> = {}
    for (const item of (initialReport.expense_items ?? []) as ItemWithRelations[]) {
      initial[item.id] = { action: null, reason: '' }
    }
    return initial
  })

  // Generate signed URLs client-side from the initial report data
  useEffect(() => {
    if (!initialReport?.expense_items) return
    const typedItems = (initialReport.expense_items ?? []) as ItemWithRelations[]
    const allAttachments = typedItems
      .flatMap(item => item.attachments ?? [])
      .filter(att => att.file_type === 'image')

    if (allAttachments.length === 0) return

    const supabase = createClient()
    Promise.all(
      allAttachments.map(async att => {
        const { data: signed } = await supabase.storage
          .from('expense-attachments')
          .createSignedUrl(att.storage_path, 3600)
        return [att.id, signed?.signedUrl ?? null] as [string, string | null]
      })
    ).then(entries => {
      const urls: Record<string, string> = {}
      for (const [aid, url] of entries) {
        if (url) urls[aid] = url
      }
      setSignedUrls(urls)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setDecision(itemId: string, field: keyof Decision, value: string | null) {
    setDecisions(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }))
  }

  function allDecided(): boolean {
    return Object.values(decisions).every(d => d.action !== null)
  }

  async function handleSubmit() {
    const undecided = Object.entries(decisions).filter(([, d]) => d.action === null)
    if (undecided.length > 0) {
      setError(`Debes decidir todos los ítems (${undecided.length} sin decisión)`)
      return
    }
    const rejected = Object.entries(decisions).filter(([, d]) => d.action === 'reject' && !d.reason.trim())
    if (rejected.length > 0) {
      setError('Los ítems rechazados requieren un motivo')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const payload = Object.entries(decisions).map(([itemId, d]) => ({
        itemId,
        action: d.action as 'approve' | 'reject',
        reason: d.reason || undefined,
      }))
      await submitApprovalDecision(id, payload, notes)

      const allApproved = payload.every(p => p.action === 'approve')
      const allRejected = payload.every(p => p.action === 'reject')
      const notifyAction = allApproved ? 'approved' : allRejected ? 'rejected' : 'partially_approved'
      await notifySubmitterOfDecision(id, notifyAction).catch(() => {})

      router.push('/approvals')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar decisión')
    } finally {
      setSubmitting(false)
    }
  }

  if (!report) {
    return (
      <div className="text-center py-12 text-slate-400">
        <p>Rendición no encontrada</p>
        <button onClick={() => router.push('/approvals')} className="text-brand-600 text-sm mt-2 hover:underline">
          Volver
        </button>
      </div>
    )
  }

  const isActionable = report.status === 'submitted' || report.status === 'pending_l2'
  const items = (report.expense_items ?? []) as ItemWithRelations[]

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <button
          onClick={() => router.push('/approvals')}
          className="text-xs text-slate-400 hover:text-slate-600 mb-1 flex items-center gap-1"
        >
          ← Bandeja de aprobaciones
        </button>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{report.title}</h1>
            {report.submitter_name && (
              <p className="text-sm text-slate-500 mt-0.5">
                Enviado por <strong>{report.submitter_name}</strong>
                {report.submitted_at && ` el ${formatDate(report.submitted_at.split('T')[0])}`}
              </p>
            )}
          </div>
          <ReportStatusBadge status={report.status as any} />
        </div>
      </div>

      {/* Total */}
      <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4 flex items-center justify-between">
        <span className="text-sm text-slate-500">Total rendición</span>
        <CurrencyAmount amount={report.total_amount} currency="CLP" size="lg" />
      </div>

      {/* Ítems para revisar */}
      <div className="space-y-3">
        {items.map(item => {
          const d        = decisions[item.id] ?? { action: null, reason: '' }
          const docLabel = DOC_TYPES.find(dt => dt.value === item.doc_type)?.label
          const itemAttachments = (item.attachments ?? []) as Pick<Attachment, 'id' | 'storage_path' | 'file_type'>[]

          return (
            <div
              key={item.id}
              className={[
                'bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4 space-y-3 border-l-4',
                d.action === 'approve' ? 'border-l-emerald-400' :
                d.action === 'reject'  ? 'border-l-red-400'     :
                                         'border-l-slate-200',
              ].join(' ')}
            >
              {/* Info del ítem */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800">{item.description}</p>
                  {item.merchant && <p className="text-xs text-slate-400 mt-0.5">{item.merchant}</p>}
                </div>
                <div className="text-right shrink-0">
                  <CurrencyAmount amount={item.amount_clp} currency="CLP" size="md" />
                  {item.currency !== 'CLP' && (
                    <p className="text-xs text-slate-400 mt-0.5">{item.currency} {item.amount.toLocaleString('es-CL')}</p>
                  )}
                </div>
              </div>

              {/* Metadatos */}
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span>{formatDate(item.date)}</span>
                {item.expense_categories && (
                  <span>{item.expense_categories.icon} {item.expense_categories.name}</span>
                )}
                {docLabel && <span>{docLabel}</span>}
                {item.doc_number && <span>N° {item.doc_number}</span>}
              </div>

              {item.notes && (
                <p className="text-xs text-slate-400 italic bg-slate-50 rounded p-2">{item.notes}</p>
              )}

              {/* Fotos adjuntas */}
              {itemAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {itemAttachments.map(att => (
                    att.file_type === 'image' && signedUrls[att.id] ? (
                      <a
                        key={att.id}
                        href={signedUrls[att.id]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <img
                          src={signedUrls[att.id]}
                          alt="Adjunto"
                          className="w-24 h-24 object-cover rounded-item border border-slate-200 hover:opacity-80 transition-opacity"
                        />
                      </a>
                    ) : (
                      <span key={att.id} className="text-xs text-slate-400 flex items-center gap-1">
                        📎 {att.file_type === 'pdf' ? 'PDF' : 'Adjunto'}
                      </span>
                    )
                  ))}
                </div>
              )}

              {/* Decisión */}
              {isActionable && (
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDecision(item.id, 'action', 'approve')}
                      className={[
                        'flex-1 py-2 rounded-item text-sm font-semibold transition-colors',
                        d.action === 'approve'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                      ].join(' ')}
                    >
                      ✓ Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecision(item.id, 'action', 'reject')}
                      className={[
                        'flex-1 py-2 rounded-item text-sm font-semibold transition-colors',
                        d.action === 'reject'
                          ? 'bg-red-500 text-white'
                          : 'bg-red-50 text-red-600 hover:bg-red-100',
                      ].join(' ')}
                    >
                      ✕ Rechazar
                    </button>
                  </div>

                  {d.action === 'reject' && (
                    <textarea
                      value={d.reason}
                      onChange={e => setDecision(item.id, 'reason', e.target.value)}
                      placeholder="Motivo del rechazo (obligatorio)..."
                      rows={2}
                      className="w-full px-3 py-2 border border-red-200 rounded-item text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 bg-red-50"
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Adjuntos de respaldo de la cadena de aprobación */}
      <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4">
        <ApprovalAttachments
          attachments={attachments}
          target={{ reportId: id }}
          onRefresh={() => getApprovalAttachments({ reportId: id }).then(data => setAttachments(data as typeof attachments))}
        />
      </div>

      {/* Notas globales + Enviar */}
      {isActionable && (
        <div className="space-y-3 pt-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nota general (opcional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Comentario para el rendidor..."
              rows={2}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-item p-3">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || !allDecided()}
            className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-card transition-colors"
          >
            {submitting ? 'Enviando decisión...' : 'Enviar decisión'}
          </button>
          {!allDecided() && (
            <p className="text-xs text-slate-400 text-center">
              Decide todos los ítems para poder enviar
            </p>
          )}
        </div>
      )}

      {!isActionable && (
        <div className="bg-slate-50 rounded-card p-4 text-center text-sm text-slate-500">
          Esta rendición ya fue procesada (estado: <strong>{report.status}</strong>).
        </div>
      )}
    </div>
  )
}
