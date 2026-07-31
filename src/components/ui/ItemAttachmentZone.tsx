'use client'

import { useState, useRef, useTransition, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addExpenseItemAttachment, addPettyCashItemAttachment, deleteItemAttachment } from '@/actions/expenses'
import { Paperclip, Trash2, FileText, Camera, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'

interface AttachmentRow {
  id: string
  storage_path: string
  file_type: 'image' | 'pdf'
}

interface Props {
  itemId: string
  itemType: 'expense_item' | 'petty_cash_item'
  initialAttachments?: AttachmentRow[]
  canUpload?: boolean
  startExpanded?: boolean
}

const BUCKET = 'expense-attachments'

export function ItemAttachmentZone({
  itemId,
  itemType,
  initialAttachments = [],
  canUpload = true,
  startExpanded = false,
}: Props) {
  const [attachments, setAttachments] = useState<AttachmentRow[]>(initialAttachments)
  const [urls, setUrls]               = useState<Record<string, string>>({})
  const [expanded, setExpanded]       = useState(startExpanded || initialAttachments.length > 0)
  const [uploading, startUpload]      = useTransition()
  const [deletingId, setDeletingId]   = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const fileRef                       = useRef<HTMLInputElement>(null)

  // Generar signed URLs cuando cambia la lista de adjuntos
  useEffect(() => {
    if (attachments.length === 0) return
    const missing = attachments.filter(a => !urls[a.id])
    if (missing.length === 0) return
    const supabase = createClient()
    Promise.all(
      missing.map(a =>
        supabase.storage.from(BUCKET)
          .createSignedUrl(a.storage_path, 3600)
          .then(({ data }) => [a.id, data?.signedUrl ?? ''] as const)
      )
    ).then(pairs => setUrls(prev => ({ ...prev, ...Object.fromEntries(pairs) })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments])

  // Recargar lista de adjuntos desde Supabase (después de upload/delete)
  async function reload() {
    const supabase = createClient()
    const col = itemType === 'expense_item' ? 'item_id' : 'petty_cash_item_id'
    const { data } = await supabase
      .from('attachments')
      .select('id, storage_path, file_type')
      .eq(col, itemId)
      .order('created_at', { ascending: true })
    setAttachments((data ?? []) as AttachmentRow[])
    setUrls({})  // forzar regeneración de URLs
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setError('El archivo no puede superar 10 MB'); return }
    setError(null)

    startUpload(async () => {
      try {
        if (itemType === 'expense_item') {
          await addExpenseItemAttachment(itemId, file)
        } else {
          await addPettyCashItemAttachment(itemId, file)
        }
        await reload()
        if (fileRef.current) fileRef.current.value = ''
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al subir')
      }
    })
  }

  async function handleDelete(att: AttachmentRow) {
    if (!confirm('¿Eliminar este adjunto?')) return
    setDeletingId(att.id)
    try {
      await deleteItemAttachment(att.id, att.storage_path)
      setAttachments(prev => prev.filter(a => a.id !== att.id))
      setUrls(prev => { const n = { ...prev }; delete n[att.id]; return n })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeletingId(null)
    }
  }

  const count = attachments.length

  return (
    <div className="mt-1.5">
      {/* Toggle */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-ink-700 transition-colors select-none"
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Paperclip size={11} />
        {count > 0
          ? <span className="font-medium text-ink-600">{count} adjunto{count !== 1 ? 's' : ''}</span>
          : <span>Adjuntar comprobante</span>
        }
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5 pl-1">
          {/* Lista */}
          {attachments.map(att => {
            const url = urls[att.id]
            const name = att.storage_path.split('/').pop() ?? 'archivo'
            return (
              <div key={att.id} className="flex items-center gap-2 px-2 py-1.5 bg-ink-50 rounded-item border border-ink-100 group">
                <FileText size={12} className={att.file_type === 'image' ? 'text-brand-500' : 'text-ink-400'} />
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-xs text-brand-600 hover:underline truncate flex items-center gap-1"
                  >
                    {name}
                    <ExternalLink size={10} className="shrink-0 opacity-60" />
                  </a>
                ) : (
                  <span className="flex-1 text-xs text-ink-400 truncate">{name}</span>
                )}
                {canUpload && (
                  <button
                    type="button"
                    onClick={() => handleDelete(att)}
                    disabled={deletingId === att.id}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-ink-300 hover:text-rose-500 transition-all disabled:opacity-40"
                    title="Eliminar adjunto"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            )
          })}

          {/* Botón subir */}
          {canUpload && (
            <label className={[
              'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-item cursor-pointer border transition-colors active:scale-[.97]',
              uploading
                ? 'bg-ink-100 text-ink-400 border-ink-200 cursor-not-allowed'
                : 'bg-white border-brand-200 text-brand-600 hover:bg-brand-50 hover:border-brand-400',
            ].join(' ')}>
              <Camera size={11} />
              {uploading ? 'Subiendo…' : 'Subir archivo'}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                capture="environment"
                className="sr-only"
                disabled={uploading}
                onChange={handleFileChange}
              />
            </label>
          )}

          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
