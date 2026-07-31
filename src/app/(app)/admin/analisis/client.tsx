'use client'

import { useState, useMemo } from 'react'
import { Download, ChevronDown, ChevronUp } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import type { CenterExpenseRow } from '@/actions/admin'
import type { CostCenter } from '@/lib/supabase/types'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Props {
  result: { rows: CenterExpenseRow[]; months: string[] }
  costCenters: CostCenter[]
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
  if (id) return id
  return 'Sin centro de costo'
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function AnalisisClient({ result, costCenters: _costCenters }: Props) {
  const { rows, months } = result

  // Celda seleccionada para drill-down
  const [drill, setDrill] = useState<DrillKey>(null)

  // ── Pivot principal ────────────────────────────────────────────────────────
  // pivotMap[centerId][month] = total_clp
  const pivotMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const r of rows) {
      const cid = r.cost_center_id ?? '__null__'
      if (!map[cid]) map[cid] = {}
      map[cid][r.month] = (map[cid][r.month] ?? 0) + r.total_clp
    }
    return map
  }, [rows])

  // Centros ordenados por total desc
  const centers = useMemo(() => {
    const totals: Record<string, { id: string | null; name: string | null; total: number }> = {}
    for (const r of rows) {
      const cid = r.cost_center_id ?? '__null__'
      if (!totals[cid]) totals[cid] = { id: r.cost_center_id, name: r.cost_center_name, total: 0 }
      totals[cid].total += r.total_clp
    }
    return Object.values(totals).sort((a, b) => b.total - a.total)
  }, [rows])

  // Total por mes
  const monthTotals = useMemo(() => {
    const t: Record<string, number> = {}
    for (const r of rows) t[r.month] = (t[r.month] ?? 0) + r.total_clp
    return t
  }, [rows])

  const grandTotal = useMemo(() => rows.reduce((s, r) => s + r.total_clp, 0), [rows])

  // ── Drill-down ─────────────────────────────────────────────────────────────
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

  // ── Export Excel ───────────────────────────────────────────────────────────
  async function handleExport() {
    const XLSX = (await import('xlsx')).default

    // Hoja 1 — Pivot
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

    // Hoja 2 — Detalle por categoría
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

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pivotData),  'Pivot CC')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailData), 'Detalle')

    const now = new Date()
    const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}`
    XLSX.writeFile(wb, `analisis-cc-${stamp}.xlsx`)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (rows.length === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-display font-bold text-slate-800 mb-2">Análisis por Centro de Costo</h1>
        <p className="text-slate-500 text-sm mb-8">Últimos 6 meses — ítems aprobados de rendiciones</p>
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-12 text-center text-slate-400">
          Sin datos para el período seleccionado.
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-800">
            Análisis por Centro de Costo
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Últimos 6 meses · {centers.length} centros · {rows.length} categorías
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-item transition-colors"
        >
          <Download className="w-4 h-4" />
          Exportar Excel
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {months.map(m => (
          <div key={m} className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">{monthLabel(m)}</p>
            <p className="text-lg font-mono-amount font-semibold text-slate-800">{formatCLP(monthTotals[m] ?? 0)}</p>
          </div>
        ))}
      </div>

      {/* Tabla pivot */}
      <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 min-w-[200px]">Centro de costo</th>
                {months.map(m => (
                  <th key={m} className="text-right px-3 py-3 font-semibold text-slate-600 whitespace-nowrap min-w-[110px]">
                    {monthLabel(m)}
                  </th>
                ))}
                <th className="text-right px-4 py-3 font-semibold text-slate-800 whitespace-nowrap min-w-[120px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {centers.map((c) => {
                const cid = c.id ?? '__null__'
                const rowTotal = c.total
                return (
                  <>
                    <tr key={cid} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-medium text-slate-700">
                        <span className="text-xs text-slate-400 mr-1">{c.id ?? '—'}</span>
                        {c.name ?? 'Sin centro de costo'}
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
                                    ? 'bg-teal-100 text-teal-700'
                                    : 'hover:bg-teal-50 text-slate-700 hover:text-teal-700'
                                }`}
                              >
                                {formatCLP(val)}
                                {isDrillOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2.5 text-right font-mono-amount font-semibold text-slate-800 text-xs">
                        {formatCLP(rowTotal)}
                      </td>
                    </tr>

                    {/* Drill-down: categorías para este centro × mes */}
                    {months.map(m => {
                      if (drill?.centerId !== c.id || drill?.month !== m) return null
                      return (
                        <tr key={`drill-${cid}-${m}`} className="bg-teal-50/40 border-b border-teal-100">
                          <td colSpan={months.length + 2} className="px-6 py-3">
                            <p className="text-xs font-semibold text-teal-700 mb-2">
                              Desglose por categoría — {centerLabel(c.id, c.name)} · {monthLabel(m)}
                            </p>
                            <div className="space-y-1">
                              {drillRows.map((r, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-600">{r.category_name ?? 'Sin categoría'}</span>
                                  <span className="font-mono-amount font-medium text-slate-800">{formatCLP(r.total_clp)}</span>
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
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-4 py-3 font-bold text-slate-800">TOTAL</td>
                {months.map(m => (
                  <td key={m} className="px-3 py-3 text-right font-mono-amount font-bold text-slate-800 text-xs">
                    {formatCLP(monthTotals[m] ?? 0)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-mono-amount font-bold text-teal-700">
                  {formatCLP(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
