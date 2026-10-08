'use client'

// La barra de chips del filtro del empleado (diseño A, elegido por Daniel el
// 2026-10-07). No sabe de rendiciones ni de fondos: recibe qué chips mostrar y
// con qué opciones, y devuelve un Filtro. Qué documento entra lo decide
// src/lib/filtro-documentos.ts; acá solo se elige.
//
// Va sobre hoja blanca, nunca sobre el degradado (regla de Tornasol).

import { useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { FILTRO_VACIO, type Filtro } from '@/lib/filtro-documentos'
import {
  chipActivo, etiquetaDeChip, nombreDeChip, quitarChip, type ClaveChip, type Opcion,
} from '@/lib/filtro-etiquetas'
import { HojaOpciones } from './HojaOpciones'

export interface Dimension {
  clave:    ClaveChip
  opciones: (Opcion & { detalle?: string })[]
}

interface Props {
  filtro:      Filtro
  onCambio:    (f: Filtro) => void
  dimensiones: Dimension[]
  /** Cuántos documentos quedarían con este filtro: el número del botón de la hoja */
  contar:      (f: Filtro) => number
  sustantivo:  [singular: string, plural: string]
  /** La línea bajo los chips; null cuando no hay filtro puesto */
  resumen:     string | null
}

export function BarraFiltros({ filtro, onCambio, dimensiones, contar, sustantivo, resumen }: Props) {
  const [abierta, setAbierta] = useState<ClaveChip | null>(null)

  return (
    <div className="hoja">
      {/* En el teléfono la fila se desliza; desde `sm` cabe, y el menú del
          chip necesita que nada lo recorte. */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto sm:overflow-visible sm:flex-wrap">
        {dimensiones.map(d => {
          const activo = chipActivo(d.clave, filtro)
          return (
            <div key={d.clave} className="relative shrink-0">
              <div
                className={`inline-flex items-center h-10 rounded-full border text-sm font-semibold whitespace-nowrap ${
                  activo ? 'border-transparent text-white' : 'border-ink-200 bg-white text-ink-700'
                }`}
                style={activo ? { background: 'var(--cta-brand)' } : undefined}
              >
                <button
                  type="button"
                  onClick={() => setAbierta(d.clave)}
                  aria-expanded={abierta === d.clave}
                  className={`inline-flex items-center gap-1.5 h-10 max-w-[13rem] ${activo ? 'pl-3.5 pr-1' : 'px-3.5'}`}
                >
                  <span className="truncate">{etiquetaDeChip(d.clave, filtro, d.opciones)}</span>
                  {!activo && <ChevronDown size={15} className="shrink-0" aria-hidden="true" />}
                </button>
                {activo && (
                  <button
                    type="button"
                    onClick={() => onCambio(quitarChip(d.clave, filtro))}
                    aria-label={`Quitar filtro ${nombreDeChip(d.clave)}`}
                    className="h-10 w-9 inline-flex items-center justify-center"
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
              {abierta === d.clave && (
                <HojaOpciones
                  dimension={d} filtro={filtro} contar={contar} sustantivo={sustantivo}
                  onAplicar={f => { onCambio(f); setAbierta(null) }}
                  onCerrar={() => setAbierta(null)}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Plegar o recargar nunca esconde que hay un filtro puesto */}
      {resumen && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-ink-100 bg-brand-50/60 rounded-b-card">
          <span className="card-meta text-ink-600 min-w-0">{resumen}</span>
          <button type="button" onClick={() => onCambio(FILTRO_VACIO)} className="card-meta font-bold text-brand-600 shrink-0">
            Limpiar
          </button>
        </div>
      )}
    </div>
  )
}
