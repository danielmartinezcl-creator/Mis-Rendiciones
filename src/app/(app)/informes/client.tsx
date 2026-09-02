'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Download, FileSpreadsheet, ChevronDown } from 'lucide-react'
import { getUnifiedReportItems } from '@/actions/reports'
import { buildPeriodRange, computeUnifiedKpis, SOURCE_LABELS, SOURCE_COLORS, MOVEMENT_LABELS } from '@/lib/report-helpers'
import { formatCLP, formatDate } from '@/lib/utils'
import type { ReportFilterOptions, UnifiedReportItem, UnifiedReportFilters, UnifiedKpis, PeriodPreset, UnifiedMovement } from '@/lib/report-helpers'

// ─── Constantes ───────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3]

const REPORT_STATUS_OPTS = [
  { value: 'submitted',                  label: 'En revisión',      color: 'bg-info-100 text-info-700' },
  { value: 'pending_l2',                 label: 'Revisión N2',       color: 'bg-flare-100 text-flare-700' },
  { value: 'approved',                   label: 'Aprobada',          color: 'bg-success-100 text-success-700' },
  { value: 'partially_approved',         label: 'Aprobada parcial',  color: 'bg-warning-100 text-warning-700' },
  { value: 'rejected',                   label: 'Rechazada',         color: 'bg-danger-100 text-danger-700' },
  { value: 'reimbursed',                 label: 'Reembolsada',       color: 'bg-ink-100 text-ink-600' },
  { value: 'pending_approval',           label: 'En revisión (CC)',  color: 'bg-info-100 text-info-700' },
  { value: 'funds_sent',                 label: 'Fondos enviados',   color: 'bg-info-100 text-info-700' },
  { value: 'active',                     label: 'Activo',            color: 'bg-accent-100 text-accent-700' },
  { value: 'pending_liquidation_approval', label: 'Liquidación',    color: 'bg-warning-100 text-warning-700' },
  { value: 'settled',                    label: 'Liquidado',         color: 'bg-ink-100 text-ink-600' },
]

const ITEM_STATUS_OPTS = [
  { value: 'pending',  label: 'Pendiente', color: 'bg-warning-100 text-warning-700'   },
  { value: 'approved', label: 'Aprobado',  color: 'bg-success-100 text-success-700' },
  { value: 'rejected', label: 'Rechazado', color: 'bg-danger-100 text-danger-700'       },
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
  const [departments,      setDepartments]     = useState<string[]>([])
  const [selectedEmps,     setSelectedEmps]    = useState<string[]>([])
  const [empDropdownOpen,  setEmpDropdownOpen] = useState(false)
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false)
  const [empSearchInner,   setEmpSearchInner]  = useState('')
  const [selectedCats,    setSelectedCats]    = useState<string[]>([])
  const [selectedRends,   setSelectedRends]   = useState<string[]>([])
  const [selectedFondos,  setSelectedFondos]  = useState<string[]>([])
  const [reportStatuses,  setReportStatuses]  = useState<string[]>([])
  const [itemStatuses,    setItemStatuses]    = useState<('pending' | 'approved' | 'rejected')[]>([])
  const [movements,       setMovements]       = useState<UnifiedMovement[]>([])
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
        departments:    departments.length ? departments : undefined,
        employeeIds:    selectedEmps.length   ? selectedEmps   : undefined,
        categoryIds:    selectedCats.length   ? selectedCats   : undefined,
        reportIds:      selectedRends.length  ? selectedRends  : undefined,
        fundIds:        selectedFondos.length ? selectedFondos : undefined,
        reportStatuses: reportStatuses.length ? reportStatuses : undefined,
        itemStatuses:   itemStatuses.length   ? itemStatuses   : undefined,
        movements:      movements.length      ? movements      : undefined,
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
    !empSearchInner || e.name.toLowerCase().includes(empSearchInner.toLowerCase())
  )

  const empDropRef  = useRef<HTMLDivElement>(null)
  const deptDropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (empDropRef.current  && !empDropRef.current.contains(e.target as Node))  setEmpDropdownOpen(false)
      if (deptDropRef.current && !deptDropRef.current.contains(e.target as Node)) setDeptDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const hasResults = items !== null

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div>
        <h1 className="font-display font-extrabold text-2xl tracking-tight tor-on-gradient">Informes</h1>
        <p className="text-sm tor-on-gradient-soft mt-1">Vista unificada de gastos: rendiciones, caja chica, históricos</p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-card p-5 shadow-card space-y-5">

        {/* Fila 1: Fuente + Datos */}
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="card-meta font-semibold text-ink-500 mb-2">Fuente</p>
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
            <p className="card-meta font-semibold text-ink-500 mb-2">Datos</p>
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
          <p className="card-meta font-semibold text-ink-500 mb-2">Período</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-ink-500 mb-1 block">Seleccionar período</label>
              <select
                value={
                  periodPreset.type === 'custom'   ? 'custom'
                  : periodPreset.type === 'year'   ? `year-${periodPreset.year}`
                  : `s${periodPreset.half}-${periodPreset.year}`
                }
                onChange={e => {
                  const v = e.target.value
                  if (v === 'custom') { applyPreset({ type: 'custom' }); return }
                  if (v.startsWith('year-')) { applyPreset({ type: 'year', year: parseInt(v.slice(5)) }); return }
                  const parts = v.split('-')
                  applyPreset({ type: 'semester', year: parseInt(parts[1]), half: parseInt(parts[0].slice(1)) as 1|2 })
                }}
                className="border border-ink-200 rounded-item px-3 py-2 text-sm text-ink-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="custom">Personalizado</option>
                <optgroup label="Año completo">
                  {YEARS.map(y => <option key={y} value={`year-${y}`}>{y}</option>)}
                </optgroup>
                <optgroup label="Semestre">
                  {YEARS.flatMap(y => [1, 2].map(h => (
                    <option key={`s${h}-${y}`} value={`s${h}-${y}`}>S{h} {y}</option>
                  )))}
                </optgroup>
              </select>
            </div>
            {periodPreset.type === 'custom' && (
              <>
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
              </>
            )}
            {periodPreset.type !== 'custom' && dateFrom && dateTo && (
              <p className="text-xs text-ink-400 pb-2">{dateFrom} → {dateTo}</p>
            )}
          </div>
        </div>

        {/* Fila 3: Departamento + Empleados */}
        <div className="flex flex-wrap gap-4">

          {/* Departamento — multi-select dropdown */}
          {filterOptions.departments.length > 0 && (
            <div className="min-w-[180px]" ref={deptDropRef}>
              <label className="card-meta font-semibold text-ink-500 mb-2 block">Departamento</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setDeptDropdownOpen(o => !o); setEmpDropdownOpen(false) }}
                  className="w-full flex items-center justify-between border border-ink-200 rounded-item px-3 py-2 text-sm bg-white hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
                >
                  <span className={departments.length ? 'text-ink-800' : 'text-ink-400'}>
                    {departments.length === 0 ? 'Todos' : `${departments.length} seleccionado${departments.length !== 1 ? 's' : ''}`}
                  </span>
                  <ChevronDown size={13} className={`text-ink-400 transition-transform ${deptDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {deptDropdownOpen && (
                  <div className="absolute z-50 top-full mt-1 w-full min-w-[200px] bg-white border border-ink-200 rounded-item shadow-lg">
                    <div className="max-h-52 overflow-y-auto p-1">
                      {filterOptions.departments.map(d => (
                        <label key={d} className="flex items-center gap-2.5 px-3 py-2 hover:bg-ink-50 cursor-pointer rounded-item">
                          <input
                            type="checkbox"
                            checked={departments.includes(d)}
                            onChange={() => setDepartments(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                            className="accent-brand-600 w-3.5 h-3.5 shrink-0"
                          />
                          <span className="text-sm text-ink-700">{d}</span>
                        </label>
                      ))}
                    </div>
                    {departments.length > 0 && (
                      <div className="border-t border-ink-100 px-3 py-2">
                        <button type="button" onClick={() => setDepartments([])} className="text-xs text-ink-400 hover:text-ink-600">
                          Limpiar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empleados — multi-select dropdown con búsqueda */}
          <div className="min-w-[220px]" ref={empDropRef}>
            <p className="card-meta font-semibold text-ink-500 mb-2">Empleados</p>
            <div className="relative">
              <button
                type="button"
                onClick={() => { setEmpDropdownOpen(o => !o); setDeptDropdownOpen(false) }}
                className="w-full flex items-center justify-between border border-ink-200 rounded-item px-3 py-2 text-sm bg-white hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
              >
                <span className={selectedEmps.length ? 'text-ink-800' : 'text-ink-400'}>
                  {selectedEmps.length === 0 ? 'Todos los empleados' : `${selectedEmps.length} seleccionado${selectedEmps.length !== 1 ? 's' : ''}`}
                </span>
                <ChevronDown size={13} className={`text-ink-400 transition-transform ${empDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {empDropdownOpen && (
                <div className="absolute z-50 top-full mt-1 w-full min-w-[240px] bg-white border border-ink-200 rounded-item shadow-lg">
                  <div className="p-2 border-b border-ink-100">
                    <input
                      type="text"
                      placeholder="Buscar empleado..."
                      value={empSearchInner}
                      onChange={e => setEmpSearchInner(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-500"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto p-1">
                    {empOptions.map(e => (
                      <label key={e.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-ink-50 cursor-pointer rounded-item">
                        <input
                          type="checkbox"
                          checked={selectedEmps.includes(e.id)}
                          onChange={() => setSelectedEmps(ids => toggle(ids, e.id))}
                          className="accent-brand-600 w-3.5 h-3.5 shrink-0"
                        />
                        <span className="text-sm text-ink-700">{e.name}</span>
                      </label>
                    ))}
                    {empOptions.length === 0 && (
                      <p className="text-xs text-ink-400 text-center py-3">Sin resultados</p>
                    )}
                  </div>
                  {selectedEmps.length > 0 && (
                    <div className="border-t border-ink-100 px-3 py-2">
                      <button type="button" onClick={() => setSelectedEmps([])} className="text-xs text-ink-400 hover:text-ink-600">
                        Limpiar selección
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Fila 4: Categorías */}
        {filterOptions.categories.length > 0 && (
          <div>
            <p className="card-meta font-semibold text-ink-500 mb-2">Categorías</p>
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
              <p className="card-meta font-semibold text-ink-500 mb-2">Rendición específica</p>
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
              <p className="card-meta font-semibold text-ink-500 mb-2">Fondo específico</p>
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
          <p className="card-meta font-semibold text-ink-500 mb-2">Estado del informe</p>
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

        {/* Fila 7: Movimiento + Estado ítem + Reembolso + Defontana */}
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="card-meta font-semibold text-ink-500 mb-2">Movimiento</p>
            <div className="flex gap-2">
              {(['expense', 'advance', 'return', 'transfer'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMovements(s => toggle(s, m))}
                  className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors ${
                    movements.includes(m) ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                  }`}
                >
                  {MOVEMENT_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="card-meta font-semibold text-ink-500 mb-2">Estado del ítem</p>
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
                <p className="card-meta font-semibold text-ink-500 mb-2">Reembolso</p>
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
                <p className="card-meta font-semibold text-ink-500 mb-2">Defontana</p>
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
        <div className="bg-danger-50 border border-danger-200 rounded-card p-4 text-sm text-danger-700">{error}</div>
      )}

      {/* Resultados */}
      {hasResults && kpis && (
        <div className="space-y-4">
          {/* KPI cards — el gasto es el número principal; adelantos, devoluciones
              y traspasos son movimientos de fondos y no se suman al gasto */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-card p-4 shadow-card">
              <p className="text-xs text-ink-500 font-medium">Gastos aprobados</p>
              <p className="text-2xl font-mono-amount font-bold text-success-600 mt-1">{formatCLP(kpis.byMovement.expense.approvedCLP)}</p>
              <p className="text-xs text-ink-400 mt-0.5">{kpis.byMovement.expense.count.toLocaleString('es-CL')} ítems de gasto</p>
            </div>
            <div className="bg-white rounded-card p-4 shadow-card">
              <p className="text-xs text-ink-500 font-medium mb-2">Movimientos de fondos</p>
              <div className="space-y-1">
                {(['advance', 'return', 'transfer'] as const)
                  .filter(m => kpis.byMovement[m].count > 0)
                  .map(m => (
                    <div key={m} className="flex justify-between text-xs">
                      <span className="text-ink-500">{MOVEMENT_LABELS[m]}</span>
                      <span className="font-mono-amount text-ink-600">
                        {kpis.byMovement[m].count} · {formatCLP(kpis.byMovement[m].totalCLP)}
                      </span>
                    </div>
                  ))}
                {(['advance', 'return', 'transfer'] as const).every(m => kpis.byMovement[m].count === 0) && (
                  <p className="text-xs text-ink-400">Sin movimientos en el período</p>
                )}
              </div>
              <p className="text-[11px] text-ink-400 mt-2 leading-tight">No se suman al gasto</p>
            </div>
            <div className="bg-white rounded-card p-4 shadow-card">
              <p className="text-xs text-ink-500 font-medium">Total ítems</p>
              <p className="text-2xl font-mono-amount font-bold text-ink-900 mt-1">{kpis.totalItems.toLocaleString('es-CL')}</p>
              <p className="text-xs text-ink-400 mt-0.5">{formatCLP(kpis.totalCLP)} en total</p>
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
                    <tr className="border-b border-ink-100 text-[13px] text-ink-500 font-semibold">
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
                            item.item_status === 'approved' ? 'bg-success-100 text-success-700' :
                            item.item_status === 'rejected' ? 'bg-danger-100 text-danger-700' :
                            'bg-warning-100 text-warning-700'
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
