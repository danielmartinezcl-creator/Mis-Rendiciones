'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { getAdminReports, getReportDetailForAdmin, getDefontanaExportData, markDefontanaExported, getOrgCategories, reclassifyExpenseItem, changeHistoricalImportType } from '@/actions/admin'
import { markReimbursed } from '@/actions/approvals'
import { adminDeleteExpenseReport, adminDeleteAllReports } from '@/actions/expenses'
import { formatDate, formatCLP } from '@/lib/utils'
import { AdminKpiHero } from '@/components/ui/AdminKpiHero'
import { Search, Banknote, Trash2, Pencil, FilePen } from 'lucide-react'
import type { AdminReportRow } from '@/lib/export/excel'

type Report = Awaited<ReturnType<typeof getAdminReports>>[number]
type Detail = Awaited<ReturnType<typeof getReportDetailForAdmin>>

const STATUS_OPTS = [
  { value: 'submitted',          label: 'En revisión',    color: 'bg-blue-100 text-blue-700' },
  { value: 'pending_l2',         label: 'Revisión N2',    color: 'bg-purple-100 text-purple-700' },
  { value: 'approved',           label: 'Aprobada',       color: 'bg-emerald-100 text-emerald-700' },
  { value: 'partially_approved', label: 'Aprobada parcial', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'rejected',           label: 'Rechazada',      color: 'bg-red-100 text-red-700' },
  { value: 'reimbursed',         label: 'Reembolsada',    color: 'bg-slate-100 text-slate-600' },
]

function statusLabel(s: string) { return STATUS_OPTS.find(o => o.value === s)?.label ?? s }
function statusCls(s: string)   { return STATUS_OPTS.find(o => o.value === s)?.color ?? 'bg-slate-100 text-slate-600' }

interface Props { initialReports: Report[] }

export function AdminReportsClient({ initialReports }: Props) {
  const [reports,  setReports]  = useState<Report[]>(initialReports)
  const [details,  setDetails]  = useState<Record<string, Detail>>({})
  const [expanding, setExpanding] = useState<string | null>(null)
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | 'defontana' | null>(null)
  const [defontanaWarnings, setDefontanaWarnings] = useState<{ reportTitle: string; categories: string[] }[]>([])

  // Filtros
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [statusSel,  setStatusSel]  = useState<string[]>([])
  const [empFilter,  setEmpFilter]  = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [reimb,      setReimb]      = useState<'all' | 'pending' | 'reimbursed'>('all')
  const [defFilter,  setDefFilter]  = useState<'all' | 'notExported' | 'exported'>('all')

  // Reembolso inline
  const [reimbOpen,  setReimbOpen]  = useState<string | null>(null)
  const [reimbRef,   setReimbRef]   = useState('')
  const [reimbSaving, setReimbSaving] = useState(false)

  // Eliminar
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)

  // Mover módulo (rendicion ↔ caja_chica)
  const [movingId, setMovingId] = useState<string | null>(null)

  // Reclasificación de ítems
  type Category = Awaited<ReturnType<typeof getOrgCategories>>[number]
  const [categories,       setCategories]       = useState<Category[]>([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [reclassifyingItem, setReclassifyingItem] = useState<string | null>(null)
  const [reclassifySaving,  setReclassifySaving]  = useState(false)

  async function startReclassify(itemId: string) {
    if (!categoriesLoaded) {
      const cats = await getOrgCategories()
      setCategories(cats)
      setCategoriesLoaded(true)
    }
    setReclassifyingItem(itemId)
  }

  async function handleReclassify(reportId: string, itemId: string, categoryId: string) {
    setReclassifySaving(true)
    try {
      await reclassifyExpenseItem(itemId, categoryId)
      const newCatName = categories.find(c => c.id === categoryId)?.name ?? null
      setDetails(prev => ({
        ...prev,
        [reportId]: {
          ...prev[reportId],
          items: prev[reportId].items.map(it =>
            it.id === itemId ? { ...it, category_id: categoryId, category_name: newCatName } : it
          ),
        },
      }))
    } finally {
      setReclassifyingItem(null)
      setReclassifySaving(false)
    }
  }

  async function load() {
    const data = await getAdminReports()
    setReports(data)
  }

  // Listas únicas para filtros
  const employees   = useMemo(() => [...new Map(reports.map(r => [r.submitter_id, { id: r.submitter_id, name: r.submitter_name }])).values()].sort((a, b) => a.name.localeCompare(b.name)), [reports])
  const departments = useMemo(() => [...new Set(reports.map(r => r.department).filter(Boolean) as string[])].sort(), [reports])

  // Filtrado
  const filtered = useMemo(() => reports.filter(r => {
    const subDate = r.submitted_at?.split('T')[0] ?? ''
    if (dateFrom && subDate && subDate < dateFrom) return false
    if (dateTo   && subDate && subDate > dateTo)   return false
    if (statusSel.length > 0 && !statusSel.includes(r.status)) return false
    if (empFilter  && r.submitter_id !== empFilter)   return false
    if (deptFilter && r.department   !== deptFilter)   return false
    if (reimb === 'pending'    && r.status === 'reimbursed') return false
    if (reimb === 'reimbursed' && r.status !== 'reimbursed') return false
    if (defFilter === 'notExported' && r.defontana_exported_at) return false
    if (defFilter === 'exported'    && !r.defontana_exported_at) return false
    return true
  }), [reports, dateFrom, dateTo, statusSel, empFilter, deptFilter, reimb, defFilter])

  // KPI: rendiciones en revisión con más de 5 días de espera
  const staleSubmitted = useMemo(() => {
    const cutoff = new Date(Date.now() - 5 * 86_400_000).toISOString()
    return reports.filter(r => r.status === 'submitted' && r.submitted_at && r.submitted_at < cutoff).length
  }, [reports])

  // KPIs del filtro actual
  const totalMonto    = filtered.reduce((s, r) => s + r.total_amount, 0)
  const totalAprobado = filtered.reduce((s, r) => s + r.approved_amount, 0)
  const pendReimb     = filtered.filter(r => r.status === 'approved' || r.status === 'partially_approved').reduce((s, r) => s + r.approved_amount, 0)

  async function handleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (details[id]) return
    setExpanding(id)
    const d = await getReportDetailForAdmin(id)
    setDetails(prev => ({ ...prev, [id]: d }))
    setExpanding(null)
  }

  async function handleReimburse(reportId: string) {
    setReimbSaving(true)
    try {
      await markReimbursed(reportId, reimbRef)
      setReimbOpen(null)
      setReimbRef('')
      await load()
    } finally {
      setReimbSaving(false)
    }
  }

  async function handleExport(type: 'xlsx' | 'pdf') {
    setExporting(type)
    try {
      const withDetails: AdminReportRow[] = await Promise.all(
        filtered.map(async r => {
          const d = details[r.id] ?? await getReportDetailForAdmin(r.id)
          setDetails(prev => ({ ...prev, [r.id]: d }))
          return { ...r, approvals: d.approvals, items: d.items }
        })
      )

      const activeFilters = {
        dateFrom:   dateFrom || undefined,
        dateTo:     dateTo   || undefined,
        employee:   employees.find(e => e.id === empFilter)?.name,
        department: deptFilter || undefined,
        status:     statusSel.length > 0 ? statusSel : undefined,
      }

      if (type === 'xlsx') {
        const { exportAdminReportsToExcel } = await import('@/lib/export/excel')
        exportAdminReportsToExcel(withDetails)
      } else {
        const { exportAdminReportsToPDF } = await import('@/lib/export/pdf')
        exportAdminReportsToPDF(withDetails, activeFilters)
      }
    } finally {
      setExporting(null)
    }
  }

  async function handleExportDefontana() {
    setExporting('defontana')
    setDefontanaWarnings([])
    try {
      const { reports: defReports, settings, exportedReportIds } = await getDefontanaExportData({
        reportIds: filtered.map(r => r.id),
        dateFrom:  dateFrom || undefined,
        dateTo:    dateTo   || undefined,
      })
      if (!defReports.length) {
        alert('No hay rendiciones aprobadas en el filtro actual para exportar a Defontana.')
        return
      }
      if (!settings?.contraAccount) {
        alert('Configura la cuenta contraparte en Configuración → Defontana antes de exportar.')
        return
      }
      // Advertir si alguna rendición ya fue exportada antes
      if (exportedReportIds.length > 0) {
        const ok = window.confirm(
          `⚠ ${exportedReportIds.length} rendición(es) del filtro ya fue(ron) exportada(s) a Defontana anteriormente.\n\n` +
          `Exportar de nuevo puede generar asientos duplicados en la contabilidad.\n\n` +
          `¿Deseas continuar de todas formas?`
        )
        if (!ok) return
      }
      const { buildDefontanaEntries, exportDefontanaToExcel } = await import('@/lib/export/defontana')
      const result = buildDefontanaEntries(defReports, settings)
      const exportRef = `DEF-${new Date().toISOString().slice(0, 10)}`
      exportDefontanaToExcel(result, `asientos-defontana-${exportRef}`)
      // Marcar todas las rendiciones incluidas como exportadas
      const justExportedIds = defReports.map(r => r.reportId)
      await markDefontanaExported(justExportedIds, exportRef)
      if (result.warnings.length > 0) {
        setDefontanaWarnings(result.warnings.map(w => ({ reportTitle: w.reportTitle, categories: w.categories })))
      }
      await load()
    } finally {
      setExporting(null)
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`¿Mover a la papelera la rendición "${title}"?\n\nPodrás recuperarla desde Admin → Papelera durante 90 días.`)) return
    setDeletingId(id)
    try {
      await adminDeleteExpenseReport(id)
      await load()
      if (expanded === id) setExpanded(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleDeleteAll() {
    const confirmed = window.prompt(
      `⚠ Esta acción moverá TODAS las rendiciones a la papelera.\n\nPodrás recuperarlas desde Admin → Papelera durante 90 días.\n\nEscribí ELIMINAR para confirmar:`
    )
    if (confirmed !== 'ELIMINAR') return
    setDeletingAll(true)
    try {
      await adminDeleteAllReports()
      await load()
      setExpanded(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeletingAll(false)
    }
  }

  async function handleMoveModule(reportId: string, title: string) {
    if (!confirm(`¿Mover "${title}" al módulo Caja Chica?\n\nDesaparecerá de Rendiciones y aparecerá en Caja Chica → Carga histórica.`)) return
    setMovingId(reportId)
    try {
      await changeHistoricalImportType(reportId, 'caja_chica')
      setReports(prev => prev.filter(r => r.id !== reportId))
      setExpanded(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al mover')
    } finally {
      setMovingId(null)
    }
  }

  function toggleStatus(v: string) {
    setStatusSel(prev => prev.includes(v) ? prev.filter(s => s !== v) : [...prev, v])
  }

  const hasFilters = dateFrom || dateTo || statusSel.length > 0 || empFilter || deptFilter || reimb !== 'all' || defFilter !== 'all'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Rendiciones</h1>
          <p className="text-sm text-slate-500 mt-0.5">{filtered.length} de {reports.length} resultado{reports.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <button
            onClick={() => handleExport('xlsx')}
            disabled={!!exporting || filtered.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all duration-[180ms] active:scale-[.97] shadow-sm hover:shadow-md"
            style={{ background: 'linear-gradient(130deg, #0B1120 0%, #059669 100%)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            {exporting === 'xlsx' ? 'Exportando…' : 'Excel'}
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={!!exporting || filtered.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all duration-[180ms] active:scale-[.97] shadow-sm hover:shadow-md"
            style={{ background: 'linear-gradient(130deg, #0B1120 0%, #BE123C 100%)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            {exporting === 'pdf' ? 'Exportando…' : 'PDF'}
          </button>
          <button
            onClick={handleExportDefontana}
            disabled={!!exporting || filtered.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all duration-[180ms] active:scale-[.97] shadow-sm hover:shadow-md"
            style={{ background: 'linear-gradient(130deg, #0B1120 0%, #0D9488 100%)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            {exporting === 'defontana' ? 'Exportando…' : 'Defontana'}
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={!!exporting || deletingAll || reports.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded-item disabled:opacity-40 transition-colors"
            title="Eliminar todas las rendiciones (solo para pruebas)"
          >
            <Trash2 size={14} />
            {deletingAll ? 'Eliminando…' : 'Eliminar todas'}
          </button>
        </div>
      </div>

      {/* Advertencias Defontana */}
      {defontanaWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-card p-4">
          <div className="flex items-start gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 mb-1">Categorías sin código Defontana ({defontanaWarnings.length} {defontanaWarnings.length === 1 ? 'rendición' : 'rendiciones'})</p>
              <p className="text-xs text-amber-700 mb-2">Los ítems de estas categorías no fueron incluidos en los asientos. Asigna sus códigos en <strong>Configuración → Defontana</strong>.</p>
              <ul className="space-y-1">
                {defontanaWarnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700">
                    <span className="font-medium">{w.reportTitle}:</span> {w.categories.join(', ')}
                  </li>
                ))}
              </ul>
              <button onClick={() => setDefontanaWarnings([])} className="mt-2 text-xs text-amber-600 hover:underline">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* KPI alerta: rendiciones en espera +5 días */}
      {staleSubmitted > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-card p-3 flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <p className="text-xs text-amber-800 font-medium">
            <strong>{staleSubmitted} rendición{staleSubmitted !== 1 ? 'es' : ''}</strong> llevan más de 5 días sin revisión — el período contable puede verse afectado.
          </p>
        </div>
      )}

      {/* KPIs */}
      <AdminKpiHero
        title="Resumen filtrado"
        total={totalMonto}
        secondary={[
          { label: 'Total aprobado',    value: totalAprobado, color: 'violet' },
          { label: 'Pendiente reemb.',  value: pendReimb,     color: 'sky' },
        ]}
      />

      {/* Filtros */}
      <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Filtros</p>
          {hasFilters && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); setStatusSel([]); setEmpFilter(''); setDeptFilter(''); setReimb('all'); setDefFilter('all') }}
              className="text-xs text-brand-600 hover:underline"
            >
              Limpiar todo
            </button>
          )}
        </div>

        {/* Fecha */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Desde (fecha envío)</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full border border-slate-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Hasta</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full border border-slate-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600" />
          </div>
        </div>

        {/* Estado */}
        <div>
          <p className="text-xs text-slate-500 mb-2">Estado</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTS.map(s => (
              <button
                key={s.value}
                onClick={() => toggleStatus(s.value)}
                className={[
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  statusSel.includes(s.value) ? s.color + ' ring-2 ring-offset-1 ring-brand-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                ].join(' ')}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Empleado / Depto / Reembolso / Defontana */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Empleado</label>
            <select value={empFilter} onChange={e => setEmpFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-item px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600">
              <option value="">Todos</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Departamento</label>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-item px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600">
              <option value="">Todos</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Reembolso</label>
            <select value={reimb} onChange={e => setReimb(e.target.value as typeof reimb)}
              className="w-full border border-slate-200 rounded-item px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600">
              <option value="all">Todos</option>
              <option value="pending">Pendiente de reembolso</option>
              <option value="reimbursed">Reembolsadas</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Contabilización</label>
            <select value={defFilter} onChange={e => setDefFilter(e.target.value as typeof defFilter)}
              className="w-full border border-slate-200 rounded-item px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600">
              <option value="all">Todas</option>
              <option value="notExported">Sin contabilizar</option>
              <option value="exported">Contabilizadas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 && (
        <div className="text-center py-12 text-ink-400">
          <Search size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No hay rendiciones que coincidan con los filtros.</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(r => {
          const isOpen    = expanded === r.id
          const detail    = details[r.id]
          const loading   = expanding === r.id
          const canReimb  = r.status === 'approved' || r.status === 'partially_approved'
          const isReopened = reimbOpen === r.id

          return (
            <div key={r.id} className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] overflow-hidden">
              {/* Fila principal */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800">{r.title}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCls(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                      {r.defontana_exported_at && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                          ✓ Contabilizado {formatDate(r.defontana_exported_at.split('T')[0])}
                          {r.defontana_export_ref && ` · ${r.defontana_export_ref}`}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <strong>{r.submitter_name}</strong>
                      {r.department && ` · ${r.department}`}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {r.submitted_at && `Enviada ${formatDate(r.submitted_at.split('T')[0])}`}
                      {r.approved_at  && ` · Aprobada ${formatDate(r.approved_at.split('T')[0])}`}
                      {r.reimbursed_at && ` · Reembolsada ${formatDate(r.reimbursed_at.split('T')[0])}`}
                      {r.payment_reference && ` · Ref: ${r.payment_reference}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-800">{formatCLP(r.total_amount)}</p>
                      {r.approved_amount > 0 && r.approved_amount !== r.total_amount && (
                        <p className="text-xs text-emerald-600">Aprobado: {formatCLP(r.approved_amount)}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleExpand(r.id)}
                      className="text-xs text-brand-600 hover:text-brand-800 font-medium px-2 py-1 border border-brand-200 rounded-item hover:bg-brand-50 transition-colors"
                    >
                      {loading ? '...' : isOpen ? '▲ Cerrar' : '▼ Ver detalle'}
                    </button>
                    {r.is_historical_import && (
                      <button
                        onClick={() => handleMoveModule(r.id, r.title)}
                        disabled={movingId === r.id}
                        className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-item transition-colors disabled:opacity-40"
                        title="Mover a Caja Chica"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(r.id, r.title)}
                      disabled={deletingId === r.id}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-item transition-colors disabled:opacity-40"
                      title="Eliminar rendición"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Borrador: CTA para continuar editando */}
                {r.status === 'draft' && (
                  <div className="mt-3 pt-3 border-t border-amber-100 flex items-center justify-between gap-3 flex-wrap">
                    <span className="flex items-center gap-1.5 text-xs text-amber-700 font-medium">
                      <FilePen size={13} />
                      Borrador — no enviada al aprobador
                    </span>
                    <Link
                      href={`/expenses/${r.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-item transition-colors"
                    >
                      Continuar editando →
                    </Link>
                  </div>
                )}

                {/* Botón reembolso */}
                {canReimb && !isReopened && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => { setReimbOpen(r.id); setReimbRef('') }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                    >
                      <Banknote size={13} />Marcar como reembolsada
                    </button>
                  </div>
                )}
                {isReopened && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2 items-center">
                    <input
                      type="text"
                      value={reimbRef}
                      onChange={e => setReimbRef(e.target.value)}
                      placeholder="Referencia de pago (opcional)"
                      className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-item text-xs focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                    <button
                      onClick={() => handleReimburse(r.id)}
                      disabled={reimbSaving}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-item transition-colors"
                    >
                      {reimbSaving ? '...' : 'Confirmar'}
                    </button>
                    <button onClick={() => setReimbOpen(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancelar</button>
                  </div>
                )}
              </div>

              {/* Detalle expandido */}
              {isOpen && (
                <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-4">
                  {!detail && <p className="text-xs text-slate-400 text-center py-2">Cargando...</p>}

                  {detail && (
                    <>
                      {/* Historial de aprobaciones */}
                      {detail.approvals.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Historial de aprobaciones</p>
                          <div className="space-y-1.5">
                            {detail.approvals.map((a, i) => (
                              <div key={i} className={[
                                'flex items-start gap-2 text-xs rounded-item px-3 py-2',
                                a.action === 'approved' ? 'bg-emerald-50 text-emerald-800' :
                                a.action === 'rejected' ? 'bg-red-50 text-red-800' :
                                'bg-slate-100 text-slate-700',
                              ].join(' ')}>
                                <span className="font-medium shrink-0">N{a.level}</span>
                                <span className="font-semibold shrink-0">{a.approver_name}</span>
                                <span className="shrink-0">→ {statusLabel(a.action)}</span>
                                {a.notes && <span className="text-slate-500 italic">"{a.notes}"</span>}
                                <span className="ml-auto text-slate-400 shrink-0">{formatDate(a.created_at.split('T')[0])}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Ítems */}
                      <div>
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Ítems ({detail.items.length})</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="text-left text-slate-400 border-b border-slate-200">
                                <th className="pb-1.5 pr-3 font-medium">Descripción</th>
                                <th className="pb-1.5 pr-3 font-medium">Categoría</th>
                                <th className="pb-1.5 pr-3 font-medium text-right">Monto</th>
                                <th className="pb-1.5 pr-3 font-medium">Estado</th>
                                <th className="pb-1.5 font-medium">Motivo rechazo</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {detail.items.map((item, i) => (
                                <tr key={i}>
                                  <td className="py-1.5 pr-3 text-slate-700">{item.description}</td>
                                  <td className="py-1.5 pr-3 text-slate-500">
                                    {reclassifyingItem === item.id ? (
                                      <select
                                        autoFocus
                                        defaultValue={item.category_id ?? ''}
                                        disabled={reclassifySaving}
                                        onChange={async e => {
                                          if (e.target.value) await handleReclassify(r.id, item.id, e.target.value)
                                          else setReclassifyingItem(null)
                                        }}
                                        onBlur={() => !reclassifySaving && setReclassifyingItem(null)}
                                        className="text-xs border border-slate-300 rounded px-1 py-0.5 bg-white max-w-[160px]"
                                      >
                                        <option value="">— cancelar —</option>
                                        {categories.map(c => (
                                          <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="flex items-center gap-1 group/cat">
                                        <span>{item.category_name ?? '—'}</span>
                                        <button
                                          onClick={() => startReclassify(item.id)}
                                          className="opacity-0 group-hover/cat:opacity-100 transition-opacity text-slate-400 hover:text-brand-600 shrink-0"
                                          title="Reclasificar categoría"
                                        >
                                          <Pencil size={10} />
                                        </button>
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right font-mono text-slate-800">{formatCLP(item.amount_clp)}</td>
                                  <td className="py-1.5 pr-3">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusCls(item.status)}`}>
                                      {statusLabel(item.status)}
                                    </span>
                                  </td>
                                  <td className="py-1.5 text-red-600 italic">{item.rejection_reason ?? ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
