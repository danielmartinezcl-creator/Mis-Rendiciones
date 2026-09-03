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
        <h1 className="text-xl font-bold tor-on-gradient">Nueva rendición</h1>
        <p className="text-sm tor-on-gradient-soft mt-1">
          Primero dale un nombre, después vas a agregar los ítems con fotos
        </p>
      </div>

      {/* Banner de borrador guardado */}
      {draft && (
        <div className="flex items-start gap-3 bg-accent-50 border border-accent-200 rounded-card p-4">
          <RotateCcw size={16} className="text-accent-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="card-eyebrow text-accent-800">Borrador guardado</p>
            <p className="card-meta text-accent-600 mt-0.5">
              &ldquo;{draft.title}&rdquo; · {draftDate}
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={handleRestoreDraft}
                className="card-meta px-3 py-2 bg-accent-600 text-white rounded-item font-semibold hover:bg-accent-700 transition-colors"
              >
                Restaurar
              </button>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="card-meta px-3 py-2 border border-accent-300 text-accent-700 rounded-item font-semibold hover:bg-accent-100 transition-colors"
              >
                Descartar
              </button>
            </div>
          </div>
          <button type="button" onClick={handleDiscardDraft} className="text-accent-400 hover:text-accent-600">
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className="bg-danger-50 border border-danger-200 text-danger-700 card-label rounded-item p-3">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] border-t-[3px] border-t-brand-600 p-5 space-y-4">
        <div>
          <label htmlFor="title" className="block card-label font-semibold text-ink-700 mb-1">
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
            // autoCapitalize="sentences": el teclado del celular arranca en
            // mayúscula. Ataca el problema en el origen, en vez de corregir
            // después con formatDisplayTitle.
            autoCapitalize="sentences"
            className="campo w-full py-2.5 text-[16px]"
          />
          <p className="card-meta text-ink-400 mt-1">
            Escribilo como una frase normal — evitá las mayúsculas completas
          </p>
        </div>

        <div>
          <label htmlFor="description" className="block card-label font-semibold text-ink-700 mb-1">
            Descripción (opcional)
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            value={description}
            onChange={e => setDesc(e.target.value)}
            placeholder="Contexto adicional para quien aprueba..."
            className="campo w-full py-2.5 text-[16px] resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={loading}
            className="flex-1 py-3 px-4 border border-ink-200 rounded-item card-label font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="btn-primario flex-1 py-3 px-4 card-label"
          >
            {loading ? 'Creando...' : 'Crear rendición →'}
          </button>
        </div>
      </form>

      <p className="text-center card-meta text-ink-300">
        El título y descripción se guardan automáticamente en este dispositivo
      </p>
    </div>
  )
}
