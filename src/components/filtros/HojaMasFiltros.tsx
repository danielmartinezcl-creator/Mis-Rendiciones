'use client'

// Las dimensiones que no entran en la barra. En el teléfono, una hoja que sube
// desde abajo; desde `sm`, un panel anclado al botón.
//
// Cada dimensión se dibuja entera acá adentro, sin abrir otra hoja encima: una
// hoja dentro de otra deja al que la usa sin saber qué cierra cada «Cerrar».
// Lo marcado es un borrador: solo cambia el filtro al tocar «Ver N …».

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { PresetFecha } from '@/lib/filtro-documentos'
import {
  ETIQUETA_PRESET, hayValor, valorVacio, valoresVacios,
  type Dimension, type Valores,
} from '@/lib/filtros/dimensiones'

const PRESETS: PresetFecha[] = ['este-mes', 'mes-pasado', 'ultimos-3', 'este-anio', 'elegir']

interface Props {
  dimensiones: Dimension[]
  valores:     Valores
  contar:      (v: Valores) => number
  sustantivo:  [string, string]
  onAplicar:   (v: Valores) => void
  onCerrar:    () => void
}

export function HojaMasFiltros({ dimensiones, valores, contar, sustantivo, onAplicar, onCerrar }: Props) {
  const [borrador, setBorrador] = useState<Valores>(valores)

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  const n = contar(borrador)
  const puestas = dimensiones.filter(d => {
    const v = borrador[d.clave]
    return v !== undefined && hayValor(v)
  }).length

  const poner = (clave: string, v: Valores[string]) => setBorrador({ ...borrador, [clave]: v })

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50 sm:bg-transparent" onClick={onCerrar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Más filtros"
        className="hoja fixed inset-x-0 bottom-0 z-[61] max-h-[80vh] overflow-y-auto rounded-b-none p-4 pb-6
                   sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:left-auto sm:top-full sm:mt-2 sm:w-96 sm:max-h-[28rem] sm:rounded-card sm:pb-4"
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-display font-bold text-lg text-ink-900">Más filtros</h2>
          <button
            type="button" onClick={onCerrar} aria-label="Cerrar"
            className="h-11 w-11 inline-flex items-center justify-center rounded-item bg-ink-100 text-ink-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          {dimensiones.map(d => {
            const valor = borrador[d.clave] ?? valorVacio(d)
            return (
              <div key={d.clave}>
                <p className="card-meta font-semibold text-ink-500 mb-1">{d.nombre}</p>

                {/* Una sola opción: un desplegable, no casillas. «Todos» es el
                    estado sin poner y tiene que poder volverse a elegir. */}
                {d.tipo === 'unico' && valor.tipo === 'unico' && (
                  <select
                    value={valor.id ?? ''}
                    onChange={e => poner(d.clave, { tipo: 'unico', id: e.target.value || null })}
                    aria-label={d.nombre}
                    className="campo w-full"
                  >
                    <option value="">Todos</option>
                    {d.opciones.map(o => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
                  </select>
                )}

                {/* Varias: la lista con su propio alto. Sin tope, siete
                    dimensiones con veinte opciones cada una dejan la hoja
                    imposible de recorrer. */}
                {d.tipo === 'multi' && valor.tipo === 'multi' && (
                  <div className="max-h-36 overflow-y-auto rounded-item border border-ink-200 divide-y divide-ink-100 px-2">
                    {d.opciones.map(o => {
                      const marcado = valor.ids.includes(o.id)
                      return (
                        <label key={o.id} className="flex items-center gap-2.5 min-h-10 cursor-pointer">
                          <input
                            type="checkbox" checked={marcado}
                            onChange={() => poner(d.clave, {
                              tipo: 'multi',
                              ids: marcado ? valor.ids.filter(x => x !== o.id) : [...valor.ids, o.id],
                            })}
                            className="accent-brand-600 w-4 h-4 shrink-0"
                          />
                          <span className={`card-label flex-1 min-w-0 truncate ${marcado ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
                            {o.etiqueta}
                          </span>
                        </label>
                      )
                    })}
                    {d.opciones.length === 0 && <p className="card-meta text-ink-500 py-2">Sin opciones</p>}
                  </div>
                )}

                {d.tipo === 'fecha' && valor.tipo === 'fecha' && (
                  <>
                    <select
                      value={valor.preset ?? ''}
                      onChange={e => {
                        const p = (e.target.value || null) as PresetFecha | null
                        poner(d.clave, p === 'elegir'
                          ? { tipo: 'fecha', preset: p, desde: valor.desde, hasta: valor.hasta }
                          : { tipo: 'fecha', preset: p, desde: null, hasta: null })
                      }}
                      aria-label={d.nombre}
                      className="campo w-full"
                    >
                      <option value="">Cualquier fecha</option>
                      {PRESETS.map(p => <option key={p} value={p}>{ETIQUETA_PRESET[p]}</option>)}
                    </select>
                    {valor.preset === 'elegir' && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <label className="card-meta text-ink-500">
                          Desde
                          <input
                            type="date" value={valor.desde ?? ''}
                            onChange={e => poner(d.clave, { ...valor, desde: e.target.value || null })}
                            className="campo w-full mt-1"
                          />
                        </label>
                        <label className="card-meta text-ink-500">
                          Hasta
                          <input
                            type="date" value={valor.hasta ?? ''}
                            onChange={e => poner(d.clave, { ...valor, hasta: e.target.value || null })}
                            className="campo w-full mt-1"
                          />
                        </label>
                      </div>
                    )}
                  </>
                )}

                {d.tipo === 'texto' && valor.tipo === 'texto' && (
                  <input
                    type="search" value={valor.texto}
                    onChange={e => poner(d.clave, { tipo: 'texto', texto: e.target.value })}
                    placeholder={d.marcador}
                    aria-label={d.nombre}
                    className="campo w-full"
                  />
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            type="button"
            onClick={() => setBorrador({ ...borrador, ...valoresVacios(dimensiones) })}
            disabled={puestas === 0}
            className="h-12 px-4 card-label font-bold text-brand-600 disabled:text-ink-400"
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
