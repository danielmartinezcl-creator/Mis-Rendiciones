'use client'

import { Fragment, useState, useEffect, useTransition } from 'react'
import { getAuditLog } from '@/actions/admin'
import type { AuditLog } from '@/lib/supabase/types'
import type { AuditLogFilters } from '@/actions/admin'
import * as XLSX from 'xlsx'
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Shield,
} from 'lucide-react'

const PAGE_SIZE = 50

const ACTION_COLORS: Record<string, string> = {
  deleted:             'bg-danger-100 text-danger-700',
  permanently_deleted: 'bg-danger-200 text-danger-800',
  restored:            'bg-success-100 text-success-700',
  created:             'bg-accent-100 text-accent-700',
  updated:             'bg-info-100 text-info-700',
  bulk_updated:        'bg-flare-100 text-flare-700',
  config_changed:      'bg-warning-100 text-warning-700',
  exported:            'bg-ink-100 text-ink-700',
  reverted:            'bg-warning-100 text-warning-800',
  submitted:           'bg-info-100 text-info-800',
  approved:            'bg-success-100 text-success-700',
  rejected:            'bg-danger-100 text-danger-700',
}

const ENTITY_TYPES = [
  'user',
  'expense_report',
  'expense_item',
  'category',
  'policy',
  'travel_policy',
  'defontana_settings',
  'defontana_supplier',
  'defontana_export',
  'defontana_export_petty_cash',
  'cost_center_assignment',
  'approver_assignment',
  'petty_cash_fund',
  'petty_cash_item',
  'webhook',
]

const ACTIONS = [
  'deleted',
  'restored',
  'permanently_deleted',
  'created',
  'updated',
  'bulk_updated',
  'config_changed',
  'exported',
  'reverted',
  'submitted',
  'approved',
  'rejected',
]

interface Props {
  initial: AuditLog[]
  total:   number
}

export function AuditoriaClient({ initial, total: initialTotal }: Props) {
  const [items, setItems] = useState<AuditLog[]>(initial)
  const [total, setTotal] = useState(initialTotal)
  const [loading, startTransition] = useTransition()

  const [search,     setSearch]     = useState('')
  const [entityType, setEntityType] = useState('')
  const [action,     setAction]     = useState('')
  const [from,       setFrom]       = useState('')
  const [to,         setTo]         = useState('')
  const [offset,     setOffset]     = useState(0)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function buildFilters(overrideOffset?: number): AuditLogFilters {
    const ofs = overrideOffset ?? offset
    return {
      search:     search     || undefined,
      entityType: entityType || undefined,
      action:     action     || undefined,
      from:       from       || undefined,
      to:         to         || undefined,
      limit:      PAGE_SIZE,
      offset:     ofs || undefined,
    }
  }

  function doFetch(filters: AuditLogFilters) {
    startTransition(async () => {
      const result = await getAuditLog(filters)
      setItems(result.items)
      setTotal(result.total)
    })
  }

  // Debounce select/date filter changes (not search text — that uses the button)
  useEffect(() => {
    const timer = setTimeout(() => {
      doFetch(buildFilters(0))
      setOffset(0)
    }, 500)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, action, from, to])

  function handleSearch() {
    setOffset(0)
    doFetch(buildFilters(0))
  }

  function goNext() {
    const newOffset = offset + PAGE_SIZE
    setOffset(newOffset)
    doFetch(buildFilters(newOffset))
  }

  function goPrev() {
    const newOffset = Math.max(0, offset - PAGE_SIZE)
    setOffset(newOffset)
    doFetch(buildFilters(newOffset))
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleExport() {
    const rows = items.map(i => ({
      'Fecha':        new Date(i.created_at).toLocaleString('es-CL'),
      'Actor':        i.actor_name ?? '',
      'Acción':       i.action,
      'Tipo Entidad': i.entity_type,
      'Entidad':      i.entity_id,
      'Descripción':  i.entity_label ?? '',
      'Notas':        i.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Auditoría')
    XLSX.writeFile(wb, `auditoria-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const totalPages  = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="space-y-6 p-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-item bg-accent-50 flex items-center justify-center">
            <Shield size={20} className="text-accent-600" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold tor-on-gradient">Auditoría</h1>
            <p className="text-sm text-ink-500">
              {loading ? 'Cargando…' : `${total} registro${total !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={items.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-item text-sm font-semibold bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Download size={16} />
          Exportar Excel
        </button>
      </div>

      {/* ── Filtros ── */}
      <div className="bg-white rounded-card border border-ink-100 p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* Búsqueda libre */}
          <div className="sm:col-span-2 xl:col-span-2">
            <input
              type="text"
              placeholder="Buscar actor, entidad, notas…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
              className="w-full px-3 py-2 rounded-item border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 bg-white"
            />
          </div>

          {/* Tipo de entidad */}
          <select
            value={entityType}
            onChange={e => setEntityType(e.target.value)}
            className="px-3 py-2 rounded-item border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 bg-white"
          >
            <option value="">Todas las entidades</option>
            {ENTITY_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Acción */}
          <select
            value={action}
            onChange={e => setAction(e.target.value)}
            className="px-3 py-2 rounded-item border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 bg-white"
          >
            <option value="">Todas las acciones</option>
            {ACTIONS.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {/* Desde */}
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            title="Desde"
            className="px-3 py-2 rounded-item border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 bg-white"
          />

          {/* Hasta */}
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            title="Hasta"
            className="px-3 py-2 rounded-item border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 bg-white"
          />
        </div>

        <div className="flex justify-end mt-3">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-item text-sm font-semibold bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-60 transition-colors"
          >
            <Search size={16} />
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="bg-white rounded-card border border-ink-100 shadow-sm overflow-hidden">
        {items.length === 0 ? (
          <div className="py-16 text-center text-ink-400 text-sm">
            No hay registros de auditoría para los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50">
                  <th className="px-4 py-3 text-left font-semibold text-ink-600 whitespace-nowrap">Fecha/Hora</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink-600">Actor</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink-600">Acción</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink-600 whitespace-nowrap">Tipo</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink-600">Descripción</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink-600">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {items.map(item => {
                  const isExpanded = expanded.has(item.id)
                  const badgeClass = ACTION_COLORS[item.action] ?? 'bg-ink-100 text-ink-700'
                  const hasDetail  = item.old_value !== null || item.new_value !== null

                  return (
                    <Fragment key={item.id}>
                      <tr className="hover:bg-ink-50 transition-colors">
                        <td className="px-4 py-3 font-mono-amount text-xs text-ink-500 whitespace-nowrap">
                          {new Date(item.created_at).toLocaleString('es-CL')}
                        </td>
                        <td className="px-4 py-3 text-ink-800 font-medium">
                          {item.actor_name ?? (
                            <span className="text-ink-400 italic">Sistema</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badgeClass}`}>
                            {item.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-ink-600 whitespace-nowrap text-xs">
                          {item.entity_type}
                        </td>
                        <td className="px-4 py-3 text-ink-800 max-w-xs truncate">
                          {item.entity_label ?? <span className="text-ink-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {hasDetail ? (
                            <button
                              onClick={() => toggleExpand(item.id)}
                              className="flex items-center gap-1 text-accent-600 hover:text-accent-800 text-xs font-medium transition-colors"
                            >
                              {isExpanded
                                ? <><ChevronUp size={14} /> Ocultar</>
                                : <><ChevronDown size={14} /> Ver</>
                              }
                            </button>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="px-6 py-4 bg-ink-50">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {item.old_value !== null && (
                                <div>
                                  <p className="text-xs font-semibold text-ink-500 mb-1">Valor anterior</p>
                                  <pre className="text-xs bg-white border border-ink-100 rounded-item p-3 overflow-auto max-h-48 text-ink-700 whitespace-pre-wrap">
                                    {JSON.stringify(item.old_value, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {item.new_value !== null && (
                                <div>
                                  <p className="text-xs font-semibold text-ink-500 mb-1">Valor nuevo</p>
                                  <pre className="text-xs bg-white border border-ink-100 rounded-item p-3 overflow-auto max-h-48 text-ink-700 whitespace-pre-wrap">
                                    {JSON.stringify(item.new_value, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                            {item.notes && (
                              <p className="mt-3 text-sm text-ink-600">
                                <span className="font-semibold">Notas:</span> {item.notes}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Paginación ── */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-ink-500">
            Página {currentPage} de {totalPages} · {total} resultados
          </p>
          <div className="flex gap-2">
            <button
              onClick={goPrev}
              disabled={offset === 0 || loading}
              className="flex items-center gap-1 px-3 py-2 rounded-item border border-ink-200 text-ink-700 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
            <button
              onClick={goNext}
              disabled={offset + PAGE_SIZE >= total || loading}
              className="flex items-center gap-1 px-3 py-2 rounded-item border border-ink-200 text-ink-700 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
