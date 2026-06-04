'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ExpenseItemForm, type ItemFormData } from '@/components/expenses/ExpenseItemForm'
import { ExpenseItemCard } from '@/components/expenses/ExpenseItemCard'
import { ReportStatusBadge } from '@/components/ui/Badge'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import {
  addExpenseItem,
  deleteExpenseItem,
  submitExpenseReport,
  uploadAttachment,
  getReportWithItems,
} from '@/actions/expenses'
import type { ExpenseCategory, ExpenseItem, Attachment, Json } from '@/lib/supabase/types'

type ReportWithItems = Awaited<ReturnType<typeof getReportWithItems>>

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [report, setReport]         = useState<ReportWithItems>(null)
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [showForm, setShowForm]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)

  async function load() {
    const data = await getReportWithItems(id)
    setReport(data)
    setLoading(false)
  }

  useEffect(() => {
    load()

    const supabase = createClient()
    supabase
      .from('expense_categories')
      .select('*')
      .order('name')
      .then(({ data }) => setCategories(data ?? []))
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
      ocr_raw:              data.ocr_raw as Json | null,
      ocr_confidence:       data.ocr_confidence,
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

  type ItemWithRelations = ExpenseItem & {
    expense_categories: Pick<ExpenseCategory, 'name' | 'icon' | 'color'> | null
    attachments: Pick<Attachment, 'id' | 'storage_path' | 'file_type'>[]
  }

  const isDraft = report.status === 'draft'
  const items   = (report.expense_items ?? []) as ItemWithRelations[]

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
        <ReportStatusBadge status={report.status as any} />
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

      {/* Lista de ítems */}
      <div className="space-y-2">
        {items.map(item => (
          <ExpenseItemCard
            key={item.id}
            item={item}
            canDelete={isDraft}
            onDelete={handleDeleteItem}
          />
        ))}
      </div>

      {/* Formulario de nuevo ítem */}
      {showForm && isDraft && (
        <ExpenseItemForm
          categories={categories}
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
