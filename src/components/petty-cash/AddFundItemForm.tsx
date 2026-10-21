'use client'

import { useState, useTransition } from 'react'
import { addFundItem } from '@/actions/petty-cash'
import { checkItemDuplicate, addPettyCashItemAttachment } from '@/actions/expenses'
import { PhotoUpload } from '@/components/expenses/PhotoUpload'
import type { OcrResult } from '@/lib/ocr-helpers'
import { DOC_TYPES } from '@/lib/constants'
import { AlertTriangle, X, Info } from 'lucide-react'

type Category = { id: string; name: string; color: string | null }
type DuplicateResult = Awaited<ReturnType<typeof checkItemDuplicate>>

interface Props {
  fundId:     string
  categories: Category[]
  onDone:     () => void
}

const EMPTY = {
  description: '', amount: '', currency: 'CLP',
  date: new Date().toISOString().split('T')[0],
  category_id: '', merchant: '', doc_type: '', doc_number: '', supplier_rut: '', notes: '',
}

// text-[16px]: por debajo de 16px Safari en iPhone hace zoom al enfocar el campo
const inputCls = 'campo w-full py-2.5 text-[16px]'

export function AddFundItemForm({ fundId, categories, onDone }: Props) {
  const [form, setForm]           = useState(EMPTY)
  const [error, setError]         = useState<string | null>(null)
  const [dupWarning, setDupWarn]  = useState<DuplicateResult>(null)
  const [pending, startTrans]     = useTransition()
  /** La boleta: entra al OCR y después se adjunta al gasto creado. */
  const [foto, setFoto]           = useState<File | null>(null)
  const [avisoAdjunto, setAviso]  = useState<string | null>(null)

  function set(k: keyof typeof EMPTY, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    if (k === 'doc_number' || k === 'doc_type' || k === 'supplier_rut') setDupWarn(null)
  }

  /* Mismo trato que en una rendición: el OCR rellena lo que reconoce y lo demás
     queda como está. El archivo se guarda aunque el OCR falle — es el respaldo
     del gasto, no solo la entrada del reconocimiento. */
  function handleOcrResult(result: OcrResult | null, file: File) {
    setFoto(file)
    setAviso(null)
    if (!result) return
    if (result.amount)       set('amount', String(result.amount))
    if (result.date)         set('date', result.date)
    if (result.merchant)     set('merchant', result.merchant)
    if (result.doc_type)     set('doc_type', result.doc_type)
    if (result.doc_number)   set('doc_number', result.doc_number)
    if (result.supplier_rut) set('supplier_rut', result.supplier_rut)
  }

  const isFactura = form.doc_type === 'factura' || form.doc_type === 'factura_exenta'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    if (!form.description.trim()) { setError('La descripción es obligatoria'); return }
    if (isNaN(amount) || amount <= 0) { setError('Monto inválido'); return }
    if (!form.date) { setError('La fecha es obligatoria'); return }
    setError(null)

    // Detección de duplicados antes de guardar
    if (form.doc_type && form.doc_number.trim()) {
      const dup = await checkItemDuplicate({
        doc_type:     form.doc_type,
        doc_number:   form.doc_number,
        supplier_rut: form.supplier_rut || undefined,
      })
      if (dup && !dupWarning) {
        setDupWarn(dup)
        return
      }
    }

    startTrans(async () => {
      try {
        const itemId = await addFundItem(fundId, {
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
          supplier_rut: form.supplier_rut || null,
          notes:        form.notes || null,
        })

        /* La foto se adjunta DESPUÉS de crear el gasto, porque recién ahí hay un
           id al cual colgarla. Si la subida falla, el gasto igual quedó
           registrado: se avisa dónde subirla y no se pierde lo cargado. Perder
           el gasto por no poder subir la foto sería peor que quedarse sin ella
           — el mismo criterio que el gasto rápido de `/quick`. */
        if (foto) {
          try {
            await addPettyCashItemAttachment(itemId, foto)
          } catch {
            setAviso('El gasto se registró, pero la foto no se pudo adjuntar. Podés subirla desde el detalle del gasto.')
            setForm(EMPTY)
            setFoto(null)
            setDupWarn(null)
            onDone()
            return
          }
        }

        setForm(EMPTY)
        setFoto(null)
        setDupWarn(null)
        onDone()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al agregar gasto')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* La boleta, primero: igual que en una rendición nueva, la foto rellena
          los campos con el OCR y además queda como respaldo del gasto. Hasta el
          2026-10-20 este formulario no tenía dónde adjuntar nada, así que un
          gasto de caja chica se registraba sin comprobante. */}
      <PhotoUpload onOcrResult={handleOcrResult} disabled={pending} />

      {avisoAdjunto && (
        <div className="bg-warning-50 border border-warning-200 rounded-item p-3 text-xs text-warning-800">
          {avisoAdjunto}
        </div>
      )}

      {/* Francisco Díaz cargó la devolución del saldo COMO UN GASTO para que el
          fondo cerrara en el monto aprobado (2026-10-21): $26.636 que no se
          gastaron quedaron sumando a lo gastado, y habrían viajado a Defontana
          imputados a una cuenta de gasto en vez de volver al banco. Es lo
          intuitivo y nada se lo impedía, así que la pantalla ahora lo dice
          donde se toma la decisión — no en el cierre, que es demasiado tarde. */}
      <p className="card-meta text-ink-500 flex items-start gap-1.5">
        <Info size={13} className="shrink-0 mt-0.5 text-ink-400" aria-hidden />
        <span>Si te sobra plata no la cargues como gasto: se registra al final.</span>
      </p>

      {/* Descripción */}
      <div>
        <label className="block card-label font-semibold text-ink-600 mb-1">Descripción *</label>
        <input
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Ej: Almuerzo de trabajo"
          className={inputCls}
        />
      </div>

      {/* Monto + Fecha */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block card-label font-semibold text-ink-600 mb-1">Monto CLP *</label>
          <input
            type="number" min="1" step="1"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            placeholder="0"
            className={`${inputCls} font-mono-amount`}
          />
        </div>
        <div>
          <label className="block card-label font-semibold text-ink-600 mb-1">Fecha *</label>
          <input
            type="date"
            value={form.date}
            onChange={e => set('date', e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {/* Categoría + Proveedor */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block card-label font-semibold text-ink-600 mb-1">Categoría</label>
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
          <label className="block card-label font-semibold text-ink-600 mb-1">Proveedor / Comercio</label>
          <input
            value={form.merchant}
            onChange={e => set('merchant', e.target.value)}
            placeholder="Ej: Jumbo, Copec..."
            className={inputCls}
          />
        </div>
      </div>

      {/* Tipo doc + N° doc */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block card-label font-semibold text-ink-600 mb-1">Tipo documento</label>
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
          <label className="block card-label font-semibold text-ink-600 mb-1">N° folio / documento</label>
          <input
            value={form.doc_number}
            onChange={e => set('doc_number', e.target.value)}
            placeholder="000123"
            className={inputCls}
          />
        </div>
      </div>

      {/* RUT Proveedor — solo para facturas */}
      {isFactura && (
        <div>
          <label className="block card-label font-semibold text-ink-600 mb-1">
            RUT Proveedor <span className="text-danger-500">*</span>
            <span className="font-normal text-ink-400 ml-1">(requerido para crédito fiscal IVA)</span>
          </label>
          <input
            value={form.supplier_rut}
            onChange={e => set('supplier_rut', e.target.value)}
            placeholder="12.345.678-9"
            className={inputCls}
          />
          {!form.supplier_rut && (
            <div className="mt-1.5 flex items-center gap-1.5 card-meta text-warning-700 bg-warning-50 px-2.5 py-1.5 rounded-item border border-warning-200">
              <AlertTriangle size={12} className="shrink-0" />
              Sin RUT el crédito fiscal IVA no puede acreditarse ante el SII
            </div>
          )}
        </div>
      )}

      {/* Advertencia duplicado */}
      {dupWarning && (
        <div className="bg-warning-50 border border-warning-300 rounded-item p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="text-warning-600 mt-0.5 shrink-0" />
            <div>
              <p className="card-eyebrow text-warning-800">Posible documento duplicado</p>
              <p className="card-meta text-warning-700 mt-0.5">
                Ya existe un ítem con este número de documento en <strong>{dupWarning.source}</strong>
                {dupWarning.context ? ` "${dupWarning.context}"` : ''}.
              </p>
              <div className="mt-2 bg-white border border-warning-200 rounded px-3 py-2 card-meta text-ink-600 space-y-0.5">
                <p><span className="font-medium">Descripción:</span> {dupWarning.description}</p>
                <p><span className="font-medium">Monto CLP:</span> $ {dupWarning.amount_clp.toLocaleString('es-CL')}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-2.5 bg-warning-600 hover:bg-warning-700 text-white card-meta font-bold rounded-item transition-colors"
            >
              Agregar igualmente
            </button>
            <button
              type="button"
              onClick={() => setDupWarn(null)}
              className="btn-secundario px-3 py-2.5 card-meta"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Notas */}
      <div>
        <label className="block card-label font-semibold text-ink-600 mb-1">Nota (opcional)</label>
        <input
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Observaciones adicionales"
          className={inputCls}
        />
      </div>

      {error && <p className="card-label text-danger-600 bg-danger-50 px-3 py-2 rounded-item">{error}</p>}

      {!dupWarning && (
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="btn-primario flex-1 py-3 card-label"
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
      )}
    </form>
  )
}
