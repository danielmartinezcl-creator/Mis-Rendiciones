'use client'

// Las vistas guardadas: las combinaciones que se repiten, como pestañas.
//
// Van **sobre el degradado** y no sobre hoja blanca: son navegación entre
// listas, no datos que se lean o se comparen (regla de materiales de Tornasol).
//
// Son de la ORGANIZACIÓN: un solo juego para todos los admins. Guardar ENCIMA
// de una vista nunca es lo que pasa por omisión —tocar un chip no la cambia—,
// porque una vista de la empresa no se modifica porque alguien estaba
// revisando.

import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { coincideConVista, erroresDeNombre, LARGO_NOMBRE, type Vista } from '@/lib/filtros/vistas'
import { clavesPuestas, valoresVacios, type Dimension, type Valores } from '@/lib/filtros/dimensiones'
import { useDialogos } from '@/components/ui/Dialogos'

interface Props {
  vistas:      Vista[]
  dimensiones: Dimension[]
  valores:     Valores
  onElegir:    (v: Valores) => void
  /** Cuántas filas trae un juego de valores: el número de cada pestaña. */
  contar:      (v: Valores) => number
  /** Devuelve los errores; vacío si guardó. Solo se llama si `puedeEditar`. */
  onGuardar:   (nombre: string, valores: Valores) => Promise<string[]>
  onBorrar:    (id: string) => Promise<string | null>
  /** Solo el admin crea y borra vistas. */
  puedeEditar: boolean
}

export function Vistas({
  vistas, dimensiones, valores, onElegir, contar, onGuardar, onBorrar, puedeEditar,
}: Props) {
  const { confirmar, avisar } = useDialogos()
  /* Sobre qué vista se estaba parado cuando se tocó un chip. Sin esto,
     «Descartar» no sabe a dónde volver. */
  const [baseId, setBaseId]   = useState<string | null>(null)
  const [nombrando, setNombrando] = useState(false)
  const [nombre, setNombre]   = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])

  const vacios  = valoresVacios(dimensiones)
  const activa  = vistas.find(v => coincideConVista(valores, v.filtro, dimensiones)) ?? null
  const limpio  = clavesPuestas(dimensiones, valores).length === 0
  const base    = vistas.find(v => v.id === baseId) ?? null
  // Ni es una vista ni es «Todas»: el filtro quedó a medio camino.
  const cambiada = !activa && !limpio

  function elegir(v: Vista | null) {
    setBaseId(v?.id ?? null)
    setNombrando(false)
    setErrores([])
    onElegir(v ? v.filtro : vacios)
  }

  async function guardar() {
    const errs = erroresDeNombre(nombre, vistas.map(v => v.nombre))
    if (errs.length) { setErrores(errs); return }
    setGuardando(true)
    try {
      const delServidor = await onGuardar(nombre.trim(), valores)
      if (delServidor.length) { setErrores(delServidor); return }
      setNombrando(false)
      setNombre('')
      setErrores([])
      avisar(`Vista «${nombre.trim()}» guardada`)
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(v: Vista) {
    const ok = await confirmar({
      titulo:  `Borrar la vista «${v.nombre}»`,
      detalle: 'Es una vista de la empresa: deja de verla todo el mundo. Lo que filtra no se toca.',
      aceptar: 'Borrar',
      peligro: true,
    })
    if (!ok) return
    const error = await onBorrar(v.id)
    if (error) { avisar(error, 'error'); return }
    if (baseId === v.id) setBaseId(null)
    avisar(`Vista «${v.nombre}» borrada`)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Pestana activa={limpio && !activa} onClick={() => elegir(null)}
                 nombre="Todas" cuenta={contar(vacios)} />

        {vistas.map(v => (
          <Pestana
            key={v.id}
            activa={activa?.id === v.id}
            onClick={() => elegir(v)}
            nombre={v.nombre}
            cuenta={contar(v.filtro)}
            onBorrar={puedeEditar && activa?.id === v.id ? () => borrar(v) : undefined}
          />
        ))}

        {puedeEditar && !nombrando && cambiada && (
          <button
            type="button"
            onClick={() => { setNombrando(true); setNombre('') }}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-dashed border-white/50 bg-transparent text-sm font-semibold text-white/90"
          >
            <Plus size={15} aria-hidden="true" />
            Guardar como vista
          </button>
        )}
      </div>

      {/* Tocar un chip NO cambia la vista: lo dice y ofrece las dos salidas */}
      {cambiada && !nombrando && (
        <p className="card-meta tor-on-gradient-soft">
          {base
            ? <>Cambiaste el filtro sobre la vista <strong className="font-semibold">{base.nombre}</strong>.</>
            : <>Tenés un filtro puesto que no es ninguna vista guardada.</>}
          {' '}
          <button type="button" onClick={() => elegir(base)}
                  className="underline font-semibold">
            Descartar
          </button>
        </p>
      )}

      {nombrando && (
        <div className="hoja p-3 flex flex-wrap items-start gap-2">
          <label className="flex-1 min-w-[12rem]">
            <span className="sr-only">Nombre de la vista</span>
            <input
              value={nombre}
              onChange={e => { setNombre(e.target.value); setErrores([]) }}
              maxLength={LARGO_NOMBRE}
              placeholder="Por pagar"
              autoFocus
              className="campo w-full"
            />
          </label>
          <button type="button" onClick={guardar} disabled={guardando}
                  className="btn-primario h-11 px-4 card-label">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" onClick={() => { setNombrando(false); setErrores([]) }}
                  aria-label="Cancelar" className="h-11 w-11 inline-flex items-center justify-center rounded-item bg-ink-100 text-ink-600">
            <X size={18} />
          </button>
          {errores.length > 0 && (
            <ul className="w-full">
              {errores.map(e => <li key={e} className="card-meta text-danger-600">{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Pestana({ activa, onClick, nombre, cuenta, onBorrar }: {
  activa: boolean; onClick: () => void; nombre: string; cuenta: number
  onBorrar?: () => void
}) {
  return (
    <div className={[
      'inline-flex items-center h-9 rounded-full border text-sm font-bold',
      activa ? 'border-transparent bg-white text-ink-900' : 'border-white/34 bg-white/14 text-white',
    ].join(' ')}>
      <button type="button" onClick={onClick} aria-current={activa ? 'true' : 'false'}
              className={`inline-flex items-center gap-2 h-9 ${onBorrar ? 'pl-4 pr-1' : 'px-4'}`}>
        <span>{nombre}</span>
        <span className={`font-mono-amount font-semibold ${activa ? 'text-ink-500' : 'text-white/66'}`}>
          {cuenta}
        </span>
      </button>
      {onBorrar && (
        <button type="button" onClick={onBorrar} aria-label={`Borrar la vista ${nombre}`}
                className="h-9 w-8 inline-flex items-center justify-center text-ink-400 hover:text-danger-600">
          <Trash2 size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
