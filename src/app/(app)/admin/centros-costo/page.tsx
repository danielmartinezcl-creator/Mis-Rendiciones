'use client'

// El catálogo de centros de costo. Hasta hoy no existía: los 46 venían
// sembrados por la migración 012 y agregar uno exigía SQL a mano.
//
// Al revés que las obras —que se arman con el uso, porque son 150 y cambian
// todo el año— los centros de costo son pocos, estables y **tienen que existir
// antes** de que alguien los elija: la planilla de alta deja afuera la fila que
// nombra un centro que no está.
//
// Las reglas del código viven en `src/lib/centros-costo.ts`. Lo que hay que
// saber acá: el código ES el centro de negocios de Defontana y se lee de tres
// en tres letras, así que el alta pide el padre y las tres letras nuevas, nunca
// el código completo.

import { useEffect, useMemo, useState } from 'react'
import { FolderTree, Search, Plus, Trash2, X } from 'lucide-react'
import {
  listarCentrosCosto, crearCentroCosto, corregirCentroCosto, eliminarCentroCosto,
  type FilaCentro,
} from '@/actions/cost-centers'
import {
  ordenarEnArbol, sePuedeBorrar, normalizarCodigo, armarCodigo, erroresDeAlta,
  LARGO_SEGMENTO, toSheetCostCenter,
} from '@/lib/centros-costo'
import { useDialogos } from '@/components/ui/Dialogos'

export default function CentrosCostoPage() {
  const { confirmar, avisar } = useDialogos()
  const [filas,     setFilas]     = useState<FilaCentro[]>([])
  const [cargando,  setCargando]  = useState(true)
  const [busqueda,  setBusqueda]  = useState('')
  const [guardando, setGuardando] = useState<string | null>(null)
  const [alta,      setAlta]      = useState(false)

  async function cargar() {
    setFilas(await listarCentrosCosto())
    setCargando(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar().catch(() => setCargando(false)) }, [])

  /* El árbol se arma con TODOS los centros y recién después se filtra: si se
     ordenara lo filtrado, el nivel de cada fila y la marca de «sin padre»
     saldrían de una lista incompleta y mentirían. */
  const arbol = useMemo(() => ordenarEnArbol(filas), [filas])
  const visibles = useMemo(() => {
    const q = normalizarCodigo(busqueda)
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return arbol
    return arbol.filter(f =>
      (q && f.id.includes(q)) || f.descripcion.toLowerCase().includes(texto))
  }, [arbol, busqueda])

  async function guardar(id: string, cambios: Parameters<typeof corregirCentroCosto>[1]) {
    setGuardando(id)
    try {
      const { error } = await corregirCentroCosto(id, cambios)
      if (error) { avisar(error, 'error'); return }
      await cargar()
      avisar('Guardado')
    } finally {
      setGuardando(null)
    }
  }

  async function borrar(f: FilaCentro) {
    /* Sin palabra que escribir: solo se ofrece cuando NADA lo nombra, así que
       no hay nada que perder. El verbo real en el botón, igual que siempre. */
    const ok = await confirmar({
      titulo:  `Borrar ${f.id}`,
      detalle: `«${f.descripcion}» no lo usa ninguna ficha ni ningún gasto. Desaparece del catálogo.`,
      aceptar: 'Borrar',
      peligro: true,
    })
    if (!ok) return
    setGuardando(f.id)
    try {
      const { error } = await eliminarCentroCosto(f.id)
      if (error) { avisar(error, 'error'); return }
      await cargar()
      avisar(`${f.id} borrado`)
    } finally {
      setGuardando(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <header>
        <h1 className="text-xl font-bold tor-on-gradient flex items-center gap-2">
          <FolderTree size={20} /> Centros de costo
        </h1>
        <p className="card-label tor-on-gradient-soft mt-1">
          El código es el centro de negocios de Defontana: viaja tal cual al comprobante.
        </p>
      </header>

      {alta ? (
        <PanelAlta
          centros={filas}
          onCancelar={() => setAlta(false)}
          onCreado={async (id) => { setAlta(false); await cargar(); avisar(`${id} creado`) }}
        />
      ) : (
        <button onClick={() => setAlta(true)}
                className="btn-primario inline-flex items-center gap-1.5 px-4 py-2 card-label">
          <Plus size={15} /> Nuevo centro de costo
        </button>
      )}

      <div className="hoja p-4 space-y-4">
        <label className="relative block">
          <span className="sr-only">Buscar por código o nombre</span>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por código o nombre"
            className="campo w-full pl-9 py-2.5"
          />
        </label>

        {cargando ? (
          <p className="card-label text-ink-500 py-6 text-center">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="card-label text-ink-500 py-6 text-center">
            {filas.length === 0
              ? 'Todavía no hay centros de costo.'
              : 'Ningún centro coincide con la búsqueda.'}
          </p>
        ) : (
          /* Una sola lista, no una tabla con una versión para el teléfono.
             Dos presentaciones habrían dejado los 46 controles duplicados en el
             DOM —dos casillas «Centro EMP activo», dos botones «Borrar EMP»—, y
             un nombre accesible repetido rompe cualquier búsqueda por nombre,
             que es como se eligen los controles acá.

             Y no es una tabla porque seis columnas no entran en 390 px: en esta
             pantalla `overflow-x-auto` NO evita que el cuerpo de la página
             scrollee (probado poniendo `overflow-x:hidden` en los siete
             ancestros, uno por vez: seguía corriendo 334 px), y aun sin los
             pisos de ancho la tabla pedía 506. La fila de flex se apila en el
             teléfono y alinea sus columnas de `lg:` en adelante — en `lg:` y no en
             `sm:` porque a `md:` aparece el riel lateral y se come 256 px: a 768 hay
             MENOS ancho de contenido que a 640, y ahí los anchos fijos desbordaban 30. */
          <div className="space-y-1">
            {/* Los rótulos, donde hay una fila que rotular */}
            <div className="hidden lg:flex items-end gap-3 px-1 pb-1 border-b border-ink-100
                            card-meta font-semibold text-ink-500">
              <span className="w-44 shrink-0">Código</span>
              <span className="flex-1 min-w-0">Nombre</span>
              <span className="w-20 shrink-0 text-center">Recibe asientos</span>
              <span className="w-36 shrink-0 text-right">Uso</span>
              <span className="w-14 shrink-0 text-center">Activo</span>
              <span className="w-7 shrink-0"><span className="sr-only">Borrar</span></span>
            </div>

            <ul className="divide-y divide-ink-100 lg:divide-y-0">
              {visibles.map(f => (
                <li key={f.id}
                    className={[
                      'flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 py-2.5 lg:py-1.5 px-1',
                      'lg:border-b lg:border-ink-100',
                      f.activo ? '' : 'opacity-60',
                    ].join(' ')}>
                  <span className="w-44 shrink-0 flex items-baseline gap-1.5">
                    {/* La sangría ES el árbol: cada tramo de tres letras es un nivel */}
                    <span className="font-semibold text-ink-900 font-mono-amount card-label"
                          style={{ paddingLeft: `${(f.nivel - 1) * 10}px` }}>
                      {f.id}
                    </span>
                    {f.sinPadre && (
                      <span className="card-meta text-warning-600"
                            title="El centro de arriba que nombra su código no existe">
                        sin padre
                      </span>
                    )}
                  </span>

                  <input
                    defaultValue={f.descripcion}
                    disabled={guardando === f.id}
                    onBlur={e => {
                      const v = e.target.value.trim()
                      if (v && v !== f.descripcion) guardar(f.id, { descripcion: v })
                    }}
                    aria-label={`Nombre del centro ${f.id}`}
                    className="campo-compacto flex-1 min-w-0"
                  />

                  <div className="flex items-center gap-3 lg:gap-3">
                    <label className="lg:w-20 lg:shrink-0 lg:justify-center flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={f.imputable}
                        disabled={guardando === f.id}
                        onChange={e => guardar(f.id, { imputable: e.target.checked })}
                        aria-label={`El centro ${f.id} recibe asientos`}
                        className="rounded text-brand-600"
                      />
                      <span className="card-meta text-ink-600 lg:hidden">Recibe asientos</span>
                    </label>

                    <span className="lg:w-36 lg:shrink-0 lg:text-right card-meta text-ink-600">
                      {f.personas || f.gastos ? (
                        [
                          f.personas > 0 ? `${f.personas} pers.` : null,
                          f.gastos > 0 ? `${f.gastos} gastos` : null,
                        ].filter(Boolean).join(' · ')
                      ) : (
                        /* `ink-500` y no `ink-300`: sobre blanco el 300 da 1,78
                           de contraste y el piso del sistema es 2. La jerarquía
                           la hace el tamaño y la palabra, no un gris ilegible. */
                        <span className="text-ink-500">sin uso</span>
                      )}
                    </span>

                    <label className="lg:w-14 lg:shrink-0 lg:justify-center flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={f.activo}
                        disabled={guardando === f.id}
                        onChange={e => guardar(f.id, { activo: e.target.checked })}
                        aria-label={`Centro ${f.id} activo`}
                        className="rounded text-brand-600"
                      />
                      <span className="card-meta text-ink-600 lg:hidden">Activo</span>
                    </label>

                    <span className="w-7 shrink-0 text-right">
                      {/* Solo cuando nada lo nombra: es para arreglar un código
                          recién escrito mal, no para retirar uno en uso */}
                      {sePuedeBorrar(f) && (
                        <button
                          onClick={() => borrar(f)}
                          disabled={guardando === f.id}
                          className="text-ink-400 hover:text-danger-600 transition-colors p-1"
                        >
                          <Trash2 size={15} />
                          <span className="sr-only">Borrar {f.id}</span>
                        </button>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="card-meta text-ink-500 pt-1 border-t border-ink-100">
          {filas.length} centros · {filas.filter(f => f.imputable).length} reciben asientos.
          Los que agrupan no reciben: existen para ordenar el árbol.
        </p>
      </div>

      <p className="card-meta tor-on-gradient-soft">
        <strong className="font-semibold">El código no se puede cambiar.</strong> Está escrito en las
        fichas, en los gastos ya imputados y en los comprobantes de Defontana. Uno mal escrito se
        arregla creando el correcto y borrando el otro, que se puede mientras nadie lo haya usado.
        Para retirar un centro que ya se usó, desactivalo: deja de ofrecerse y lo ya imputado no se mueve.
      </p>
    </div>
  )
}

/* ── El alta ──────────────────────────────────────────────────────────────── */

function PanelAlta({ centros, onCancelar, onCreado }: {
  centros:    FilaCentro[]
  onCancelar: () => void
  onCreado:   (id: string) => void | Promise<void>
}) {
  const [padre,       setPadre]       = useState('')
  const [sufijo,      setSufijo]      = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [imputable,   setImputable]   = useState(true)
  const [guardando,   setGuardando]   = useState(false)
  const [errores,     setErrores]     = useState<string[]>([])

  const alta     = { padre, sufijo, descripcion }
  const codigo   = armarCodigo(padre, sufijo)
  const previos  = erroresDeAlta(alta, centros)
  const listo    = previos.length === 0

  async function crear() {
    setErrores([])
    if (!listo) { setErrores(previos); return }
    setGuardando(true)
    try {
      const { id, errores: errs } = await crearCentroCosto({ ...alta, imputable })
      if (errs?.length || !id) { setErrores(errs ?? ['No se pudo crear el centro']); return }
      await onCreado(id)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="hoja p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-ink-900">Nuevo centro de costo</h2>
          <p className="card-meta text-ink-500 mt-0.5">
            El código se arma con el centro de arriba y tres letras nuevas, para que
            coincida con Defontana.
          </p>
        </div>
        <button onClick={onCancelar} aria-label="Cerrar" className="text-ink-400 hover:text-ink-700 p-1">
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="lg:col-span-2">
          <label htmlFor="cc-padre" className="block card-label font-medium text-ink-600 mb-1">
            Cuelga de
          </label>
          <select id="cc-padre" value={padre} onChange={e => setPadre(e.target.value)}
                  className="campo w-full">
            <option value="">— Rama nueva, en el primer nivel —</option>
            {ordenarEnArbol(centros).map(c => (
              <option key={c.id} value={c.id}>
                {' '.repeat((c.nivel - 1) * 3)}{c.id} — {c.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cc-sufijo" className="block card-label font-medium text-ink-600 mb-1">
            Tres letras nuevas
          </label>
          <input
            id="cc-sufijo"
            value={sufijo}
            onChange={e => setSufijo(normalizarCodigo(e.target.value).slice(0, LARGO_SEGMENTO))}
            placeholder="MEC"
            maxLength={LARGO_SEGMENTO}
            className="campo w-full font-mono-amount uppercase"
          />
        </div>

        <div>
          <label htmlFor="cc-nombre" className="block card-label font-medium text-ink-600 mb-1">
            Nombre
          </label>
          <input
            id="cc-nombre"
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder="MECANICA"
            className="campo w-full"
          />
        </div>
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={imputable} onChange={e => setImputable(e.target.checked)}
               className="rounded text-brand-600 mt-0.5" />
        <span className="card-label text-ink-700">
          Recibe asientos
          <span className="block card-meta text-ink-500">
            Desmarcalo si este centro solo agrupa a otros. Solo los que reciben asientos se
            pueden elegir en una ficha o en un gasto.
          </span>
        </span>
      </label>

      {/* Lo que va a quedar escrito, antes de escribirlo: el código y cómo sale
          en el comprobante, con los tres ceros que agrega el export */}
      {codigo && (
        <p className="card-meta text-ink-600 bg-ink-50 rounded-item p-2.5">
          Código: <strong className="font-mono-amount font-semibold text-ink-900">{codigo}</strong>
          <span className="text-ink-400"> · </span>
          en Defontana: <strong className="font-mono-amount">{toSheetCostCenter(codigo)}</strong>
        </p>
      )}

      {(errores.length > 0 || (sufijo && previos.length > 0)) && (
        <ul className="bg-danger-50 border border-danger-200 rounded-item p-2.5 space-y-1">
          {(errores.length ? errores : previos).map(e => (
            <li key={e} className="card-meta text-danger-700">{e}</li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <button onClick={crear} disabled={guardando || !listo}
                className="btn-primario px-4 py-2 card-label">
          {guardando ? 'Creando…' : 'Crear centro'}
        </button>
        <button onClick={onCancelar} className="btn-secundario px-4 py-2 card-label">
          Cancelar
        </button>
      </div>
    </div>
  )
}
