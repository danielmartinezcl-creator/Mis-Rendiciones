'use client'

import { useState, useMemo, useTransition } from 'react'
import { Download, ChevronDown, ChevronUp, AlertTriangle, Check, ExternalLink } from 'lucide-react'
import { formatCLP, formatDate } from '@/lib/utils'
import { updateExpenseItemCostCenter } from '@/actions/admin'
import type { CenterExpenseRow, ItemWithoutCC } from '@/actions/admin'
import type { CostCenter } from '@/lib/supabase/types'
import Link from 'next/link'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Props {
  result:         { rows: CenterExpenseRow[]; months: string[] }
  itemsWithoutCC: ItemWithoutCC[]
  costCenters:    CostCenter[]
}

type DrillKey = { centerId: string | null; month: string } | null

// ─── Helpers ─────────────────────────────────────────────────────────────────

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[parseInt(m) - 1]} ${y}`
}

function centerLabel(id: string | null, name: string | null): string {
  if (name) return name
  if (id)   return id
  return 'Sin centro de costo'
}

// ─── Sub-componente: panel de ítems sin CC ────────────────────────────────────

function ItemsWithoutCCPanel({ items, costCenters }: { items: ItemWithoutCC[]; costCenters: CostCenter[] }) {
  const [open,     setOpen]     = useState(false)
  const [pending,  startTrans]  = useTransition()
  const [saved,    setSaved]    = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [error,    setError]    = useState<string | null>(null)

  const imputables = costCenters.filter(c => c.imputable && c.activo)

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-success-50 border border-success-200 rounded-item px-4 py-2.5">
        <Check size={14} className="text-success-600 shrink-0" />
        <p className="text-sm text-success-700 font-medium">
          Todos los gastos tienen centro de costo asignado (directo o por herencia del empleado).
        </p>
      </div>
    )
  }

  const totalSinCC = items.reduce((s, i) => s + i.amount_clp, 0)

  function handleAssign(itemId: string, ccId: string) {
    setError(null)
    startTrans(async () => {
      try {
        await updateExpenseItemCostCenter(itemId, ccId || null)
        setSaved(prev => new Set([...prev, itemId]))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al guardar')
      }
    })
  }

  return (
    <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] overflow-hidden">
      {/* Header colapsable */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-warning-50/60 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <AlertTriangle size={16} className="text-warning-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-warning-800">
              {items.length} gasto{items.length !== 1 ? 's' : ''} sin centro de costo — {formatCLP(totalSinCC)}
            </p>
            <p className="text-xs text-warning-600 mt-0.5">
              Ítems aprobados donde ni el gasto ni el empleado tienen CC asignado. Asígnalos para que aparezcan en el análisis.
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={15} className="text-warning-500 shrink-0" /> : <ChevronDown size={15} className="text-warning-500 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-warning-100">
          {error && (
            <div className="mx-4 mt-3 bg-danger-50 border border-danger-200 text-danger-700 text-xs rounded-item px-3 py-2">
              {error}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-warning-100 bg-warning-50/40">
                  <th className="text-left px-4 py-2 font-semibold text-ink-600">Fecha</th>
                  <th className="text-left px-4 py-2 font-semibold text-ink-600">Descripción / Proveedor</th>
                  <th className="text-left px-4 py-2 font-semibold text-ink-600">Empleado</th>
                  <th className="text-left px-4 py-2 font-semibold text-ink-600">Rendición</th>
                  <th className="text-left px-4 py-2 font-semibold text-ink-600">Categoría</th>
                  <th className="text-right px-4 py-2 font-semibold text-ink-600">Monto</th>
                  <th className="px-4 py-2 font-semibold text-ink-600 min-w-[180px]">Asignar CC</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const isSaved = saved.has(item.id)
                  return (
                    <tr key={item.id} className={`border-b border-ink-50 ${isSaved ? 'bg-success-50/60' : 'hover:bg-warning-50/30'}`}>
                      <td className="px-4 py-2 text-ink-500 whitespace-nowrap">
                        {formatDate(item.date)}
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-medium text-ink-700 truncate max-w-[200px]" title={item.description}>
                          {item.description}
                        </p>
                        {item.merchant && (
                          <p className="text-ink-400 truncate max-w-[200px]">{item.merchant}</p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-ink-600 whitespace-nowrap">
                        {item.employee_name}
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/admin/reports`}
                          className="text-brand-600 hover:underline flex items-center gap-1 whitespace-nowrap"
                          title={item.report_title}
                        >
                          <span className="truncate max-w-[120px]">{item.report_title}</span>
                          <ExternalLink size={10} className="shrink-0" />
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-ink-500">
                        {item.category_name ?? <span className="text-ink-300">Sin cat.</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-mono-amount font-semibold text-ink-800 whitespace-nowrap">
                        {formatCLP(item.amount_clp)}
                      </td>
                      <td className="px-4 py-2">
                        {isSaved ? (
                          <span className="flex items-center gap-1 text-success-600 font-medium">
                            <Check size={12} />
                            Guardado
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={selected[item.id] ?? ''}
                              onChange={e => setSelected(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className="campo-compacto flex-1"
                            >
                              <option value="">Seleccionar…</option>
                              {imputables.map(cc => (
                                <option key={cc.id} value={cc.id}>{cc.id} — {cc.descripcion}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleAssign(item.id, selected[item.id] ?? '')}
                              disabled={!selected[item.id] || pending}
                              className="btn-primario px-2 py-1 text-xs whitespace-nowrap"
                            >
                              Asignar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-warning-50/30 text-xs text-warning-700 border-t border-warning-100">
            Tip: También podés ir a <strong>Admin → Empleados</strong> y asignar un centro de costo por defecto al empleado — todos sus gastos futuros lo heredarán automáticamente.
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function AnalisisClient({ result, itemsWithoutCC, costCenters }: Props) {
  const { rows, months } = result

  const [drill, setDrill] = useState<DrillKey>(null)

  const pivotMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const r of rows) {
      const cid = r.cost_center_id ?? '__null__'
      if (!map[cid]) map[cid] = {}
      map[cid][r.month] = (map[cid][r.month] ?? 0) + r.total_clp
    }
    return map
  }, [rows])

  const centers = useMemo(() => {
    const totals: Record<string, { id: string | null; name: string | null; total: number }> = {}
    for (const r of rows) {
      const cid = r.cost_center_id ?? '__null__'
      if (!totals[cid]) totals[cid] = { id: r.cost_center_id, name: r.cost_center_name, total: 0 }
      totals[cid].total += r.total_clp
    }
    return Object.values(totals).sort((a, b) => b.total - a.total)
  }, [rows])

  const monthTotals = useMemo(() => {
    const t: Record<string, number> = {}
    for (const r of rows) t[r.month] = (t[r.month] ?? 0) + r.total_clp
    return t
  }, [rows])

  const grandTotal = useMemo(() => rows.reduce((s, r) => s + r.total_clp, 0), [rows])

  const drillRows = useMemo(() => {
    if (!drill) return []
    const cid = drill.centerId
    return rows
      .filter(r => (r.cost_center_id ?? null) === cid && r.month === drill.month)
      .sort((a, b) => b.total_clp - a.total_clp)
  }, [drill, rows])

  function toggleDrill(centerId: string | null, month: string) {
    const same = drill?.centerId === centerId && drill?.month === month
    setDrill(same ? null : { centerId, month })
  }

  async function handleExport() {
    const XLSX = (await import('xlsx')).default

    const pivotData: unknown[][] = [
      ['Centro de Costo', ...months.map(monthLabel), 'Total'],
      ...centers.map(c => {
        const cid = c.id ?? '__null__'
        return [
          centerLabel(c.id, c.name),
          ...months.map(m => pivotMap[cid]?.[m] ?? 0),
          c.total,
        ]
      }),
      ['TOTAL', ...months.map(m => monthTotals[m] ?? 0), grandTotal],
    ]

    const detailData: unknown[][] = [
      ['Centro de Costo', 'Mes', 'Categoría', 'Total CLP'],
      ...rows
        .sort((a, b) => (a.cost_center_name ?? '').localeCompare(b.cost_center_name ?? ''))
        .map(r => [
          centerLabel(r.cost_center_id, r.cost_center_name),
          monthLabel(r.month),
          r.category_name ?? 'Sin categoría',
          r.total_clp,
        ]),
    ]

    const sinCCData: unknown[][] = [
      ['Fecha', 'Descripción', 'Proveedor', 'Empleado', 'Rendición', 'Categoría', 'Monto CLP'],
      ...itemsWithoutCC.map(i => [
        i.date, i.description, i.merchant ?? '', i.employee_name, i.report_title, i.category_name ?? '', i.amount_clp,
      ]),
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pivotData),  'Pivot CC')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailData), 'Detalle')
    if (itemsWithoutCC.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sinCCData), 'Sin CC ⚠')
    }

    const now = new Date()
    const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}`
    XLSX.writeFile(wb, `analisis-cc-${stamp}.xlsx`)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tor-on-gradient">
            Análisis por Centro de Costo
          </h1>
          <p className="tor-on-gradient-soft text-sm mt-1">
            Últimos 6 meses · solo gastos reales (excluye adelantos y devoluciones) · con herencia de CC del empleado
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white text-sm font-semibold rounded-item transition-colors shrink-0"
        >
          <Download className="w-4 h-4" />
          Exportar Excel
        </button>
      </div>

      {/* Panel ítems sin CC */}
      <ItemsWithoutCCPanel items={itemsWithoutCC} costCenters={costCenters} />

      {rows.length === 0 ? (
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-12 text-center text-ink-400">
          Sin datos de gastos para el período seleccionado.
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {months.map(m => (
              <div key={m} className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4">
                <p className="card-meta text-ink-400 font-semibold mb-1">{monthLabel(m)}</p>
                <p className="text-lg font-mono-amount font-semibold text-ink-800">{formatCLP(monthTotals[m] ?? 0)}</p>
              </div>
            ))}
          </div>

          {/* Tabla pivot */}
          <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100">
                    <th className="text-left px-4 py-3 font-semibold text-ink-600 min-w-[200px]">Centro de costo</th>
                    {months.map(m => (
                      <th key={m} className="text-right px-3 py-3 font-semibold text-ink-600 whitespace-nowrap min-w-[110px]">
                        {monthLabel(m)}
                      </th>
                    ))}
                    <th className="text-right px-4 py-3 font-semibold text-ink-800 whitespace-nowrap min-w-[120px]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {centers.map((c) => {
                    const cid = c.id ?? '__null__'
                    return (
                      <>
                        <tr key={cid} className="border-b border-ink-50 hover:bg-ink-50/60">
                          <td className="px-4 py-2.5 font-medium text-ink-700">
                            {c.id ? (
                              <>
                                <span className="text-xs text-ink-400 mr-1">{c.id}</span>
                                {c.name ?? c.id}
                              </>
                            ) : (
                              <span className="text-ink-400 italic text-xs">Sin centro de costo</span>
                            )}
                          </td>
                          {months.map(m => {
                            const val = pivotMap[cid]?.[m] ?? 0
                            const isDrillOpen = drill?.centerId === c.id && drill?.month === m
                            return (
                              <td key={m} className="px-3 py-2.5 text-right">
                                {val > 0 ? (
                                  <button
                                    onClick={() => toggleDrill(c.id, m)}
                                    className={`font-mono-amount text-xs px-2 py-1 rounded transition-colors inline-flex items-center gap-1 ${
                                      isDrillOpen
                                        ? 'bg-accent-100 text-accent-700'
                                        : 'hover:bg-accent-50 text-ink-700 hover:text-accent-700'
                                    }`}
                                  >
                                    {formatCLP(val)}
                                    {isDrillOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  </button>
                                ) : (
                                  <span className="text-ink-300 text-xs">—</span>
                                )}
                              </td>
                            )
                          })}
                          <td className="px-4 py-2.5 text-right font-mono-amount font-semibold text-ink-800 text-xs">
                            {formatCLP(c.total)}
                          </td>
                        </tr>

                        {/* Drill-down */}
                        {months.map(m => {
                          if (drill?.centerId !== c.id || drill?.month !== m) return null
                          return (
                            <tr key={`drill-${cid}-${m}`} className="bg-accent-50/40 border-b border-accent-100">
                              <td colSpan={months.length + 2} className="px-6 py-3">
                                <p className="text-xs font-semibold text-accent-700 mb-2">
                                  Desglose por categoría — {centerLabel(c.id, c.name)} · {monthLabel(m)}
                                </p>
                                <div className="space-y-2">
                                  {drillRows.map((r, i) => (
                                    <div key={i} className="flex items-center gap-4 text-xs">
                                      <span className="text-ink-600 w-40 truncate shrink-0">{r.category_name ?? 'Sin categoría'}</span>
                                      <span className="font-mono-amount font-medium text-ink-800 w-28 text-right shrink-0">{formatCLP(r.total_clp)}</span>
                                      {r.monthly_budget_clp ? (
                                        <div className="min-w-[120px] flex-1">
                                          <div className="flex justify-between text-xs mb-1">
                                            <span className="font-medium text-ink-600">
                                              {Math.round((r.total_clp / r.monthly_budget_clp) * 100)}%
                                            </span>
                                            <span className="text-ink-400">{formatCLP(r.monthly_budget_clp)}</span>
                                          </div>
                                          <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full transition-all ${
                                                r.total_clp > r.monthly_budget_clp ? 'bg-danger-500' :
                                                r.total_clp > r.monthly_budget_clp * 0.8 ? 'bg-warning-500' : 'bg-brand-500'
                                              }`}
                                              style={{ width: `${Math.min(100, (r.total_clp / r.monthly_budget_clp) * 100)}%` }}
                                            />
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-ink-300 text-xs">—</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-200 bg-ink-50">
                    <td className="px-4 py-3 font-bold text-ink-800">TOTAL</td>
                    {months.map(m => (
                      <td key={m} className="px-3 py-3 text-right font-mono-amount font-bold text-ink-800 text-xs">
                        {formatCLP(monthTotals[m] ?? 0)}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-mono-amount font-bold text-accent-700">
                      {formatCLP(grandTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
