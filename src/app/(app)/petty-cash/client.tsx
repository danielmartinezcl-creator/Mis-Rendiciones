'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Wallet, Plus, FileText, Filter, X, Download, BarChart2, Trash2 } from 'lucide-react'
import { FundStatusBadge } from '@/components/petty-cash/FundStatusBadge'
import { formatPeriod } from '@/lib/petty-cash-helpers'
import { getPettyCashItemsForReport, deletePettyCashFund } from '@/actions/petty-cash'
import type { FundListItem } from '@/actions/petty-cash'

function fmtCLP(n: number) {
  return '$ ' + Math.round(n).toLocaleString('es-CL')
}

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

type Category = { id: string; name: string; color: string | null }

interface Props {
  initialFunds:      FundListItem[]
  initialCategories: Category[]
  isManager:         boolean
}

export function PettyCashClient({ initialFunds, initialCategories, isManager }: Props) {
  // ── Estado local de fondos (permite eliminar sin recargar la página) ──────
  const [funds, setFunds] = useState<FundListItem[]>(initialFunds)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDeleteFund(id: string, name: string) {
    if (!confirm(`¿Eliminar el fondo "${name}"?\n\nSe eliminarán todos sus ítems y aprobaciones.\nEsta acción no se puede deshacer.`)) return
    setDeletingId(id)
    try {
      await deletePettyCashFund(id)
      setFunds(prev => prev.filter(f => f.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar el fondo')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Filtros de lista (cliente) ────────────────────────────────────────────
  const [statusFilter,   setStatusFilter]   = useState('all')
  const [dateFrom,       setDateFrom]       = useState('')
  const [dateTo,         setDateTo]         = useState('')
  const [employeeSearch, setEmployeeSearch] = useState('')

  // ── Panel de informe ─────────────────────────────────────────────────────
  const [showReport,       setShowReport]       = useState(false)
  const [reportDateFrom,   setReportDateFrom]   = useState('')
  const [reportDateTo,     setReportDateTo]     = useState('')
  const [selectedCatIds,   setSelectedCatIds]   = useState<string[]>([])
  const [selectedEmpIds,   setSelectedEmpIds]   = useState<string[]>([])
  const [itemStatusFilter, setItemStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [generating, setGenerating] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  // Empleados únicos en los fondos cargados
  const employees = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of funds) {
      if (!map.has(f.employee_id)) map.set(f.employee_id, f.employee_name)
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [funds])

  // Filtrado cliente de la lista de fondos
  const filtered = useMemo(() => {
    return funds.filter(f => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false
      if (dateFrom && f.period_end   < dateFrom) return false
      if (dateTo   && f.period_start > dateTo)   return false
      if (employeeSearch && !f.employee_name.toLowerCase().includes(employeeSearch.toLowerCase())) return false
      return true
    })
  }, [funds, statusFilter, dateFrom, dateTo, employeeSearch])

  const activeFilters = statusFilter !== 'all' || dateFrom || dateTo || employeeSearch

  function toggleCat(id: string) {
    setSelectedCatIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleEmp(id: string) {
    setSelectedEmpIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleExport(format: 'excel' | 'pdf') {
    setGenerating(true)
    setReportError(null)
    try {
      const { items, totalCLP } = await getPettyCashItemsForReport({
        dateFrom:    reportDateFrom || undefined,
        dateTo:      reportDateTo   || undefined,
        itemStatus:  itemStatusFilter,
        employeeIds: selectedEmpIds.length  ? selectedEmpIds  : undefined,
        categoryIds: selectedCatIds.length  ? selectedCatIds  : undefined,
      })

      if (!items.length) {
        setReportError('No hay ítems que coincidan con los filtros seleccionados.')
        return
      }

      const title = `Caja Chica${reportDateFrom ? ` ${reportDateFrom}` : ''}${reportDateTo ? ` al ${reportDateTo}` : ''}`

      if (format === 'excel') {
        const { exportPettyCashToExcel } = await import('@/lib/export/excel')
        exportPettyCashToExcel(items, 'caja-chica-informe')
      } else {
        const { exportPettyCashToPDF } = await import('@/lib/export/pdf')
        exportPettyCashToPDF(items, title)
      }
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Error al generar el informe')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink-900">Caja Chica</h1>
          <p className="text-sm text-ink-500 mt-1">
            {filtered.length !== initialFunds.length
              ? `${filtered.length} de ${initialFunds.length} fondos`
              : `${initialFunds.length} fondo${initialFunds.length !== 1 ? 's' : ''} registrado${initialFunds.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isManager && (
            <button
              onClick={() => setShowReport(s => !s)}
              className={[
                'inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-item transition-all border',
                showReport
                  ? 'bg-brand-50 border-brand-300 text-brand-700'
                  : 'bg-white border-ink-200 text-ink-700 hover:border-brand-300 hover:text-brand-700',
              ].join(' ')}
            >
              <BarChart2 size={14} />
              Generar informe
            </button>
          )}
          <Link
            href="/petty-cash/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item transition-all shadow-sm hover:shadow-md active:scale-[.97]"
            style={{ background: 'linear-gradient(130deg, #12152E 0%, #3B4090 100%)' }}
          >
            <Plus size={14} />
            Nuevo fondo
          </Link>
        </div>
      </div>

      {/* Panel de informe */}
      {showReport && (
        <div className="bg-white rounded-card shadow-card p-5 border-t-4 border-t-brand-600 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-base text-ink-900 flex items-center gap-2">
              <FileText size={16} className="text-brand-600" />
              Informe de gastos
            </h2>
            <button onClick={() => setShowReport(false)} className="text-ink-400 hover:text-ink-700 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1">Fecha desde</label>
              <input
                type="date"
                value={reportDateFrom}
                onChange={e => setReportDateFrom(e.target.value)}
                className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1">Fecha hasta</label>
              <input
                type="date"
                value={reportDateTo}
                onChange={e => setReportDateTo(e.target.value)}
                className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
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

          {/* Filtro por categoría */}
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-2">
              Categorías
              {selectedCatIds.length > 0 && <span className="ml-1 text-brand-600">({selectedCatIds.length} seleccionadas)</span>}
            </label>
            <div className="flex flex-wrap gap-2">
              {initialCategories.map(cat => {
                const sel = selectedCatIds.includes(cat.id)
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleCat(cat.id)}
                    className={[
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                      sel
                        ? 'border-brand-400 bg-brand-50 text-brand-700'
                        : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
                    ].join(' ')}
                  >
                    {cat.color && (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.color }} />
                    )}
                    {cat.name}
                  </button>
                )
              })}
            </div>
            {selectedCatIds.length > 0 && (
              <button onClick={() => setSelectedCatIds([])} className="mt-1.5 text-xs text-ink-400 hover:text-ink-600 underline">
                Limpiar selección
              </button>
            )}
          </div>

          {/* Filtro por empleado */}
          {employees.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-2">
                Empleados
                {selectedEmpIds.length > 0 && <span className="ml-1 text-brand-600">({selectedEmpIds.length} seleccionados)</span>}
              </label>
              <div className="flex flex-wrap gap-2">
                {employees.map(emp => {
                  const sel = selectedEmpIds.includes(emp.id)
                  return (
                    <button
                      key={emp.id}
                      onClick={() => toggleEmp(emp.id)}
                      className={[
                        'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                        sel
                          ? 'border-brand-400 bg-brand-50 text-brand-700'
                          : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
                      ].join(' ')}
                    >
                      {emp.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {reportError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-item p-3">
              {reportError}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => handleExport('excel')}
              disabled={generating}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all active:scale-[.97] shadow-sm"
              style={{ background: 'linear-gradient(130deg, #12152E 0%, #059669 100%)' }}
            >
              <Download size={14} />
              {generating ? 'Generando…' : 'Excel'}
            </button>
            <button
              onClick={() => handleExport('pdf')}
              disabled={generating}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all active:scale-[.97] shadow-sm"
              style={{ background: 'linear-gradient(130deg, #12152E 0%, #e11d48 100%)' }}
            >
              <Download size={14} />
              {generating ? 'Generando…' : 'PDF'}
            </button>
          </div>
        </div>
      )}

      {/* Filtros de la lista */}
      {initialFunds.length > 0 && (
        <div className="bg-white rounded-card shadow-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-ink-400" />
            <span className="text-xs font-semibold text-ink-600">Filtrar lista</span>
            {activeFilters && (
              <button
                onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo(''); setEmployeeSearch('') }}
                className="ml-auto text-xs text-brand-600 hover:text-brand-700 underline"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Chips de estado */}
          <div className="flex gap-2 flex-wrap">
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">Período desde</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full border border-ink-200 rounded-item px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">Período hasta</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full border border-ink-200 rounded-item px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">Buscar empleado</label>
              <input
                type="text"
                value={employeeSearch}
                onChange={e => setEmployeeSearch(e.target.value)}
                placeholder="Nombre del empleado..."
                className="w-full border border-ink-200 rounded-item px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>
        </div>
      )}

      {/* Lista de fondos */}
      {filtered.length === 0 ? (
        funds.length === 0 ? (
          <div className="text-center py-16 text-ink-400">
            <Wallet size={40} className="mx-auto mb-4 opacity-25" />
            <p className="text-sm font-medium">Sin fondos de caja chica</p>
            <p className="text-xs mt-1 text-ink-300">Los fondos aparecerán aquí una vez creados</p>
            <Link
              href="/petty-cash/new"
              className="inline-flex items-center gap-2 mt-4 text-brand-600 text-sm font-semibold hover:underline"
            >
              <Plus size={14} />
              Crear primer fondo
            </Link>
          </div>
        ) : (
          <div className="text-center py-12 text-ink-400">
            <Filter size={32} className="mx-auto mb-3 opacity-25" />
            <p className="text-sm font-medium">Sin resultados con los filtros actuales</p>
            <button
              onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo(''); setEmployeeSearch('') }}
              className="mt-2 text-brand-600 text-sm hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {filtered.map(f => (
            <div key={f.id} className="bg-white rounded-card shadow-card border-l-4 border-l-brand-600 hover:shadow-md transition-shadow flex items-stretch">
              <Link
                href={`/petty-cash/${f.id}`}
                className="flex-1 block p-4"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-ink-900 truncate">{f.name}</p>
                      <FundStatusBadge status={f.status} />
                    </div>
                    <p className="text-xs text-ink-500 mt-1">
                      Empleado: <span className="font-medium text-ink-700">{f.employee_name}</span>
                      {' · '}
                      EFF: <span className="font-medium text-ink-700">{f.manager_name}</span>
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5">{formatPeriod(f.period_start, f.period_end)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono-amount font-bold text-ink-900">{fmtCLP(f.amount_approved ?? f.amount_requested)}</p>
                    {f.amount_approved != null && f.amount_approved !== f.amount_requested && (
                      <p className="text-xs text-ink-400">Solicitado: {fmtCLP(f.amount_requested)}</p>
                    )}
                  </div>
                </div>
              </Link>
              {isManager && (
                <button
                  onClick={() => handleDeleteFund(f.id, f.name)}
                  disabled={deletingId === f.id}
                  title="Eliminar fondo"
                  className="px-3 border-l border-ink-100 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 rounded-r-card"
                >
                  {deletingId === f.id
                    ? <span className="text-xs">...</span>
                    : <Trash2 size={15} />
                  }
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
