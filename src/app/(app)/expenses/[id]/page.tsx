'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ExpenseItemForm, type ItemFormData } from '@/components/expenses/ExpenseItemForm'
import { ExpenseItemCard } from '@/components/expenses/ExpenseItemCard'
import { ReportStatusBadge } from '@/components/ui/Badge'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { ItemAttachmentZone } from '@/components/ui/ItemAttachmentZone'
import { ApprovalAttachments } from '@/components/approvals/ApprovalAttachments'
import {
  addExpenseItem,
  deleteExpenseItem,
  deleteExpenseReport,
  submitExpenseReport,
  uploadAttachment,
  getReportWithItems,
  getReportApprovals,
} from '@/actions/expenses'
import { getApprovalAttachments } from '@/actions/approval-attachments'
import type { ExpenseCategory, ExpenseItem, Attachment, CostCenter, Json } from '@/lib/supabase/types'

type ReportWithItems = Awaited<ReturnType<typeof getReportWithItems>>
type ApprovalAtt = Awaited<ReturnType<typeof getApprovalAttachments>>[number]
type ReportApproval = Awaited<ReturnType<typeof getReportApprovals>>[number]
type ItemWithRelations = ExpenseItem & {
  expense_categories: Pick<ExpenseCategory, 'name' | 'icon' | 'color'> | null
  attachments: Pick<Attachment, 'id' | 'storage_path' | 'file_type'>[]
}

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [report, setReport]                       = useState<ReportWithItems>(null)
  const [categories, setCategories]               = useState<ExpenseCategory[]>([])
  const [costCenters, setCostCenters]             = useState<CostCenter[]>([])
  const [employeeCostCenterId, setEmployeeCC]     = useState<string | null>(null)
  const [mileageRate, setMileageRate]             = useState<number>(136)
  const [currentUserId, setCurrentUserId]         = useState<string | null>(null)
  const [showForm, setShowForm]                   = useState(false)
  const [submitting, setSubmitting]               = useState(false)
  const [deleting, setDeleting]                   = useState(false)
  const [error, setError]                         = useState<string | null>(null)
  const [loading, setLoading]                     = useState(true)
  const [approvalAtts, setApprovalAtts]           = useState<ApprovalAtt[]>([])
  const [reportApprovals, setReportApprovals]     = useState<ReportApproval[]>([])
  const [exportingPdf, setExportingPdf]           = useState(false)

  async function load() {
    const data = await getReportWithItems(id)
    setReport(data)
    setLoading(false)
  }

  async function loadApprovalAtts() {
    const atts = await getApprovalAttachments({ reportId: id })
    setApprovalAtts(atts)
  }

  async function handleDownloadPdf() {
    if (!report) return
    setExportingPdf(true)
    try {
      const approvals = reportApprovals.length > 0 ? reportApprovals : await getReportApprovals(id)
      setReportApprovals(approvals)
      const { exportReportToPDF } = await import('@/lib/export/pdf')
      const items = ((report.expense_items ?? []) as ItemWithRelations[])
      await exportReportToPDF({
        title:           report.title,
        total_amount:    report.total_amount,
        approved_amount: report.approved_amount,
        status:          report.status,
        submitted_at:    report.submitted_at ?? null,
        items:           items.map(i => ({
          description:        i.description,
          merchant:           i.merchant ?? null,
          amount_clp:         i.amount_clp,
          date:               i.date,
          status:             i.status,
          expense_categories: i.expense_categories ?? null,
        })),
        approvals,
      })
    } finally {
      setExportingPdf(false)
    }
  }

  useEffect(() => {
    load()
    loadApprovalAtts()

    const supabase = createClient()
    // Categorías
    supabase.from('expense_categories').select('*').order('name')
      .then(({ data }) => setCategories(data ?? []))
    // Centros de costo imputables
    supabase.from('cost_centers').select('*').eq('imputable', true).eq('activo', true)
      .then(({ data }) => setCostCenters(data ?? []))
    // Centro de costo y ID del empleado logueado
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setCurrentUserId(user.id)
      supabase.from('users').select('cost_center_id, org_id').eq('id', user.id).single()
        .then(({ data }) => {
          setEmployeeCC(data?.cost_center_id ?? null)
          if (data?.org_id) {
            supabase.from('organizations').select('mileage_rate_per_km').eq('id', data.org_id).single()
              .then(({ data: org }) => {
                if (org?.mileage_rate_per_km) setMileageRate(org.mileage_rate_per_km)
              })
          }
        })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleSaveItem(data: ItemFormData) {
    if (!report) return
    setError(null)

    const amount = parseFloat(data.amount.replace(/\./g, '').replace(',', '.'))

    const itemId = await addExpenseItem(id, {
      description:          data.description,
      amount,
      currency:             data.currency,
      exchange_rate:        data.exchange_rate,
      exchange_rate_source: data.exchange_rate_source,
      amount_clp:           data.amount_clp || Math.round(amount * data.exchange_rate),
      date:                 data.date,
      category_id:          data.category_id || null,
      merchant:             data.merchant || null,
      doc_type:             data.doc_type || null,
      doc_number:           data.doc_number || null,
      notes:                data.notes || null,
      cost_center_id:       data.cost_center_id || null,
      supplier_rut:         data.supplier_rut || null,
      ocr_raw:              data.ocr_raw as Json | null,
      ocr_confidence:       data.ocr_confidence,
      policy_justification: data.policy_justification ?? null,
      policy_violations:    data.policy_violations as unknown as Json | null ?? null,
      mileage_km:           data.mileage_km ? parseFloat(data.mileage_km) : null,
      mileage_rate:         data.mileage_rate,
    })

    // Subir foto si existe
    if (data.file && itemId) {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('users').select('org_id').eq('id', user.id).single()
        if (profile) {
          await uploadAttachment(itemId, profile.org_id, data.file).catch(console.error)
        }
      }
    }

    setShowForm(false)
    await load()
  }

  async function handleDeleteItem(itemId: string) {
    if (!confirm('¿Eliminar este ítem?')) return
    await deleteExpenseItem(itemId, id)
    await load()
  }

  async function handleDeleteReport() {
    if (!confirm('¿Eliminar esta rendición? Esta acción no se puede deshacer.')) return
    setDeleting(true)
    setError(null)
    try {
      await deleteExpenseReport(id)
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
      setDeleting(false)
    }
  }

  async function handleSubmit() {
    if (!confirm('¿Enviar esta rendición a revisión? No podrás editarla después.')) return
    setSubmitting(true)
    setError(null)
    try {
      await submitExpenseReport(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="text-center py-12 text-slate-400">
        <p>Rendición no encontrada</p>
        <button onClick={() => router.push('/')} className="text-brand-600 text-sm mt-2 hover:underline">
          Volver al inicio
        </button>
      </div>
    )
  }

  const isDraft    = report.status === 'draft'
  const isMyDraft  = isDraft && report.submitter_id === currentUserId
  const items      = (report.expense_items ?? []) as ItemWithRelations[]

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <button
            onClick={() => router.push('/')}
            className="text-xs text-slate-400 hover:text-slate-600 mb-1 flex items-center gap-1"
          >
            ← Inicio
          </button>
          <h1 className="text-xl font-bold text-slate-800">{report.title}</h1>
          {report.description && (
            <p className="text-sm text-slate-500 mt-1">{report.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ReportStatusBadge status={report.status as any} />
          {report.status !== 'draft' && (
            <button
              onClick={handleDownloadPdf}
              disabled={exportingPdf}
              className="text-xs px-2.5 py-1.5 border border-ink-200 rounded-item text-ink-500 hover:bg-ink-50 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              title="Descargar PDF"
            >
              {exportingPdf ? (
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              ) : '📄'}
              PDF
            </button>
          )}
        </div>
      </div>

      {/* Total */}
      <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4 flex items-center justify-between">
        <span className="text-sm text-slate-500">Total rendición</span>
        <CurrencyAmount amount={report.total_amount} currency="CLP" size="lg" />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-item p-3">
          {error}
        </div>
      )}

      {/* Adjuntos del informe (aprobadores/admin) */}
      <ApprovalAttachments
        attachments={approvalAtts}
        target={{ reportId: id }}
        onRefresh={loadApprovalAtts}
      />

      {/* Lista de ítems */}
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id}>
            <ExpenseItemCard
              item={item}
              canDelete={isDraft}
              onDelete={handleDeleteItem}
            />
            <div className="px-3 pb-2">
              <ItemAttachmentZone
                itemId={item.id}
                itemType="expense_item"
                initialAttachments={item.attachments}
                canUpload={isDraft}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Formulario de nuevo ítem */}
      {showForm && isDraft && (
        <ExpenseItemForm
          categories={categories}
          costCenters={costCenters}
          employeeCostCenterId={employeeCostCenterId}
          mileageRate={mileageRate}
          onSave={handleSaveItem}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Acciones (solo borradores) */}
      {isDraft && (
        <div className="space-y-3 pt-2">
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-3 border-2 border-dashed border-brand-200 hover:border-brand-500 rounded-card text-brand-600 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              + Agregar ítem
            </button>
          )}

          {items.length > 0 && !showForm && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-card transition-colors"
            >
              {submitting
                ? 'Enviando...'
                : `Enviar a revisión — ${items.length} ítem${items.length !== 1 ? 's' : ''}`}
            </button>
          )}

          {isMyDraft && !showForm && (
            <button
              onClick={handleDeleteReport}
              disabled={deleting}
              className="w-full py-2 text-red-500 hover:text-red-700 text-sm font-medium border border-red-200 hover:border-red-400 rounded-card transition-colors disabled:opacity-50"
            >
              {deleting ? 'Eliminando...' : 'Eliminar rendición'}
            </button>
          )}
        </div>
      )}

      {/* Estado informativo (no borrador) */}
      {!isDraft && (
        <div className="bg-slate-50 rounded-card p-4 text-center text-sm text-slate-500">
          Esta rendición está en estado <strong>{report.status}</strong> y no puede editarse.
        </div>
      )}
    </div>
  )
}
