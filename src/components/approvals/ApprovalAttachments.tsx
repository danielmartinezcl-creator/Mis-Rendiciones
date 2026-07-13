'use client'

import { useState, useRef, useTransition } from 'react'
import { uploadApprovalAttachment, deleteApprovalAttachment } from '@/actions/approval-attachments'
import { Paperclip, Trash2, ExternalLink, Upload } from 'lucide-react'
import type { ApprovalAttachment } from '@/lib/supabase/types'
import { formatDate } from '@/lib/utils'

type AttachmentWithMeta = ApprovalAttachment & {
  uploader_name: string
  url: string | null
}

interface Props {
  attachments: AttachmentWithMeta[]
  target: { reportId?: string; fundId?: string }
  onRefresh: () => void
}

function formatBytes(n: number | null) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function ApprovalAttachments({ attachments, target, onRefresh }: Props) {
  const [description, setDescription] = useState('')
  const [uploading, startUpload] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('description', description)
    if (target.reportId) fd.append('report_id', target.reportId)
    if (target.fundId)   fd.append('fund_id', target.fundId)

    startUpload(async () => {
      try {
        await uploadApprovalAttachment(fd)
        setDescription('')
        if (fileRef.current) fileRef.current.value = ''
        onRefresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al subir')
      }
    })
  }

  async function handleDelete(id: string, storagePath: string) {
    if (!confirm('¿Eliminar este adjunto?')) return
    setDeleting(id)
    try {
      await deleteApprovalAttachment(id, storagePath)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-ink-600 uppercase tracking-wide flex items-center gap-2">
        <Paperclip size={13} />
        Adjuntos de respaldo ({attachments.length})
      </p>

      {/* Lista de adjuntos existentes */}
      {attachments.map(att => (
        <div key={att.id} className="flex items-center gap-3 p-3 bg-ink-50 rounded-item border border-ink-100">
          <Paperclip size={14} className="text-ink-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink-800 truncate">{att.filename}</p>
            <p className="text-xs text-ink-400">
              {att.description && <span className="text-ink-600">{att.description} · </span>}
              {formatBytes(att.file_size)} · {att.uploader_name} · {formatDate(att.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {att.url && (
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-item transition-colors"
                title="Abrir"
              >
                <ExternalLink size={14} />
              </a>
            )}
            <button
              onClick={() => handleDelete(att.id, att.storage_path)}
              disabled={deleting === att.id}
              className="p-1.5 text-ink-400 hover:text-rose-600 hover:bg-rose-50 rounded-item transition-colors disabled:opacity-40"
              title="Eliminar"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}

      {/* Upload */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Descripción del adjunto (ej: Email de autorización)"
          className="flex-1 border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
        <label className={[
          'inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-item cursor-pointer transition-colors active:scale-[.97]',
          uploading
            ? 'bg-ink-300 text-white cursor-not-allowed'
            : 'bg-white border border-brand-600 text-brand-600 hover:bg-brand-50',
        ].join(' ')}>
          <Upload size={14} />
          {uploading ? 'Subiendo…' : 'Adjuntar archivo'}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.eml,.msg"
            className="sr-only"
            disabled={uploading}
            onChange={handleUpload}
          />
        </label>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}
      <p className="text-xs text-ink-400">
        Formatos aceptados: PDF, imágenes, correos (.eml, .msg) · Máx. 10 MB
      </p>
    </div>
  )
}
