'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createExpenseReport } from '@/actions/expenses'
import { RotateCcw, X } from 'lucide-react'

const DRAFT_KEY = (userId: string) => `draft_expense_${userId}`

interface Draft { title: string; description: string; savedAt: string }

export default function NewExpensePage() {
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [userId, setUserId]     = useState<string | null>(null)
  const [draft, setDraft]       = useState<Draft | null>(null)
  const [title, setTitle]       = useState('')
  const [description, setDesc]  = useState('')
  const router = useRouter()
  const titleRef = useRef<HTMLInputElement>(null)

  // Cargar userId y verificar draft guardado
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      try {
        const raw = localStorage.getItem(DRAFT_KEY(user.id))
        if (raw) setDraft(JSON.parse(raw))
      } catch { /* ignore */ }
    })
  }, [])

  // Auto-guardar cada 30 segundos cuando hay título
  useEffect(() => {
    if (!userId || !title.trim()) return
    const interval = setInterval(() => {
      const data: Draft = { title, description, savedAt: new Date().toISOString() }
      localStorage.setItem(DRAFT_KEY(userId), JSON.stringify(data))
    }, 30_000)
    return () => clearInterval(interval)
  }, [userId, title, description])

  function handleRestoreDraft() {
    if (!draft) return
    setTitle(draft.title)
    setDesc(draft.description)
    setDraft(null)
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  function handleDiscardDraft() {
    if (userId) localStorage.removeItem(DRAFT_KEY(userId))
    setDraft(null)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = new FormData()
    form.append('title', title)
    form.append('description', description)

    try {
      // Limpiar draft antes del redirect
      if (userId) localStorage.removeItem(DRAFT_KEY(userId))
      await createExpenseReport(form)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la rendición')
      setLoading(false)
    }
  }

  const draftDate = draft ? new Date(draft.savedAt).toLocaleString('es-CL', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : ''

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800">Nueva rendición</h1>
        <p className="text-sm text-ink-500 mt-1">
          Primero dale un nombre, después vas a agregar los ítems con fotos
        </p>
      </div>

      {/* Banner de borrador guardado */}
      {draft && (
        <div className="flex items-start gap-3 bg-teal-50 border border-teal-200 rounded-card p-4">
          <RotateCcw size={16} className="text-teal-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-teal-800">Borrador guardado</p>
            <p className="text-xs text-teal-600 mt-0.5">
              &ldquo;{draft.title}&rdquo; · {draftDate}
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={handleRestoreDraft}
                className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-item font-semibold hover:bg-teal-700 transition-colors"
              >
                Restaurar
              </button>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="text-xs px-3 py-1.5 border border-teal-300 text-teal-700 rounded-item font-semibold hover:bg-teal-100 transition-colors"
              >
                Descartar
              </button>
            </div>
          </div>
          <button type="button" onClick={handleDiscardDraft} className="text-teal-400 hover:text-teal-600">
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-item p-3">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] border-t-[3px] border-t-brand-600 p-5 space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-semibold text-ink-700 mb-1">
            Nombre de la rendición *
          </label>
          <input
            ref={titleRef}
            id="title"
            name="title"
            type="text"
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ej: Viaje a Santiago — Mayo 2026"
            className="w-full px-3 py-2.5 border border-ink-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <p className="text-xs text-ink-400 mt-1">
            Un nombre que identifique claramente el grupo de gastos
          </p>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-semibold text-ink-700 mb-1">
            Descripción (opcional)
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            value={description}
            onChange={e => setDesc(e.target.value)}
            placeholder="Contexto adicional para quien aprueba..."
            className="w-full px-3 py-2.5 border border-ink-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={loading}
            className="flex-1 py-2.5 px-4 border border-ink-200 rounded-item text-sm font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="flex-1 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-item text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creando...' : 'Crear rendición →'}
          </button>
        </div>
      </form>

      <p className="text-center text-xs text-ink-300">
        El título y descripción se guardan automáticamente en este dispositivo
      </p>
    </div>
  )
}
