'use client'

import { useState, useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { PhotoUpload } from './PhotoUpload'
import { getHistoricalRate } from '@/actions/exchange-rate'
import { checkItemDuplicate, checkDuplicateExpenseItem } from '@/actions/expenses'
import { checkPolicyViolations, checkTravelPolicies } from '@/actions/policies'
import { formatViolationMessage } from '@/lib/policy-helpers'
import { formatCLP, formatExchangeRate, formatDate } from '@/lib/utils'
import { validateAndFormatRut } from '@/lib/sii-validator'
import { CURRENCIES, DOC_TYPES, type Currency } from '@/lib/constants'
import type { OcrResult } from '@/lib/ocr-helpers'
import type { PolicyCheckResult, TravelPolicyCheckResult } from '@/actions/policies'
import type { PolicyViolation } from '@/lib/policy-helpers'
import type { DuplicateMatch } from '@/lib/duplicate-detection'
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
  policy_justification: string | null
  policy_violations:    PolicyViolation[] | null
  // Kilometraje
  mileage_km:   string   // '' cuando no aplica
  mileage_rate: number | null
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
  policy_justification: null,
  policy_violations:    null,
  mileage_km:           '',
  mileage_rate:         null,
})

interface ExpenseItemFormProps {
  categories:           ExpenseCategory[]
  costCenters:          CostCenter[]
  employeeCostCenterId: string | null
  mileageRate:          number   // tarifa CLP/km configurada por la org
  submitterId:          string | null   // ID del empleado logueado (para detección de duplicados)
  orgId:                string | null   // org_id del empleado logueado
  onSave:               (data: ItemFormData) => Promise<void>
  onCancel:             () => void
}

export function ExpenseItemForm({
  categories,
  costCenters,
  employeeCostCenterId,
  mileageRate,
  submitterId,
  orgId,
  onSave,
  onCancel,
}: ExpenseItemFormProps) {
  const [form, setForm]         = useState<ItemFormData>(emptyForm())
  const [tcLoading, setTcLoading]     = useState(false)
  const [saving, setSaving]           = useState(false)
  const [errors, setErrors]           = useState<string[]>([])
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateResult>(null)

  // ─── Estado de validación de políticas ────────────────────────────────────
  const [policyResult, setPolicyResult]         = useState<PolicyCheckResult | null>(null)
  const [policyLoading, setPolicyLoading]       = useState(false)
  const [policyJustification, setPolicyJustification] = useState('')
  const pendingCheck = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Estado de política de viáticos ──────────────────────────────────────
  const [travelResult, setTravelResult] = useState<TravelPolicyCheckResult | null>(null)
  const pendingTravel = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // ─── Validación de políticas (debounce 600ms; inmediato para selects) ───────
  function triggerPolicyCheck(amount: string, catId: string | null, immediate = false) {
    if (pendingCheck.current) clearTimeout(pendingCheck.current)
    if (pendingTravel.current) clearTimeout(pendingTravel.current)

    const numericAmount = parseInt(amount.replace(/\D/g, ''), 10)
    if (!numericAmount || numericAmount <= 0) {
      setPolicyResult(null)
      setTravelResult(null)
      return
    }

    const delay = immediate ? 0 : 600
    pendingCheck.current = setTimeout(async () => {
      setPolicyLoading(true)
      try {
        const result = await checkPolicyViolations({
          categoryId: catId || null,
          amount:     numericAmount,
          date:       form.date || new Date().toISOString().split('T')[0],
        })
        setPolicyResult(result)
        if (!result.violations.length) setPolicyJustification('')
      } catch {
        setPolicyResult(null)
      } finally {
        setPolicyLoading(false)
      }
    }, delay)

    pendingTravel.current = setTimeout(async () => {
      try {
        const result = await checkTravelPolicies({ categoryId: catId || null, amount: numericAmount })
        setTravelResult(result)
      } catch {
        setTravelResult(null)
      }
    }, delay)
  }

  function handleAmountChange(raw: string) {
    set('amount', raw)
    recalcAmountClp(raw, form.exchange_rate)
    triggerPolicyCheck(raw, form.category_id || null)
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
      await onSave({
        ...form,
        policy_justification: policyJustification || null,
        policy_violations:    policyResult?.violations.length ? policyResult.violations : null,
      })
      setDuplicateWarning(null)
      setPolicyResult(null)
      setPolicyJustification('')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const localErrors: string[] = []
    if (!form.description.trim()) localErrors.push('La descripción es obligatoria')
    if (isMileage) {
      const km = parseFloat(form.mileage_km)
      if (isNaN(km) || km <= 0) localErrors.push('Ingresá los kilómetros recorridos')
    } else {
      if (!form.amount || parseFloat(form.amount) <= 0) localErrors.push('El monto debe ser mayor a 0')
    }
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

    // Verificar duplicado por merchant + monto + fecha (±7 días)
    if (!isMileage && form.merchant.trim() && form.amount_clp > 0 && submitterId && orgId) {
      setSaving(true)
      const merchantDup: DuplicateMatch | null = await checkDuplicateExpenseItem({
        submitterId,
        orgId,
        amountClp: form.amount_clp,
        merchant:  form.merchant,
        date:      form.date,
      })
      setSaving(false)
      if (merchantDup) {
        const proceed = window.confirm(
          `Posible duplicado detectado: ya existe un ítem de ${formatCLP(merchantDup.amount)} ` +
          `en "${merchantDup.reportTitle}" del ${merchantDup.date}.\n\n¿Continuar de todas formas?`
        )
        if (!proceed) return
      }
    }

    await doSave()
  }

  const isMileage   = !!form.mileage_km.trim()
  const isFactura   = form.doc_type === 'factura' || form.doc_type === 'factura_exenta'
  const selectedCat = categories.find(c => c.id === form.category_id)
  const catMissingCode = !!form.category_id && selectedCat && !selectedCat.defontana_account_code

  function handleMileageKmChange(raw: string) {
    set('mileage_km', raw)
    set('mileage_rate', mileageRate)
    const km = parseFloat(raw)
    if (!isNaN(km) && km > 0) {
      const total = Math.round(km * mileageRate)
      set('amount', String(total))
      set('amount_clp', total)
      set('exchange_rate', 1)
      set('exchange_rate_source', 'api')
    } else {
      set('amount', '')
      set('amount_clp', 0)
    }
  }

  function toggleMileage() {
    if (isMileage) {
      // volver a modo normal
      set('mileage_km',   '')
      set('mileage_rate', null)
      set('amount', '')
      set('amount_clp', 0)
    } else {
      // entrar en modo kilometraje
      set('doc_type',    '')
      set('doc_number',  '')
      set('currency',    'CLP')
      set('mileage_km',  '')
      set('mileage_rate', mileageRate)
    }
  }

  const defaultCCLabel = employeeCostCenterId
    ? `Mi centro por defecto (${employeeCostCenterId})`
    : 'Sin centro asignado'

  const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600'

  const isSaveDisabled =
    saving ||
    policyLoading ||
    !!policyResult?.hasBlock ||
    (!!policyResult?.hasJustificationRequired && !policyResult.hasBlock && !policyJustification.trim())

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] border-t-[3px] border-t-brand-600 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Agregar ítem</h3>
        <button
          type="button"
          onClick={toggleMileage}
          className={`text-xs font-semibold px-2.5 py-1 rounded-item border transition-colors ${
            isMileage
              ? 'bg-brand-600 text-white border-brand-600'
              : 'text-brand-600 border-brand-200 hover:bg-brand-50'
          }`}
        >
          {isMileage ? '🚗 Kilometraje' : '🚗 ¿Es km?'}
        </button>
      </div>

      {!isMileage && <PhotoUpload onOcrResult={handleOcrResult} disabled={saving} />}

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

      {/* Modo kilometraje — km + tramo */}
      {isMileage && (
        <div className="bg-brand-50 border border-brand-200 rounded-item p-3 space-y-3">
          <p className="text-xs text-brand-700 font-semibold">
            Tarifa: {mileageRate.toLocaleString('es-CL')} CLP/km (configurada por la org)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kilómetros *</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.mileage_km}
                onChange={e => handleMileageKmChange(e.target.value)}
                placeholder="0"
                className={`${inputCls} font-[Manrope] tabular-nums`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Total CLP</label>
              <p className="px-3 py-2.5 bg-white border border-slate-200 rounded-item text-sm font-[Manrope] tabular-nums text-slate-800">
                {form.amount_clp > 0 ? form.amount_clp.toLocaleString('es-CL') : '—'}
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tramo (origen → destino)</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Ej: Oficina → Faena El Peñón"
              className={inputCls}
            />
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
          placeholder={isMileage ? 'Ej: Viaje a faena' : 'Ej: Almuerzo con cliente'}
          className={inputCls}
        />
      </div>

      {/* Monto + Moneda — oculto en modo kilometraje (se calcula automáticamente) */}
      {!isMileage && (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Monto *</label>
          <input
            type="text"
            inputMode="decimal"
            value={form.amount}
            onChange={e => handleAmountChange(e.target.value)}
            placeholder="15000"
            className={`${inputCls} font-[Manrope] tabular-nums ${policyResult?.hasBlock ? 'border-rose-400 bg-rose-50' : ''}`}
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
      )}

      {/* Tipo de cambio (solo si moneda != CLP) */}
      {!isMileage && form.currency !== 'CLP' && (
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
          onChange={e => {
            set('category_id', e.target.value)
            triggerPolicyCheck(form.amount, e.target.value || null, true)
          }}
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

      {/* Proveedor + Tipo doc (solo en modo gasto normal) */}
      {!isMileage && (
      <>
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
            {form.supplier_rut && (() => {
              const result = validateAndFormatRut(form.supplier_rut)
              return result.valid
                ? <p className="text-xs text-teal-600 mt-1">✓ RUT válido: {result.formatted}</p>
                : <p className="text-xs text-red-600 mt-1">✗ {result.error}</p>
            })()}
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
      </>
      )}

      {/* ─── Banner de validación de políticas ──────────────────────────────── */}
      {policyLoading && (
        <div className="text-xs text-ink-400 flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
          Verificando políticas...
        </div>
      )}

      {!policyLoading && policyResult && policyResult.violations.length > 0 && (
        <div className={`rounded-item p-3 space-y-1.5 ${
          policyResult.hasBlock
            ? 'bg-rose-50 border border-rose-200'
            : 'bg-amber-50 border border-amber-200'
        }`}>
          <div className={`flex items-start gap-2 text-sm font-semibold ${
            policyResult.hasBlock ? 'text-rose-700' : 'text-amber-700'
          }`}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              {policyResult.hasBlock ? 'Gasto bloqueado por política' : 'Advertencia de política'}
            </span>
          </div>
          {policyResult.violations.map((v, i) => (
            <p key={i} className={`text-xs ml-5 ${
              policyResult.hasBlock ? 'text-rose-600' : 'text-amber-600'
            }`}>
              {formatViolationMessage(v)}
            </p>
          ))}

          {/* Campo justificación — solo si require_justification y no block */}
          {policyResult.hasJustificationRequired && !policyResult.hasBlock && (
            <div className="mt-2">
              <label className="block text-xs font-semibold text-amber-700 mb-1">
                Justificación requerida *
              </label>
              <textarea
                value={policyJustification}
                onChange={e => setPolicyJustification(e.target.value)}
                placeholder="Explica por qué es necesario este gasto..."
                className="w-full border border-amber-300 rounded-item px-2.5 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                rows={2}
              />
            </div>
          )}
        </div>
      )}

      {/* ─── Banner política de viáticos ─────────────────────────────────────── */}
      {travelResult?.policy && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-item text-xs font-semibold border ${
          travelResult.exceeds
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          <span>{travelResult.exceeds ? '⚠' : '✓'}</span>
          <span>
            {travelResult.exceeds
              ? `Excede política de viáticos "${travelResult.policy.name}" — máximo ${travelResult.limitAmount?.toLocaleString('es-CL')} ${travelResult.limitCurrency}`
              : `Dentro de política de viáticos "${travelResult.policy.name}" — máx. ${travelResult.limitAmount?.toLocaleString('es-CL')} ${travelResult.limitCurrency}`
            }
          </span>
        </div>
      )}

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
          disabled={isSaveDisabled}
          className="flex-1 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-item text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {saving ? 'Guardando...' : 'Agregar ítem'}
        </button>
      </div>
    </form>
  )
}
