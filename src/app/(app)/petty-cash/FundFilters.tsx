'use client'

import React from 'react'
import { Filter, BarChart2, ChevronDown, Search } from 'lucide-react'
import { buildPeriodRange } from '@/lib/report-helpers'
import type { PeriodPreset } from '@/lib/report-helpers'
import { formatCLP } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import type { Category, ReportResult } from './usePettyCashState'
import { toggle_ids } from './usePettyCashState'

const FUND_STATUSES = [
  { value: 'all',                        label: 'Todos' },
  { value: 'draft',                      label: 'Borrador' },
  { value: 'pending_approval',           label: 'En revisión' },
  { value: 'approved',                   label: 'Aprobado' },
  { value: 'funds_sent',                 label: 'Fondos enviados' },
  { value: 'active',                     label: 'Activo' },
  { value: 'pending_liquidation_approval', label: 'Liquidación' },
  { value: 'settled',                    label: 'Liquidado' },
  { value: 'rejected',                   label: 'Rechazado' },
]

const CURRENT_YEAR = new Date().getFullYear()

export interface FundFiltersProps {
  isManager:          boolean
  initialCategories:  Category[]
  employees:          { id: string; name: string }[]
  // List filters
  statusFilter:           string
  dateFrom:               string
  dateTo:                 string
  selectedEmpIds_list:    string[]
  periodPreset_list:      PeriodPreset
  empDropdownOpen:        boolean
  catDropdownOpen:        boolean
  activeFilters:          boolean
  // Report search
  reportDateFrom:   string
  reportDateTo:     string
  selectedCatIds:   string[]
  itemStatusFilter: 'all' | 'pending' | 'approved' | 'rejected'
  loadingSearch:    boolean
  generating:       boolean
  reportData:       ReportResult | null
  reportError:      string | null
  // Setters
  setStatusFilter:        (v: string) => void
  setDateFrom:            (v: string) => void
  setDateTo:              (v: string) => void
  setSelectedEmpIds_list: React.Dispatch<React.SetStateAction<string[]>>
  setPeriodPreset_list:   (v: PeriodPreset) => void
  setEmpDropdownOpen:     React.Dispatch<React.SetStateAction<boolean>>
  setCatDropdownOpen:     React.Dispatch<React.SetStateAction<boolean>>
  setReportDateFrom:      (v: string) => void
  setReportDateTo:        (v: string) => void
  setItemStatusFilter:    (v: 'all' | 'pending' | 'approved' | 'rejected') => void
  // Handlers
  toggleCat:          (id: string) => void
  clearListFilters:   () => void
  clearSearchFilters: () => void
  fetchReportItems:   () => Promise<void>
  handleExport:       (format: 'excel' | 'pdf') => Promise<void>
}

export function FundFilters({
  isManager,
  initialCategories,
  employees,
  statusFilter, setStatusFilter,
  dateFrom, setDateFrom,
  dateTo, setDateTo,
  selectedEmpIds_list, setSelectedEmpIds_list,
  periodPreset_list, setPeriodPreset_list,
  empDropdownOpen, setEmpDropdownOpen,
  catDropdownOpen, setCatDropdownOpen,
  activeFilters,
  reportDateFrom, setReportDateFrom,
  reportDateTo, setReportDateTo,
  selectedCatIds,
  itemStatusFilter, setItemStatusFilter,
  loadingSearch,
  reportData,
  reportError,
  toggleCat,
  clearListFilters,
  clearSearchFilters,
  fetchReportItems,
}: FundFiltersProps) {
  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      {/* ── Sección 1: Filtros de lista (siempre visible) ── */}
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter size={13} className="text-ink-400" />
            <span className="card-label font-bold text-ink-700">Filtros de lista</span>
          </div>
          {activeFilters && (
            <button
              onClick={clearListFilters}
              className="text-xs text-brand-600 hover:text-brand-700 underline"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Chips de estado */}
        <div className="flex gap-1.5 flex-wrap">
          {FUND_STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={[
                'px-3 py-1 rounded-item text-xs font-semibold transition-colors border',
                statusFilter === s.value
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-ink-600 border-ink-200 hover:border-brand-300',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Período */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1">Período desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPeriodPreset_list({ type: 'custom' }) }}
              className="w-full border border-ink-200 rounded-item px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1">Período hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPeriodPreset_list({ type: 'custom' }) }}
              className="w-full border border-ink-200 rounded-item px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
        </div>

        {/* Período shortcuts */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-ink-400 mr-1">Acceso rápido:</span>
          {[CURRENT_YEAR, CURRENT_YEAR - 1].map(y => (
            <button
              key={y}
              onClick={() => {
                const range = buildPeriodRange({ type: 'year', year: y })
                if (range) { setDateFrom(range.dateFrom); setDateTo(range.dateTo); setPeriodPreset_list({ type: 'year', year: y }) }
              }}
              className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors ${
                periodPreset_list.type === 'year' && (periodPreset_list as { type: 'year'; year: number }).year === y
                  ? 'bg-brand-600 text-white'
                  : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
              }`}
            >
              {y}
            </button>
          ))}
          {[1, 2].map(h => (
            <button
              key={h}
              onClick={() => {
                const range = buildPeriodRange({ type: 'semester', year: CURRENT_YEAR, half: h as 1 | 2 })
                if (range) { setDateFrom(range.dateFrom); setDateTo(range.dateTo); setPeriodPreset_list({ type: 'semester', year: CURRENT_YEAR, half: h as 1 | 2 }) }
              }}
              className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors ${
                periodPreset_list.type === 'semester' && (periodPreset_list as { type: 'semester'; year: number; half: 1 | 2 }).half === h
                  ? 'bg-brand-600 text-white'
                  : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
              }`}
            >
              S{h} {CURRENT_YEAR}
            </button>
          ))}
        </div>

        {/* Empleado (dropdown colapsable) */}
        {employees.length > 1 && (
          <div>
            <button
              type="button"
              onClick={() => setEmpDropdownOpen(v => !v)}
              className="flex items-center justify-between w-full text-xs font-medium text-ink-500 hover:text-ink-700 transition-colors"
            >
              <span>
                Empleado
                {selectedEmpIds_list.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded-full font-semibold">
                    {selectedEmpIds_list.length}
                  </span>
                )}
              </span>
              <ChevronDown size={13} className={`transition-transform ${empDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {empDropdownOpen && (
              <div className="mt-2 border border-ink-200 rounded-item bg-white max-h-44 overflow-y-auto divide-y divide-ink-50">
                {employees.map(emp => {
                  const checked = selectedEmpIds_list.includes(emp.id)
                  return (
                    <label key={emp.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-ink-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedEmpIds_list(ids => toggle_ids(ids, emp.id))}
                        className="accent-brand-600 w-3.5 h-3.5"
                      />
                      <span className={`text-sm ${checked ? 'font-medium text-ink-800' : 'text-ink-600'}`}>{emp.name}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Sección 2: Búsqueda de ítems (solo managers, separada con borde) ── */}
      {isManager && (
        <div className="border-t border-ink-100 p-5 space-y-4 bg-ink-50/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 size={13} className="text-ink-400" />
              <span className="card-label font-bold text-ink-700">Búsqueda de ítems</span>
              <span className="text-xs text-ink-400">— busca gastos dentro de los fondos</span>
            </div>
            {(reportDateFrom || reportDateTo || selectedCatIds.length > 0 || itemStatusFilter !== 'all') && (
              <button
                onClick={clearSearchFilters}
                className="text-xs text-ink-400 hover:text-ink-600 underline"
              >
                Limpiar
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1">Fecha desde</label>
              <input
                type="date"
                value={reportDateFrom}
                onChange={e => setReportDateFrom(e.target.value)}
                className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1">Fecha hasta</label>
              <input
                type="date"
                value={reportDateTo}
                onChange={e => setReportDateTo(e.target.value)}
                className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-ink-600 mb-1">Estado del ítem</label>
              <div className="flex gap-2 flex-wrap">
                {(['all', 'approved', 'pending', 'rejected'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setItemStatusFilter(s)}
                    className={[
                      'px-3 py-1.5 rounded-item text-xs font-semibold transition-colors border',
                      itemStatusFilter === s
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-ink-600 border-ink-200 hover:border-brand-300',
                    ].join(' ')}
                  >
                    {s === 'all' ? 'Todos' : s === 'approved' ? 'Aprobados' : s === 'pending' ? 'Pendientes' : 'Rechazados'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Categorías (dropdown colapsable) */}
          <div>
            <button
              type="button"
              onClick={() => setCatDropdownOpen(v => !v)}
              className="flex items-center justify-between w-full text-xs font-semibold text-ink-600 hover:text-ink-800 transition-colors"
            >
              <span>
                Categoría
                {selectedCatIds.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded-full font-semibold">
                    {selectedCatIds.length}
                  </span>
                )}
              </span>
              <ChevronDown size={13} className={`transition-transform ${catDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {catDropdownOpen && (
              <div className="mt-2 border border-ink-200 rounded-item bg-white max-h-44 overflow-y-auto divide-y divide-ink-50">
                {initialCategories.map(cat => {
                  const checked = selectedCatIds.includes(cat.id)
                  return (
                    <label key={cat.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-ink-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCat(cat.id)}
                        className="accent-brand-600 w-3.5 h-3.5"
                      />
                      {cat.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.color }} />}
                      <span className={`text-sm ${checked ? 'font-medium text-ink-800' : 'text-ink-600'}`}>{cat.name}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {selectedEmpIds_list.length > 0 && (
            <p className="text-xs text-ink-400">
              Buscando ítems de <span className="font-medium text-ink-600">
                {selectedEmpIds_list.length === 1
                  ? employees.find(e => e.id === selectedEmpIds_list[0])?.name ?? 'empleado seleccionado'
                  : `${selectedEmpIds_list.length} empleados seleccionados`}
              </span> (filtrado desde la sección de lista).
            </p>
          )}

          {reportError && (
            <div className="bg-danger-50 border border-danger-200 text-danger-700 text-sm rounded-item p-3">
              {reportError}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={fetchReportItems}
              disabled={loadingSearch}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all active:scale-[.97] shadow-sm"
              style={{ background: 'linear-gradient(130deg, #0B1120 0%, #0D9488 100%)' }}
            >
              <Search size={14} />
              {loadingSearch ? 'Buscando…' : 'Buscar'}
            </button>
          </div>

          {/* Resultados */}
          {reportData && !loadingSearch && (
            <div className="border-t border-ink-100 pt-4 space-y-3">
              <p className="text-sm font-semibold text-ink-700">
                {reportData.items.length === 0
                  ? 'Sin resultados para los filtros aplicados'
                  : `${reportData.items.length} ítem${reportData.items.length !== 1 ? 's' : ''} · Total: ${formatCLP(reportData.totalCLP)}`}
              </p>
              {reportData.items.length > 0 && (
                <div className="overflow-x-auto rounded-item border border-ink-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-ink-50 text-ink-500 font-semibold">
                        <th className="text-left px-3 py-2">Empleado</th>
                        <th className="text-left px-3 py-2">Fondo</th>
                        <th className="text-left px-3 py-2">Descripción</th>
                        <th className="text-left px-3 py-2">Categoría</th>
                        <th className="text-left px-3 py-2">Fecha</th>
                        <th className="text-right px-3 py-2">CLP</th>
                        <th className="text-left px-3 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.items.map((item, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/50'}>
                          <td className="px-3 py-2 text-ink-800 font-medium">{item.employee_name}</td>
                          <td className="px-3 py-2 text-ink-500 max-w-[120px] truncate" title={item.fund_name}>{item.fund_name}</td>
                          <td className="px-3 py-2 text-ink-700 max-w-[160px] truncate" title={item.description}>{item.description}</td>
                          <td className="px-3 py-2 text-ink-500">{item.category_name ?? '—'}</td>
                          <td className="px-3 py-2 text-ink-500 whitespace-nowrap">{formatDate(item.date)}</td>
                          <td className="px-3 py-2 text-right font-mono-amount text-ink-800">{formatCLP(item.amount_clp)}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded-item font-medium ${
                              item.status === 'approved' ? 'bg-success-100 text-success-700' :
                              item.status === 'rejected' ? 'bg-danger-100 text-danger-700' :
                              'bg-warning-100 text-warning-700'
                            }`}>
                              {item.status === 'approved' ? 'Aprobado' : item.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
