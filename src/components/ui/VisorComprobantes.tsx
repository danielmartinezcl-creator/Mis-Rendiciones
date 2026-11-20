'use client'

import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, X, ExternalLink, Mail } from 'lucide-react'
import type { AttachmentKind } from '@/lib/attachment-types'

/**
 * El comprobante en grande, encima de la página, con flechas para pasar al
 * siguiente. Sale del diseño B elegido por Daniel el 2026-11-20: revisar nueve
 * boletas no puede ser abrir nueve pestañas.
 *
 * Recorre los COMPROBANTES, no los gastos: un gasto con dos archivos son dos
 * paradas, y uno sin archivo no es ninguna.
 */

export interface Comprobante {
  url:       string | null
  tipo:      AttachmentKind
  nombre:    string
  gasto:     string
  detalle:   string
}

interface Props {
  comprobantes: Comprobante[]
  indice:       number | null
  onCambiar:    (i: number) => void
  onCerrar:     () => void
}

export function VisorComprobantes({ comprobantes, indice, onCambiar, onCerrar }: Props) {
  const abierto = indice !== null && comprobantes[indice] !== undefined
  const total = comprobantes.length

  // Flechas y Escape mientras está abierto; nada cuando está cerrado
  useEffect(() => {
    if (!abierto || indice === null) return
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
      if (e.key === 'ArrowLeft'  && indice! > 0)         onCambiar(indice! - 1)
      if (e.key === 'ArrowRight' && indice! < total - 1) onCambiar(indice! + 1)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [abierto, indice, total, onCambiar, onCerrar])

  if (!abierto || indice === null) return null
  const c = comprobantes[indice]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Comprobante de ${c.gasto}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6"
      onClick={onCerrar}
    >
      <div
        className="bg-white rounded-card shadow-xl w-full max-w-4xl max-h-full flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-4 py-3 border-b border-ink-100">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-ink-500">Comprobante {indice + 1} de {total}</p>
            <p className="text-sm font-semibold text-ink-800 truncate">{c.gasto}</p>
            <p className="text-xs text-ink-500 truncate">{c.detalle}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onCambiar(indice - 1)}
              disabled={indice === 0}
              aria-label="Comprobante anterior"
              className="w-11 h-11 rounded-item flex items-center justify-center text-ink-600 hover:bg-ink-100 disabled:opacity-30"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => onCambiar(indice + 1)}
              disabled={indice === total - 1}
              aria-label="Comprobante siguiente"
              className="w-11 h-11 rounded-item flex items-center justify-center text-ink-600 hover:bg-ink-100 disabled:opacity-30"
            >
              <ChevronRight size={20} />
            </button>
            <button
              onClick={onCerrar}
              aria-label="Cerrar"
              className="w-11 h-11 rounded-item flex items-center justify-center text-ink-600 hover:bg-ink-100"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-ink-50 flex items-center justify-center overflow-auto">
          {!c.url ? (
            <p className="text-sm text-ink-500 p-8 text-center">No se pudo preparar el archivo. Recarga la página para intentarlo de nuevo.</p>
          ) : c.tipo === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element -- una URL firmada de Storage, no un recurso del sitio
            <img src={c.url} alt={`Comprobante de ${c.gasto}`} className="max-w-full max-h-[70vh] object-contain" />
          ) : c.tipo === 'pdf' ? (
            <iframe src={c.url} title={`Comprobante de ${c.gasto}`} className="w-full h-[70vh] bg-white" />
          ) : (
            // Un .eml o .msg no se puede dibujar en el navegador: se descarga
            <div className="p-8 text-center space-y-2">
              <Mail size={28} className="mx-auto text-ink-400" aria-hidden />
              <p className="text-sm text-ink-600">Es un correo. Se abre con tu programa de correo.</p>
            </div>
          )}
        </div>

        {c.url && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-ink-100">
            <span className="text-xs text-ink-500 truncate">{c.nombre}</span>
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 shrink-0"
            >
              <ExternalLink size={14} aria-hidden />
              {c.tipo === 'email' ? 'Descargar' : 'Abrir en otra pestaña'}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
