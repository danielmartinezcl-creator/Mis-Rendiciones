'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { PhotoUpload } from './PhotoUpload'
import { getHistoricalRate } from '@/actions/exchange-rate'
import { checkItemDuplicate } from '@/actions/expenses'
import { formatCLP, formatExchangeRate, formatDate } from '@/lib/utils'
import { CURRENCIES, DOC_TYPES, type Currency } from '@/lib/constants'
import type { OcrResult } from '@/lib/ocr-helpers'
import type { ExpenseCategory, CostCenter, Json } from '@/lib/supabase/types'

type DuplicateResult = Awaited<ReturnType<typeof checkItemDuplicate>>

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
  cost_center_id:       string   // '' = usar el del empleado
  supplier_rut:         string   // RUT del proveedor (requerido en facturas)
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
  cost_center_id:       '',
  supplier_rut:         '',
  ocr_raw:              null,
  ocr_confidence:       null,
  file:                 null,
})

interface ExpenseItemFormProps {
  categories:           ExpenseCategory[]
  costCenters:          CostCenter[]
  employeeCostCenterId: string | null
  onSave:               (data: ItemFormData) => Promise<void>
  onCancel:             () => void
}

export function ExpenseItemForm({
  categories,
  costCenters,
  employeeCostCenterId,
  onSave,
  onCancel,
}: ExpenseItemFormProps) {
  const [form, setForm]         = useState<ItemFormData>(emptyForm())
  const [tcLoading, setTcLoading]     = useState(false)
  const [saving, setSaving]           = useState(false)
  const [errors, setErrors]           = useState<string[]>([])
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateResult>(null)

  function set(field: keyof ItemFormData, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function recalcAmountClp(amountStr: string, rate: number) {
    const val = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'))
    set('amount_clp', !isNaN(val) && val > 0 ? Math.round(val * rate) : 0)
  }

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

    if (result.amount)        set('amount', String(result.amount))
    if (result.currency)      set('currency', result.currency as Currency)
    if (result.date)          set('date', result.date)
    if (result.merchant)      set('merchant', result.merchant)
    if (result.doc_type)      set('doc_type', result.doc_type)
    if (result.doc_number)    set('doc_number', result.doc_number)
    if (result.supplier_rut)  set('supplier_rut', result.supplier_rut)
    set('ocr_raw', { amount: result.amount, currency: result.currency, date: result.date, merchant: result.merchant } as Json)
    set('ocr_confidence', result.confidence)
  }

  async function doSave() {
    setSaving(true)
    try {
      await onSave(form)
      setDuplicateWarning(null)
    } finally {
      setSaving(false)
    }
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

    if (form.doc_type && form.doc_number.trim()) {
      setSaving(true)
      const dup = await checkItemDuplicate({ doc_type: form.doc_type, doc_number: form.doc_number, supplier_rut: form.supplier_rut || undefined })
      setSaving(false)
      if (dup) {
        setDuplicateWarning(dup)
        return
      }
    }

    await doSave()
  }

  const isFactura = form.doc_type === 'factura' || form.doc_type === 'factura_exenta'
  const selectedCat = categories.find(c => c.id === form.category_id)
  const catMissingCode = !!form.category_id && selectedCat && !selectedCat.defontana_account_code

  const defaultCCLabel = employeeCostCenterId
    ? `Mi centro por defecto (${employeeCostCenterId})`
    : 'Sin centro asignado'

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

      {/* Advertencia de documento duplicado */}
      {duplicateWarning && (
        <div className="bg-amber-50 border border-amber-300 rounded-item p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Posible documento duplicado</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Ya existe un ítem con este número de documento en{' '}
                <strong>{duplicateWarning.source}</strong>
                {duplicateWarning.context ? ` "${duplicateWarning.context}"` : ''}.
              </p>
              <div className="mt-2 bg-white border border-amber-200 rounded px-3 py-2 text-xs text-slate-600 space-y-0.5">
                <p><span className="font-medium">Descripción:</span> {duplicateWarning.description}</p>
                <p><span className="font-medium">Monto CLP:</span> {formatCLP(duplicateWarning.amount_clp)}</p>
                <p><span className="font-medium">Fecha:</span> {formatDate(duplicateWarning.date)}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDuplicateWarning(null)}
              className="flex-1 py-2 px-3 border border-amber-300 rounded-item text-sm font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={doSave}
              disabled={saving}
              className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-item text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : 'Registrar de todas formas'}
            </button>
          </div>
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

      {/* Categoría + warning cuenta Defontana */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
        <select
          value={form.category_id}
          onChange={e => set('category_id', e.target.value)}
          className={inputCls}
        >
          <option value="">Sin categoría</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        {catMissingCode && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-item border border-amber-200">
            <AlertTriangle size={12} className="shrink-0" />
            Esta categoría no tiene cuenta Defontana asignada — no aparecerá en el asiento contable
          </div>
        )}
      </div>

      {/* Centro de costo (override por ítem) */}
      {costCenters.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Centro de costo</label>
          <select
            value={form.cost_center_id}
            onChange={e => set('cost_center_id', e.target.value)}
            className={inputCls}
          >
            <option value="">{defaultCCLabel}</option>
            {costCenters.map(cc => (
              <option key={cc.id} value={cc.id}>{cc.id} — {cc.descripcion}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Cambia solo si el gasto corresponde a otro centro o proyecto.
          </p>
        </div>
      )}

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

      {/* RUT Proveedor — solo visible para facturas (crédito fiscal IVA) */}
      {isFactura && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            RUT Proveedor
            <span className="ml-1.5 text-xs font-normal text-slate-400">(requerido para crédito fiscal IVA)</span>
          </label>
          <input
            type="text"
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
