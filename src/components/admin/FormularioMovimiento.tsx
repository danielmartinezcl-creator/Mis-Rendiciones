'use client'

import { useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import { agregarMovimientoHistorico } from '@/actions/admin'
import { movimientosDisponibles, erroresDeMovimiento, movimientoPorClave, type ClaveMovimiento } from '@/lib/movimientos-historicos'
import { useDialogos } from '@/components/ui/Dialogos'

interface Props {
  reportId: string
  /** Vacío donde la pantalla no carga el catálogo (`/petty-cash`): entonces no se
   *  ofrece «Gasto», porque sin categoría no hay cómo imputarlo. */
  categorias: { id: string; name: string }[]
  /** Se llama tras agregar, para que la pantalla recargue sus totales. */
  onAgregado: () => void
}

// text-[16px]: por debajo de 16px Safari en iPhone hace zoom al enfocar el campo
const campo = 'campo-compacto text-[16px] sm:text-sm'

/** Agregar un movimiento a una carga histórica ya importada.
 *
 *  Las cuatro opciones del selector salen de `MOVIMIENTOS`, donde «Adelanto a rendir» y
 *  «Reembolso al empleado» escriben el mismo `advance`: contablemente es el mismo asiento.
 *  La palabra «reembolso» está acá porque es la que la gente busca. */
export function FormularioMovimiento({ reportId, categorias, onAgregado }: Props) {
  const { avisar } = useDialogos()
  const [abierto,  setAbierto]  = useState(false)
  const [clave,    setClave]    = useState<ClaveMovimiento>('reembolso')
  const [desc,     setDesc]     = useState('')
  const [fecha,    setFecha]    = useState('')
  const [monto,    setMonto]    = useState('')
  const [catId,    setCatId]    = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [guardando, startTrans] = useTransition()

  const opciones = movimientosDisponibles(categorias.length > 0)
  const elegido  = movimientoPorClave(clave)
  const esGasto  = elegido?.itemType === 'expense'

  function limpiar() {
    setClave('reembolso'); setDesc(''); setFecha(''); setMonto(''); setCatId(''); setError(null)
  }

  function guardar() {
    const mov = {
      clave,
      descripcion: desc,
      fecha,
      montoCLP:    Math.round(Number(monto)) || 0,
      categoryId:  esGasto ? (catId || null) : null,
    }
    const errores = erroresDeMovimiento(mov)
    if (errores.length) { setError(errores.join('. ')); return }
    setError(null)

    startTrans(async () => {
      try {
        await agregarMovimientoHistorico(reportId, mov)
        avisar('Movimiento agregado')
        limpiar()
        setAbierto(false)
        onAgregado()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo agregar el movimiento')
      }
    })
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 font-medium"
      >
        <Plus size={14} /> Agregar movimiento
      </button>
    )
  }

  return (
    <div className="hoja rounded-item p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="card-label font-semibold text-ink-500">Agregar movimiento</p>
        <button
          onClick={() => { limpiar(); setAbierto(false) }}
          title="Cerrar"
          className="p-0.5 text-ink-400 hover:text-ink-700 rounded-item transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-start gap-2">
        <select
          value={clave}
          onChange={e => setClave(e.target.value as ClaveMovimiento)}
          className={`${campo} lg:w-48`}
          aria-label="Tipo de movimiento"
        >
          {opciones.map(m => (
            <option key={m.clave} value={m.clave}>{m.etiqueta}</option>
          ))}
        </select>

        <input
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder={elegido?.descripcionPorDefecto ?? 'Descripción'}
          className={`${campo} lg:flex-1`}
          aria-label="Descripción"
        />

        <input
          type="date"
          value={fecha}
          onChange={e => setFecha(e.target.value)}
          className={`${campo} lg:w-40`}
          aria-label="Fecha del movimiento"
        />

        <input
          type="number"
          value={monto}
          onChange={e => setMonto(e.target.value)}
          placeholder="Monto"
          className={`${campo} lg:w-32 text-right font-mono-amount`}
          aria-label="Monto en pesos"
        />
      </div>

      {/* Solo el gasto se imputa a una cuenta: el adelanto, el reembolso y la devolución
          van contra Fondos por Rendir, que no lleva categoría ni centro de negocios. */}
      {esGasto && (
        <select
          value={catId}
          onChange={e => setCatId(e.target.value)}
          className={`${campo} w-full lg:w-64`}
          aria-label="Categoría del gasto"
        >
          <option value="">Elegí la categoría…</option>
          {categorias.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}

      {error && (
        <p className="text-xs text-danger-700 bg-danger-50 border border-danger-200 rounded-item px-2 py-1">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <button onClick={guardar} disabled={guardando} className="btn-primario text-sm py-1.5 px-3 disabled:opacity-50">
          {guardando ? 'Agregando…' : 'Agregar'}
        </button>
        <p className="text-xs text-ink-400">
          {esGasto
            ? 'El total de la carga se recalcula con este gasto.'
            : 'No cambia el total de gastos: es un movimiento de fondos y arma su propio comprobante.'}
        </p>
      </div>
    </div>
  )
}
