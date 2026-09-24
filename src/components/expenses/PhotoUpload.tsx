'use client'

import { useState, useRef } from 'react'
import { Camera, FileUp } from 'lucide-react'
import { runOcr } from '@/actions/ocr'
import type { OcrResult } from '@/lib/ocr-helpers'
import { ACCEPT_ATTACHMENTS, MAX_ATTACHMENT_BYTES, classifyAttachment } from '@/lib/attachment-types'
import { useDialogos } from '@/components/ui/Dialogos'

interface PhotoUploadProps {
  onOcrResult: (result: OcrResult | null, file: File) => void
  disabled?: boolean
}

// Redimensiona imágenes grandes a max 1200px de ancho antes de enviar al servidor.
// Esto evita el límite de payload de Server Actions y reduce el costo OCR.
// PDFs se pasan sin modificar (Canvas no puede procesarlos).
async function resizeIfNeeded(file: File): Promise<{ base64: string; mimeType: string }> {
  if (classifyAttachment(file.name)?.kind === 'pdf') {
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
  const { avisar } = useDialogos()
  const [status, setStatus] = useState<'idle' | 'reading' | 'processing' | 'done' | 'attached' | 'error'>('idle')
  // Dos entradas: `capture` abre la cámara directo, y en el celular eso impide
  // elegir un PDF o un correo guardado. Por eso el archivo tiene la suya, sin capture.
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef   = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const tipo = classifyAttachment(file.name)
    if (!tipo) {
      avisar('Solo se aceptan fotos (JPG, PNG, WebP), PDF o correos (.eml / .msg)')
      return
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      avisar('El archivo no puede superar 10 MB')
      return
    }

    // Un correo es respaldo de la autorización, no un comprobante con monto:
    // se adjunta tal cual y los datos del gasto se llenan a mano.
    if (tipo.kind === 'email') {
      setStatus('attached')
      onOcrResult(null, file)
      return
    }

    setStatus('reading')

    try {
      const { base64, mimeType } = await resizeIfNeeded(file)

      setStatus('processing')

      try {
        const result = await runOcr(base64, mimeType)
        // runOcr devuelve null cuando la IA falla: marcarlo «procesado ✓» escondió
        // durante meses que ningún PDF se estaba leyendo
        setStatus(result ? 'done' : 'error')
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
    idle:       'Foto o archivo del comprobante',
    reading:    'Leyendo archivo...',
    processing: 'Extrayendo datos con IA...',
    done:       'Comprobante procesado ✓',
    attached:   'Correo adjuntado ✓',
    error:      'Archivo adjuntado — llenar manualmente',
  }

  const metas = {
    idle:       'Foto · PDF · correo (.eml / .msg) — máx 10 MB',
    reading:    '',
    processing: '',
    done:       'Datos pre-cargados — revisá y confirmá',
    attached:   'Completá los datos del gasto a mano',
    error:      'La IA no pudo leer los datos — el archivo igual queda adjunto',
  }

  const isLoading = status === 'processing' || status === 'reading'
  const bloqueado = disabled || isLoading

  return (
    <div className="border-2 border-dashed border-brand-200 rounded-card p-5 text-center space-y-3">
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        disabled={bloqueado}
      />
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTACHMENTS}
        className="hidden"
        onChange={handleFileChange}
        disabled={bloqueado}
      />

      <div className="flex flex-col items-center gap-1">
        {isLoading && (
          <div className="w-7 h-7 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        )}
        <span className="card-label font-semibold text-brand-600">{labels[status]}</span>
        {metas[status] && <span className="card-meta text-ink-400">{metas[status]}</span>}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={bloqueado}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-item border border-brand-200 bg-white text-brand-600 hover:bg-brand-50 hover:border-brand-400 transition-colors disabled:opacity-50"
        >
          <Camera size={16} />
          Tomar foto
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={bloqueado}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-item border border-brand-200 bg-white text-brand-600 hover:bg-brand-50 hover:border-brand-400 transition-colors disabled:opacity-50"
        >
          <FileUp size={16} />
          Subir archivo
        </button>
      </div>
    </div>
  )
}
