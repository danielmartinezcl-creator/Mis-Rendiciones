'use client'

import { useState, useTransition } from 'react'
import { updateFundItem } from '@/actions/petty-cash'
import { DOC_TYPES } from '@/lib/constants'
import { AlertTriangle, X } from 'lucide-react'

type Category = { id: string; name: string; color: string | null }

interface ItemValues {
  id:           string
  description:  string
  amount_clp:   number
  date:         string
  category_id:  string | null
  merchant:     string | null
  doc_type:     string | null
  doc_number:   string | null
  supplier_rut: string | null
  notes:        string | null
}

interface Props {
  item:       ItemValues
  categories: Category[]
  onDone:     () => void
}

const inputCls = 'w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600'

export function EditFundItemForm({ item, categories, onDone }: Props) {
  const [form, setForm]       = useState({
    description:  item.description,
    amount:       String(item.amount_clp),
    date:         item.date,
    category_id:  item.category_id ?? '',
    merchant:     item.merchant ?? '',
    doc_type:     item.doc_type ?? '',
    doc_number:   item.doc_number ?? '',
    supplier_rut: item.supplier_rut ?? '',
    notes:        item.notes ?? '',
  })
  const [error, setError]     = useState<string | null>(null)
  const [pending, startTrans] = useTransition()

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  const isFactura = form.doc_type === 'factura' || form.doc_type === 'factura_exenta'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    if (!form.description.trim()) { setError('La descripción es obligatoria'); return }
    if (isNaN(amount) || amount <= 0) { setError('Monto inválido'); return }
    if (!form.date) { setError('La fecha es obligatoria'); return }
    setError(null)

    startTrans(async () => {
      try {
        await updateFundItem(item.id, {
          description:  form.description.trim(),
          amount_clp:   amount,
          date:         form.date,
          category_id:  form.category_id || null,
          merchant:     form.merchant || null,
          doc_type:     (form.doc_type as 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro') || null,
          doc_number:   form.doc_number || null,
          supplier_rut: form.supplier_rut || null,
          notes:        form.notes || null,
        })
        onDone()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al guardar')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-ink-600 mb-1">Descripción *</label>
        <input
          value={form.description}
          onChange={e => set('description', e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1">Monto CLP *</label>
          <input
            type="number" min="1" step="1"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            className={`${inputCls} font-mono-amount`}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1">Fecha *</label>
          <input
            type="date"
            value={form.date}
            onChange={e => set('date', e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1">Categoría</label>
          <select
            value={form.category_id}
            onChange={e => set('category_id', e.target.value)}
            className={`${inputCls} bg-white`}
          >
            <option value="">Sin categoría</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1">Proveedor / Comercio</label>
          <input
            value={form.merchant}
            onChange={e => set('merchant', e.target.value)}
            placeholder="Ej: Jumbo, Copec..."
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1">Tipo documento</label>
          <select
            value={form.doc_type}
            onChange={e => set('doc_type', e.target.value)}
            className={`${inputCls} bg-white`}
          >
            <option value="">Sin documento</option>
            {DOC_TYPES.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1">N° folio / documento</label>
          <input
            value={form.doc_number}
            onChange={e => set('doc_number', e.target.value)}
            placeholder="000123"
            className={inputCls}
          />
        </div>
      </div>

      {isFactura && (
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1">
            RUT Proveedor <span className="text-rose-500">*</span>
            <span className="font-normal text-ink-400 ml-1">(requerido para crédito fiscal IVA)</span>
          </label>
          <input
            value={form.supplier_rut}
            onChange={e => set('supplier_rut', e.target.value)}
            placeholder="12.345.678-9"
            className={inputCls}
          />
          {!form.supplier_rut && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-item border border-amber-200">
              <AlertTriangle size={12} className="shrink-0" />
              Sin RUT el crédito fiscal IVA no puede acreditarse ante el SII
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-ink-600 mb-1">Nota (opcional)</label>
        <input
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Observaciones adicionales"
          className={inputCls}
        />
      </div>

      {error && <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-item">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors"
        >
          {pending ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-2 text-ink-500 hover:text-ink-800 rounded-item hover:bg-ink-100 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </form>
  )
}
