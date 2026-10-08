'use client'

// Las opciones de un chip. En el teléfono, una hoja que sube desde abajo;
// desde `sm`, un menú anclado bajo el chip. Lo marcado es un borrador: solo
// cambia el filtro al tocar «Ver N …»; cerrar lo descarta.
//
// No sabe qué se está filtrando: recibe una `Dimension` y un juego de
// `Valores`. Lo que pasa el filtro lo decide cada pantalla.

import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { PresetFecha } from '@/lib/filtro-documentos'
import {
  ETIQUETA_PRESET, valorVacio,
  type Dimension, type Valores,
} from '@/lib/filtros/dimensiones'

const PRESETS: PresetFecha[] = ['este-mes', 'mes-pasado', 'ultimos-3', 'este-anio', 'elegir']

/** Con pocas opciones un buscador estorba más de lo que ayuda. */
const DESDE_CUANTAS_BUSCADOR = 6

interface Props {
  dimension:  Dimension
  valores:    Valores
  contar:     (v: Valores) => number
  sustantivo: [string, string]
  onAplicar:  (v: Valores) => void
  onCerrar:   () => void
}

export function HojaOpciones({ dimension, valores, contar, sustantivo, onAplicar, onCerrar }: Props) {
  const { clave } = dimension
  const [borrador, setBorrador] = useState<Valores>(valores)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  /* La lista sale de adentro del useMemo y no de una variable derivada: una
     expresión condicional afuera arma un array nuevo en cada render y la
     dependencia nunca es la misma. */
  const visibles = useMemo(() => {
    const opciones = dimension.tipo === 'multi' || dimension.tipo === 'unico' ? dimension.opciones : []
    const q = busqueda.trim().toLowerCase()
    return q ? opciones.filter(o => o.etiqueta.toLowerCase().includes(q)) : opciones
  }, [dimension, busqueda])

  const conBuscador =
    (dimension.tipo === 'multi' || dimension.tipo === 'unico')
    && !!dimension.buscador
    && dimension.opciones.length > DESDE_CUANTAS_BUSCADOR

  const n = contar(borrador)
  const valor = borrador[clave] ?? valorVacio(dimension)

  function alternar(id: string) {
    if (valor.tipo !== 'multi') return
    const nuevo = valor.ids.includes(id) ? valor.ids.filter(x => x !== id) : [...valor.ids, id]
    setBorrador({ ...borrador, [clave]: { tipo: 'multi', ids: nuevo } })
  }

  return (
    <>
      {/* Velo: oscuro en el teléfono; transparente en escritorio, donde solo sirve para cerrar al tocar afuera */}
      <div className="fixed inset-0 z-[60] bg-black/50 sm:bg-transparent" onClick={onCerrar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dimension.nombre}
        className="hoja fixed inset-x-0 bottom-0 z-[61] max-h-[80vh] overflow-y-auto rounded-b-none p-4 pb-6
                   sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:w-80 sm:max-h-96 sm:rounded-card sm:pb-4"
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="font-display font-bold text-lg text-ink-900">{dimension.nombre}</h2>
          <button
            type="button" onClick={onCerrar} aria-label="Cerrar"
            className="h-11 w-11 inline-flex items-center justify-center rounded-item bg-ink-100 text-ink-600"
          >
            <X size={18} />
          </button>
        </div>

        {conBuscador && (
          <label className="campo flex items-center gap-2 mb-2">
            <Search size={16} className="text-ink-400 shrink-0" />
            <input
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder={
                (dimension.tipo === 'multi' || dimension.tipo === 'unico')
                  ? dimension.marcadorBusqueda ?? 'Buscar…'
                  : 'Buscar…'
              }
              className="w-full bg-transparent outline-none"
            />
          </label>
        )}

        {valor.tipo === 'fecha' ? (
          <div className="divide-y divide-ink-100">
            {PRESETS.map(p => (
              <label key={p} className="flex items-center gap-3 min-h-12 card-label text-ink-800 cursor-pointer">
                <input
                  type="radio" name="fecha" checked={valor.preset === p}
                  onChange={() => setBorrador({
                    ...borrador,
                    [clave]: p === 'elegir'
                      ? { tipo: 'fecha', preset: p, desde: valor.desde, hasta: valor.hasta }
                      : { tipo: 'fecha', preset: p, desde: null, hasta: null },
                  })}
                  className="accent-brand-600 w-5 h-5 shrink-0"
                />
                {ETIQUETA_PRESET[p]}
              </label>
            ))}
            {valor.preset === 'elegir' && (
              <div className="grid grid-cols-2 gap-3 pt-3">
                <label className="card-meta text-ink-500">
                  Desde
                  <input
                    type="date" value={valor.desde ?? ''}
                    onChange={e => setBorrador({
                      ...borrador, [clave]: { ...valor, desde: e.target.value || null },
                    })}
                    className="campo w-full mt-1"
                  />
                </label>
                <label className="card-meta text-ink-500">
                  Hasta
                  <input
                    type="date" value={valor.hasta ?? ''}
                    onChange={e => setBorrador({
                      ...borrador, [clave]: { ...valor, hasta: e.target.value || null },
                    })}
                    className="campo w-full mt-1"
                  />
                </label>
              </div>
            )}
          </div>
        ) : valor.tipo === 'unico' ? (
          /* Una sola opción a la vez: no hay nada que combinar en «Reembolso» o
             «Contabilización», y una casilla marcada invitaría a marcar dos. */
          <div className="divide-y divide-ink-100">
            {visibles.map(o => (
              <label key={o.id} className="flex items-center gap-3 min-h-12 cursor-pointer">
                <input
                  type="radio" name={clave} checked={valor.id === o.id}
                  onChange={() => setBorrador({ ...borrador, [clave]: { tipo: 'unico', id: o.id } })}
                  className="accent-brand-600 w-5 h-5 shrink-0"
                />
                <span className={`card-label flex-1 min-w-0 ${valor.id === o.id ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
                  {o.etiqueta}
                </span>
                {o.detalle && <span className="card-meta text-ink-400 shrink-0">{o.detalle}</span>}
              </label>
            ))}
            {visibles.length === 0 && <p className="card-meta text-ink-400 py-3">Sin resultados</p>}
          </div>
        ) : valor.tipo === 'multi' ? (
          <div className="divide-y divide-ink-100">
            {visibles.map(o => {
              const marcado = valor.ids.includes(o.id)
              return (
                <label key={o.id} className="flex items-center gap-3 min-h-12 cursor-pointer">
                  <input
                    type="checkbox" checked={marcado} onChange={() => alternar(o.id)}
                    className="accent-brand-600 w-5 h-5 shrink-0"
                  />
                  <span className={`card-label flex-1 min-w-0 ${marcado ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
                    {o.etiqueta}
                  </span>
                  {o.detalle && <span className="card-meta text-ink-400 shrink-0">{o.detalle}</span>}
                </label>
              )
            })}
            {visibles.length === 0 && <p className="card-meta text-ink-400 py-3">Sin resultados</p>}
          </div>
        ) : null}

        <div className="flex items-center gap-2 mt-4">
          <button
            type="button"
            onClick={() => setBorrador({ ...borrador, [clave]: valorVacio(dimension) })}
            className="h-12 px-4 card-label font-bold text-brand-600"
          >
            Limpiar
          </button>
          <button type="button" onClick={() => onAplicar(borrador)} className="btn-primario flex-1 h-12">
            Ver {n} {n === 1 ? sustantivo[0] : sustantivo[1]}
          </button>
        </div>
      </div>
    </>
  )
}
