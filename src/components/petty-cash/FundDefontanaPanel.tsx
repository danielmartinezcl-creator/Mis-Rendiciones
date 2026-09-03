'use client'

import { useEffect, useState } from 'react'
import { FileSpreadsheet, BookCheck, Undo2 } from 'lucide-react'
import {
  getFundDefontanaBreakdown,
  getFundDefontanaMovementData,
  confirmFundDefontana,
  revertFundDefontana,
  type FundMovement,
} from '@/actions/petty-cash'
import { RevertDefontanaDialog } from '@/components/ui/RevertDefontanaDialog'
import { formatCLP } from '@/lib/utils'

const LABEL: Record<FundMovement, string> = {
  advance: 'Adelantos al empleado',
  expense: 'Gastos aprobados',
  return:  'Reembolsos del empleado',
}

const HINT: Record<FundMovement, string> = {
  advance: 'Sale plata del banco — asiento con CARGO',
  expense: 'Contra la cuenta Fondos por Rendir',
  return:  'Entra plata al banco — asiento con ABONO',
}

type Breakdown = Awaited<ReturnType<typeof getFundDefontanaBreakdown>>

interface Props {
  fundId: string
  /** Se llama tras confirmar o revertir, para refrescar el detalle del fondo. */
  onChanged: () => void
}

/**
 * Contabilización por movimiento de un fondo vivo. Cada movimiento se puede
 * llevar a Defontana en cuanto queda firme: el adelanto apenas se transfiere,
 * los gastos cuando están aprobados y el reembolso cuando vuelve la plata.
 */
export function FundDefontanaPanel({ fundId, onChanged }: Props) {
  const [data,        setData]        = useState<Breakdown | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [info,        setInfo]        = useState<string | null>(null)
  const [selected,    setSelected]    = useState<Set<FundMovement>>(new Set())
  const [exporting,   setExporting]   = useState(false)
  const [confirming,  setConfirming]  = useState(false)
  const [comprobante, setComprobante] = useState('')
  const [warnings,    setWarnings]    = useState<{ categories: string[]; unmappedCLP: number } | null>(null)
  const [revertTarget, setRevertTarget] = useState<FundMovement[] | null>(null)

  function apply(d: Breakdown) {
    setData(d)
    setSelected(new Set(d.byMovement.filter(m => m.pendingCount > 0).map(m => m.movement)))
    setError(null)
  }

  async function reload() {
    try {
      apply(await getFundDefontanaBreakdown(fundId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle')
    }
  }

  useEffect(() => {
    let cancelled = false
    getFundDefontanaBreakdown(fundId)
      .then(d => { if (!cancelled) apply(d) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fundId])

  function toggle(m: FundMovement) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else             next.add(m)
      return next
    })
  }

  async function runExport() {
    const movements = [...selected]
    if (!movements.length) return
    setExporting(true)
    setError(null)
    setWarnings(null)
    setInfo(null)
    try {
      const { report, settings, itemIds, transferIds } = await getFundDefontanaMovementData(fundId, movements)
      if (!settings.contraAccount) {
        setError('Configura la cuenta Fondos por Rendir en Configuración → Defontana antes de exportar.')
        return
      }
      if (!itemIds.length && !transferIds.length) {
        setError('No hay movimientos pendientes de contabilizar en lo seleccionado.')
        return
      }
      const { buildDefontanaEntries, exportDefontanaAuto } = await import('@/lib/export/defontana')
      const result = buildDefontanaEntries([report], settings)
      const slug   = movements.join('-')
      const vouchers = await exportDefontanaAuto(result, `caja-chica-${slug}-${new Date().toISOString().slice(0, 10)}`)
      if (vouchers > 1) {
        setInfo(`Se generó un ZIP con ${vouchers} comprobantes, uno por archivo — Defontana importa uno por vez.`)
      }
      const w = result.warnings[0]
      if (w) setWarnings({ categories: w.categories, unmappedCLP: w.unmappedCLP })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al exportar')
    } finally {
      setExporting(false)
    }
  }

  async function runConfirm() {
    const movements = [...selected]
    if (!movements.length) return
    setConfirming(true)
    setError(null)
    try {
      await confirmFundDefontana(fundId, movements, comprobante)
      setComprobante('')
      setInfo(null)
      await reload()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar')
    } finally {
      setConfirming(false)
    }
  }

  async function runRevert(reason: string) {
    if (!revertTarget) return
    await revertFundDefontana(fundId, revertTarget, reason)
    setRevertTarget(null)
    await reload()
    onChanged()
  }

  const hasPending = !!data?.byMovement.some(m => selected.has(m.movement) && m.pendingCount > 0)

  return (
    <div className="hoja p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileSpreadsheet size={16} className="text-accent-600" />
        <p className="text-sm font-semibold text-ink-800">Contabilidad Defontana</p>
      </div>
      <p className="text-xs text-ink-500">
        Cada movimiento se contabiliza cuando queda firme, sin esperar a liquidar el fondo.
      </p>

      {loading && <p className="text-xs text-ink-500">Cargando movimientos…</p>}

      {data && data.byMovement.length === 0 && (
        <p className="text-xs text-ink-500">Todavía no hay movimientos para contabilizar.</p>
      )}

      {data && data.byMovement.length > 0 && (
        <div className="space-y-2">
          {data.byMovement.map(m => {
            const allDone = m.pendingCount === 0
            return (
              <label
                key={m.movement}
                className={`flex items-center gap-3 text-sm rounded-item px-2 py-2 border ${allDone ? 'border-accent-100 bg-accent-50/40 opacity-75' : 'border-ink-100 cursor-pointer hover:border-accent-200'}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(m.movement) && !allDone}
                  disabled={allDone}
                  onChange={() => toggle(m.movement)}
                  className="accent-accent-600 w-4 h-4 shrink-0"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-ink-700 font-medium">{LABEL[m.movement]}</span>
                  <span className="block text-[11px] text-ink-400">{HINT[m.movement]}</span>
                </span>
                {allDone ? (
                  <span className="text-xs text-accent-600 font-medium flex items-center gap-1 shrink-0">
                    <BookCheck size={11} /> {m.exportedCount} · {formatCLP(m.exportedCLP)}
                  </span>
                ) : (
                  <span className="text-xs text-ink-500 shrink-0 text-right">
                    {m.pendingCount} pendiente{m.pendingCount !== 1 ? 's' : ''} · {formatCLP(m.pendingCLP)}
                    {m.exportedCount > 0 && (
                      <span className="block text-accent-600">+{m.exportedCount} contabilizados</span>
                    )}
                  </span>
                )}
                {m.exportedCount > 0 && (
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); setRevertTarget([m.movement]) }}
                    title={`Revertir la contabilización de ${LABEL[m.movement].toLowerCase()}`}
                    className="shrink-0 p-1 text-warning-500 hover:text-warning-700 hover:bg-warning-50 rounded-item transition-colors"
                  >
                    <Undo2 size={12} />
                  </button>
                )}
              </label>
            )
          })}
        </div>
      )}

      {warnings && (
        <div className="bg-warning-50 border border-warning-200 rounded-item px-3 py-2 text-xs text-warning-700">
          Sin cuenta Defontana: {warnings.categories.join(', ')}
          {warnings.unmappedCLP > 0 && ` — ${formatCLP(warnings.unmappedCLP)} no incluidos en el asiento`}
        </div>
      )}

      {info && (
        <p className="text-xs text-accent-800 bg-accent-50 border border-accent-200 rounded-item px-3 py-2">{info}</p>
      )}

      {error && (
        <p className="text-xs text-danger-600 bg-danger-50 border border-danger-200 rounded-item px-3 py-2">{error}</p>
      )}

      {data && data.byMovement.length > 0 && (
        <div className="space-y-3 pt-1">
          <button
            onClick={runExport}
            disabled={exporting || confirming || !hasPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-accent-700 bg-white border border-accent-300 hover:bg-accent-50 rounded-item transition-colors disabled:opacity-40"
          >
            {exporting
              ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-accent-500 border-t-transparent rounded-full" /> Generando…</>
              : <><FileSpreadsheet size={13} /> Generar Excel para Defontana</>}
          </button>

          <div className="border-t border-ink-100 pt-3 space-y-2">
            <p className="text-xs font-semibold text-accent-800">Confirmar contabilización</p>
            <p className="text-xs text-ink-500">
              Hacé clic solo después de haber importado el Excel en Defontana exitosamente.
            </p>
            {data.headerRef && (
              <p className="text-xs text-accent-600 font-mono">Último comprobante registrado: {data.headerRef}</p>
            )}
            <input
              type="text"
              placeholder="N° comprobante Defontana (opcional)"
              value={comprobante}
              onChange={e => setComprobante(e.target.value)}
              disabled={exporting || confirming}
              className="campo w-full text-xs focus:ring-1 disabled:opacity-50"
            />
            <button
              onClick={runConfirm}
              disabled={confirming || exporting || !hasPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-accent-600 hover:bg-accent-700 rounded-item transition-colors disabled:opacity-40"
            >
              {confirming
                ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Guardando…</>
                : <><BookCheck size={13} /> Confirmar contabilización</>}
            </button>
          </div>
        </div>
      )}

      {revertTarget && data && (
        <RevertDefontanaDialog
          targetLabel={`${data.fundName} — ${revertTarget.map(m => LABEL[m]).join(', ')}`}
          detail={(() => {
            const count = data.byMovement
              .filter(m => revertTarget.includes(m.movement))
              .reduce((s, m) => s + m.exportedCount, 0)
            return [
              `${count} movimiento${count !== 1 ? 's' : ''}`,
              data.headerRef ? `Comprobante: ${data.headerRef}` : null,
            ].filter(Boolean).join(' · ')
          })()}
          onCancel={() => setRevertTarget(null)}
          onConfirm={runRevert}
        />
      )}
    </div>
  )
}
