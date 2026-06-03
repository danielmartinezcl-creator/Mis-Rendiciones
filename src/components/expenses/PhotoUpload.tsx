'use client'

import { useState, useRef } from 'react'
import { runOcr } from '@/actions/ocr'
import type { OcrResult } from '@/lib/ocr-helpers'

interface PhotoUploadProps {
  onOcrResult: (result: OcrResult | null, file: File) => void
  disabled?: boolean
}

export function PhotoUpload({ onOcrResult, disabled }: PhotoUploadProps) {
  const [status, setStatus] = useState<'idle' | 'reading' | 'processing' | 'done' | 'error'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) {
      alert('Solo se aceptan imágenes JPG, PNG, WebP o PDF')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('El archivo no puede superar 10 MB')
      return
    }

    setStatus('reading')

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      const base64 = dataUrl.split(',')[1]
      const mimeType = file.type

      setStatus('processing')

      try {
        const result = await runOcr(base64, mimeType)
        setStatus('done')
        onOcrResult(result, file)
      } catch {
        setStatus('error')
        onOcrResult(null, file)
      }
    }
    reader.readAsDataURL(file)
  }

  const labels = {
    idle:       'Tomá la foto y listo',
    reading:    'Leyendo imagen...',
    processing: 'Extrayendo datos con IA...',
    done:       'Foto procesada ✓',
    error:      'Error — llenar manualmente',
  }

  const isLoading = status === 'processing' || status === 'reading'

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || isLoading}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || isLoading}
        className="w-full border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-[12px] p-6 text-center transition-colors disabled:opacity-50"
      >
        <div className="flex flex-col items-center gap-2">
          {isLoading ? (
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-3xl">📷</span>
          )}
          <span className="text-sm font-semibold text-indigo-600">
            {labels[status]}
          </span>
          {status === 'idle' && (
            <span className="text-xs text-slate-400">
              JPG · PNG · WebP · PDF — máx 10 MB
            </span>
          )}
          {status === 'done' && (
            <span className="text-xs text-slate-400">
              Datos pre-cargados — revisá y confirmá
            </span>
          )}
          {status === 'error' && (
            <span className="text-xs text-slate-400">
              La IA no pudo leer el documento — completá los campos manualmente
            </span>
          )}
        </div>
      </button>
    </div>
  )
}
