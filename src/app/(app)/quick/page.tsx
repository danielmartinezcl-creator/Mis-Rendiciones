'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CheckCircle2, Wallet, ArrowRight, RotateCcw, AlertCircle } from 'lucide-react'
import { runOcr } from '@/actions/ocr'
import { addFundItem, listPettyCashFunds, getActivePettyCashCategories } from '@/actions/petty-cash'
import { addPettyCashItemAttachment } from '@/actions/expenses'
import type { FundListItem } from '@/actions/petty-cash'

type Category = { id: string; name: string; color: string | null }

type Step = 'photo' | 'confirm' | 'fund'

const STEP_LABELS: Record<Step, string> = {
  photo:   '1. Foto',
  confirm: '2. Confirmar',
  fund:    '3. Fondo',
}

function fmtCLP(n: number) {
  return '$ ' + Math.round(n).toLocaleString('es-CL')
}

export default function QuickPage() {
  const router   = useRouter()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [step,        setStep]        = useState<Step>('photo')
  const [photo,       setPhoto]       = useState<string | null>(null)   // base64
  const [photoFile,   setPhotoFile]   = useState<File | null>(null)
  const [avisoAdjunto, setAvisoAdjunto] = useState<string | null>(null)
  const [ocrRunning,  setOcrRunning]  = useState(false)
  const [description, setDesc]        = useState('')
  const [amount,      setAmount]      = useState('')
  const [categoryId,  setCategoryId]  = useState('')
  const [fundId,      setFundId]      = useState('')
  const [funds,       setFunds]       = useState<FundListItem[]>([])
  const [categories,  setCategories]  = useState<Category[]>([])
  const [submitting,  setSubmitting]  = useState(false)
  const [done,        setDone]        = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const readyFunds = funds.filter(f => f.status === 'funds_sent')

  useEffect(() => {
    listPettyCashFunds().then(setFunds)
    getActivePettyCashCategories().then(setCategories)
  }, [])

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setError(null)

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      setPhoto(`data:${file.type};base64,${base64}`)
      setOcrRunning(true)
      try {
        const result = await runOcr(base64, file.type)
        if (result) {
          if (result.amount)   setAmount(String(result.amount))
          if (result.merchant) setDesc(result.merchant)
        }
      } finally {
        setOcrRunning(false)
        setStep('confirm')
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit() {
    if (!fundId || !description.trim() || !amount) {
      setError('Completá todos los campos')
      return
    }
    const amtNum = parseFloat(amount.replace(/\./g, '').replace(',', '.'))
    if (isNaN(amtNum) || amtNum <= 0) { setError('Monto inválido'); return }

    setSubmitting(true)
    setError(null)
    try {
      const itemId = await addFundItem(fundId, {
        description:   description.trim(),
        amount:        amtNum,
        currency:      'CLP',
        exchange_rate: 1,
        amount_clp:    amtNum,
        date:          new Date().toISOString().split('T')[0],
        category_id:   categoryId || null,
        merchant:      null,
        doc_type:      null,
        doc_number:    null,
        supplier_rut:  null,
        notes:         null,
      })

      /* La foto es el respaldo del gasto, no solo la entrada del OCR. Se adjunta
         DESPUÉS de crear el ítem porque recién ahí hay un id al cual colgarla.
         Si la subida falla, el gasto igual quedó registrado: se avisa y no se
         pierde lo cargado. Perder el gasto por no poder subir la foto sería
         peor que quedarse sin la foto. */
      if (photoFile) {
        try {
          await addPettyCashItemAttachment(itemId, photoFile)
        } catch {
          setAvisoAdjunto('El gasto se registró, pero la foto no se pudo adjuntar. Podés subirla desde el detalle del fondo.')
        }
      }

      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-5 px-4">
        <CheckCircle2 size={56} className="text-accent-500" />
        <h2 className="text-xl font-display font-bold text-ink-800">¡Gasto registrado!</h2>
        <p className="text-ink-500 card-label">
          {avisoAdjunto ? 'El gasto se agregó a tu caja chica.' : 'El gasto y su boleta quedaron en tu caja chica.'}
        </p>
        {avisoAdjunto && (
          <p className="card-label text-warning-700 bg-warning-50 border border-warning-200 rounded-item px-3 py-2 max-w-xs">
            {avisoAdjunto}
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => { setDone(false); setStep('photo'); setPhoto(null); setPhotoFile(null); setAvisoAdjunto(null); setDesc(''); setAmount(''); setCategoryId(''); setFundId('') }}
            className="btn-secundario px-4 py-3 card-label"
          >
            Otro gasto
          </button>
          <button
            onClick={() => router.push('/petty-cash/' + fundId)}
            className="btn-primario px-4 py-3 card-label"
          >
            Ver fondo →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto space-y-5">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold tor-on-gradient">Gasto rápido</h1>
          <p className="card-meta tor-on-gradient-soft mt-0.5">3 pasos, solo lo esencial</p>
        </div>
        <button onClick={() => router.push('/')} className="card-label text-ink-400 hover:text-ink-600">
          Cancelar
        </button>
      </div>

      {/* Stepper */}
      <div className="flex gap-1">
        {(['photo', 'confirm', 'fund'] as Step[]).map((s, i) => (
          <div key={s} className="flex-1 flex items-center gap-1">
            <div className={`h-1 rounded-full flex-1 transition-colors ${
              step === s ? 'bg-brand-600' : i < (['photo','confirm','fund'] as Step[]).indexOf(step) ? 'bg-accent-400' : 'bg-ink-100'
            }`} />
          </div>
        ))}
      </div>
      <p className="card-label font-semibold text-ink-500 -mt-3">{STEP_LABELS[step]}</p>

      {error && (
        <div className="flex items-center gap-2 bg-danger-50 border border-danger-200 rounded-item px-3 py-2.5">
          <AlertCircle size={18} className="text-danger-500 shrink-0" />
          <p className="card-label text-danger-700">{error}</p>
        </div>
      )}

      {/* Paso 1: Foto */}
      {step === 'photo' && (
        <div className="space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="relative bg-ink-900 rounded-card flex flex-col items-center justify-center cursor-pointer hover:bg-ink-800 transition-colors"
            style={{ height: 260 }}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="foto" className="w-full h-full object-cover rounded-card" />
            ) : (
              <>
                <Camera size={44} className="text-white/40 mb-3" />
                <p className="text-white/70 card-eyebrow">Tomá la foto</p>
                <p className="text-white/40 card-label mt-1">Boleta, factura o ticket</p>
              </>
            )}
            {ocrRunning && (
              <div className="absolute inset-0 bg-black/50 rounded-card flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhoto}
          />

          <button
            onClick={() => fileRef.current?.click()}
            disabled={ocrRunning}
            className="btn-primario w-full py-3.5 text-[19px] flex items-center justify-center gap-2"
          >
            <Camera size={24} />
            {ocrRunning ? 'Analizando...' : 'Abrir cámara'}
          </button>

          {photo && !ocrRunning && (
            <button
              onClick={() => setStep('confirm')}
              className="w-full py-3 border border-ink-200 rounded-card card-label font-semibold text-ink-600 hover:bg-ink-50 flex items-center justify-center gap-2"
            >
              Continuar sin OCR <ArrowRight size={18} />
            </button>
          )}
        </div>
      )}

      {/* Paso 2: Confirmar */}
      {step === 'confirm' && (
        <div className="space-y-4">
          {photo && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="foto" className="w-full rounded-card object-cover" style={{ maxHeight: 140 }} />
              <button
                onClick={() => { setStep('photo'); setPhoto(null) }}
                className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          )}

          <div className="hoja p-4 space-y-3">
            <div>
              <label className="block card-label font-semibold text-ink-600 mb-1">Descripción *</label>
              <input
                value={description}
                onChange={e => setDesc(e.target.value)}
                placeholder="Ej: Almuerzo de trabajo"
                className="campo w-full py-2.5 text-[16px]"
              />
            </div>
            <div>
              <label className="block card-label font-semibold text-ink-600 mb-1">Monto CLP *</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                className="campo w-full py-2.5 text-[16px] font-mono-amount"
              />
            </div>
            <div>
              <label className="block card-label font-semibold text-ink-600 mb-1">Categoría</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="campo w-full py-2.5 text-[16px]"
              >
                <option value="">Sin categoría</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={() => {
              if (!description.trim() || !amount) { setError('Descripción y monto son obligatorios'); return }
              setError(null)
              setStep('fund')
            }}
            className="btn-primario w-full py-3.5 text-base flex items-center justify-center gap-2"
          >
            Siguiente <ArrowRight size={18} />
          </button>
        </div>
      )}

      {/* Paso 3: Fondo */}
      {step === 'fund' && (
        <div className="space-y-4">
          <div className="hoja p-4 space-y-2">
            <p className="card-eyebrow text-ink-700">{description}</p>
            <p className="font-mono-amount font-bold text-accent-700 text-[28px] leading-none">{fmtCLP(parseFloat(amount) || 0)}</p>
          </div>

          {readyFunds.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <Wallet size={40} className="mx-auto text-ink-200" />
              <p className="card-eyebrow text-ink-500">Sin fondos activos</p>
              <p className="card-label text-ink-400">Necesitás un fondo de caja chica con fondos enviados.</p>
              <button
                onClick={() => router.push('/petty-cash')}
                className="card-label text-brand-600 hover:underline"
              >
                Ver caja chica →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="card-label font-semibold text-ink-600">Elegí el fondo de caja chica:</p>
              {readyFunds.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFundId(f.id)}
                  className={`w-full text-left p-3.5 rounded-card border-2 transition-colors ${
                    fundId === f.id
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-ink-100 bg-white hover:border-ink-300'
                  }`}
                >
                  <p className="card-eyebrow text-ink-800">{f.name}</p>
                  <p className="card-meta text-ink-400 mt-0.5">{f.employee_name}</p>
                </button>
              ))}
            </div>
          )}

          {readyFunds.length > 0 && (
            <button
              onClick={handleSubmit}
              disabled={!fundId || submitting}
              className="w-full py-3.5 bg-accent-600 hover:bg-accent-700 text-white rounded-card font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {submitting ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  Guardar gasto
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
