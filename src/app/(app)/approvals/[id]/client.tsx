'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, CheckCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getReportForApproval, submitApprovalDecision, bulkApproveItems } from '@/actions/approvals'
import { notifySubmitterOfDecision } from '@/actions/notifications'
import { getApprovalAttachments } from '@/actions/approval-attachments'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { InsigniaEstado } from '@/components/ui/InsigniaEstado'
import { ApprovalAttachments } from '@/components/approvals/ApprovalAttachments'
import { formatDate, formatDisplayTitle } from '@/lib/utils'
import { DOC_TYPES } from '@/lib/constants'
import type { AiAnalysis } from '@/lib/approval-analysis-helpers'
import type { ExpenseItem, ExpenseCategory, Attachment, ApprovalAttachment, TravelPolicy } from '@/lib/supabase/types'

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
  analysis: AiAnalysis | null
}

export function ApprovalDetailClient({ id, initialReport, initialAttachments, analysis }: Props) {
  const router = useRouter()

  const [report,    setReport]    = useState<ReportData>(initialReport)
  const [attachments, setAttachments] = useState(initialAttachments)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]     = useState<string | null>(null)
  const [notes,      setNotes]     = useState('')
  const [bulkApproving, setBulkApproving] = useState(false)
  const [bulkDone, setBulkDone] = useState(false)
  const [travelPolicies, setTravelPolicies] = useState<TravelPolicy[]>([])

  // Initialize decisions from initialReport using lazy initializer
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() => {
    if (!initialReport?.expense_items) return {}
    const initial: Record<string, Decision> = {}
    for (const item of (initialReport.expense_items ?? []) as ItemWithRelations[]) {
      initial[item.id] = { action: null, reason: '' }
    }
    return initial
  })

  // Load travel policies once (read-only, any authenticated user can read)
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('users').select('org_id').eq('id', user.id).single()
        .then(({ data: profile }) => {
          if (!profile) return
          supabase.from('travel_policies').select('*')
            .eq('org_id', profile.org_id).eq('activo', true)
            .then(({ data }) => setTravelPolicies((data ?? []) as TravelPolicy[]))
        })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Check if an item exceeds its travel policy
  function checkItemTravelPolicy(item: ItemWithRelations): { policy: TravelPolicy; exceeds: boolean } | null {
    if (!travelPolicies.length) return null
    let match = item.category_id
      ? travelPolicies.find(p => p.category_id === item.category_id)
      : null
    if (!match) match = travelPolicies.find(p => p.category_id === null) ?? null
    if (!match) return null
    const limitCLP = match.currency === 'CLP' ? match.max_amount : null
    if (limitCLP === null) return null
    return { policy: match, exceeds: item.amount_clp > limitCLP }
  }

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

  async function handleApproveAll() {
    if (!confirm(`¿Aprobar TODOS los ${items.length} ítems de esta rendición? Esta acción no se puede deshacer.`)) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = items.map(item => ({ itemId: item.id, action: 'approve' as const, reason: undefined }))
      await submitApprovalDecision(id, payload, notes)
      await notifySubmitterOfDecision(id, 'approved').catch(() => {})
      router.push('/approvals')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aprobar')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleBulkApprove() {
    if (!analysis?.routine_item_ids?.length) return
    setBulkApproving(true)
    try {
      await bulkApproveItems(id, analysis.routine_item_ids)
      // Sincronizar decisiones locales para los ítems aprobados en bulk
      const bulkDecisions: Record<string, Decision> = {}
      analysis.routine_item_ids.forEach(itemId => {
        bulkDecisions[itemId] = { action: 'approve', reason: '' }
      })
      setDecisions(prev => ({ ...prev, ...bulkDecisions }))
      setBulkDone(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aprobar ítems')
    } finally {
      setBulkApproving(false)
    }
  }

  if (!report) {
    return (
      <div className="text-center py-12 text-ink-400">
        <p>Rendición no encontrada</p>
        <button onClick={() => router.push('/approvals')} className="text-brand-600 text-sm mt-2 hover:underline">
          Volver
        </button>
      </div>
    )
  }

  const isActionable = report.status === 'submitted' || report.status === 'pending_l2'
  const items = (report.expense_items ?? []) as ItemWithRelations[]

  // AI analysis helpers
  const attentionItemIds = new Set(analysis?.attention_items.map(a => a.item_id) ?? [])
  const sortedItems = [...items].sort((a, b) => {
    const aIsAttention = attentionItemIds.has(a.id)
    const bIsAttention = attentionItemIds.has(b.id)
    if (aIsAttention && !bIsAttention) return -1
    if (!aIsAttention && bIsAttention) return 1
    return 0
  })

  function renderAttentionReasons(itemId: string) {
    if (!analysis || !attentionItemIds.has(itemId)) return null
    const attItem = analysis.attention_items.find(a => a.item_id === itemId)
    if (!attItem) return null
    return (
      <div className="mt-1.5 px-2 py-1.5 bg-warning-50 rounded-item border border-warning-200">
        <p className="card-meta font-semibold text-warning-700 mb-0.5">Requiere atención:</p>
        <ul className="list-disc list-inside space-y-0.5">
          {attItem.reasons.map((r, i) => (
            <li key={i} className="card-meta text-warning-600">{r}</li>
          ))}
        </ul>
        <p className="card-meta font-medium text-warning-700 mt-1">
          Sugerencia IA: {attItem.suggestion === 'aprobar' ? 'Aprobar' :
           attItem.suggestion === 'rechazar' ? 'Rechazar' : 'Revisión manual recomendada'}
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <button
          onClick={() => router.push('/approvals')}
          className="card-meta text-ink-400 hover:text-ink-600 mb-1 flex items-center gap-1"
        >
          ← Bandeja de aprobaciones
        </button>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tor-on-gradient">{formatDisplayTitle(report.title)}</h1>
            {report.submitter_name && (
              <p className="card-label tor-on-gradient-soft mt-0.5">
                Enviado por <strong>{report.submitter_name}</strong>
                {report.submitted_at && ` el ${formatDate(report.submitted_at.split('T')[0])}`}
              </p>
            )}
          </div>
          <InsigniaEstado tipo="reporte" estado={report.status as any} />
        </div>
      </div>

      {/* Total */}
      <div className="hoja p-4 flex items-center justify-between">
        <span className="card-label text-ink-500">Total rendición</span>
        <CurrencyAmount amount={report.total_amount} currency="CLP" size="lg" />
      </div>

      {/* Tarjeta de análisis IA */}
      {analysis && (
        <div className={`rounded-card border p-4 space-y-3 ${
          analysis.risk_level === 'high'   ? 'bg-danger-50 border-danger-200' :
          analysis.risk_level === 'medium' ? 'bg-warning-50 border-warning-200' :
                                             'bg-success-50 border-success-200'
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${
                analysis.risk_level === 'high'   ? 'bg-danger-500' :
                analysis.risk_level === 'medium' ? 'bg-warning-500' :
                                                   'bg-success-500'
              }`} />
              <span className={`card-label font-semibold ${
                analysis.risk_level === 'high'   ? 'text-danger-600' :
                analysis.risk_level === 'medium' ? 'text-warning-600' :
                                                   'text-success-600'
              }`}>
                {analysis.risk_level === 'high' ? 'Riesgo alto' :
                 analysis.risk_level === 'medium' ? 'Riesgo medio' : 'Riesgo bajo'}
              </span>
            </div>
            <span className="card-meta text-ink-400 flex items-center gap-1">
              <Sparkles size={14} />
              Análisis IA
            </span>
          </div>

          <p className="card-label font-medium text-ink-800">{analysis.headline}</p>

          <div className="flex flex-wrap gap-x-4 gap-y-1 card-meta text-ink-500">
            <span>${analysis.stats.total_clp.toLocaleString('es-CL')} total</span>
            <span>{analysis.stats.vs_employee_avg} vs su promedio</span>
            {analysis.stats.policy_violations > 0 && (
              <span className="text-warning-600">
                {analysis.stats.policy_violations} {analysis.stats.policy_violations === 1 ? 'violación' : 'violaciones'} de política
              </span>
            )}
            {analysis.stats.missing_docs > 0 && (
              <span className="text-warning-600">
                {analysis.stats.missing_docs} doc{analysis.stats.missing_docs !== 1 ? 's' : ''} faltante{analysis.stats.missing_docs !== 1 ? 's' : ''}
              </span>
            )}
            {analysis.stats.new_merchants > 0 && (
              <span className="text-ink-500">
                {analysis.stats.new_merchants} proveedor{analysis.stats.new_merchants !== 1 ? 'es' : ''} nuevo{analysis.stats.new_merchants !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {!bulkDone && analysis.routine_item_ids.length > 0 && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleBulkApprove}
                disabled={bulkApproving}
                className="btn-primario flex items-center gap-1.5 px-3 py-2 card-meta"
              >
                <CheckCheck size={16} />
                {bulkApproving
                  ? 'Aprobando...'
                  : `Aprobar ${analysis.routine_item_ids.length} ítem${analysis.routine_item_ids.length !== 1 ? 's' : ''} rutinario${analysis.routine_item_ids.length !== 1 ? 's' : ''}`
                }
              </button>
              <span className="card-meta text-ink-400 self-center">
                {analysis.attention_items.length > 0
                  ? `Los ${analysis.attention_items.length} de atención quedan para revisión manual`
                  : 'Todos los ítems son rutinarios'
                }
              </span>
            </div>
          )}
          {bulkDone && (
            <p className="card-meta text-success-600 font-medium">Ítems rutinarios aprobados — revisa los de atención abajo</p>
          )}
        </div>
      )}

      {/* Ítems para revisar */}
      <div className="space-y-3">
        {sortedItems.map(item => {
          const d        = decisions[item.id] ?? { action: null, reason: '' }
          const docLabel = DOC_TYPES.find(dt => dt.value === item.doc_type)?.label
          const itemAttachments = (item.attachments ?? []) as Pick<Attachment, 'id' | 'storage_path' | 'file_type'>[]
          const travelCheck = checkItemTravelPolicy(item)

          return (
            <div
              key={item.id}
              className={[
                'hoja p-4 space-y-3 border-l-4',
                d.action === 'approve' ? 'border-l-success-400' :
                d.action === 'reject'  ? 'border-l-danger-400'     :
                                         'border-l-ink-200',
                attentionItemIds.has(item.id) ? 'ring-2 ring-warning-400' : '',
              ].join(' ')}
            >
              {/* Info del ítem */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[16px] leading-snug font-semibold text-ink-800">{item.description}</p>
                  {item.merchant && <p className="card-meta text-ink-400 mt-0.5">{item.merchant}</p>}
                </div>
                <div className="text-right shrink-0">
                  <CurrencyAmount amount={item.amount_clp} currency="CLP" size="md" />
                  {item.currency !== 'CLP' && (
                    <p className="card-meta text-ink-400 mt-0.5">{item.currency} {item.amount.toLocaleString('es-CL')}</p>
                  )}
                </div>
              </div>

              {/* Metadatos */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 card-meta text-ink-500">
                <span>{formatDate(item.date)}</span>
                {item.expense_categories && (
                  <span>{item.expense_categories.icon} {item.expense_categories.name}</span>
                )}
                {docLabel && <span>{docLabel}</span>}
                {item.doc_number && <span>N° {item.doc_number}</span>}
              </div>

              {/* Badge política de viáticos */}
              {travelCheck && (
                <div className={`flex items-center gap-1.5 card-meta font-medium px-2.5 py-1.5 rounded-item border ${
                  travelCheck.exceeds
                    ? 'bg-warning-50 border-warning-200 text-warning-700'
                    : 'bg-success-50 border-success-200 text-success-700'
                }`}>
                  <span>{travelCheck.exceeds ? '⚠' : '✓'}</span>
                  <span>
                    {travelCheck.exceeds
                      ? `Excede política "${travelCheck.policy.name}" — máx. ${travelCheck.policy.max_amount.toLocaleString('es-CL')} ${travelCheck.policy.currency}`
                      : `Dentro de política "${travelCheck.policy.name}" — máx. ${travelCheck.policy.max_amount.toLocaleString('es-CL')} ${travelCheck.policy.currency}`
                    }
                  </span>
                </div>
              )}

              {item.notes && (
                <p className="card-meta text-ink-400 italic bg-ink-50 rounded p-2">{item.notes}</p>
              )}

              {/* Razones de atención IA */}
              {renderAttentionReasons(item.id)}

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
                          className="w-24 h-24 object-cover rounded-item border border-ink-200 hover:opacity-80 transition-opacity"
                        />
                      </a>
                    ) : (
                      <span key={att.id} className="card-meta text-ink-400 flex items-center gap-1">
                        📎 {att.file_type === 'pdf' ? 'PDF' : 'Adjunto'}
                      </span>
                    )
                  ))}
                </div>
              )}

              {/* Decisión */}
              {isActionable && (
                <div className="space-y-2 pt-1 border-t border-ink-100">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDecision(item.id, 'action', 'approve')}
                      className={[
                        'flex-1 py-2.5 rounded-item card-label font-semibold transition-colors',
                        d.action === 'approve'
                          ? 'bg-success-500 text-white'
                          : 'bg-success-50 text-success-700 hover:bg-success-100',
                      ].join(' ')}
                    >
                      ✓ Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecision(item.id, 'action', 'reject')}
                      className={[
                        'flex-1 py-2.5 rounded-item card-label font-semibold transition-colors',
                        d.action === 'reject'
                          ? 'bg-danger-500 text-white'
                          : 'bg-danger-50 text-danger-600 hover:bg-danger-100',
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
                      className="w-full px-3 py-2 border border-danger-200 rounded-item text-[16px] resize-none focus:outline-none focus:ring-2 focus:ring-danger-400 bg-danger-50"
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Adjuntos de respaldo de la cadena de aprobación */}
      <div className="hoja p-4">
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
            <label className="block card-label font-medium text-ink-700 mb-1">
              Nota general (opcional)
            </label>
            {/* text-[16px] en los campos: por debajo de 16px, Safari en iPhone
                hace zoom automático al enfocar el campo y descoloca la pantalla */}
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Comentario para el rendidor..."
              rows={2}
              className="campo w-full py-2.5 text-[16px] resize-none"
            />
          </div>

          {error && (
            <div className="bg-danger-50 border border-danger-200 text-danger-700 card-label rounded-item p-3">
              {error}
            </div>
          )}

          <button
            onClick={handleApproveAll}
            disabled={submitting}
            className="w-full py-3 bg-success-600 hover:bg-success-700 disabled:opacity-50 text-white font-semibold rounded-card transition-colors card-label flex items-center justify-center gap-2"
          >
            <CheckCheck size={18} />
            {submitting ? 'Aprobando...' : `Aprobar todos — ${items.length} ítem${items.length !== 1 ? 's' : ''}`}
          </button>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-ink-200" />
            <span className="card-meta text-ink-400">o decide ítem por ítem</span>
            <div className="flex-1 h-px bg-ink-200" />
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || !allDecided()}
            className="btn-primario w-full py-3 card-label"
          >
            {submitting ? 'Enviando decisión...' : 'Enviar decisión'}
          </button>
          {!allDecided() && (
            <p className="card-meta text-ink-400 text-center">
              Decide todos los ítems para poder enviar
            </p>
          )}
        </div>
      )}

      {!isActionable && (
        <div className="bg-ink-50 rounded-card p-4 text-center card-label text-ink-500">
          Esta rendición ya fue procesada (estado: <strong>{report.status}</strong>).
        </div>
      )}
    </div>
  )
}
