'use client'

import { useState, useEffect, useTransition } from 'react'
import { submitSuggestion, getMySuggestions, getAllSuggestions, updateSuggestionStatus } from '@/actions/suggestions'
import { Lightbulb, Send, ChevronDown } from 'lucide-react'
import type { Suggestion } from '@/lib/supabase/types'
import { formatDate } from '@/lib/utils'

type SuggestionWithUser = Suggestion & { user_name?: string }

const CATEGORY_LABELS = {
  mejora:   'Mejora',
  error:    'Error / Bug',
  consulta: 'Consulta',
  otro:     'Otro',
}

const STATUS_LABELS = {
  pending:    { label: 'Nueva',       cls: 'bg-warning-100 text-warning-700' },
  reviewing:  { label: 'En revisión', cls: 'bg-info-100 text-info-700' },
  done:       { label: 'Aplicada',    cls: 'bg-success-100 text-success-700' },
  dismissed:  { label: 'Descartada', cls: 'bg-ink-100 text-ink-500' },
}

interface Props {
  isAdmin:        boolean
  initialItems:   SuggestionWithUser[]
  initialShowAll?: boolean
}

export function SuggestionsClient({ isAdmin, initialItems, initialShowAll = false }: Props) {
  const [content,   setContent]   = useState('')
  const [category,  setCategory]  = useState<Suggestion['category']>('mejora')
  const [items,     setItems]     = useState<SuggestionWithUser[]>(initialItems)
  const [showAll,   setShowAll]   = useState(initialShowAll)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState(false)
  const [isPending, startTransition] = useTransition()

  async function loadData() {
    setLoading(true)
    try {
      const data = isAdmin && showAll
        ? await getAllSuggestions()
        : await getMySuggestions()
      setItems(data as SuggestionWithUser[])
    } finally {
      setLoading(false)
    }
  }

  // Reload when toggling admin view
  useEffect(() => {
    loadData()
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
        await loadData()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al enviar')
      }
    })
  }

  async function handleStatusChange(id: string, status: Suggestion['status']) {
    try {
      await updateSuggestionStatus(id, status)
      await loadData()
    } catch { /* ignore */ }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display font-extrabold text-2xl tracking-tight tor-on-gradient flex items-center gap-2">
          <Lightbulb size={22} className="text-warning-500" />
          Sugerencias
        </h1>
        <p className="text-sm tor-on-gradient-soft mt-1">
          Compartí ideas, mejoras o errores que encontraste en el sistema.
        </p>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="hoja p-5 border-t-4 border-t-brand-600 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-ink-600 mb-1">Tipo</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as Suggestion['category'])}
              className="campo w-full"
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
            className="campo w-full resize-none"
          />
        </div>

        {error && <p className="text-xs text-danger-600">{error}</p>}
        {success && <p className="text-xs text-success-600">¡Sugerencia enviada! Gracias por tu aporte.</p>}

        <button
          type="submit"
          disabled={isPending || !content.trim()}
          className="btn-primario inline-flex items-center gap-2 px-5 py-2.5 text-sm"
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
            className="flex items-center gap-1.5 text-sm font-semibold tor-on-gradient hover:text-white/80 transition-colors"
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
              <div key={item.id} className="hoja p-4">
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
                        className="campo text-xs px-1.5 py-1"
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
