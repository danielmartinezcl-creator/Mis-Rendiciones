'use client'

import { useState, useTransition } from 'react'
import { addFundItem } from '@/actions/petty-cash'
import { DOC_TYPES } from '@/lib/constants'
import { X } from 'lucide-react'

type Category = { id: string; name: string; color: string | null }

interface Props {
  fundId:     string
  categories: Category[]
  onDone:     () => void
}

const EMPTY = {
  description: '', amount: '', currency: 'CLP',
  date: new Date().toISOString().split('T')[0],
  category_id: '', merchant: '', doc_type: '', doc_number: '', notes: '',
}

export function AddFundItemForm({ fundId, categories, onDone }: Props) {
  const [form, setForm]       = useState(EMPTY)
  const [error, setError]     = useState<string | null>(null)
  const [pending, startTrans] = useTransition()

  function set(k: keyof typeof EMPTY, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    if (!form.description.trim()) { setError('La descripción es obligatoria'); return }
    if (isNaN(amount) || amount <= 0) { setError('Monto inválido'); return }
    if (!form.date) { setError('La fecha es obligatoria'); return }
    setError(null)

    startTrans(async () => {
      try {
        await addFundItem(fundId, {
          description:  form.description,
          amount,
          currency:     form.currency,
          exchange_rate: 1,
          amount_clp:   amount,
          date:         form.date,
          category_id:  form.category_id || null,
          merchant:     form.merchant || null,
          doc_type:     (form.doc_type as 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro') || null,
          doc_number:   form.doc_number || null,
          notes:        form.notes || null,
        })
        setForm(EMPTY)
        onDone()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al agregar gasto')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Fila 1: descripción */}
      <div>
        <label className="block text-xs font-semibold text-ink-600 mb-1">Descripción *</label>
        <input
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Ej: Almuerzo de trabajo"
          className="w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
      </div>

      {/* Fila 2: monto + fecha */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1">Monto CLP *</label>
          <input
            type="number" min="1" step="1"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600 font-mono-amount"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1">Fecha *</label>
          <input
            type="date"
            value={form.date}
            onChange={e => set('date', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
      </div>

      {/* Fila 3: categoría + proveedor */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1">Categoría</label>
          <select
            value={form.category_id}
            onChange={e => set('category_id', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
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
            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
      </div>

      {/* Fila 4: tipo doc + nro doc */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1">Tipo documento</label>
          <select
            value={form.doc_type}
            onChange={e => set('doc_type', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
          >
            <option value="">Sin documento</option>
            {DOC_TYPES.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1">N° documento</label>
          <input
            value={form.doc_number}
            onChange={e => set('doc_number', e.target.value)}
            placeholder="000123"
            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
      </div>

      {/* Notas */}
      <div>
        <label className="block text-xs font-semibold text-ink-600 mb-1">Nota (opcional)</label>
        <input
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Observaciones adicionales"
          className="w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
      </div>

      {error && <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-item">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors"
        >
          {pending ? 'Agregando...' : 'Agregar gasto'}
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
