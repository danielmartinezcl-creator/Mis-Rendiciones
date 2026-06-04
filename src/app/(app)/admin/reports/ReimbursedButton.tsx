'use client'

import { useState } from 'react'
import { markReimbursed } from '@/actions/approvals'
import { useRouter } from 'next/navigation'

export function ReimbursedButton({ reportId }: { reportId: string }) {
  const [open,      setOpen]      = useState(false)
  const [ref,       setRef]       = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const router = useRouter()

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      await markReimbursed(reportId, ref)
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al marcar reembolso')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
      >
        💸 Marcar como reembolsada
      </button>
    )
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={ref}
          onChange={e => setRef(e.target.value)}
          placeholder="Referencia de pago (opcional)"
          className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-item text-xs focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-item transition-colors"
        >
          {loading ? '...' : 'Confirmar'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
