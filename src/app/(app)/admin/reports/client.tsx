'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { getAdminReports, getReportDetailForAdmin, getDefontanaExportData, markDefontanaExported, revertDefontanaExport, getOrgCategories, reclassifyExpenseItem, changeHistoricalImportType, getReportAttachmentUrls, bulkUpdateExpenseItemsCostCenter, getCostCenters } from '@/actions/admin'
import { markReimbursed, revertReimbursement, requestReportBankLoad } from '@/actions/approvals'
import { adminDeleteExpenseReport, adminDeleteAllReports } from '@/actions/expenses'
import { formatDate, formatCLP, formatDisplayTitle } from '@/lib/utils'
import { AdminKpiHero } from '@/components/ui/AdminKpiHero'
import { RevertDefontanaDialog } from '@/components/ui/RevertDefontanaDialog'
import { DefontanaTypePanel } from '@/components/admin/DefontanaTypePanel'
import { Search, Banknote, Trash2, ArrowRightLeft, FilePen, ChevronDown, Undo2, Landmark, BookCheck, FileSpreadsheet } from 'lucide-react'
import { CompactStepper } from '@/components/ui/CompactStepper'
import { VerticalTimeline } from '@/components/ui/VerticalTimeline'
import { REPORT_STEPS } from '@/lib/constants'
import type { AdminReportRow } from '@/lib/export/excel'
import type { CostCenter } from '@/lib/supabase/types'
import { SEMANTIC } from '@/lib/design-tokens'

type Report = Awaited<ReturnType<typeof getAdminReports>>[number]
type Detail = Awaited<ReturnType<typeof getReportDetailForAdmin>>

const STATUS_OPTS = [
  { value: 'submitted',          label: 'En revisión',      color: 'bg-info-100 text-info-700' },
  { value: 'pending_l2',         label: 'Revisión N2',      color: 'bg-flare-100 text-flare-700' },
  { value: 'approved',           label: 'Aprobada',         color: 'bg-success-100 text-success-700' },
  { value: 'partially_approved', label: 'Aprobada parcial', color: 'bg-warning-100 text-warning-700' },
  { value: 'rejected',           label: 'Rechazada',        color: 'bg-danger-100 text-danger-700' },
  { value: 'pending_bank_load',  label: 'En banco (carga)', color: 'bg-accent-100 text-accent-700' },
  { value: 'pending_bank_auth',  label: 'En banco (auth)',  color: 'bg-info-100 text-info-700' },
  { value: 'reimbursed',         label: 'Reembolsada',      color: 'bg-ink-100 text-ink-600' },
]

function statusLabel(s: string) { return STATUS_OPTS.find(o => o.value === s)?.label ?? s }
function statusCls(s: string)   { return STATUS_OPTS.find(o => o.value === s)?.color ?? 'bg-ink-100 text-ink-600' }

interface Props { initialReports: Report[] }

export function AdminReportsClient({ initialReports }: Props) {
  const [reports,  setReports]  = useState<Report[]>(initialReports)
  const [details,  setDetails]  = useState<Record<string, Detail>>({})
  const [expanding, setExpanding] = useState<string | null>(null)
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | 'defontana' | null>(null)
  const [defontanaWarnings, setDefontanaWarnings] = useState<{ reportTitle: string; categories: string[] }[]>([])

  // Defontana: selección manual de un lote + export de una rendición puntual
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [defRowId,    setDefRowId]    = useState<string | null>(null)
  // Panel Defontana por tipo — cargas históricas
  const [defPanelId,  setDefPanelId]  = useState<string | null>(null)
  // Reversa de contabilización — el diálogo pide el motivo
  const [revertTarget, setRevertTarget] = useState<{ ids: string[]; label: string; detail: string | null } | null>(null)

  // Filtros
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [statusSel,  setStatusSel]  = useState<string[]>([])
  const [empFilter,       setEmpFilter]       = useState<string[]>([])
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false)
  const [empSearch,       setEmpSearch]       = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const empDropRef = useRef<HTMLDivElement>(null)
  const [reimb,      setReimb]      = useState<'all' | 'pending' | 'reimbursed'>('all')
  const [defFilter,  setDefFilter]  = useState<'all' | 'notExported' | 'exported'>('all')

  // Reembolso inline
  const [reimbOpen,    setReimbOpen]    = useState<string | null>(null)
  const [reimbRef,     setReimbRef]     = useState('')
  const [reimbAmount,  setReimbAmount]  = useState('')
  const [reimbSaving,  setReimbSaving]  = useState(false)
  const [revertingId,  setRevertingId]  = useState<string | null>(null)

  // Cerrar dropdown empleado al hacer click fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (empDropRef.current && !empDropRef.current.contains(e.target as Node)) {
        setEmpDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Eliminar
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)

  // Proceso bancario
  const [bankInitId, setBankInitId] = useState<string | null>(null)

  // Mover módulo (rendicion ↔ caja_chica)
  const [movingId, setMovingId] = useState<string | null>(null)

  // ZIP comprobantes
  const [zippingId, setZippingId] = useState<string | null>(null)

  // Reasignar CC masivo
  const [bulkCCReportId, setBulkCCReportId]   = useState<string | null>(null)
  const [bulkCCSelected, setBulkCCSelected]   = useState<string>('')
  const [bulkCCSaving,   setBulkCCSaving]     = useState(false)
  const [costCenters,    setCostCenters]       = useState<CostCenter[]>([])
  const [ccLoaded,       setCCLoaded]         = useState(false)

  async function openBulkCC(reportId: string) {
    if (!ccLoaded) {
      const ccs = await getCostCenters()
      setCostCenters(ccs.filter(c => c.imputable))
      setCCLoaded(true)
    }
    setBulkCCSelected('')
    setBulkCCReportId(reportId)
  }

  async function handleBulkCC() {
    if (!bulkCCReportId) return
    setBulkCCSaving(true)
    try {
      await bulkUpdateExpenseItemsCostCenter(bulkCCReportId, bulkCCSelected || null)
      setBulkCCReportId(null)
    } finally {
      setBulkCCSaving(false)
    }
  }

  async function handleExportZip(reportId: string, title: string) {
    setZippingId(reportId)
    try {
      const urls = await getReportAttachmentUrls(reportId)
      if (!urls.length) {
        alert('Esta rendición no tiene comprobantes adjuntos.')
        return
      }
      const JSZip = (await import('jszip')).default
      const zip   = new JSZip()
      const downloads = await Promise.allSettled(
        urls.map(async ({ filename, url }) => {
          const resp = await fetch(url)
          const blob = await resp.blob()
          return { filename, blob }
        })
      )
      for (const d of downloads) {
        if (d.status === 'fulfilled') zip.file(d.value.filename, d.value.blob)
      }
      const content = await zip.generateAsync({ type: 'blob' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(content)
      link.download = `comprobantes_${title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.zip`
      link.click()
      URL.revokeObjectURL(link.href)
    } finally {
      setZippingId(null)
    }
  }

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
    if (empFilter.length > 0 && !empFilter.includes(r.submitter_id)) return false
    if (deptFilter && r.department   !== deptFilter)   return false
    if (reimb === 'pending'    && r.status === 'reimbursed') return false
    if (reimb === 'reimbursed' && r.status !== 'reimbursed') return false
    if (defFilter === 'notExported' && r.defontana_exported_at) return false
    if (defFilter === 'exported'    && !r.defontana_exported_at) return false
    return true
  }), [reports, dateFrom, dateTo, statusSel, empFilter, deptFilter, reimb, defFilter])

  const empOptions = useMemo(() => {
    const list = employees.filter(e => !empSearch || e.name.toLowerCase().includes(empSearch.toLowerCase()))
    return list
  }, [employees, empSearch])

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
      const amount = reimbAmount ? parseFloat(reimbAmount) : undefined
      await markReimbursed(reportId, reimbRef, amount)
      setReimbOpen(null)
      setReimbRef('')
      setReimbAmount('')
      await load()
    } finally {
      setReimbSaving(false)
    }
  }

  async function handleBankInit(reportId: string, title: string) {
    if (!confirm(`¿Enviar "${title}" al proceso bancario?\n\nLa rendición pasará al estado "En banco (carga)" y los operadores bancarios podrán confirmar la transferencia.`)) return
    setBankInitId(reportId)
    try {
      await requestReportBankLoad(reportId)
      await load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al iniciar el proceso bancario')
    } finally {
      setBankInitId(null)
    }
  }

  async function handleRevert(reportId: string, title: string) {
    if (!confirm(`¿Revertir el reembolso de "${title}"?\n\nLa rendición volverá a estado Aprobada y se podrá marcar como reembolsada nuevamente.`)) return
    setRevertingId(reportId)
    try {
      await revertReimbursement(reportId)
      await load()
    } finally {
      setRevertingId(null)
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
        employee:   empFilter.length === 1 ? employees.find(e => e.id === empFilter[0])?.name : empFilter.length > 1 ? `${empFilter.length} empleados` : undefined,
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

  /** Exporta a Defontana. Sin argumentos toma todo el filtro actual; con `ids` exporta
   *  solo esas rendiciones — una fila puntual o el lote marcado con las casillas. */
  async function handleExportDefontana(ids?: string[]) {
    const scoped    = !!ids?.length
    const targetIds = scoped ? ids! : filtered.map(r => r.id)

    setExporting('defontana')
    if (scoped && ids!.length === 1) setDefRowId(ids![0])
    setDefontanaWarnings([])
    try {
      const { reports: defReports, settings, exportedReportIds } = await getDefontanaExportData({
        reportIds: targetIds,
        // Con selección explícita el rango de fechas no debe recortar lo elegido
        dateFrom:  scoped ? undefined : (dateFrom || undefined),
        dateTo:    scoped ? undefined : (dateTo   || undefined),
      })
      if (!defReports.length) {
        alert(scoped && targetIds.length === 1
          ? 'Esta rendición no tiene ítems aprobados para exportar a Defontana.\n\nSolo se exportan rendiciones aprobadas, aprobadas parcialmente o reembolsadas.'
          : 'No hay rendiciones aprobadas en la selección para exportar a Defontana.')
        return
      }
      if (!settings?.contraAccount) {
        alert('Configura la cuenta contraparte en Configuración → Defontana antes de exportar.')
        return
      }
      // Advertir si alguna rendición ya fue exportada antes
      if (exportedReportIds.length > 0) {
        const ok = window.confirm(
          `⚠ ${exportedReportIds.length} rendición(es) ya fue(ron) contabilizada(s) en Defontana anteriormente.\n\n` +
          `Exportar de nuevo puede generar asientos duplicados en la contabilidad.\n\n` +
          `¿Deseas continuar de todas formas?`
        )
        if (!ok) return
      }
      const { buildDefontanaEntries, exportDefontanaAuto } = await import('@/lib/export/defontana')
      const result = buildDefontanaEntries(defReports, settings)
      // Hora local en el ref: distingue dos exportaciones del mismo día al revertir
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const exportRef = `DEF-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
      const fileName = defReports.length === 1
        ? `defontana-${defReports[0].reportTitle.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40)}-${exportRef}`
        : `asientos-defontana-${exportRef}`
      // Un asiento → un .xlsx; varios → .zip con un archivo por comprobante,
      // porque Defontana no distingue dos asientos dentro del mismo archivo
      const vouchers = await exportDefontanaAuto(result, fileName)
      // Marcar todas las rendiciones incluidas como exportadas
      const justExportedIds = defReports.map(r => r.reportId)
      await markDefontanaExported(justExportedIds, exportRef)
      if (result.warnings.length > 0) {
        setDefontanaWarnings(result.warnings.map(w => ({ reportTitle: w.reportTitle, categories: w.categories })))
      }
      if (vouchers > 1) {
        alert(
          `Se generó un ZIP con ${vouchers} comprobantes, uno por archivo.\n\n` +
          `Defontana importa un comprobante por archivo, así que hay que subirlos de a uno.\n` +
          `Están numerados en el orden en que conviene importarlos.`
        )
      }
      setSelectedIds(new Set())
      await load()
    } finally {
      setExporting(null)
      setDefRowId(null)
    }
  }

  /** Abre el diálogo de motivo para deshacer el "Contabilizado" de una o varias rendiciones. */
  function openRevertDefontana(rows: Report[]) {
    const contabilizadas = rows.filter(r => r.defontana_exported_at)
    if (!contabilizadas.length) {
      alert('Ninguna de las rendiciones seleccionadas está contabilizada.')
      return
    }
    const refs = [...new Set(contabilizadas.map(r => r.defontana_export_ref).filter(Boolean))]
    setRevertTarget({
      ids:    contabilizadas.map(r => r.id),
      label:  contabilizadas.length === 1
        ? formatDisplayTitle(contabilizadas[0].title)
        : `${contabilizadas.length} rendiciones contabilizadas`,
      detail: refs.length ? `Comprobante: ${refs.join(' · ')}` : null,
    })
  }

  async function handleConfirmRevertDefontana(reason: string) {
    if (!revertTarget) return
    await revertDefontanaExport(revertTarget.ids, reason)
    setRevertTarget(null)
    setSelectedIds(new Set())
    await load()
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else              next.add(id)
      return next
    })
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

  const hasFilters = dateFrom || dateTo || statusSel.length > 0 || empFilter.length > 0 || deptFilter || reimb !== 'all' || defFilter !== 'all'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tor-on-gradient">Rendiciones</h1>
          <p className="text-sm tor-on-gradient-soft mt-0.5">{filtered.length} de {reports.length} resultado{reports.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <button
            onClick={() => handleExport('xlsx')}
            disabled={!!exporting || filtered.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all duration-[180ms] active:scale-[.97] shadow-sm hover:shadow-md"
            style={{ background: 'var(--cta-success)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            {exporting === 'xlsx' ? 'Exportando…' : 'Excel'}
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={!!exporting || filtered.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all duration-[180ms] active:scale-[.97] shadow-sm hover:shadow-md"
            style={{ background: 'var(--cta-danger)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            {exporting === 'pdf' ? 'Exportando…' : 'PDF'}
          </button>
          <button
            onClick={() => handleExportDefontana()}
            disabled={!!exporting || filtered.length === 0}
            title={`Exportar las ${filtered.length} rendiciones del filtro actual`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all duration-[180ms] active:scale-[.97] shadow-sm hover:shadow-md"
            style={{ background: 'var(--cta-accent)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            {exporting === 'defontana' && !defRowId ? 'Exportando…' : `Defontana (${filtered.length})`}
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={!!exporting || deletingAll || reports.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-danger-200 border border-danger-200/40 hover:bg-danger-200/10 rounded-item disabled:opacity-40 transition-colors"
            title="Eliminar todas las rendiciones (solo para pruebas)"
          >
            <Trash2 size={14} />
            {deletingAll ? 'Eliminando…' : 'Eliminar todas'}
          </button>
        </div>
      </div>

      {/* Advertencias Defontana */}
      {defontanaWarnings.length > 0 && (
        <div className="bg-warning-50 border border-warning-200 rounded-card p-4">
          <div className="flex items-start gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SEMANTIC.warning} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-warning-800 mb-1">Categorías sin código Defontana ({defontanaWarnings.length} {defontanaWarnings.length === 1 ? 'rendición' : 'rendiciones'})</p>
              <p className="text-xs text-warning-700 mb-2">Los ítems de estas categorías no fueron incluidos en los asientos. Asigna sus códigos en <strong>Configuración → Defontana</strong>.</p>
              <ul className="space-y-1">
                {defontanaWarnings.map((w, i) => (
                  <li key={i} className="text-xs text-warning-700">
                    <span className="font-medium">{w.reportTitle}:</span> {w.categories.join(', ')}
                  </li>
                ))}
              </ul>
              <button onClick={() => setDefontanaWarnings([])} className="mt-2 text-xs text-warning-600 hover:underline">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* KPI alerta: rendiciones en espera +5 días */}
      {staleSubmitted > 0 && (
        <div className="bg-warning-50 border border-warning-200 rounded-card p-3 flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={SEMANTIC.warning} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <p className="text-xs text-warning-800 font-medium">
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
      <div className="hoja p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="card-meta font-semibold text-ink-600">Filtros</p>
          {hasFilters && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); setStatusSel([]); setEmpFilter([]); setDeptFilter(''); setReimb('all'); setDefFilter('all') }}
              className="text-xs text-brand-600 hover:underline"
            >
              Limpiar todo
            </button>
          )}
        </div>

        {/* Fecha */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-ink-500 mb-1">Desde (fecha envío)</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="campo w-full" />
          </div>
          <div>
            <label className="block text-xs text-ink-500 mb-1">Hasta</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="campo w-full" />
          </div>
        </div>

        {/* Estado */}
        <div>
          <p className="text-xs text-ink-500 mb-2">Estado</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTS.map(s => (
              <button
                key={s.value}
                onClick={() => toggleStatus(s.value)}
                className={[
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  statusSel.includes(s.value) ? s.color + ' ring-2 ring-offset-1 ring-brand-600' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                ].join(' ')}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Empleado / Depto / Reembolso / Defontana */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div ref={empDropRef}>
            <label className="block text-xs text-ink-500 mb-1">Empleado</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setEmpDropdownOpen(o => !o)}
                className="campo w-full flex items-center justify-between hover:border-brand-400"
              >
                <span className={empFilter.length ? 'text-ink-800' : 'text-ink-400'}>
                  {empFilter.length === 0 ? 'Todos' : `${empFilter.length} seleccionado${empFilter.length !== 1 ? 's' : ''}`}
                </span>
                <ChevronDown size={13} className={`text-ink-400 transition-transform ${empDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {empDropdownOpen && (
                <div className="absolute z-50 top-full mt-1 w-full min-w-[220px] bg-white border border-ink-200 rounded-item shadow-lg">
                  <div className="p-2 border-b border-ink-100">
                    <input
                      type="text"
                      placeholder="Buscar empleado…"
                      value={empSearch}
                      onChange={e => setEmpSearch(e.target.value)}
                      className="campo w-full px-2.5 py-1.5"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto p-1">
                    {empOptions.map(e => (
                      <label key={e.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-ink-50 cursor-pointer rounded-item">
                        <input
                          type="checkbox"
                          checked={empFilter.includes(e.id)}
                          onChange={() => setEmpFilter(ids => ids.includes(e.id) ? ids.filter(x => x !== e.id) : [...ids, e.id])}
                          className="accent-brand-600 w-3.5 h-3.5 shrink-0"
                        />
                        <span className="text-sm text-ink-700">{e.name}</span>
                      </label>
                    ))}
                    {empOptions.length === 0 && (
                      <p className="text-xs text-ink-400 text-center py-3">Sin resultados</p>
                    )}
                  </div>
                  {empFilter.length > 0 && (
                    <div className="border-t border-ink-100 px-3 py-2">
                      <button type="button" onClick={() => setEmpFilter([])} className="text-xs text-ink-400 hover:text-ink-600">
                        Limpiar selección
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-500 mb-1">Departamento</label>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="campo w-full">
              <option value="">Todos</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-500 mb-1">Reembolso</label>
            <select value={reimb} onChange={e => setReimb(e.target.value as typeof reimb)}
              className="campo w-full">
              <option value="all">Todos</option>
              <option value="pending">Pendiente de reembolso</option>
              <option value="reimbursed">Reembolsadas</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-500 mb-1">Contabilización</label>
            <select value={defFilter} onChange={e => setDefFilter(e.target.value as typeof defFilter)}
              className="campo w-full">
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

      {/* Barra de lote — aparece al marcar casillas */}
      {selectedIds.size > 0 && (() => {
        const picked        = filtered.filter(r => selectedIds.has(r.id))
        const contabilizadas = picked.filter(r => r.defontana_exported_at).length
        return (
          <div className="sticky top-2 z-30 bg-ink-900 text-white rounded-card px-4 py-3 flex items-center justify-between gap-3 flex-wrap shadow-lg">
            <div className="text-sm">
              <strong>{picked.length}</strong> seleccionada{picked.length !== 1 ? 's' : ''}
              {contabilizadas > 0 && (
                <span className="text-accent-300 ml-2 text-xs">· {contabilizadas} ya contabilizada{contabilizadas !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleExportDefontana(picked.map(r => r.id))}
                disabled={!!exporting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent-600 hover:bg-accent-500 rounded-item disabled:opacity-40 transition-colors"
              >
                <FileSpreadsheet size={13} />
                {exporting === 'defontana' ? 'Exportando…' : `Exportar a Defontana (${picked.length})`}
              </button>
              {contabilizadas > 0 && (
                <button
                  onClick={() => openRevertDefontana(picked)}
                  disabled={!!exporting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-warning-200 border border-warning-400/40 hover:bg-warning-400/10 rounded-item disabled:opacity-40 transition-colors"
                >
                  <Undo2 size={13} />
                  Revertir contabilización ({contabilizadas})
                </button>
              )}
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 text-xs font-semibold text-ink-300 hover:text-white transition-colors"
              >
                Limpiar
              </button>
            </div>
          </div>
        )
      })()}

      <div className="space-y-2">
        {filtered.map(r => {
          const isOpen    = expanded === r.id
          const detail    = details[r.id]
          const loading   = expanding === r.id
          const canReimb  = r.status === 'approved' || r.status === 'partially_approved'
          const isReopened = reimbOpen === r.id
          // Defontana solo acepta rendiciones ya aprobadas
          const canDefontana = ['approved', 'partially_approved', 'reimbursed'].includes(r.status)

          return (
            <div key={r.id} className="hoja overflow-hidden">
              {/* Fila principal */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  {canDefontana && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelected(r.id)}
                      title="Seleccionar para exportar a Defontana"
                      className="mt-1 w-4 h-4 shrink-0 accent-accent-600 cursor-pointer"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[16px] leading-snug font-semibold text-ink-800">{formatDisplayTitle(r.title)}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCls(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                      {r.defontana_exported_at && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent-50 text-accent-700 border border-accent-200">
                          ✓ Contabilizado {formatDate(r.defontana_exported_at.split('T')[0])}
                          {r.defontana_export_ref && ` · ${r.defontana_export_ref}`}
                        </span>
                      )}
                      {/* Badge cuadre de reembolso */}
                      {r.status === 'reimbursed' && (() => {
                        if (r.reimbursed_amount == null) return (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-ink-100 text-ink-500 border border-ink-200" title="No se registró el monto pagado">
                            — Sin registro
                          </span>
                        )
                        const diff = r.reimbursed_amount - r.approved_amount
                        const absDiff = Math.abs(diff)
                        if (absDiff < 1) return (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success-50 text-success-700 border border-success-200">
                            ✓ Cuadrado
                          </span>
                        )
                        if (diff > 0) return (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-warning-50 text-warning-700 border border-warning-200" title={`Aprobado neto: ${formatCLP(r.approved_amount)} · Reembolsado: ${formatCLP(r.reimbursed_amount)}`}>
                            ↑ Exceso de reembolso {formatCLP(absDiff)}
                          </span>
                        )
                        return (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-danger-50 text-danger-700 border border-danger-200" title={`Aprobado neto: ${formatCLP(r.approved_amount)} · Reembolsado: ${formatCLP(r.reimbursed_amount)}`}>
                            ↓ Pendiente por reembolsar {formatCLP(absDiff)}
                          </span>
                        )
                      })()}
                    </div>
                    <p className="text-xs text-ink-500 mt-0.5">
                      <strong>{r.submitter_name}</strong>
                      {r.department && ` · ${r.department}`}
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5">
                      {r.submitted_at && `Enviada ${formatDate(r.submitted_at.split('T')[0])}`}
                      {r.approved_at  && ` · Aprobada ${formatDate(r.approved_at.split('T')[0])}`}
                      {r.reimbursed_at && ` · Reembolsada ${formatDate(r.reimbursed_at.split('T')[0])}`}
                      {r.payment_reference && ` · Ref: ${r.payment_reference}`}
                    </p>
                    {r.status !== 'rejected' && (
                      <div className="mt-2 max-w-xs">
                        <CompactStepper
                          steps={REPORT_STEPS}
                          currentStatus={r.status === 'partially_approved' ? 'approved' : r.status}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-ink-800">{formatCLP(r.total_amount)}</p>
                      {r.approved_amount > 0 && r.approved_amount !== r.total_amount && (
                        <p className="text-xs text-success-600">Por reembolsar: {formatCLP(r.approved_amount)}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleExpand(r.id)}
                      className="text-xs text-brand-600 hover:text-brand-800 font-medium px-2 py-1 border border-brand-200 rounded-item hover:bg-brand-50 transition-colors"
                    >
                      {loading ? '...' : isOpen ? '▲ Cerrar' : '▼ Ver detalle'}
                    </button>
                    {canDefontana && r.is_historical_import && (
                      <button
                        onClick={() => setDefPanelId(prev => prev === r.id ? null : r.id)}
                        className={[
                          'p-1.5 rounded-item transition-colors',
                          defPanelId === r.id
                            ? 'text-accent-700 bg-accent-100'
                            : 'text-accent-500 hover:text-accent-700 hover:bg-accent-50',
                        ].join(' ')}
                        title="Defontana por tipo: exportar, confirmar o revertir gastos y adelantos por separado"
                      >
                        <FileSpreadsheet size={14} />
                      </button>
                    )}
                    {canDefontana && !r.is_historical_import && !r.defontana_exported_at && (
                      <button
                        onClick={() => handleExportDefontana([r.id])}
                        disabled={!!exporting}
                        className="p-1.5 text-accent-500 hover:text-accent-700 hover:bg-accent-50 rounded-item transition-colors disabled:opacity-40"
                        title="Exportar solo esta rendición a Defontana"
                      >
                        {defRowId === r.id
                          ? <span className="inline-block w-3.5 h-3.5 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
                          : <FileSpreadsheet size={14} />}
                      </button>
                    )}
                    {r.defontana_exported_at && !r.is_historical_import && (
                      <button
                        onClick={() => openRevertDefontana([r])}
                        disabled={!!exporting}
                        className="p-1.5 text-warning-500 hover:text-warning-700 hover:bg-warning-50 rounded-item transition-colors disabled:opacity-40"
                        title="Revertir contabilización (vuelve a Sin contabilizar)"
                      >
                        <BookCheck size={14} />
                      </button>
                    )}
                    {r.is_historical_import && (
                      <button
                        onClick={() => handleMoveModule(r.id, r.title)}
                        disabled={movingId === r.id}
                        className="p-1.5 text-warning-500 hover:text-warning-700 hover:bg-warning-50 rounded-item transition-colors disabled:opacity-40"
                        title="Mover a Caja Chica"
                      >
                        <ArrowRightLeft size={14} />
                      </button>
                    )}
                    {r.status === 'reimbursed' && (
                      <button
                        onClick={() => handleRevert(r.id, r.title)}
                        disabled={revertingId === r.id}
                        className="p-1.5 text-ink-400 hover:text-ink-600 hover:bg-ink-100 rounded-item transition-colors disabled:opacity-40"
                        title="Revertir reembolso (vuelve a Aprobada)"
                      >
                        <Undo2 size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(r.id, r.title)}
                      disabled={deletingId === r.id}
                      className="p-1.5 text-danger-400 hover:text-danger-600 hover:bg-danger-50 rounded-item transition-colors disabled:opacity-40"
                      title="Eliminar rendición"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Borrador: CTA para continuar editando */}
                {r.status === 'draft' && (
                  <div className="mt-3 pt-3 border-t border-warning-100 flex items-center justify-between gap-3 flex-wrap">
                    <span className="flex items-center gap-1.5 text-xs text-warning-700 font-medium">
                      <FilePen size={13} />
                      Borrador — no enviada al aprobador
                    </span>
                    <Link
                      href={`/expenses/${r.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-warning-500 hover:bg-warning-600 text-white px-3 py-1.5 rounded-item transition-colors"
                    >
                      Continuar editando →
                    </Link>
                  </div>
                )}

                {/* Acciones de reembolso */}
                {canReimb && !isReopened && (
                  <div className="mt-3 pt-3 border-t border-ink-100 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => handleBankInit(r.id, r.title)}
                      disabled={bankInitId === r.id}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-item transition-colors"
                    >
                      <Landmark size={13} />
                      {bankInitId === r.id ? 'Iniciando…' : 'Iniciar proceso bancario'}
                    </button>
                    <button
                      onClick={() => { setReimbOpen(r.id); setReimbRef(''); setReimbAmount(r.approved_amount > 0 ? String(r.approved_amount) : '') }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-700 transition-colors"
                    >
                      <Banknote size={13} />Marcar reembolsada directamente
                    </button>
                  </div>
                )}
                {isReopened && (
                  <div className="mt-3 pt-3 border-t border-ink-100 space-y-2">
                    <div className="flex gap-2 items-center">
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-ink-500">Monto reembolsado (CLP)</label>
                        <input
                          type="number"
                          value={reimbAmount}
                          onChange={e => setReimbAmount(e.target.value)}
                          placeholder={`Por reembolsar: ${formatCLP(r.approved_amount)}`}
                          className="campo w-full px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-ink-500">Referencia (opcional)</label>
                        <input
                          type="text"
                          value={reimbRef}
                          onChange={e => setReimbRef(e.target.value)}
                          placeholder="N° transferencia, cheque…"
                          className="campo w-full px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                    {reimbAmount && (() => {
                      const paid = parseFloat(reimbAmount)
                      const diff = paid - r.approved_amount
                      if (Math.abs(diff) < 1) return <p className="text-xs text-success-600 font-medium">✓ Cuadra exacto con el monto aprobado</p>
                      if (diff > 0) return <p className="text-xs text-warning-600">↑ Estás pagando {formatCLP(diff)} de más sobre los {formatCLP(r.approved_amount)} aprobados</p>
                      return <p className="text-xs text-danger-600">↓ Estás pagando {formatCLP(Math.abs(diff))} de menos sobre los {formatCLP(r.approved_amount)} aprobados</p>
                    })()}
                    <div className="flex gap-2 items-center">
                    <button
                      onClick={() => handleReimburse(r.id)}
                      disabled={reimbSaving}
                      className="px-3 py-1.5 bg-info-600 hover:bg-info-700 disabled:opacity-50 text-white text-xs font-semibold rounded-item transition-colors"
                    >
                      {reimbSaving ? '...' : 'Confirmar'}
                    </button>
                    <button onClick={() => setReimbOpen(null)} className="text-xs text-ink-400 hover:text-ink-600">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Panel Defontana por tipo — solo cargas históricas (gastos y adelantos
                  pueden ir en comprobantes separados) */}
              {defPanelId === r.id && (
                <DefontanaTypePanel
                  reportId={r.id}
                  onClose={() => setDefPanelId(null)}
                  onChanged={load}
                />
              )}

              {/* Detalle expandido */}
              {isOpen && (
                <div className="border-t border-ink-100 bg-ink-50/60">
                  {!detail && (
                    <div className="flex items-center justify-center py-6">
                      <span className="text-xs text-ink-400">Cargando...</span>
                    </div>
                  )}
                  {detail && (
                    <>
                      {/* KPI mini-cards */}
                      <div className="p-4 pb-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="hoja border border-ink-100 p-3">
                          <p className="text-xs text-ink-400">Total rendición</p>
                          <p className="text-sm font-bold text-ink-800 font-mono-amount mt-0.5">{formatCLP(r.total_amount)}</p>
                          <p className="text-xs text-ink-400 mt-0.5">{detail.items.length} ítem{detail.items.length !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="hoja border border-ink-100 p-3">
                          <p className="text-xs text-ink-400">Gastos aprobados</p>
                          <p className="text-sm font-bold text-ink-800 font-mono-amount mt-0.5">
                            {formatCLP(detail.items.filter(i => i.status === 'approved' && i.item_type === 'expense').reduce((s, i) => s + i.amount_clp, 0))}
                          </p>
                          <p className="text-xs text-ink-400 mt-0.5">{detail.items.filter(i => i.status === 'approved').length} aprobados</p>
                        </div>
                        <div className="hoja border border-ink-100 p-3">
                          <p className="text-xs text-ink-400">Por reembolsar</p>
                          <p className={`text-sm font-bold font-mono-amount mt-0.5 ${r.approved_amount > 0 ? 'text-brand-700' : 'text-ink-400'}`}>
                            {r.approved_amount > 0 ? formatCLP(r.approved_amount) : '—'}
                          </p>
                          <p className="text-xs text-ink-400 mt-0.5">neto aprobado</p>
                        </div>
                        <div className="hoja border border-ink-100 p-3">
                          <p className="text-xs text-ink-400">Reembolsado</p>
                          <p className={`text-sm font-bold font-mono-amount mt-0.5 ${r.reimbursed_amount != null ? 'text-success-700' : 'text-ink-400'}`}>
                            {r.reimbursed_amount != null ? formatCLP(r.reimbursed_amount) : '—'}
                          </p>
                          {r.reimbursed_at && (
                            <p className="text-xs text-ink-400 mt-0.5">{formatDate(r.reimbursed_at.split('T')[0])}</p>
                          )}
                        </div>
                      </div>

                      {/* Contenido: timeline + detalle */}
                      <div className="p-4 grid grid-cols-1 md:grid-cols-[160px_1fr] gap-6">
                        {/* Columna izquierda: timeline vertical */}
                        <div>
                          <p className="card-label font-semibold text-ink-500 mb-3">Progreso</p>
                          <VerticalTimeline
                            steps={REPORT_STEPS}
                            currentStatus={r.status === 'partially_approved' ? 'approved' : r.status}
                          />
                        </div>

                        {/* Columna derecha: historial + ítems + zip */}
                        <div className="space-y-5">
                          {/* Historial de aprobaciones */}
                          {detail.approvals.length > 0 && (
                            <div>
                              <p className="card-label font-semibold text-ink-500 mb-2">Historial de aprobaciones</p>
                              <div className="space-y-1.5">
                                {detail.approvals.map((a, i) => (
                                  <div key={i} className={[
                                    'flex items-start gap-2 text-xs rounded-item px-3 py-2',
                                    a.action === 'approved' ? 'bg-success-50 text-success-800' :
                                    a.action === 'rejected' ? 'bg-danger-50 text-danger-800' :
                                    'bg-ink-100 text-ink-700',
                                  ].join(' ')}>
                                    <span className="font-medium shrink-0">N{a.level}</span>
                                    <span className="font-semibold shrink-0">{a.approver_name}</span>
                                    <span className="shrink-0">→ {statusLabel(a.action)}</span>
                                    {a.notes && <span className="text-ink-500 italic">"{a.notes}"</span>}
                                    <span className="ml-auto text-ink-400 shrink-0">{formatDate(a.created_at.split('T')[0])}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Ítems */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="card-label font-semibold text-ink-500">Ítems ({detail.items.length})</p>
                              <button
                                onClick={() => openBulkCC(r.id)}
                                className="text-xs text-brand-600 border border-brand-200 hover:bg-brand-50 px-2.5 py-1 rounded-item font-semibold transition-colors"
                              >
                                Reasignar CC
                              </button>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="text-left text-ink-400 border-b border-ink-200">
                                    <th className="pb-1.5 pr-3 font-medium">Descripción</th>
                                    <th className="pb-1.5 pr-3 font-medium">Tipo</th>
                                    <th className="pb-1.5 pr-3 font-medium">Categoría</th>
                                    <th className="pb-1.5 pr-3 font-medium text-right">Monto</th>
                                    <th className="pb-1.5 pr-3 font-medium">Estado</th>
                                    <th className="pb-1.5 font-medium">Motivo rechazo</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-100">
                                  {detail.items.map((item, i) => (
                                    <tr key={i}>
                                      <td className="py-1.5 pr-3 text-ink-700">{item.description}</td>
                                      <td className="py-1.5 pr-3">
                                        {item.item_type === 'advance'  && <span className="px-1.5 py-0.5 rounded bg-warning-50 text-warning-700 font-medium">Anticipo</span>}
                                        {item.item_type === 'return'   && <span className="px-1.5 py-0.5 rounded bg-info-50 text-info-700 font-medium">Devolución</span>}
                                        {item.item_type === 'transfer' && <span className="px-1.5 py-0.5 rounded bg-ink-100 text-ink-600 font-medium">Traspaso</span>}
                                        {(item.item_type === 'expense' || !item.item_type) && <span className="text-ink-400">—</span>}
                                      </td>
                                      <td className="py-1.5 pr-3 text-ink-500">
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
                                            className="text-xs border border-ink-300 rounded px-1 py-0.5 bg-white max-w-[160px]"
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
                                              className="opacity-0 group-hover/cat:opacity-100 transition-opacity text-ink-400 hover:text-brand-600 shrink-0"
                                              title="Reclasificar categoría"
                                            >
                                              <FilePen size={10} />
                                            </button>
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-1.5 pr-3 text-right font-mono text-ink-800">{formatCLP(item.amount_clp)}</td>
                                      <td className="py-1.5 pr-3">
                                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusCls(item.status)}`}>
                                          {statusLabel(item.status)}
                                        </span>
                                      </td>
                                      <td className="py-1.5 text-danger-600 italic">{item.rejection_reason ?? ''}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* ZIP comprobantes */}
                          <div className="flex justify-end pt-1">
                            <button
                              onClick={() => handleExportZip(r.id, r.title)}
                              disabled={zippingId === r.id}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 border border-brand-200 hover:bg-brand-50 px-3 py-1.5 rounded-item transition-colors disabled:opacity-40"
                            >
                              {zippingId === r.id
                                ? <span className="w-3 h-3 border border-brand-400 border-t-transparent rounded-full animate-spin" />
                                : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              }
                              {zippingId === r.id ? 'Preparando ZIP…' : 'Comprobantes ZIP'}
                            </button>
                          </div>
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

      {/* ── Modal Reasignar Centro de Costo ── */}
      {bulkCCReportId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="hoja shadow-xl p-6 w-full max-w-sm space-y-4 mx-4">
            <h3 className="font-semibold text-ink-800">Reasignar Centro de Costo</h3>
            <p className="text-sm text-ink-500">
              Aplicará el centro de costo seleccionado a <strong>todos los ítems</strong> de esta rendición.
            </p>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1">Centro de costo</label>
              <select
                value={bulkCCSelected}
                onChange={e => setBulkCCSelected(e.target.value)}
                className="campo w-full"
              >
                <option value="">Sin centro asignado (quitar override)</option>
                {costCenters.map(cc => (
                  <option key={cc.id} value={cc.id}>{cc.id} — {cc.descripcion}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setBulkCCReportId(null)}
                disabled={bulkCCSaving}
                className="btn-secundario flex-1 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkCC}
                disabled={bulkCCSaving}
                className="btn-primario flex-1 py-2 text-sm"
              >
                {bulkCCSaving ? 'Guardando...' : 'Aplicar a todos los ítems'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Diálogo Revertir contabilización Defontana ── */}
      {revertTarget && (
        <RevertDefontanaDialog
          targetLabel={revertTarget.label}
          detail={revertTarget.detail}
          onCancel={() => setRevertTarget(null)}
          onConfirm={handleConfirmRevertDefontana}
        />
      )}
    </div>
  )
}
