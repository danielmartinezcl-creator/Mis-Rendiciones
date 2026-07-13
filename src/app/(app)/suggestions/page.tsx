'use client'

import { useState, useEffect, useTransition } from 'react'
import { submitSuggestion, getMySuggestions, getAllSuggestions, updateSuggestionStatus } from '@/actions/suggestions'
import { Lightbulb, Send, ChevronDown } from 'lucide-react'
import type { Suggestion } from '@/lib/supabase/types'
import { formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

type SuggestionWithUser = Suggestion & { user_name?: string }

const CATEGORY_LABELS = {
  mejora:   'Mejora',
  error:    'Error / Bug',
  consulta: 'Consulta',
  otro:     'Otro',
}

const STATUS_LABELS = {
  pending:    { label: 'Nueva',       cls: 'bg-amber-100 text-amber-700' },
  reviewing:  { label: 'En revisión', cls: 'bg-blue-100 text-blue-700' },
  done:       { label: 'Aplicada',    cls: 'bg-emerald-100 text-emerald-700' },
  dismissed:  { label: 'Descartada', cls: 'bg-slate-100 text-slate-500' },
}

export default function SuggestionsPage() {
  const [content,   setContent]   = useState('')
  const [category,  setCategory]  = useState<Suggestion['category']>('mejora')
  const [items,     setItems]     = useState<SuggestionWithUser[]>([])
  const [showAll,   setShowAll]   = useState(false)
  const [isAdmin,   setIsAdmin]   = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState(false)
  const [isPending, startTransition] = useTransition()

  async function loadData(admin: boolean) {
    setLoading(true)
    try {
      const data = admin && showAll
        ? await getAllSuggestions()
        : await getMySuggestions()
      setItems(data as SuggestionWithUser[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      const admin = profile?.role === 'admin'
      setIsAdmin(admin)
      await loadData(admin)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loading) loadData(isAdmin)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim() || content.trim().length < 5) {
      setError('La sugerencia debe tener al menos 5 caracteres.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await submitSuggestion({ content, category })
        setContent('')
        setSuccess(true)
        setTimeout(() => setSuccess(false), 4000)
        await loadData(isAdmin)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al enviar')
      }
    })
  }

  async function handleStatusChange(id: string, status: Suggestion['status']) {
    try {
      await updateSuggestionStatus(id, status)
      await loadData(isAdmin)
    } catch { /* ignore */ }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink-900 flex items-center gap-2">
          <Lightbulb size={22} className="text-amber-500" />
          Sugerencias
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Compartí ideas, mejoras o errores que encontraste en el sistema.
        </p>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="bg-white rounded-card shadow-card p-5 border-t-4 border-t-brand-600 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-ink-600 mb-1">Tipo</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as Suggestion['category'])}
              className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
            >
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1">
            Descripción <span className="text-ink-300 font-normal">({content.length}/2000)</span>
          </label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Describí la idea o el problema con el mayor detalle posible…"
            className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
          />
        </div>

        {error && <p className="text-xs text-rose-600">{error}</p>}
        {success && <p className="text-xs text-emerald-600">¡Sugerencia enviada! Gracias por tu aporte.</p>}

        <button
          type="submit"
          disabled={isPending || !content.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors active:scale-[.97]"
        >
          <Send size={14} />
          {isPending ? 'Enviando…' : 'Enviar sugerencia'}
        </button>
      </form>

      {/* Toggle admin */}
      {isAdmin && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAll(s => !s)}
            className="flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors"
          >
            <ChevronDown size={15} className={showAll ? 'rotate-180 transition-transform' : 'transition-transform'} />
            {showAll ? 'Ver solo las mías' : 'Ver todas las sugerencias (admin)'}
          </button>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-ink-400 text-sm">
            <Lightbulb size={32} className="mx-auto mb-2 opacity-30" />
            {showAll ? 'No hay sugerencias aún en la organización.' : 'Aún no enviaste ninguna sugerencia.'}
          </div>
        ) : (
          items.map(item => {
            const st = STATUS_LABELS[item.status]
            return (
              <div key={item.id} className="bg-white rounded-card shadow-card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-xs text-ink-400">
                    <span className="font-medium text-ink-600">{CATEGORY_LABELS[item.category]}</span>
                    <span>·</span>
                    <span>{formatDate(item.created_at)}</span>
                    {item.user_name && <><span>·</span><span>{item.user_name}</span></>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>
                      {st.label}
                    </span>
                    {isAdmin && showAll && (
                      <select
                        value={item.status}
                        onChange={e => handleStatusChange(item.id, e.target.value as Suggestion['status'])}
                        className="text-xs border border-ink-200 rounded-item px-1.5 py-1 bg-white focus:outline-none"
                      >
                        <option value="pending">Nueva</option>
                        <option value="reviewing">En revisión</option>
                        <option value="done">Aplicada</option>
                        <option value="dismissed">Descartada</option>
                      </select>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-sm text-ink-700 leading-relaxed whitespace-pre-wrap">{item.content}</p>
                {item.admin_notes && (
                  <div className="mt-2 pt-2 border-t border-ink-100 text-xs text-ink-500 italic">
                    Nota admin: {item.admin_notes}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
