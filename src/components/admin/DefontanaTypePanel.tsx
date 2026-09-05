'use client'

import { useEffect, useState } from 'react'
import { FileSpreadsheet, BookCheck, Undo2, X } from 'lucide-react'
import {
  getDefontanaTypeBreakdown,
  getHistoricalFundDefontanaData,
  confirmHistoricalDefontanaByType,
  revertHistoricalFundDefontana,
} from '@/actions/admin'
import { RevertDefontanaDialog } from '@/components/ui/RevertDefontanaDialog'
import { formatCLP } from '@/lib/utils'

type ItemType = 'expense' | 'advance' | 'return' | 'transfer'

const LABEL: Record<ItemType, string> = {
  expense: 'Gastos',
  advance: 'Adelantos',
  return:   'Devoluciones',
  transfer: 'Traspasos',
}

type Breakdown = Awaited<ReturnType<typeof getDefontanaTypeBreakdown>>

interface Props {
  reportId: string
  onClose:  () => void
  /** Se llama tras confirmar o revertir, para que la lista de arriba se refresque. */
  onChanged: () => void
}

/** Flujo Defontana por tipo de ítem para cargas históricas: elegir tipos, generar el
 *  Excel, confirmar con el N° de comprobante y revertir si se contabilizó mal.
 *  Permite llevar gastos y adelantos en comprobantes separados. */
export function DefontanaTypePanel({ reportId, onClose, onChanged }: Props) {
  const [data,     setData]     = useState<Breakdown | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<ItemType>>(new Set())
  const [exporting,   setExporting]   = useState(false)
  const [confirming,  setConfirming]  = useState(false)
  const [comprobante, setComprobante] = useState('')
  const [warnings,    setWarnings]    = useState<{ categories: string[]; unmappedCLP: number } | null>(null)
  const [revertTypes, setRevertTypes] = useState<ItemType[] | null>(null)
  const [info,        setInfo]        = useState<string | null>(null)

  function applyBreakdown(d: Breakdown) {
    setData(d)
    // Preselecciona lo que quedó pendiente de contabilizar
    setSelected(new Set(d.types.filter(t => t.pendingCount > 0).map(t => t.type as ItemType)))
    setError(null)
  }

  /** Relectura tras confirmar o revertir. Se llama desde handlers, nunca desde un effect. */
  async function load() {
    try {
      applyBreakdown(await getDefontanaTypeBreakdown(reportId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle')
    }
  }

  useEffect(() => {
    let cancelled = false
    getDefontanaTypeBreakdown(reportId)
      .then(d => { if (!cancelled) applyBreakdown(d) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reportId])

  function toggle(type: ItemType) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else                next.add(type)
      return next
    })
  }

  async function runExport() {
    const types = [...selected]
    if (!types.length) return
    setExporting(true)
    setWarnings(null)
    setError(null)
    try {
      const { report, settings, itemIds } = await getHistoricalFundDefontanaData(reportId, types)
      if (!settings.contraAccount) {
        setError('Configura la cuenta contraparte en Configuración → Defontana antes de exportar.')
        return
      }
      if (!itemIds.length) {
        setError('No hay ítems pendientes de contabilizar para los tipos seleccionados.')
        return
      }
      const { buildDefontanaEntries, exportDefontanaAuto } = await import('@/lib/export/defontana')
      const result = buildDefontanaEntries([report], settings)

      // Un asiento → un .xlsx; varios → .zip con un archivo por comprobante.
      // Marcar gastos y adelantos juntos, o adelantos de fechas distintas,
      // genera más de un asiento y Defontana no los distingue en un mismo archivo.
      const slug = types.map(t => LABEL[t].toLowerCase()).join('-')
      const vouchers = await exportDefontanaAuto(result, `defontana-${slug}-${new Date().toISOString().slice(0, 10)}`)
      if (vouchers > 1) {
        setError(null)
        setInfo(`Se generó un ZIP con ${vouchers} comprobantes, uno por archivo — Defontana importa uno por vez.`)
      } else {
        setInfo(null)
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
    const types = [...selected]
    if (!types.length) return
    setConfirming(true)
    setError(null)
    try {
      await confirmHistoricalDefontanaByType(reportId, types, comprobante)
      setComprobante('')
      await load()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar')
    } finally {
      setConfirming(false)
    }
  }

  async function runRevert(reason: string) {
    if (!revertTypes) return
    await revertHistoricalFundDefontana(reportId, revertTypes, reason)
    setRevertTypes(null)
    await load()
    onChanged()
  }

  const hasPendingSelected = !!data?.types.some(t => selected.has(t.type as ItemType) && t.pendingCount > 0)

  return (
    <div className="border-t border-accent-100 bg-accent-50 px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-accent-900 flex items-center gap-1.5">
          <FileSpreadsheet size={14} /> Defontana por tipo de ítem
        </h4>
        <button onClick={onClose} className="text-accent-400 hover:text-accent-700 transition-colors">
          <X size={14} />
        </button>
      </div>

      {loading && <p className="text-xs text-ink-500">Cargando detalle…</p>}

      {data?.legacyHeaderOnly && (
        <div className="bg-white border border-accent-200 rounded-item px-3 py-2 text-xs text-ink-600">
          Esta carga se contabilizó completa{data.headerRef ? ` (${data.headerRef})` : ''}, sin separar por tipo.
          Si revertís un tipo, los demás quedan registrados como contabilizados.
        </div>
      )}

      {data && data.types.length === 0 && (
        <p className="text-xs text-ink-500">Sin ítems exportables en esta carga.</p>
      )}

      {data && data.types.length > 0 && (
        <div className="space-y-2">
          {data.types.map(t => {
            const type      = t.type as ItemType
            const allDone   = t.pendingCount === 0
            const isChecked = selected.has(type)
            return (
              <label
                key={type}
                className={`flex items-center gap-3 text-sm rounded-item px-2 py-1.5 bg-white border ${allDone ? 'border-accent-100 opacity-70' : 'border-ink-100 cursor-pointer hover:border-accent-200'}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked && !allDone}
                  disabled={allDone}
                  onChange={() => toggle(type)}
                  className="accent-accent-600 w-4 h-4 shrink-0"
                />
                <span className="flex-1 text-ink-700 font-medium">{LABEL[type]}</span>
                {allDone ? (
                  <span className="text-xs text-accent-600 font-medium flex items-center gap-1">
                    <BookCheck size={11} /> {t.exportedCount} contabilizados · {formatCLP(t.exportedCLP)}
                  </span>
                ) : (
                  <span className="text-xs text-ink-500">
                    {t.pendingCount} pendientes · {formatCLP(t.pendingCLP)}
                    {t.exportedCount > 0 && (
                      <span className="text-accent-600 ml-1">(+{t.exportedCount} ya contabilizados)</span>
                    )}
                  </span>
                )}
                {t.exportedCount > 0 && (
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); setRevertTypes([type]) }}
                    title={`Revertir la contabilización de ${LABEL[type].toLowerCase()} (${t.exportedCount} ítems)`}
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
        <p className="text-xs text-accent-800 bg-white border border-accent-200 rounded-item px-3 py-2">{info}</p>
      )}

      {error && (
        <p className="text-xs text-danger-600 bg-danger-50 border border-danger-200 rounded-item px-3 py-2">{error}</p>
      )}

      {data && data.types.length > 0 && (
        <div className="space-y-3 pt-1">
          <button
            onClick={runExport}
            disabled={exporting || confirming || !hasPendingSelected}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-accent-700 bg-white border border-accent-300 hover:bg-accent-50 rounded-item transition-colors disabled:opacity-40"
          >
            {exporting
              ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-accent-500 border-t-transparent rounded-full" /> Generando…</>
              : <><FileSpreadsheet size={13} /> Generar Excel para Defontana</>}
          </button>

          <div className="border-t border-accent-100 pt-3 space-y-2">
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
              disabled={confirming || exporting || !hasPendingSelected}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-accent-600 hover:bg-accent-700 rounded-item transition-colors disabled:opacity-40"
            >
              {confirming
                ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Guardando…</>
                : <><BookCheck size={13} /> Confirmar contabilización</>}
            </button>
          </div>
        </div>
      )}

      {revertTypes && data && (
        <RevertDefontanaDialog
          targetLabel={`${data.reportTitle} — ${revertTypes.map(t => LABEL[t]).join(', ')}`}
          detail={(() => {
            const count = data.types
              .filter(t => revertTypes.includes(t.type as ItemType))
              .reduce((s, t) => s + t.exportedCount, 0)
            return [
              `${count} ítem${count !== 1 ? 's' : ''}`,
              data.headerRef ? `Comprobante: ${data.headerRef}` : null,
            ].filter(Boolean).join(' · ')
          })()}
          onCancel={() => setRevertTypes(null)}
          onConfirm={runRevert}
        />
      )}
    </div>
  )
}
