'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, HelpCircle, X } from 'lucide-react'

/**
 * Los diálogos de la app, en Tornasol.
 *
 * Reemplazan a 56 `confirm()` y `alert()` nativos. El problema de los nativos
 * no era que fallaran: era que son cajas grises del sistema operativo, sin
 * nada del diseño, y que el navegador les antepone el dominio —«mi-rendicion
 * .com dice:»—. En Android además se ven como avisos de error aunque estén
 * preguntando algo inofensivo. Varios guardaban decisiones que no se pueden
 * deshacer.
 *
 * La API devuelve una promesa a propósito. Así el sitio de llamada casi no
 * cambia de forma:
 *
 *     if (!confirm('¿Eliminar?')) return          // antes
 *     if (!await confirmar('¿Eliminar?')) return  // ahora
 *
 * Eso hizo que migrar 56 lugares fuera mecánico y no una reescritura — y 26
 * de las 28 funciones que llamaban a `confirm` ya eran `async`.
 */

type OpcionesConfirmar = {
  titulo:     string
  /** Segunda línea: la consecuencia concreta, no un relleno. */
  detalle?:   string
  /** Etiqueta del botón que acepta. Por omisión, «Confirmar». */
  aceptar?:   string
  /** `true` cuando la acción destruye algo o no se puede deshacer. */
  peligro?:   boolean
  /** Palabra que hay que escribir para habilitar el botón (p. ej. «ELIMINAR»).
   *  Para lo irreversible: un clic distraído no alcanza. */
  palabra?:   string
}

type Aviso = { id: number; mensaje: string; tono: 'info' | 'error' }

type Api = {
  confirmar: (opciones: string | OpcionesConfirmar) => Promise<boolean>
  avisar:    (mensaje: string, tono?: 'info' | 'error') => void
}

const Ctx = createContext<Api | null>(null)

export function useDialogos(): Api {
  const api = useContext(Ctx)
  if (!api) throw new Error('useDialogos necesita <ProveedorDialogos> — va en el layout autenticado.')
  return api
}

/* El aviso flotante dura lo que dice la spec; el de error, más, porque casi
   siempre trae algo que hay que leer y a veces anotar. */
const DURACION = { info: 2_600, error: 7_000 }

export function ProveedorDialogos({ children }: { children: React.ReactNode }) {
  const [pregunta, setPregunta] = useState<OpcionesConfirmar | null>(null)
  const [avisos,   setAvisos]   = useState<Aviso[]>([])
  const [escrito,  setEscrito]  = useState('')
  /* El `resolve` de la promesa en curso. En una ref y no en estado: cambiarlo
     no tiene que redibujar nada, y guardarlo en estado obligaría al truco de
     `useState(() => fn)` para que React no lo confunda con un actualizador. */
  const responder = useRef<((ok: boolean) => void) | null>(null)
  const siguienteId = useRef(0)

  const confirmar = useCallback((opciones: string | OpcionesConfirmar) => {
    setPregunta(typeof opciones === 'string' ? { titulo: opciones } : opciones)
    setEscrito('')
    return new Promise<boolean>(resolve => { responder.current = resolve })
  }, [])

  const cerrar = useCallback((ok: boolean) => {
    setPregunta(null)
    responder.current?.(ok)
    responder.current = null
  }, [])

  const avisar = useCallback((mensaje: string, tono: 'info' | 'error' = 'info') => {
    const id = siguienteId.current++
    setAvisos(a => [...a, { id, mensaje, tono }])
    setTimeout(() => setAvisos(a => a.filter(x => x.id !== id)), DURACION[tono])
  }, [])

  /* Escape cancela: es lo que hace cualquier diálogo, y lo que hacía el
     nativo. Se registra sólo mientras hay pregunta abierta. */
  useEffect(() => {
    if (!pregunta) return
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(false) }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [pregunta, cerrar])

  return (
    <Ctx.Provider value={{ confirmar, avisar }}>
      {children}

      {pregunta && (
        /* z-[60]: por encima de la hoja del menú móvil, que vive en z-50. */
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={e => { if (e.target === e.currentTarget) cerrar(false) }}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-card shadow-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-start gap-3">
              <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                pregunta.peligro ? 'bg-danger-50 text-danger-600' : 'bg-brand-50 text-brand-600'
              }`}>
                {pregunta.peligro ? <AlertTriangle size={18} /> : <HelpCircle size={18} />}
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold text-ink-800 break-words">{pregunta.titulo}</h3>
                {pregunta.detalle && (
                  <p className="text-sm text-ink-500 mt-1 break-words whitespace-pre-line">{pregunta.detalle}</p>
                )}
              </div>
            </div>

            {pregunta.palabra && (
              <label className="block space-y-1.5">
                <span className="text-sm text-ink-600">
                  Escribí <strong className="font-semibold text-ink-800">{pregunta.palabra}</strong> para confirmar
                </span>
                <input
                  value={escrito}
                  onChange={e => setEscrito(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && escrito === pregunta.palabra) cerrar(true) }}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  className="campo w-full"
                />
              </label>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => cerrar(false)} className="btn-secundario flex-1 py-2 text-sm">
                Cancelar
              </button>
              <button
                onClick={() => cerrar(true)}
                autoFocus={!pregunta.palabra}
                disabled={!!pregunta.palabra && escrito !== pregunta.palabra}
                className={`flex-1 py-2 rounded-item text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  pregunta.peligro
                    ? 'bg-danger-600 hover:bg-danger-700'
                    : 'bg-brand-600 hover:bg-brand-700'
                }`}
              >
                {pregunta.aceptar ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso flotante — píldora blanca abajo al centro, §5 de la spec. */}
      {avisos.length > 0 && (
        <div className="fixed bottom-24 md:bottom-6 inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
          {avisos.map(a => (
            <div
              key={a.id}
              role="status"
              className="pointer-events-auto max-w-md w-full sm:w-auto bg-white rounded-card shadow-xl px-4 py-3 flex items-start gap-2.5"
            >
              <span className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${
                a.tono === 'error' ? 'bg-danger-500' : 'bg-accent-400'
              }`} />
              <p className="text-sm text-ink-700 whitespace-pre-line break-words flex-1">{a.mensaje}</p>
              <button
                onClick={() => setAvisos(v => v.filter(x => x.id !== a.id))}
                className="shrink-0 text-ink-300 hover:text-ink-600 transition-colors"
                aria-label="Cerrar aviso"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  )
}
