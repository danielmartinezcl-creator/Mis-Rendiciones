'use client'

// Para qué es el documento, y de ahí quién lo aprueba.
//
// Va con un selector explícito y no con «el número vacío significa que no es de
// proyecto» (decisión de Daniel, 2026-10-07): un campo de número a la vista se
// lee como obligatorio, y el costo de equivocarse acá es que el gasto le llegue
// a la persona equivocada.
//
// Lo usan las dos pantallas de creación —rendición y fondo—, porque la pregunta
// es la misma y tenerla escrita dos veces es tenerla distinta en seis meses.
//
// Spec: docs/superpowers/specs/2026-10-07-aprobador-por-proyecto-design.md

import { useEffect, useRef, useState } from 'react'
import { Building2, Briefcase, Check, Loader2 } from 'lucide-react'
import { buscarProyecto, jefesDeProyecto } from '@/actions/proyectos'

export interface ValorProyecto {
  /** null = todavía no eligió. No hay valor por defecto la primera vez. */
  esProyecto: boolean | null
  numero:     string
  nombre:     string
  jefeId:     string
}

export const VALOR_VACIO: ValorProyecto = { esProyecto: null, numero: '', nombre: '', jefeId: '' }

type Jefe = { id: string; full_name: string }
type Hallado = { id: string; numero: string; nombre: string | null; jefe_id: string | null; activo: boolean }

interface Props {
  valor:    ValorProyecto
  onChange: (v: ValorProyecto) => void
  /** Clave de localStorage para recordar la última elección de esta persona. */
  recordarComo?: string
}

export function SelectorProyecto({ valor, onChange, recordarComo }: Props) {
  const [jefes, setJefes]       = useState<Jefe[]>([])
  const [hallado, setHallado]   = useState<Hallado | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [buscado, setBuscado]   = useState(false)
  const temporizador            = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { jefesDeProyecto().then(setJefes).catch(() => setJefes([])) }, [])

  /* Se recupera dentro de un efecto y no al inicializar el estado: tocar
     localStorage durante el render rompe el SSR de Next — ya pasó con el riel. */
  useEffect(() => {
    if (!recordarComo || valor.esProyecto !== null) return
    try {
      const guardado = localStorage.getItem(recordarComo)
      if (guardado) onChange({ ...VALOR_VACIO, ...JSON.parse(guardado) })
    } catch { /* sin memoria, se pregunta de nuevo */ }
    // Solo al montar: después manda lo que la persona elija
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordarComo])

  function elegirTipo(esProyecto: boolean) {
    const v = esProyecto ? { ...valor, esProyecto } : { ...VALOR_VACIO, esProyecto }
    onChange(v)
    setHallado(null)
    setBuscado(false)
    try {
      if (recordarComo) localStorage.setItem(recordarComo, JSON.stringify({ esProyecto }))
    } catch { /* ignorar */ }
  }

  /* 600 ms después de dejar de teclear, igual que el chequeo de políticas de
     ExpenseItemForm: buscar en cada tecla sería una consulta por pulsación. */
  function cambiarNumero(numero: string) {
    onChange({ ...valor, numero })
    setHallado(null)
    setBuscado(false)
    if (temporizador.current) clearTimeout(temporizador.current)
    if (!numero.trim()) return

    setBuscando(true)
    temporizador.current = setTimeout(async () => {
      try {
        const p = await buscarProyecto(numero)
        setHallado(p)
        setBuscado(true)
        // Un proyecto conocido trae su jefe puesto: el caso normal es no elegir nada
        if (p?.jefe_id) onChange({ ...valor, numero, nombre: p.nombre ?? '', jefeId: p.jefe_id })
      } catch {
        setBuscado(true)
      } finally {
        setBuscando(false)
      }
    }, 600)
  }

  const esNuevo = buscado && !hallado && valor.numero.trim() !== ''

  return (
    <div className="space-y-3">
      <p className="card-label font-semibold text-ink-700">¿Para qué es? *</p>

      {/* Radios de verdad con su label: un div con onClick no lo alcanza el tabulador */}
      <div className="grid grid-cols-2 gap-2">
        {([
          { v: true,  icono: Building2, titulo: 'Un proyecto',      pie: 'Aprueba el jefe de la obra' },
          { v: false, icono: Briefcase, titulo: 'Gastos generales', pie: 'Oficina, cursos, administración' },
        ] as const).map(op => {
          const activo = valor.esProyecto === op.v
          const Icono = op.icono
          return (
            <label
              key={String(op.v)}
              className={`rounded-item border p-3 cursor-pointer transition-colors ${
                activo ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:border-ink-300'
              }`}
            >
              <input
                type="radio"
                name="tipo-de-documento"
                className="sr-only"
                checked={activo}
                onChange={() => elegirTipo(op.v)}
              />
              <span className="flex items-center gap-2">
                <Icono size={15} className={activo ? 'text-brand-600' : 'text-ink-400'} />
                <span className={`card-label font-semibold ${activo ? 'text-brand-700' : 'text-ink-700'}`}>
                  {op.titulo}
                </span>
                {activo && <Check size={14} className="text-brand-600 ml-auto" />}
              </span>
              <span className="card-meta text-ink-400 block mt-1">{op.pie}</span>
            </label>
          )
        })}
      </div>

      {valor.esProyecto === true && (
        <div className="space-y-3 pt-1">
          <div>
            <label htmlFor="numero-proyecto" className="block card-label font-semibold text-ink-700 mb-1">
              N° de proyecto *
            </label>
            <div className="relative">
              <input
                id="numero-proyecto"
                type="text"
                inputMode="text"
                value={valor.numero}
                onChange={e => cambiarNumero(e.target.value)}
                placeholder="Ej: 2991"
                className="campo w-full py-2.5 text-[16px]"
              />
              {buscando && (
                <Loader2 size={15} className="animate-spin text-ink-400 absolute right-3 top-1/2 -translate-y-1/2" />
              )}
            </div>
          </div>

          {hallado && (
            <p className="card-label text-ink-600">
              <span className="font-semibold text-ink-800">{hallado.nombre || 'Sin nombre'}</span>
              {!hallado.activo && <span className="text-warning-700"> · obra cerrada</span>}
            </p>
          )}

          {esNuevo && (
            <div>
              <label htmlFor="nombre-proyecto" className="block card-label font-semibold text-ink-700 mb-1">
                Nombre de la obra
              </label>
              <input
                id="nombre-proyecto"
                type="text"
                value={valor.nombre}
                onChange={e => onChange({ ...valor, nombre: e.target.value })}
                placeholder="Ej: Planta Rancagua"
                className="campo w-full py-2.5 text-[16px]"
              />
              <p className="card-meta text-ink-400 mt-1">
                Es un número nuevo. Lo que escribas acá lo van a ver los demás
              </p>
            </div>
          )}

          {valor.numero.trim() !== '' && (
            <div>
              <label htmlFor="jefe-proyecto" className="block card-label font-semibold text-ink-700 mb-1">
                Jefe de proyecto *
              </label>
              <select
                id="jefe-proyecto"
                value={valor.jefeId}
                onChange={e => onChange({ ...valor, jefeId: e.target.value })}
                className="campo w-full py-2.5 text-[16px]"
              >
                <option value="">Elegir…</option>
                {jefes.map(j => <option key={j.id} value={j.id}>{j.full_name}</option>)}
              </select>
              {jefes.length === 0 && (
                <p className="card-meta text-warning-700 mt-1">
                  Todavía no hay nadie habilitado como jefe de proyecto. Avisale a administración
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Si lo elegido alcanza para crear el documento. */
export function proyectoCompleto(v: ValorProyecto): boolean {
  if (v.esProyecto === null) return false
  if (!v.esProyecto) return true
  return v.numero.trim() !== '' && v.jefeId !== ''
}
