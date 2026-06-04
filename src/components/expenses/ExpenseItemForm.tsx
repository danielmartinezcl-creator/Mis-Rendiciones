'use client'

import { useState, useEffect } from 'react'
import { PhotoUpload } from './PhotoUpload'
import { getHistoricalRate } from '@/actions/exchange-rate'
import { formatCLP, formatExchangeRate } from '@/lib/utils'
import { CURRENCIES, DOC_TYPES, type Currency } from '@/lib/constants'
import type { OcrResult } from '@/lib/ocr-helpers'
import type { ExpenseCategory, Json } from '@/lib/supabase/types'

export interface ItemFormData {
  description:          string
  amount:               string
  currency:             Currency
  exchange_rate:        number
  exchange_rate_source: 'api' | 'manual'
  amount_clp:           number
  date:                 string
  category_id:          string
  merchant:             string
  doc_type:             'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro' | ''
  doc_number:           string
  notes:                string
  ocr_raw:              Json | null
  ocr_confidence:       number | null
  file:                 File | null
}

const emptyForm = (): ItemFormData => ({
  description:          '',
  amount:               '',
  currency:             'CLP',
  exchange_rate:        1,
  exchange_rate_source: 'api',
  amount_clp:           0,
  date:                 new Date().toISOString().split('T')[0],
  category_id:          '',
  merchant:             '',
  doc_type:             '',
  doc_number:           '',
  notes:                '',
  ocr_raw:              null,
  ocr_confidence:       null,
  file:                 null,
})

interface ExpenseItemFormProps {
  categories: ExpenseCategory[]
  onSave:     (data: ItemFormData) => Promise<void>
  onCancel:   () => void
}

export function ExpenseItemForm({ categories, onSave, onCancel }: ExpenseItemFormProps) {
  const [form, setForm]           = useState<ItemFormData>(emptyForm())
  const [tcLoading, setTcLoading] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [errors, setErrors]       = useState<string[]>([])

  function set(field: keyof ItemFormData, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function recalcAmountClp(amountStr: string, rate: number) {
    const val = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'))
    set('amount_clp', !isNaN(val) && val > 0 ? Math.round(val * rate) : 0)
  }

  // Buscar TC histórico cuando cambia moneda o fecha
  useEffect(() => {
    if (form.currency === 'CLP') {
      set('exchange_rate', 1)
      set('exchange_rate_source', 'api')
      recalcAmountClp(form.amount, 1)
      return
    }
    if (!form.date) return

    setTcLoading(true)
    getHistoricalRate(form.currency, form.date).then(result => {
      setTcLoading(false)
      if (result) {
        set('exchange_rate', result.rate)
        set('exchange_rate_source', 'api')
        recalcAmountClp(form.amount, result.rate)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.currency, form.date])

  function handleAmountChange(raw: string) {
    set('amount', raw)
    recalcAmountClp(raw, form.exchange_rate)
  }

  function handleRateChange(raw: string) {
    const rate = parseFloat(raw.replace(',', '.'))
    if (!isNaN(rate) && rate > 0) {
      set('exchange_rate', rate)
      set('exchange_rate_source', 'manual')
      recalcAmountClp(form.amount, rate)
    }
  }

  function handleOcrResult(result: OcrResult | null, file: File) {
    set('file', file)
    if (!result) return

    if (result.amount)     set('amount', String(result.amount))
    if (result.currency)   set('currency', result.currency as Currency)
    if (result.date)       set('date', result.date)
    if (result.merchant)   set('merchant', result.merchant)
    if (result.doc_type)   set('doc_type', result.doc_type)
    if (result.doc_number) set('doc_number', result.doc_number)
    set('ocr_raw', { amount: result.amount, currency: result.currency, date: result.date, merchant: result.merchant } as Json)
    set('ocr_confidence', result.confidence)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const localErrors: string[] = []
    if (!form.description.trim()) localErrors.push('La descripción es obligatoria')
    if (!form.amount || parseFloat(form.amount) <= 0) localErrors.push('El monto debe ser mayor a 0')
    if (!form.date) localErrors.push('La fecha es obligatoria')

    if (localErrors.length > 0) {
      setErrors(localErrors)
      return
    }
    setErrors([])

    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600'

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] border-t-[3px] border-t-brand-600 p-4">
      <h3 className="font-semibold text-slate-800">Agregar ítem</h3>

      <PhotoUpload onOcrResult={handleOcrResult} disabled={saving} />

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-item p-3">
          {errors.map(err => (
            <p key={err} className="text-sm text-red-600">{err}</p>
          ))}
        </div>
      )}

      {/* Descripción */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Descripción *</label>
        <input
          type="text"
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Ej: Almuerzo con cliente"
          className={inputCls}
        />
      </div>

      {/* Monto + Moneda */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Monto *</label>
          <input
            type="text"
            inputMode="decimal"
            value={form.amount}
            onChange={e => handleAmountChange(e.target.value)}
            placeholder="15000"
            className={`${inputCls} font-[Manrope] tabular-nums`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
          <select
            value={form.currency}
            onChange={e => set('currency', e.target.value as Currency)}
            className={inputCls}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Tipo de cambio (solo si moneda != CLP) */}
      {form.currency !== 'CLP' && (
        <div className="bg-amber-50 border border-amber-200 rounded-item p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-700">
              Tipo de cambio al {form.date}
            </span>
            {tcLoading && (
              <span className="text-xs text-amber-600 animate-pulse">Consultando...</span>
            )}
            {!tcLoading && form.exchange_rate_source === 'manual' && (
              <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">Manual</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">1 {form.currency} =</span>
            <input
              type="text"
              value={formatExchangeRate(form.exchange_rate)}
              onChange={e => handleRateChange(e.target.value)}
              className="w-28 px-2 py-1 border border-amber-300 rounded text-sm font-[Manrope] tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <span className="text-xs text-slate-500">CLP</span>
          </div>
          {form.amount_clp > 0 && (
            <p className="text-sm font-[Manrope] font-bold tabular-nums text-slate-800">
              ≈ {formatCLP(form.amount_clp)} CLP
            </p>
          )}
        </div>
      )}

      {/* Fecha del gasto */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Fecha del gasto *</label>
        <input
          type="date"
          value={form.date}
          onChange={e => set('date', e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          className={inputCls}
        />
      </div>

      {/* Categoría */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
        <select
          value={form.category_id}
          onChange={e => set('category_id', e.target.value)}
          className={inputCls}
        >
          <option value="">Sin categoría</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
          ))}
        </select>
      </div>

      {/* Proveedor + Tipo doc */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Proveedor</label>
          <input
            type="text"
            value={form.merchant}
            onChange={e => set('merchant', e.target.value)}
            placeholder="Nombre del comercio"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Tipo documento</label>
          <select
            value={form.doc_type}
            onChange={e => set('doc_type', e.target.value)}
            className={inputCls}
          >
            <option value="">Seleccionar</option>
            {DOC_TYPES.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* N° documento */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">N° documento</label>
        <input
          type="text"
          value={form.doc_number}
          onChange={e => set('doc_number', e.target.value)}
          placeholder="000123"
          className={inputCls}
        />
      </div>

      {/* Notas */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Nota interna</label>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Contexto adicional para el aprobador..."
          rows={2}
          className={`${inputCls} resize-none`}
        />
      </div>

      {/* Botones */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 py-2.5 px-4 border border-slate-200 rounded-item text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-item text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {saving ? 'Guardando...' : 'Agregar ítem'}
        </button>
      </div>
    </form>
  )
}
