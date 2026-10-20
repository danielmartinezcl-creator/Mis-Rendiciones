'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownToLine, ArrowUpFromLine, Receipt, SendHorizontal,
  Pencil, Trash2, Check, X, BookCheck,
} from 'lucide-react'
import {
  getMovimientosHistoricos, updateHistoricalExpenseItem, eliminarMovimientoHistorico,
} from '@/actions/admin'
import { motivoNoSeBorra } from '@/lib/movimientos-historicos'
import { formatCLP, formatDate } from '@/lib/utils'
import { useDialogos } from '@/components/ui/Dialogos'
import { FormularioMovimiento } from './FormularioMovimiento'

type Datos = Awaited<ReturnType<typeof getMovimientosHistoricos>>
type Movimiento = Datos['items'][number]

interface Props {
  reportId:   string
  categorias: { id: string; name: string }[]
  onClose:    () => void
  /** Tras agregar, editar o borrar: la cabecera de arriba cambió de monto. */
  onChanged:  () => void
}

const ICONO: Record<string, React.ReactNode> = {
  advance:  <ArrowDownToLine size={12} className="text-info-500 shrink-0" />,
  expense:  <Receipt         size={12} className="text-ink-400 shrink-0" />,
  return:   <ArrowUpFromLine size={12} className="text-success-500 shrink-0" />,
  transfer: <SendHorizontal  size={12} className="text-flare-500 shrink-0" />,
}

const ETIQUETA: Record<string, string> = {
  advance: 'Adelanto', expense: 'Gasto', return: 'Devolución', transfer: 'Traspaso',
}

const COLOR_MONTO: Record<string, string> = {
  advance: 'text-info-600', return: 'text-success-600',
}

const campo = 'campo-compacto text-[16px] sm:text-sm'

/** Los movimientos de una carga histórica, con agregar, corregir y eliminar.
 *
 *  `/admin/carga-historica` no mostraba ningún ítem: su lista es de cabeceras. Lo que
 *  faltaba al importar solo se podía arreglar cargando un documento aparte o rehaciendo
 *  la carga completa.
 *
 *  La lista es flex y no una tabla, y el corte va en `lg:`: una tabla de cinco columnas
 *  no entra en 390 px, y a `md:` aparece el riel lateral y se come 256 px de ancho. */
export function MovimientosHistoricos({ reportId, categorias, onClose, onChanged }: Props) {
  const { confirmar, avisar } = useDialogos()
  const [datos,   setDatos]   = useState<Datos | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const [editId,   setEditId]   = useState<string | null>(null)
  const [editTipo, setEditTipo] = useState<'expense' | 'advance' | 'return'>('expense')
  const [editDesc, setEditDesc] = useState('')
  const [editFecha, setEditFecha] = useState('')
  const [editMonto, setEditMonto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [borrando,  setBorrando]  = useState<string | null>(null)

  const recargar = useCallback(async () => {
    try {
      setDatos(await getMovimientosHistoricos(reportId))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los movimientos')
    }
  }, [reportId])

  useEffect(() => {
    let cancelado = false
    getMovimientosHistoricos(reportId)
      .then(d => { if (!cancelado) { setDatos(d); setError(null) } })
      .catch(e => { if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudieron cargar los movimientos') })
      .finally(() => { if (!cancelado) setCargando(false) })
    return () => { cancelado = true }
  }, [reportId])

  function empezarEdicion(m: Movimiento) {
    setEditId(m.id)
    setEditTipo((m.item_type === 'advance' || m.item_type === 'return') ? m.item_type : 'expense')
    setEditDesc(m.description ?? '')
    setEditFecha(m.date ?? '')
    setEditMonto(String(m.amount_clp))
    setError(null)
  }

  async function guardarEdicion(itemId: string) {
    setGuardando(true)
    try {
      await updateHistoricalExpenseItem(itemId, {
        item_type:  editTipo,
        description: editDesc,
        date:        editFecha,
        amount_clp:  Math.round(Number(editMonto)) || 0,
      })
      setEditId(null)
      await recargar()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(m: Movimiento) {
    if (!await confirmar({
      titulo:  `¿Eliminar "${m.description || 'este movimiento'}"?`,
      detalle: `${ETIQUETA[m.item_type ?? 'expense'] ?? ''} de ${formatCLP(m.amount_clp)}. Esta acción no se puede deshacer.`,
      aceptar: 'Eliminar',
      peligro: true,
    })) return

    setBorrando(m.id)
    try {
      await eliminarMovimientoHistorico(m.id, reportId)
      avisar('Movimiento eliminado')
      await recargar()
      onChanged()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo eliminar', 'error')
    } finally {
      setBorrando(null)
    }
  }

  return (
    <div className="bg-ink-50 border-t border-ink-100 px-3 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="card-label font-semibold text-ink-500">Movimientos de la carga</p>
        <button onClick={onClose} title="Cerrar" className="p-0.5 text-ink-400 hover:text-ink-700 rounded-item transition-colors">
          <X size={14} />
        </button>
      </div>

      {cargando && <p className="text-xs text-ink-400">Cargando movimientos…</p>}

      {datos && datos.items.length === 0 && (
        <p className="text-xs text-ink-400 italic">Esta carga no tiene movimientos.</p>
      )}

      {datos && datos.items.length > 0 && (
        <ul className="space-y-1.5">
          {datos.items.map(m => {
            const editando = editId === m.id
            const motivo   = motivoNoSeBorra(m, datos.cargaLegacy)

            if (editando) return (
              <li key={m.id} className="hoja rounded-item p-2 space-y-2">
                <div className="flex flex-col lg:flex-row lg:items-center gap-2">
                  <select value={editTipo} onChange={e => setEditTipo(e.target.value as 'expense' | 'advance' | 'return')}
                    className={`${campo} lg:w-32`} aria-label="Tipo">
                    <option value="expense">Gasto</option>
                    <option value="advance">Adelanto</option>
                    <option value="return">Devolución</option>
                  </select>
                  <input value={editDesc} onChange={e => setEditDesc(e.target.value)}
                    placeholder="Descripción" className={`${campo} lg:flex-1`} aria-label="Descripción" />
                  <input type="date" value={editFecha} onChange={e => setEditFecha(e.target.value)}
                    className={`${campo} lg:w-40`} aria-label="Fecha" />
                  <input type="number" value={editMonto} onChange={e => setEditMonto(e.target.value)}
                    className={`${campo} lg:w-28 text-right font-mono-amount`} aria-label="Monto" />
                  <div className="flex gap-1">
                    <button onClick={() => guardarEdicion(m.id)} disabled={guardando} title="Guardar"
                      className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-item transition-colors disabled:opacity-40">
                      <Check size={14} />
                    </button>
                    <button onClick={() => { setEditId(null); setError(null) }} title="Cancelar"
                      className="p-1.5 text-ink-400 hover:bg-ink-100 rounded-item transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </li>
            )

            return (
              <li key={m.id} className="hoja rounded-item px-2.5 py-2">
                <div className="flex flex-col lg:flex-row lg:items-center gap-1 lg:gap-3">
                  <span className="flex items-center gap-1 lg:w-28 shrink-0">
                    {ICONO[m.item_type ?? 'expense'] ?? null}
                    <span className="text-xs font-medium text-ink-600">
                      {ETIQUETA[m.item_type ?? 'expense'] ?? m.item_type}
                    </span>
                  </span>

                  <span className="text-sm text-ink-700 lg:flex-1 lg:truncate">
                    {m.description || '—'}
                  </span>

                  <span className="text-xs text-ink-400 lg:w-24 shrink-0">
                    {m.date ? formatDate(m.date) : '—'}
                  </span>

                  <span className={`text-sm font-semibold font-mono-amount lg:w-28 lg:text-right shrink-0 ${COLOR_MONTO[m.item_type ?? ''] ?? 'text-ink-900'}`}>
                    {formatCLP(m.amount_clp)}
                  </span>

                  <span className="flex items-center gap-1 shrink-0">
                    {m.defontana_exported_at || datos.cargaLegacy ? (
                      <span title="Contabilizado en Defontana" className="text-accent-600">
                        <BookCheck size={12} />
                      </span>
                    ) : null}

                    {m.item_type !== 'transfer' && (
                      <button onClick={() => empezarEdicion(m)} title="Corregir movimiento"
                        className="p-1 text-ink-300 hover:text-brand-600 rounded-item transition-colors">
                        <Pencil size={12} />
                      </button>
                    )}

                    {/* El botón se esconde cuando no se puede borrar, pero la acción lo
                        vuelve a comprobar: esconderlo no es impedirlo. */}
                    {motivo ? (
                      <span title={motivo} className="p-1 text-ink-200 cursor-not-allowed">
                        <Trash2 size={12} />
                      </span>
                    ) : (
                      <button onClick={() => borrar(m)} disabled={borrando === m.id} title="Eliminar movimiento"
                        className="p-1 text-ink-300 hover:text-danger-500 rounded-item transition-colors disabled:opacity-40">
                        {borrando === m.id ? <span className="text-[10px]">…</span> : <Trash2 size={12} />}
                      </button>
                    )}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p className="text-xs text-danger-700 bg-danger-50 border border-danger-200 rounded-item px-2 py-1">{error}</p>
      )}

      {datos?.cargaLegacy && (
        <p className="text-xs text-ink-500">
          Esta carga se contabilizó antes de que el comprobante se guardara por movimiento,
          así que el de la cabecera vale por todos: para eliminar alguno hay que revertirlo primero.
          Un movimiento nuevo sí queda pendiente y arma su propio comprobante.
        </p>
      )}

      <FormularioMovimiento
        reportId={reportId}
        categorias={categorias}
        onAgregado={() => { void recargar(); onChanged() }}
      />
    </div>
  )
}
