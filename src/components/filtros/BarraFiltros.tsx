'use client'

// La barra de chips del filtro (diseño A del empleado, 2026-10-07; «Más
// filtros» del diseño B del admin, 2026-10-08).
//
// No sabe de rendiciones, de fondos ni de ítems: recibe qué dimensiones hay y
// devuelve los `Valores` elegidos. Qué pasa el filtro lo decide cada pantalla.
//
// Va sobre hoja blanca, nunca sobre el degradado (regla de Tornasol).

import { useState } from 'react'
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import {
  etiquetaDe, hayValor, ocultasPuestas, quitar, valorVacio, valoresVacios,
  type Dimension, type Valores,
} from '@/lib/filtros/dimensiones'
import { HojaOpciones } from './HojaOpciones'
import { HojaMasFiltros } from './HojaMasFiltros'

interface Props {
  dimensiones: Dimension[]
  valores:     Valores
  onCambio:    (v: Valores) => void
  /** Cuántas cosas quedarían con estos valores: el número del botón de la hoja */
  contar:      (v: Valores) => number
  sustantivo:  [singular: string, plural: string]
  /**
   * La línea bajo los chips; null cuando no hay filtro puesto.
   *
   * La arma cada pantalla y NO la calcula esta barra: la del empleado no nombra
   * lo puesto, dice cuánto queda y cuánta plata («3 de 12 · $ 97.300 en
   * Combustible»). Para nombrar lo puesto está `resumen()` de `dimensiones.ts`.
   */
  resumen:     string | null
}

export function BarraFiltros({ dimensiones, valores, onCambio, contar, sustantivo, resumen }: Props) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const [masAbierto, setMasAbierto] = useState(false)

  const textos  = dimensiones.filter(d => d.tipo === 'texto')
  const chips   = dimensiones.filter(d => d.destacada && d.tipo !== 'texto')
  const ocultas = dimensiones.filter(d => !d.destacada)
  const ocultasConValor = ocultasPuestas(dimensiones, valores)

  return (
    <div className="hoja">
      {/* El envoltorio NO tiene scroll: el desvanecido se ancla a su borde
          derecho. Puesto dentro del que sí scrollea, se anclaría al final del
          contenido —después del último chip— y no se vería nunca. */}
      <div className="relative">
        {/* En el teléfono la fila se desliza; desde `sm` cabe, y el menú del
            chip necesita que nada lo recorte. */}
        <div className="flex gap-2 px-4 py-3 overflow-x-auto sm:overflow-visible sm:flex-wrap">

        {/* El buscador no es un chip: va primero y queda siempre a la vista */}
        {textos.map(d => {
          const v = valores[d.clave]
          const texto = v !== undefined && v.tipo === 'texto' ? v.texto : ''
          return (
            <label key={d.clave} className="relative shrink-0 w-56">
              <span className="sr-only">{d.nombre}</span>
              <Search size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="search"
                value={texto}
                onChange={e => onCambio({ ...valores, [d.clave]: { tipo: 'texto', texto: e.target.value } })}
                placeholder={d.tipo === 'texto' ? d.marcador : ''}
                className="h-10 w-full rounded-full border border-ink-200 bg-white pl-9 pr-3 text-sm text-ink-800"
              />
            </label>
          )
        })}

        {chips.map(d => {
          const valor  = valores[d.clave] ?? valorVacio(d)
          const activo = hayValor(valor)
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
                  <span className="truncate">{etiquetaDe(d, valor)}</span>
                  {!activo && <ChevronDown size={15} className="shrink-0" aria-hidden="true" />}
                </button>
                {activo && (
                  <button
                    type="button"
                    onClick={() => onCambio(quitar(dimensiones, valores, d.clave))}
                    aria-label={`Quitar filtro ${d.nombre}`}
                    className="h-10 w-9 inline-flex items-center justify-center"
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
              {abierta === d.clave && (
                <HojaOpciones
                  dimension={d} valores={valores} contar={contar} sustantivo={sustantivo}
                  onAplicar={v => { onCambio(v); setAbierta(null) }}
                  onCerrar={() => setAbierta(null)}
                />
              )}
            </div>
          )
        })}

        {/* Las que no entran en la barra. El número es lo que impide que esconda
            algo de verdad: sin él, un filtro puesto ahí adentro cambia la lista
            sin que nada lo anuncie. Con cuatro o cinco dimensiones —el caso del
            empleado— este botón no existe. */}
        {ocultas.length > 0 && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMasAbierto(true)}
              aria-expanded={masAbierto}
              aria-label={ocultasConValor === 0
                ? 'Más filtros'
                : `Más filtros, ${ocultasConValor} ${ocultasConValor === 1 ? 'puesto' : 'puestos'}`}
              className="inline-flex items-center gap-2 h-10 px-3.5 rounded-full border border-brand-600 bg-white text-sm font-semibold text-brand-600 whitespace-nowrap"
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              <span>Más filtros</span>
              {ocultasConValor > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-brand-600 text-white card-meta font-bold">
                  {ocultasConValor}
                </span>
              )}
            </button>
            {masAbierto && (
              <HojaMasFiltros
                dimensiones={ocultas} valores={valores} contar={contar} sustantivo={sustantivo}
                onAplicar={v => { onCambio(v); setMasAbierto(false) }}
                onCerrar={() => setMasAbierto(false)}
              />
            )}
          </div>
        )}
        </div>
        {/* «Hay más, deslizá». Va a la altura de los chips (top-3, h-10) y no de
            lado a lado: cubriendo el alto completo taparía la esquina redondeada
            de la hoja con un cuadrado blanco. Desde `sm` la fila envuelve y no
            hay nada que anunciar. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-3 h-10 w-10 bg-gradient-to-l from-white to-transparent sm:hidden"
        />
      </div>

      {/* Plegar o recargar nunca esconde que hay un filtro puesto */}
      {resumen && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-ink-100 bg-brand-50/60 rounded-b-card">
          <span className="card-meta text-ink-600 min-w-0">{resumen}</span>
          <button
            type="button"
            onClick={() => onCambio(valoresVacios(dimensiones))}
            className="card-meta font-bold text-brand-600 shrink-0"
          >
            Limpiar
          </button>
        </div>
      )}
    </div>
  )
}
