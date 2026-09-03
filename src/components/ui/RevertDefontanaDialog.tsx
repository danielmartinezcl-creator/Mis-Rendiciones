'use client'

import { useState } from 'react'
import { AlertTriangle, Undo2 } from 'lucide-react'

interface RevertDefontanaDialogProps {
  /** Qué se está revirtiendo: título de la rendición, del fondo o de la carga histórica. */
  targetLabel: string
  /** Línea de contexto: comprobante Defontana, cantidad de ítems, tipos seleccionados. */
  detail?:     string | null
  onCancel:    () => void
  /** Debe lanzar si falla; el padre cierra el diálogo cuando resuelve. */
  onConfirm:   (reason: string) => Promise<void>
}

/** Motivo mínimo — corto pero suficiente para que la auditoría diga algo. */
const MIN_REASON = 5

/** Diálogo de confirmación para deshacer el estado "Contabilizado" en Defontana.
 *  El motivo es obligatorio: queda registrado en el log de auditoría. */
export function RevertDefontanaDialog({ targetLabel, detail, onCancel, onConfirm }: RevertDefontanaDialogProps) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const tooShort = reason.trim().length < MIN_REASON

  async function submit() {
    if (tooShort || saving) return
    setSaving(true)
    setError(null)
    try {
      await onConfirm(reason.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo revertir')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-card shadow-xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-9 h-9 rounded-full bg-warning-50 text-warning-600 flex items-center justify-center">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-ink-800">Revertir contabilización</h3>
            <p className="text-sm text-ink-500 mt-0.5 break-words">{targetLabel}</p>
            {detail && <p className="text-xs text-ink-400 mt-0.5 font-mono">{detail}</p>}
          </div>
        </div>

        <div className="bg-warning-50 border border-warning-200 rounded-item px-3 py-2 text-xs text-warning-800">
          Volverá a quedar como <strong>sin contabilizar</strong> y podrá exportarse de nuevo.
          Si el asiento ya está cargado en Defontana, anúlalo allá para no duplicarlo.
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1">
            Motivo de la reversa <span className="text-danger-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            disabled={saving}
            rows={3}
            autoFocus
            placeholder="Ej: comprobante 4512 anulado en Defontana, se cargó con el centro de costo equivocado"
            className="campo w-full disabled:opacity-50 resize-none"
          />
          <p className="text-[11px] text-ink-400 mt-1">Queda registrado en Admin → Auditoría junto a tu nombre y la fecha.</p>
        </div>

        {error && (
          <p className="text-xs text-danger-600 bg-danger-50 border border-danger-200 rounded-item px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-2 border border-ink-200 rounded-item text-sm font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={tooShort || saving}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 bg-warning-600 hover:bg-warning-700 text-white rounded-item text-sm font-semibold disabled:opacity-40 transition-colors"
          >
            <Undo2 size={14} />
            {saving ? 'Revirtiendo...' : 'Revertir'}
          </button>
        </div>
      </div>
    </div>
  )
}
