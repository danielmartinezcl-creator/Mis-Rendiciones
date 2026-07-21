'use client'

import { useState, useRef } from 'react'
import { runOcr } from '@/actions/ocr'
import type { OcrResult } from '@/lib/ocr-helpers'

interface PhotoUploadProps {
  onOcrResult: (result: OcrResult | null, file: File) => void
  disabled?: boolean
}

// Redimensiona imágenes grandes a max 1200px de ancho antes de enviar al servidor.
// Esto evita el límite de payload de Server Actions y reduce el costo OCR.
// PDFs se pasan sin modificar (Canvas no puede procesarlos).
async function resizeIfNeeded(file: File): Promise<{ base64: string; mimeType: string }> {
  if (file.type === 'application/pdf') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = ev => {
        const dataUrl = ev.target?.result as string
        resolve({ base64: dataUrl.split(',')[1], mimeType: 'application/pdf' })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX_W = 1200
      const scale = img.width > MAX_W ? MAX_W / img.width : 1
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
      resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' })
    }

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo cargar la imagen')) }
    img.src = url
  })
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

    if (file.size > 20 * 1024 * 1024) {
      alert('El archivo no puede superar 20 MB')
      return
    }

    setStatus('reading')

    try {
      const { base64, mimeType } = await resizeIfNeeded(file)

      setStatus('processing')

      try {
        const result = await runOcr(base64, mimeType)
        setStatus('done')
        onOcrResult(result, file)
      } catch {
        setStatus('error')
        onOcrResult(null, file)
      }
    } catch {
      setStatus('error')
      onOcrResult(null, file)
    }
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
        className="w-full border-2 border-dashed border-brand-200 hover:border-brand-500 rounded-card p-6 text-center transition-colors disabled:opacity-50"
      >
        <div className="flex flex-col items-center gap-2">
          {isLoading ? (
            <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-3xl">📷</span>
          )}
          <span className="text-sm font-semibold text-brand-600">
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
