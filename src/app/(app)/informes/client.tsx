'use client'

import { useState } from 'react'
import { Search, Download, FileSpreadsheet, X, ChevronDown } from 'lucide-react'
import { getUnifiedReportItems } from '@/actions/reports'
import { buildPeriodRange, computeUnifiedKpis, SOURCE_LABELS, SOURCE_COLORS } from '@/lib/report-helpers'
import { formatCLP, formatDate } from '@/lib/utils'
import type { ReportFilterOptions, UnifiedReportItem, UnifiedReportFilters, UnifiedKpis, PeriodPreset } from '@/lib/report-helpers'

// ─── Constantes ───────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3]

const REPORT_STATUS_OPTS = [
  { value: 'submitted',                  label: 'En revisión',      color: 'bg-blue-100 text-blue-700' },
  { value: 'pending_l2',                 label: 'Revisión N2',       color: 'bg-purple-100 text-purple-700' },
  { value: 'approved',                   label: 'Aprobada',          color: 'bg-emerald-100 text-emerald-700' },
  { value: 'partially_approved',         label: 'Aprobada parcial',  color: 'bg-yellow-100 text-yellow-700' },
  { value: 'rejected',                   label: 'Rechazada',         color: 'bg-red-100 text-red-700' },
  { value: 'reimbursed',                 label: 'Reembolsada',       color: 'bg-slate-100 text-slate-600' },
  { value: 'pending_approval',           label: 'En revisión (CC)',  color: 'bg-blue-100 text-blue-700' },
  { value: 'funds_sent',                 label: 'Fondos enviados',   color: 'bg-cyan-100 text-cyan-700' },
  { value: 'active',                     label: 'Activo',            color: 'bg-teal-100 text-teal-700' },
  { value: 'pending_liquidation_approval', label: 'Liquidación',    color: 'bg-orange-100 text-orange-700' },
  { value: 'settled',                    label: 'Liquidado',         color: 'bg-slate-100 text-slate-600' },
]

const ITEM_STATUS_OPTS = [
  { value: 'pending',  label: 'Pendiente', color: 'bg-amber-100 text-amber-700'   },
  { value: 'approved', label: 'Aprobado',  color: 'bg-emerald-100 text-emerald-700' },
  { value: 'rejected', label: 'Rechazado', color: 'bg-red-100 text-red-700'       },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  filterOptions: ReportFilterOptions
}

// ─── Chip toggle helper ───────────────────────────────────────────────────────

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
}

// ─── Component ───────────────────────────────────────────────────────────────

export function InformesClient({ filterOptions }: Props) {
  // ── Filtros ────────────────────────────────────────────────────────────────
  const [sourceTypes,     setSourceTypes]     = useState<('rendicion' | 'caja_chica')[]>(['rendicion', 'caja_chica'])
  const [dataAge,         setDataAge]         = useState<'new' | 'historical' | 'all'>('all')
  const [periodPreset,    setPeriodPreset]     = useState<PeriodPreset>({ type: 'custom' })
  const [dateFrom,        setDateFrom]        = useState('')
  const [dateTo,          setDateTo]          = useState('')
  const [department,      setDepartment]      = useState('')
  const [empSearch,       setEmpSearch]       = useState('')
  const [selectedEmps,    setSelectedEmps]    = useState<string[]>([])
  const [selectedCats,    setSelectedCats]    = useState<string[]>([])
  const [selectedRends,   setSelectedRends]   = useState<string[]>([])
  const [selectedFondos,  setSelectedFondos]  = useState<string[]>([])
  const [reportStatuses,  setReportStatuses]  = useState<string[]>([])
  const [itemStatuses,    setItemStatuses]    = useState<('pending' | 'approved' | 'rejected')[]>([])
  const [reimb,           setReimb]           = useState<'all' | 'pending' | 'reimbursed'>('all')
  const [defontana,       setDefontana]       = useState<'all' | 'notExported' | 'exported'>('all')

  // ── Resultado ──────────────────────────────────────────────────────────────
  const [items,     setItems]     = useState<UnifiedReportItem[] | null>(null)
  const [kpis,      setKpis]      = useState<UnifiedKpis | null>(null)
  const [searching, setSearching] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)

  // ── Helpers de período ─────────────────────────────────────────────────────
  function applyPreset(preset: PeriodPreset) {
    setPeriodPreset(preset)
    if (preset.type === 'custom') return
    const range = buildPeriodRange(preset)
    if (range) { setDateFrom(range.dateFrom); setDateTo(range.dateTo) }
  }

  // ── Buscar ─────────────────────────────────────────────────────────────────
  async function handleSearch() {
    setSearching(true)
    setError(null)
    setItems(null)
    setKpis(null)
    try {
      const filters: UnifiedReportFilters = {
        sourceTypes,
        dataAge,
        dateFrom:       dateFrom || undefined,
        dateTo:         dateTo   || undefined,
        department:     department || undefined,
        employeeIds:    selectedEmps.length   ? selectedEmps   : undefined,
        categoryIds:    selectedCats.length   ? selectedCats   : undefined,
        reportIds:      selectedRends.length  ? selectedRends  : undefined,
        fundIds:        selectedFondos.length ? selectedFondos : undefined,
        reportStatuses: reportStatuses.length ? reportStatuses : undefined,
        itemStatuses:   itemStatuses.length   ? itemStatuses   : undefined,
        reimb:          reimb     !== 'all' ? reimb     : undefined,
        defontana:      defontana !== 'all' ? defontana : undefined,
      }
      const result = await getUnifiedReportItems(filters)
      setItems(result.items)
      setKpis(computeUnifiedKpis(result.items))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar el informe')
    } finally {
      setSearching(false)
    }
  }

  // ── Exportar ───────────────────────────────────────────────────────────────
  async function handleExport(format: 'excel' | 'pdf') {
    if (!items || !kpis) return
    setExporting(format)
    try {
      const title = 'Informe Gastos'
      if (format === 'excel') {
        const { exportUnifiedToExcel } = await import('@/lib/export/excel')
        exportUnifiedToExcel(items, kpis, 'informe-gastos')
      } else {
        const { exportUnifiedToPDF } = await import('@/lib/export/pdf')
        exportUnifiedToPDF(items, kpis, title)
      }
    } finally {
      setExporting(null)
    }
  }

  // ── Filtrado local de empleados (búsqueda en dropdown) ────────────────────
  const empOptions = filterOptions.employees.filter(e =>
    !empSearch || e.name.toLowerCase().includes(empSearch.toLowerCase())
  )

  const hasResults = items !== null

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div>
        <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink-900">Informes</h1>
        <p className="text-sm text-ink-500 mt-1">Vista unificada de gastos: rendiciones, caja chica, históricos</p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-card p-5 shadow-card space-y-5">

        {/* Fila 1: Fuente + Datos */}
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Fuente</p>
            <div className="flex gap-2">
              {(['rendicion', 'caja_chica'] as const).map(src => (
                <button
                  key={src}
                  onClick={() => setSourceTypes(t => t.includes(src) ? t.filter(x => x !== src) : [...t, src])}
                  className={`px-3 py-1.5 rounded-item text-sm font-semibold transition-colors ${
                    sourceTypes.includes(src)
                      ? 'bg-brand-600 text-white'
                      : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                  }`}
                >
                  {src === 'rendicion' ? 'Rendiciones' : 'Caja Chica'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Datos</p>
            <div className="flex gap-2">
              {([['all','Todos'],['new','Nuevos'],['historical','Histórico']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setDataAge(val)}
                  className={`px-3 py-1.5 rounded-item text-sm font-semibold transition-colors ${
                    dataAge === val ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Fila 2: Período */}
        <div>
          <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Período</p>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => applyPreset({ type: 'custom' })}
              className={`px-3 py-1.5 rounded-item text-sm font-semibold transition-colors ${
                periodPreset.type === 'custom' ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
              }`}
            >
              Personalizado
            </button>
            {YEARS.map(y => (
              <button
                key={y}
                onClick={() => applyPreset({ type: 'year', year: y })}
                className={`px-3 py-1.5 rounded-item text-sm font-semibold transition-colors ${
                  periodPreset.type === 'year' && periodPreset.year === y ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                }`}
              >
                {y}
              </button>
            ))}
            {YEARS.map(y => [1, 2].map(h => (
              <button
                key={`${y}-h${h}`}
                onClick={() => applyPreset({ type: 'semester', year: y, half: h as 1|2 })}
                className={`px-3 py-1.5 rounded-item text-sm font-semibold transition-colors ${
                  periodPreset.type === 'semester' && periodPreset.year === y && periodPreset.half === h ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                }`}
              >
                S{h} {y}
              </button>
            )))}
          </div>
          <div className="flex gap-3 mt-3">
            <div>
              <label className="text-xs text-ink-500 mb-1 block">Desde</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPeriodPreset({ type: 'custom' }) }}
                className="border border-ink-200 rounded-item px-3 py-2 text-sm text-ink-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-ink-500 mb-1 block">Hasta</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPeriodPreset({ type: 'custom' }) }}
                className="border border-ink-200 rounded-item px-3 py-2 text-sm text-ink-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Fila 3: Departamento + Empleados */}
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[180px]">
            <label className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2 block">Departamento</label>
            <select
              value={department}
              onChange={e => setDepartment(e.target.value)}
              className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm text-ink-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Todos</option>
              {filterOptions.departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="min-w-[220px]">
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Empleados</p>
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar empleado..."
                value={empSearch}
                onChange={e => setEmpSearch(e.target.value)}
                className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm text-ink-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {empOptions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                {empOptions.map(e => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedEmps(ids => toggle(ids, e.id))}
                    className={`px-2 py-1 rounded-item text-xs font-medium transition-colors ${
                      selectedEmps.includes(e.id) ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                    }`}
                  >
                    {e.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fila 4: Categorías */}
        {filterOptions.categories.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Categorías</p>
            <div className="flex flex-wrap gap-1.5">
              {filterOptions.categories.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCats(ids => toggle(ids, c.id))}
                  className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors border ${
                    selectedCats.includes(c.id)
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-ink-200 bg-white text-ink-600 hover:border-brand-400'
                  }`}
                  style={!selectedCats.includes(c.id) && c.color ? { borderLeftColor: c.color, borderLeftWidth: 3 } : undefined}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Fila 5: Rendición y Fondo específicos (condicionales) */}
        <div className="flex flex-wrap gap-4">
          {sourceTypes.includes('rendicion') && filterOptions.rendiciones.length > 0 && (
            <div className="min-w-[220px] max-w-xs">
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Rendición específica</p>
              <div className="max-h-28 overflow-y-auto border border-ink-200 rounded-item p-2 space-y-1">
                {filterOptions.rendiciones.map(r => (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRends.includes(r.id)}
                      onChange={() => setSelectedRends(ids => toggle(ids, r.id))}
                      className="accent-brand-600"
                    />
                    <span className="text-xs text-ink-700 truncate">{r.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {sourceTypes.includes('caja_chica') && filterOptions.fondos.length > 0 && (
            <div className="min-w-[220px] max-w-xs">
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Fondo específico</p>
              <div className="max-h-28 overflow-y-auto border border-ink-200 rounded-item p-2 space-y-1">
                {filterOptions.fondos.map(f => (
                  <label key={f.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFondos.includes(f.id)}
                      onChange={() => setSelectedFondos(ids => toggle(ids, f.id))}
                      className="accent-brand-600"
                    />
                    <span className="text-xs text-ink-700 truncate">{f.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Fila 6: Estados del informe */}
        <div>
          <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Estado del informe</p>
          <div className="flex flex-wrap gap-1.5">
            {REPORT_STATUS_OPTS.map(o => (
              <button
                key={o.value}
                onClick={() => setReportStatuses(s => toggle(s, o.value))}
                className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors ${
                  reportStatuses.includes(o.value) ? o.color + ' ring-1 ring-current' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Fila 7: Estado ítem + Reembolso + Defontana */}
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Estado del ítem</p>
            <div className="flex gap-2">
              {ITEM_STATUS_OPTS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setItemStatuses(s => toggle(s, o.value as 'pending'|'approved'|'rejected'))}
                  className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors ${
                    itemStatuses.includes(o.value as 'pending'|'approved'|'rejected') ? o.color : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {sourceTypes.includes('rendicion') && (
            <>
              <div>
                <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Reembolso</p>
                <div className="flex gap-2">
                  {([['all','Todos'],['pending','Pendiente'],['reimbursed','Reembolsado']] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      onClick={() => setReimb(val)}
                      className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors ${
                        reimb === val ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                      }`}
                    >{lbl}</button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Defontana</p>
                <div className="flex gap-2">
                  {([['all','Todos'],['notExported','Sin exportar'],['exported','Exportado']] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      onClick={() => setDefontana(val)}
                      className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors ${
                        defontana === val ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                      }`}
                    >{lbl}</button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Botón de búsqueda */}
        <div className="flex justify-end pt-1">
          <button
            onClick={handleSearch}
            disabled={searching || sourceTypes.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-item text-sm font-semibold transition-colors"
          >
            <Search size={16} />
            {searching ? 'Buscando…' : 'Generar informe'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-card p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Resultados */}
      {hasResults && kpis && (
        <div className="space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-card p-4 shadow-card">
              <p className="text-xs text-ink-500 font-medium">Total ítems</p>
              <p className="text-2xl font-mono-amount font-bold text-ink-900 mt-1">{kpis.totalItems.toLocaleString('es-CL')}</p>
            </div>
            <div className="bg-white rounded-card p-4 shadow-card">
              <p className="text-xs text-ink-500 font-medium">Total CLP</p>
              <p className="text-2xl font-mono-amount font-bold text-ink-900 mt-1">{formatCLP(kpis.totalCLP)}</p>
            </div>
            <div className="bg-white rounded-card p-4 shadow-card">
              <p className="text-xs text-ink-500 font-medium">Monto aprobado</p>
              <p className="text-2xl font-mono-amount font-bold text-emerald-600 mt-1">{formatCLP(kpis.approvedCLP)}</p>
            </div>
            <div className="bg-white rounded-card p-4 shadow-card">
              <p className="text-xs text-ink-500 font-medium mb-2">Por fuente</p>
              <div className="space-y-1">
                {(Object.entries(kpis.bySource) as [keyof typeof kpis.bySource, { count: number; totalCLP: number }][])
                  .filter(([, d]) => d.count > 0)
                  .map(([src, d]) => (
                    <div key={src} className="flex justify-between text-xs">
                      <span className={`px-1.5 py-0.5 rounded ${SOURCE_COLORS[src].bg} ${SOURCE_COLORS[src].text} font-medium`}>
                        {SOURCE_LABELS[src]}
                      </span>
                      <span className="font-mono-amount text-ink-600">{d.count} · {formatCLP(d.totalCLP)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Acciones de export */}
          {items!.length > 0 && (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleExport('excel')}
                disabled={!!exporting}
                className="flex items-center gap-2 px-4 py-2 border border-ink-200 rounded-item text-sm font-semibold text-ink-700 bg-white hover:bg-ink-50 disabled:opacity-50 transition-colors"
              >
                <FileSpreadsheet size={15} />
                {exporting === 'excel' ? 'Generando…' : 'Excel'}
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={!!exporting}
                className="flex items-center gap-2 px-4 py-2 border border-ink-200 rounded-item text-sm font-semibold text-ink-700 bg-white hover:bg-ink-50 disabled:opacity-50 transition-colors"
              >
                <Download size={15} />
                {exporting === 'pdf' ? 'Generando…' : 'PDF'}
              </button>
            </div>
          )}

          {/* Tabla */}
          {items!.length === 0 ? (
            <div className="bg-white rounded-card p-10 text-center text-ink-400 text-sm shadow-card">
              No hay ítems que coincidan con los filtros seleccionados.
            </div>
          ) : (
            <div className="bg-white rounded-card shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-xs text-ink-500 font-semibold uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Fuente</th>
                      <th className="text-left px-4 py-3">Empleado</th>
                      <th className="text-left px-4 py-3">Depto</th>
                      <th className="text-left px-4 py-3">Fondo/Rendición</th>
                      <th className="text-left px-4 py-3">Categoría</th>
                      <th className="text-left px-4 py-3">Descripción</th>
                      <th className="text-left px-4 py-3">Proveedor</th>
                      <th className="text-left px-4 py-3">Fecha</th>
                      <th className="text-right px-4 py-3">Monto CLP</th>
                      <th className="text-left px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items!.map((item, idx) => (
                      <tr key={item.item_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/40'}>
                        <td className="px-4 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${SOURCE_COLORS[item.source].bg} ${SOURCE_COLORS[item.source].text}`}>
                            {SOURCE_LABELS[item.source]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-ink-800 font-medium">{item.employee_name}</td>
                        <td className="px-4 py-2.5 text-ink-500">{item.department ?? '—'}</td>
                        <td className="px-4 py-2.5 text-ink-700 max-w-[160px] truncate" title={item.parent_title}>{item.parent_title}</td>
                        <td className="px-4 py-2.5">
                          {item.category_name ? (
                            <span className="text-xs text-ink-600" style={item.category_color ? { borderLeft: `3px solid ${item.category_color}`, paddingLeft: 6 } : undefined}>
                              {item.category_name}
                            </span>
                          ) : <span className="text-ink-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-ink-700 max-w-[180px] truncate" title={item.description}>{item.description}</td>
                        <td className="px-4 py-2.5 text-ink-500">{item.merchant ?? '—'}</td>
                        <td className="px-4 py-2.5 text-ink-500 whitespace-nowrap">{formatDate(item.date)}</td>
                        <td className="px-4 py-2.5 text-right font-mono-amount text-ink-800">{formatCLP(item.amount_clp)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-item text-xs font-medium ${
                            item.item_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                            item.item_status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {item.item_status === 'approved' ? 'Aprobado' : item.item_status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-ink-100 px-4 py-3 flex justify-between text-xs text-ink-500">
                <span>{items!.length.toLocaleString('es-CL')} ítem{items!.length !== 1 ? 's' : ''}</span>
                <span className="font-mono-amount font-semibold text-ink-800">Total: {formatCLP(kpis.totalCLP)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
