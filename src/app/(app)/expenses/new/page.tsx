'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createExpenseReport } from '@/actions/expenses'

export default function NewExpensePage() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = new FormData(e.currentTarget)

    try {
      await createExpenseReport(form)
      // createExpenseReport hace redirect interno al nuevo ID
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la rendición')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Nueva rendición</h1>
        <p className="text-sm text-slate-500 mt-1">
          Primero dale un nombre, después vas a agregar los ítems con fotos
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-item p-3">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] border-t-[3px] border-t-brand-600 p-5 space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-semibold text-slate-700 mb-1">
            Nombre de la rendición *
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="Ej: Viaje a Santiago — Mayo 2026"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <p className="text-xs text-slate-400 mt-1">
            Un nombre que identifique claramente el grupo de gastos
          </p>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-semibold text-slate-700 mb-1">
            Descripción (opcional)
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            placeholder="Contexto adicional para quien aprueba..."
            className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={loading}
            className="flex-1 py-2.5 px-4 border border-slate-200 rounded-item text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-item text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creando...' : 'Continuar →'}
          </button>
        </div>
      </form>
    </div>
  )
}
