'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Wallet, Plus, FileText, Filter, X, Download, BarChart2, Trash2, History, ArrowRightLeft, ChevronDown, ChevronRight, ArrowDownToLine, ArrowUpFromLine, Receipt, BookCheck, Pencil, Check, Link2, SendHorizontal, FileSpreadsheet, Search } from 'lucide-react'
import { FundStatusBadge } from '@/components/petty-cash/FundStatusBadge'
import { formatPeriod } from '@/lib/petty-cash-helpers'
import { formatDate, formatCLP } from '@/lib/utils'
import { buildPeriodRange } from '@/lib/report-helpers'
import type { PeriodPreset } from '@/lib/report-helpers'
import { getPettyCashItemsForReport, deletePettyCashFund } from '@/actions/petty-cash'
import { changeHistoricalImportType, markHistoricalImportDefontana, updateHistoricalExpenseItem, updateHistoricalImportTitle, getHistoricalFundDefontanaData, markExpenseItemsDefontanaExported } from '@/actions/admin'
import { deleteExpenseReport } from '@/actions/expenses'
import { createFundTransfer, linkFundTransfer, getEmployeeTargets } from '@/actions/fund-transfers'
import type { FundListItem } from '@/actions/petty-cash'
import type { getHistoricalCajaChicaImports } from '@/actions/admin'
import type { FundTransferRow, EmployeeTarget } from '@/actions/fund-transfers'

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
type HistoricalImport = Awaited<ReturnType<typeof getHistoricalCajaChicaImports>>[number]
type HistItem = HistoricalImport['items'][number]

// Patch que se pasa al padre para recalcular totales sin recargar página
type ItemSavedPatch = {
  item_type:   'expense' | 'advance' | 'return' | 'transfer'
  description: string
  amount_clp:  number
  date:        string
  merchant:    string | null
}

// Estado para el modal de creación de traspaso
type TransferSource = {
  fundId?:       string
  reportId?:     string
  defaultAmount: number
  payerEmpId:    string
}

const CURRENT_YEAR = new Date().getFullYear()

interface Props {
  initialFunds:      FundListItem[]
  initialCategories: Category[]
  isManager:         boolean
  historicalImports: HistoricalImport[]
  orgEmployees:      { id: string; full_name: string }[]
  pendingTransfers:  FundTransferRow[]
}

export function PettyCashClient({ initialFunds, initialCategories, isManager, historicalImports: initialHistoricalImports, orgEmployees, pendingTransfers: initialPendingTransfers }: Props) {
  // ── Estado local de fondos (permite eliminar sin recargar la página) ──────
  const [funds, setFunds] = useState<FundListItem[]>(initialFunds)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ── Estado local de históricas (permite mover sin recargar) ──────────────
  const [historicalImports, setHistoricalImports] = useState(initialHistoricalImports)
  const [movingHistId,      setMovingHistId]      = useState<string | null>(null)
  const [deletingHistId,    setDeletingHistId]    = useState<string | null>(null)
  const [defontanaMarkingId, setDefontanaMarkingId] = useState<string | null>(null)

  // ── Estado de traspasos ──────────────────────────────────────────────────
  const [pendingTransfers, setPendingTransfers] = useState<FundTransferRow[]>(initialPendingTransfers)

  // Modal crear traspaso
  const [transferSource,  setTransferSource]  = useState<TransferSource | null>(null)
  const [trReceiverId,    setTrReceiverId]    = useState('')
  const [trAmount,        setTrAmount]        = useState('')
  const [trDate,          setTrDate]          = useState('')
  const [trDesc,          setTrDesc]          = useState('')
  const [trSaving,        setTrSaving]        = useState(false)
  const [trError,         setTrError]         = useState<string | null>(null)

  // Modal vincular traspaso
  const [linkingTransfer, setLinkingTransfer] = useState<FundTransferRow | null>(null)
  const [linkTargets,     setLinkTargets]     = useState<EmployeeTarget[]>([])
  const [linkTargetId,    setLinkTargetId]    = useState('')
  const [linkTargetType,  setLinkTargetType]  = useState<'fund' | 'report'>('fund')
  const [loadingTargets,  setLoadingTargets]  = useState(false)
  const [linkSaving,      setLinkSaving]      = useState(false)
  const [linkError,       setLinkError]       = useState<string | null>(null)

  // Actualiza items Y recalcula totales del grupo sin recargar página
  function handleItemSaved(reportId: string, itemId: string, patch: ItemSavedPatch) {
    setHistoricalImports(prev => prev.map(h => {
      if (h.id !== reportId) return h
      const updatedItems = h.items.map(i => i.id === itemId ? { ...i, ...patch } : i)
      const advance_total = updatedItems.filter(i => i.item_type === 'advance').reduce((s, i) => s + i.amount_clp, 0)
      const expense_total = updatedItems.filter(i => i.item_type === 'expense').reduce((s, i) => s + i.amount_clp, 0)
      const return_total  = updatedItems.filter(i => i.item_type === 'return' ).reduce((s, i) => s + i.amount_clp, 0)
      return { ...h, items: updatedItems, advance_total, expense_total, return_total }
    }))
  }

  function handleTitleUpdated(reportId: string, title: string) {
    setHistoricalImports(prev => prev.map(h => h.id === reportId ? { ...h, title } : h))
  }

  // ── Handlers de traspaso ─────────────────────────────────────────────────

  function openTransferModal(source: TransferSource) {
    setTransferSource(source)
    setTrReceiverId('')
    setTrAmount(String(Math.round(source.defaultAmount)))
    setTrDate(new Date().toISOString().split('T')[0])
    setTrDesc('')
    setTrError(null)
  }

  async function handleCreateTransfer() {
    if (!transferSource) return
    if (!trReceiverId) { setTrError('Selecciona un empleado receptor'); return }
    const amount = parseFloat(trAmount)
    if (isNaN(amount) || amount <= 0) { setTrError('Ingresa un monto válido'); return }
    if (!trDate) { setTrError('Selecciona una fecha'); return }
    setTrSaving(true)
    setTrError(null)
    try {
      await createFundTransfer({
        date:                 trDate,
        amount,
        description:          trDesc.trim() || undefined,
        receiver_employee_id: trReceiverId,
        payer_fund_id:        transferSource.fundId,
        payer_report_id:      transferSource.reportId,
      })
      setTransferSource(null)
      // La revalidación actualiza la lista; recargamos manualmente el listado de pendientes
      window.location.reload()
    } catch (err) {
      setTrError(err instanceof Error ? err.message : 'Error al registrar traspaso')
    } finally {
      setTrSaving(false)
    }
  }

  async function openLinkModal(transfer: FundTransferRow) {
    setLinkingTransfer(transfer)
    setLinkTargetId('')
    setLinkError(null)
    setLoadingTargets(true)
    try {
      const targets = await getEmployeeTargets(transfer.receiver_employee_id)
      setLinkTargets(targets)
      if (targets.length) {
        setLinkTargetId(targets[0].id)
        setLinkTargetType(targets[0].type)
      }
    } catch {
      setLinkTargets([])
    } finally {
      setLoadingTargets(false)
    }
  }

  async function handleLinkTransfer() {
    if (!linkingTransfer || !linkTargetId) return
    setLinkSaving(true)
    setLinkError(null)
    try {
      await linkFundTransfer(linkingTransfer.id, {
        fundId:   linkTargetType === 'fund'   ? linkTargetId : undefined,
        reportId: linkTargetType === 'report' ? linkTargetId : undefined,
      })
      setPendingTransfers(prev => prev.filter(t => t.id !== linkingTransfer.id))
      setLinkingTransfer(null)
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Error al vincular')
    } finally {
      setLinkSaving(false)
    }
  }

  async function handleDeleteHistorical(id: string, title: string) {
    if (!confirm(`¿Eliminar la carga histórica "${title}"?\n\nEsta acción la moverá a la papelera.`)) return
    setDeletingHistId(id)
    try {
      await deleteExpenseReport(id)
      setHistoricalImports(prev => prev.filter(h => h.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeletingHistId(null)
    }
  }

  async function handleMarkDefontana(id: string, title: string) {
    const ref = prompt(`Marcar "${title}" como contabilizada en Defontana.\n\nNúmero de comprobante Defontana (opcional):`)
    if (ref === null) return  // canceló
    setDefontanaMarkingId(id)
    try {
      await markHistoricalImportDefontana(id, ref)
      setHistoricalImports(prev => prev.map(h =>
        h.id === id
          ? { ...h, defontana_exported_at: new Date().toISOString(), defontana_export_ref: ref || null }
          : h
      ))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al marcar')
    } finally {
      setDefontanaMarkingId(null)
    }
  }

  // Solo genera y descarga el Excel — NO marca ítems como contabilizados.
  // La confirmación es un paso separado (handleConfirmContabilizado).
  async function handleExportDefontanaFund(
    reportId:  string,
    itemTypes: ('expense' | 'advance' | 'return')[],
    title:     string,
  ): Promise<{ warnings: { categories: string[]; unmappedCLP: number } | null }> {
    const { report, settings, itemIds } = await getHistoricalFundDefontanaData(reportId, itemTypes)

    if (!settings.contraAccount) {
      alert('Configura la cuenta contraparte en Configuración → Defontana antes de exportar.')
      return { warnings: null }
    }
    if (!itemIds.length) {
      alert('No hay ítems pendientes de contabilizar para los tipos seleccionados.')
      return { warnings: null }
    }

    const { buildDefontanaEntries, exportDefontanaToExcel } = await import('@/lib/export/defontana')
    const result = buildDefontanaEntries([report], settings)
    exportDefontanaToExcel(result, `caja-chica-defontana-CC-${title.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}`)

    const w = result.warnings[0]
    return { warnings: w ? { categories: w.categories, unmappedCLP: w.unmappedCLP } : null }
  }

  // Marca los ítems de los tipos seleccionados como contabilizados en Defontana,
  // con número de comprobante opcional. Llama a este handler DESPUÉS de confirmar
  // que la importación en Defontana fue exitosa.
  async function handleConfirmContabilizado(
    reportId:    string,
    itemTypes:   ('expense' | 'advance' | 'return')[],
    comprobante: string,
  ): Promise<void> {
    const fund = historicalImports.find(h => h.id === reportId)
    if (!fund) return

    const itemIds = fund.items
      .filter(i => (itemTypes as string[]).includes(i.item_type || '') && !i.defontana_exported_at)
      .map(i => i.id)

    if (itemIds.length > 0) {
      await markExpenseItemsDefontanaExported(itemIds)
    }

    if (comprobante.trim()) {
      await markHistoricalImportDefontana(reportId, comprobante.trim())
    }

    const now = new Date().toISOString()
    setHistoricalImports(prev => prev.map(h => {
      if (h.id !== reportId) return h
      return {
        ...h,
        defontana_export_ref:  comprobante.trim() || h.defontana_export_ref,
        items: h.items.map(i =>
          itemIds.includes(i.id) ? { ...i, defontana_exported_at: now } : i
        ),
      }
    }))
  }

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

  async function handleMoveToRendicion(id: string, title: string) {
    if (!confirm(`¿Mover "${title}" al módulo Rendiciones?\n\nDesaparecerá de Caja Chica y aparecerá en Admin → Rendiciones.`)) return
    setMovingHistId(id)
    try {
      await changeHistoricalImportType(id, 'rendicion')
      setHistoricalImports(prev => prev.filter(h => h.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al mover')
    } finally {
      setMovingHistId(null)
    }
  }

  // ── Filtros de lista (cliente) ────────────────────────────────────────────
  const [statusFilter,        setStatusFilter]        = useState('all')
  const [dateFrom,            setDateFrom]            = useState('')
  const [dateTo,              setDateTo]              = useState('')
  const [selectedEmpIds_list, setSelectedEmpIds_list] = useState<string[]>([])
  const [empSearch_list,      setEmpSearch_list]      = useState('')
  const [periodPreset_list,   setPeriodPreset_list]   = useState<PeriodPreset>({ type: 'custom' })

  // ── Panel de informe ─────────────────────────────────────────────────────
  type ReportResult = Awaited<ReturnType<typeof getPettyCashItemsForReport>>
  const [reportDateFrom,   setReportDateFrom]   = useState('')
  const [reportDateTo,     setReportDateTo]     = useState('')
  const [selectedCatIds,   setSelectedCatIds]   = useState<string[]>([])
  const [selectedEmpIds,   setSelectedEmpIds]   = useState<string[]>([])
  const [itemStatusFilter, setItemStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [generating,   setGenerating]   = useState(false)
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [reportData,   setReportData]   = useState<ReportResult | null>(null)
  const [reportError,  setReportError]  = useState<string | null>(null)

  // Empleados únicos: fondos reales + submitters de carga histórica
  const employees = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of funds) {
      if (!map.has(f.employee_id)) map.set(f.employee_id, f.employee_name)
    }
    for (const h of historicalImports) {
      if (!map.has(h.submitter_id)) map.set(h.submitter_id, h.submitter_name)
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [funds, historicalImports])

  // Filtrado cliente de la lista de fondos
  const filtered = useMemo(() => {
    return funds.filter(f => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false
      if (dateFrom && f.period_end   < dateFrom) return false
      if (dateTo   && f.period_start > dateTo)   return false
      if (selectedEmpIds_list.length && !selectedEmpIds_list.includes(f.employee_id)) return false
      return true
    })
  }, [funds, statusFilter, dateFrom, dateTo, selectedEmpIds_list])

  const activeFilters = statusFilter !== 'all' || dateFrom || dateTo || selectedEmpIds_list.length > 0

  function toggleCat(id: string) {
    setSelectedCatIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleEmp(id: string) {
    setSelectedEmpIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggle_ids(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  async function fetchReportItems() {
    setLoadingSearch(true)
    setReportError(null)
    setReportData(null)
    try {
      const result = await getPettyCashItemsForReport({
        dateFrom:    reportDateFrom || undefined,
        dateTo:      reportDateTo   || undefined,
        itemStatus:  itemStatusFilter,
        employeeIds: selectedEmpIds.length ? selectedEmpIds : undefined,
        categoryIds: selectedCatIds.length ? selectedCatIds : undefined,
      })
      setReportData(result)
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Error al obtener los datos')
    } finally {
      setLoadingSearch(false)
    }
  }

  async function handleExport(format: 'excel' | 'pdf') {
    if (!reportData?.items.length) return
    setGenerating(true)
    setReportError(null)
    try {
      const title = `Caja Chica${reportDateFrom ? ` ${reportDateFrom}` : ''}${reportDateTo ? ` al ${reportDateTo}` : ''}`
      if (format === 'excel') {
        const { exportPettyCashToExcel } = await import('@/lib/export/excel')
        exportPettyCashToExcel(reportData.items, 'caja-chica-informe')
      } else {
        const { exportPettyCashToPDF } = await import('@/lib/export/pdf')
        exportPettyCashToPDF(reportData.items, title)
      }
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Error al exportar')
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
            {reportData
              ? `${reportData.items.length} ítem${reportData.items.length !== 1 ? 's' : ''} encontrado${reportData.items.length !== 1 ? 's' : ''}`
              : filtered.length !== initialFunds.length
                ? `${filtered.length} de ${initialFunds.length} fondos`
                : `${initialFunds.length} fondo${initialFunds.length !== 1 ? 's' : ''} registrado${initialFunds.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isManager && (
            <>
              <button
                onClick={() => handleExport('excel')}
                disabled={!!generating || !reportData?.items.length}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item disabled:opacity-40 transition-all shadow-sm hover:shadow-md active:scale-[.97]"
                style={{ background: 'linear-gradient(130deg, #12152E 0%, #059669 100%)' }}
              >
                <FileSpreadsheet size={14} />
                {generating === true ? 'Exportando…' : 'Excel'}
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={!!generating || !reportData?.items.length}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item disabled:opacity-40 transition-all shadow-sm hover:shadow-md active:scale-[.97]"
                style={{ background: 'linear-gradient(130deg, #12152E 0%, #e11d48 100%)' }}
              >
                <Download size={14} />
                {generating === true ? 'Exportando…' : 'PDF'}
              </button>
            </>
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

      {/* Panel de filtros + resultados (solo managers) */}
      {isManager && (
        <div className="bg-white rounded-card shadow-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Filtros</p>
            {(reportDateFrom || reportDateTo || selectedCatIds.length > 0 || selectedEmpIds.length > 0 || itemStatusFilter !== 'all') && (
              <button
                onClick={() => { setReportDateFrom(''); setReportDateTo(''); setSelectedCatIds([]); setSelectedEmpIds([]); setItemStatusFilter('all'); setReportData(null); setReportError(null) }}
                className="text-xs text-ink-400 hover:text-ink-600 underline"
              >
                Limpiar filtros
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

          {/* Botón buscar */}
          <div className="flex justify-end pt-1">
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

          {/* Resultados inline */}
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
                      <tr className="bg-ink-50 text-ink-500 font-semibold uppercase tracking-wide">
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
                              item.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                              item.status === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-amber-100 text-amber-700'
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

      {/* ── Traspasos sin vincular ──────────────────────────────────────────── */}
      {isManager && pendingTransfers.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-card p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Link2 size={14} className="text-amber-600" />
            <span className="text-sm font-bold text-amber-800">
              {pendingTransfers.length === 1
                ? '1 traspaso sin vincular'
                : `${pendingTransfers.length} traspasos sin vincular`}
            </span>
          </div>
          <div className="space-y-1.5">
            {pendingTransfers.map(t => (
              <div key={t.id} className="flex items-center gap-3 bg-white rounded-item border border-amber-100 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-ink-800">
                    <span className="text-amber-600 mr-1">↙</span>
                    {fmtCLP(t.amount)} → <span className="text-ink-600">{t.receiver_employee_name}</span>
                  </p>
                  <p className="text-[11px] text-ink-400 mt-0.5">
                    De: {t.payer_employee_name}
                    {t.payer_fund_name && ` · ${t.payer_fund_name}`}
                    {t.payer_report_title && ` · ${t.payer_report_title}`}
                    {' · '}{formatDate(t.date)}
                    {t.description && ` — ${t.description}`}
                  </p>
                </div>
                <button
                  onClick={() => openLinkModal(t)}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-700 border border-amber-300 rounded-item hover:bg-amber-100 transition-colors"
                >
                  <Link2 size={11} />
                  Vincular
                </button>
              </div>
            ))}
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
                onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo(''); setSelectedEmpIds_list([]); setPeriodPreset_list({ type: 'custom' }) }}
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
          <div className="flex flex-wrap gap-1.5">
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
            {(dateFrom || dateTo || selectedEmpIds_list.length > 0) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setSelectedEmpIds_list([]); setPeriodPreset_list({ type: 'custom' }) }}
                className="px-2.5 py-1 rounded-item text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Buscar empleado con chips */}
          <div>
            <input
              type="text"
              placeholder="Buscar empleado..."
              value={empSearch_list}
              onChange={e => setEmpSearch_list(e.target.value)}
              className="border border-ink-200 rounded-item px-3 py-1.5 text-sm text-ink-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 w-48"
            />
            {empSearch_list && (
              <div className="mt-1 flex flex-wrap gap-1">
                {employees
                  .filter(e => e.name.toLowerCase().includes(empSearch_list.toLowerCase()))
                  .slice(0, 8)
                  .map(e => (
                    <button
                      key={e.id}
                      onClick={() => { setSelectedEmpIds_list(ids => toggle_ids(ids, e.id)); setEmpSearch_list('') }}
                      className={`px-2 py-0.5 rounded-item text-xs font-medium transition-colors ${
                        selectedEmpIds_list.includes(e.id) ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                      }`}
                    >
                      {e.name}
                    </button>
                  ))}
              </div>
            )}
            {selectedEmpIds_list.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {selectedEmpIds_list.map(id => {
                  const emp = employees.find(e => e.id === id)
                  return emp ? (
                    <span key={id} className="flex items-center gap-1 px-2 py-0.5 bg-brand-100 text-brand-700 rounded-item text-xs font-medium">
                      {emp.name}
                      <button onClick={() => setSelectedEmpIds_list(ids => ids.filter(x => x !== id))} className="hover:text-brand-900">×</button>
                    </span>
                  ) : null
                })}
              </div>
            )}
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
              onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo(''); setSelectedEmpIds_list([]); setPeriodPreset_list({ type: 'custom' }) }}
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
                <div className="flex items-stretch border-l border-ink-100">
                  <button
                    onClick={() => openTransferModal({
                      fundId:        f.id,
                      defaultAmount: f.amount_approved ?? f.amount_requested,
                      payerEmpId:    f.employee_id,
                    })}
                    title="Registrar traspaso a otro empleado"
                    className="px-2.5 text-violet-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                  >
                    <SendHorizontal size={14} />
                  </button>
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Carga histórica ─────────────────────────────────────────────────── */}
      {historicalImports.length > 0 && (
        <HistoricalSection
          imports={historicalImports}
          isManager={isManager}
          movingHistId={movingHistId}
          deletingHistId={deletingHistId}
          onMove={handleMoveToRendicion}
          onDelete={handleDeleteHistorical}
          onExportDefontana={handleExportDefontanaFund}
          onConfirmContabilizado={handleConfirmContabilizado}
          onItemSaved={handleItemSaved}
          onTitleUpdated={handleTitleUpdated}
          onTransfer={(reportId, submitterId, defaultAmount) => openTransferModal({
            reportId,
            defaultAmount,
            payerEmpId: submitterId,
          })}
        />
      )}

      {/* ── Modal crear traspaso ─────────────────────────────────────────────── */}
      {transferSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-card shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-ink-900 flex items-center gap-2">
                <SendHorizontal size={18} className="text-violet-600" />
                Registrar traspaso
              </h2>
              <button onClick={() => setTransferSource(null)} className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-ink-500">
              El saldo traspasado quedará como ítem en el fondo origen. El receptor lo verá como saldo flotante hasta vincularlo a su propio fondo.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1">Empleado receptor</label>
                <select
                  value={trReceiverId}
                  onChange={e => setTrReceiverId(e.target.value)}
                  className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="">— Seleccionar empleado —</option>
                  {orgEmployees
                    .filter(e => e.id !== transferSource.payerEmpId)
                    .map(e => (
                      <option key={e.id} value={e.id}>{e.full_name}</option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-1">Monto (CLP)</label>
                  <input
                    type="number"
                    value={trAmount}
                    onChange={e => setTrAmount(e.target.value)}
                    min="1"
                    className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm font-mono-amount focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={trDate}
                    onChange={e => setTrDate(e.target.value)}
                    className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1">Descripción (opcional)</label>
                <input
                  type="text"
                  value={trDesc}
                  onChange={e => setTrDesc(e.target.value)}
                  placeholder="Motivo del traspaso…"
                  className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
            </div>
            {trError && (
              <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-item">{trError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCreateTransfer}
                disabled={trSaving}
                className="flex-1 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all"
                style={{ background: 'linear-gradient(130deg, #12152E 0%, #7c3aed 100%)' }}
              >
                {trSaving ? 'Registrando…' : 'Registrar traspaso'}
              </button>
              <button
                onClick={() => setTransferSource(null)}
                className="px-4 py-2 text-sm font-medium text-ink-600 border border-ink-200 rounded-item hover:bg-ink-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal vincular traspaso ──────────────────────────────────────────── */}
      {linkingTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-card shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-ink-900 flex items-center gap-2">
                <Link2 size={18} className="text-amber-600" />
                Vincular traspaso
              </h2>
              <button onClick={() => setLinkingTransfer(null)} className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-item px-3 py-2 text-xs text-amber-800 space-y-0.5">
              <p><span className="font-semibold">De:</span> {linkingTransfer.payer_employee_name}
                {linkingTransfer.payer_fund_name && ` · ${linkingTransfer.payer_fund_name}`}
                {linkingTransfer.payer_report_title && ` · ${linkingTransfer.payer_report_title}`}
              </p>
              <p><span className="font-semibold">Para:</span> {linkingTransfer.receiver_employee_name}</p>
              <p><span className="font-semibold">Monto:</span> {fmtCLP(linkingTransfer.amount)} · {formatDate(linkingTransfer.date)}</p>
              {linkingTransfer.description && <p className="text-amber-600 italic">{linkingTransfer.description}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1">
                Vincular al fondo o carga histórica de <span className="text-ink-900">{linkingTransfer.receiver_employee_name}</span>
              </label>
              {loadingTargets ? (
                <p className="text-xs text-ink-400 py-2">Cargando fondos…</p>
              ) : linkTargets.length === 0 ? (
                <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-item">
                  No hay fondos ni cargas históricas disponibles para este empleado. Crea uno primero.
                </p>
              ) : (
                <select
                  value={linkTargetId}
                  onChange={e => {
                    setLinkTargetId(e.target.value)
                    const target = linkTargets.find(t => t.id === e.target.value)
                    if (target) setLinkTargetType(target.type)
                  }}
                  className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="">— Seleccionar destino —</option>
                  {linkTargets.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.type === 'fund' ? '🟣 Fondo: ' : '📋 Histórica: '}{t.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {linkError && (
              <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-item">{linkError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleLinkTransfer}
                disabled={linkSaving || !linkTargetId || loadingTargets}
                className="flex-1 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all"
                style={{ background: 'linear-gradient(130deg, #92400e 0%, #d97706 100%)' }}
              >
                {linkSaving ? 'Vinculando…' : 'Vincular traspaso'}
              </button>
              <button
                onClick={() => setLinkingTransfer(null)}
                className="px-4 py-2 text-sm font-medium text-ink-600 border border-ink-200 rounded-item hover:bg-ink-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sección histórica agrupada por fondo ──────────────────────────────────────

interface HistoricalSectionProps {
  imports:                  HistoricalImport[]
  isManager:                boolean
  movingHistId:             string | null
  deletingHistId:           string | null
  onMove:                   (id: string, title: string) => void
  onDelete:                 (id: string, title: string) => void
  onExportDefontana:        (reportId: string, itemTypes: ('expense' | 'advance' | 'return')[], title: string) => Promise<{ warnings: { categories: string[]; unmappedCLP: number } | null }>
  onConfirmContabilizado:   (reportId: string, itemTypes: ('expense' | 'advance' | 'return')[], comprobante: string) => Promise<void>
  onItemSaved:              (reportId: string, itemId: string, patch: ItemSavedPatch) => void
  onTitleUpdated:           (reportId: string, title: string) => void
  onTransfer:               (reportId: string, submitterId: string, defaultAmount: number) => void
}

const ITEM_TYPE_ICON: Record<string, React.ReactNode> = {
  advance:  <ArrowDownToLine  size={12} className="text-blue-500 shrink-0" />,
  expense:  <Receipt          size={12} className="text-ink-400 shrink-0" />,
  return:   <ArrowUpFromLine  size={12} className="text-emerald-500 shrink-0" />,
  transfer: <SendHorizontal   size={12} className="text-violet-500 shrink-0" />,
}
const ITEM_TYPE_LABEL: Record<string, string> = {
  advance:  'Adelanto',
  expense:  'Gasto',
  return:   'Devolución',
  transfer: 'Traspaso',
}

// ── Tabla de ítems de carga histórica con edición inline ────────────────────

function HistoricalItemsTable({ reportId, items, onItemSaved }: {
  reportId:    string
  items:       HistItem[]
  onItemSaved: (reportId: string, itemId: string, patch: ItemSavedPatch) => void
}) {
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editType,     setEditType]     = useState<'expense' | 'advance' | 'return'>('expense')
  const [editDesc,     setEditDesc]     = useState('')
  const [editAmt,      setEditAmt]      = useState('')
  const [editDate,     setEditDate]     = useState('')
  const [editMerchant, setEditMerchant] = useState('')
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState<string | null>(null)

  function startEdit(item: HistItem) {
    setEditingId(item.id)
    setEditType((item.item_type as 'expense' | 'advance' | 'return') || 'expense')
    setEditDesc(item.description || '')
    setEditAmt(String(item.amount_clp))
    setEditDate(item.date || '')
    setEditMerchant(item.merchant || '')
    setSaveError(null)
  }

  async function saveEdit(itemId: string) {
    const amount = parseFloat(editAmt)
    if (!editDesc.trim()) { setSaveError('La descripción es obligatoria'); return }
    if (isNaN(amount) || amount <= 0) { setSaveError('Monto inválido'); return }
    setSaving(true)
    setSaveError(null)
    const patch: ItemSavedPatch = {
      item_type:   editType,
      description: editDesc.trim(),
      amount_clp:  amount,
      date:        editDate,
      merchant:    editMerchant.trim() || null,
    }
    try {
      await updateHistoricalExpenseItem(itemId, patch)
      // Notifica al padre para actualizar totales del grupo
      onItemSaved(reportId, itemId, patch)
      setEditingId(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'px-2 py-1 text-xs border border-ink-200 rounded-item focus:outline-none focus:ring-1 focus:ring-brand-600'

  return (
    <div className="bg-ink-50 border-t border-ink-100 px-4 py-3 space-y-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-400 border-b border-ink-200">
            <th className="text-left pb-1.5 font-medium w-28">Tipo</th>
            <th className="text-left pb-1.5 font-medium">Descripción / Destinatario</th>
            <th className="text-left pb-1.5 font-medium w-28">Fecha</th>
            <th className="text-right pb-1.5 font-medium w-24">Monto</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {items.map(item => {
            const isEdit = editingId === item.id
            return (
              <tr key={item.id} className={`text-ink-700 ${isEdit ? 'bg-white' : ''}`}>
                {/* Columna Tipo */}
                <td className="py-1.5 pr-2 whitespace-nowrap align-top">
                  {isEdit ? (
                    <select
                      value={editType}
                      onChange={e => setEditType(e.target.value as 'expense' | 'advance' | 'return')}
                      className={inputCls}
                    >
                      <option value="expense">Gasto</option>
                      <option value="advance">Adelanto</option>
                      <option value="return">Devolución</option>
                    </select>
                  ) : (
                    <span className="flex items-center gap-1">
                      {ITEM_TYPE_ICON[item.item_type] ?? null}
                      <span className={
                        item.item_type === 'advance' ? 'text-blue-600 font-medium' :
                        item.item_type === 'return'  ? 'text-emerald-600 font-medium' :
                        'text-ink-600'
                      }>{ITEM_TYPE_LABEL[item.item_type] ?? item.item_type}</span>
                    </span>
                  )}
                </td>

                {/* Columna Descripción / Empleado */}
                {isEdit ? (
                  <td className="py-1.5 pr-2 align-top">
                    <div className="space-y-1">
                      <input value={editDesc} onChange={e => setEditDesc(e.target.value)}
                        placeholder="Descripción"
                        className={`${inputCls} w-full`} />
                      <input value={editMerchant} onChange={e => setEditMerchant(e.target.value)}
                        placeholder="Destinatario / receptor (opcional)"
                        className={`${inputCls} w-full text-ink-500`} />
                    </div>
                  </td>
                ) : (
                  <td className="py-1.5 pr-2 align-top">
                    <p className="text-ink-600 truncate max-w-[180px]">{item.description || '—'}</p>
                    {item.merchant && (
                      <p className="text-ink-400 text-[10px] truncate max-w-[180px]">{item.merchant}</p>
                    )}
                  </td>
                )}

                {/* Columna Fecha */}
                {isEdit ? (
                  <td className="py-1.5 pr-2 align-top">
                    <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                      className={inputCls} />
                  </td>
                ) : (
                  <td className="py-1.5 pr-2 text-ink-400 align-top">{item.date ? formatDate(item.date) : '—'}</td>
                )}

                {/* Columna Monto */}
                {isEdit ? (
                  <td className="py-1.5 text-right align-top">
                    <input type="number" value={editAmt} onChange={e => setEditAmt(e.target.value)}
                      className={`${inputCls} w-24 text-right font-mono-amount`} />
                  </td>
                ) : (
                  <td className={`py-1.5 text-right font-mono-amount font-semibold align-top ${
                    item.item_type === 'advance' ? 'text-blue-600' :
                    item.item_type === 'return'  ? 'text-emerald-600' :
                    'text-ink-900'
                  }`}>{formatCLP(item.amount_clp)}</td>
                )}

                {/* Acciones */}
                {isEdit ? (
                  <td className="py-1.5 pl-1 align-top">
                    <div className="flex gap-0.5">
                      <button onClick={() => saveEdit(item.id)} disabled={saving}
                        title="Guardar"
                        className="p-1 text-brand-600 hover:bg-brand-50 rounded transition-colors disabled:opacity-40">
                        <Check size={13} />
                      </button>
                      <button onClick={() => { setEditingId(null); setSaveError(null) }}
                        title="Cancelar"
                        className="p-1 text-ink-400 hover:bg-ink-100 rounded transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                  </td>
                ) : (
                  <td className="py-1.5 pl-1 align-top">
                    {item.item_type !== 'transfer' && (
                      <button onClick={() => startEdit(item)} title="Editar ítem"
                        className="p-1 text-ink-300 hover:text-brand-600 rounded transition-colors">
                        <Pencil size={12} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      {saveError && (
        <p className="text-xs text-rose-600 bg-rose-50 px-2 py-1 rounded-item">{saveError}</p>
      )}
    </div>
  )
}

function HistoricalSection({ imports, isManager, movingHistId, deletingHistId, onMove, onDelete, onExportDefontana, onConfirmContabilizado, onItemSaved, onTitleUpdated, onTransfer }: HistoricalSectionProps) {
  const [expandedIds,      setExpandedIds]      = useState<Set<string>>(new Set())
  const [collapsedGroups,  setCollapsedGroups]  = useState<Set<string>>(new Set())

  // Estado para edición inline del título
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [editTitle,      setEditTitle]      = useState('')
  const [savingTitle,    setSavingTitle]    = useState(false)
  const [titleError,     setTitleError]     = useState<string | null>(null)

  // Estado del panel Defontana
  const [defPanelId,        setDefPanelId]        = useState<string | null>(null)
  const [defSelectedTypes,  setDefSelectedTypes]  = useState<Set<string>>(new Set())
  const [defExporting,      setDefExporting]      = useState(false)
  const [defExportWarnings, setDefExportWarnings] = useState<{ categories: string[]; unmappedCLP: number } | null>(null)
  const [defComprobante,    setDefComprobante]    = useState('')
  const [defConfirming,     setDefConfirming]     = useState(false)

  function openDefPanel(h: HistoricalImport) {
    const pending = new Set<string>()
    for (const item of h.items) {
      if (['expense', 'advance', 'return'].includes(item.item_type || '') && !item.defontana_exported_at) {
        pending.add(item.item_type!)
      }
    }
    setDefSelectedTypes(pending)
    setDefExportWarnings(null)
    setDefComprobante('')
    setDefPanelId(defPanelId === h.id ? null : h.id)
  }

  async function runExport(h: HistoricalImport) {
    const types = Array.from(defSelectedTypes) as ('expense' | 'advance' | 'return')[]
    if (!types.length) return
    setDefExporting(true)
    setDefExportWarnings(null)
    try {
      const result = await onExportDefontana(h.id, types, h.title)
      if (result.warnings) setDefExportWarnings(result.warnings)
      // No cerramos el panel — el usuario debe confirmar la contabilización por separado
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      setDefExporting(false)
    }
  }

  async function runConfirmContabilizado(h: HistoricalImport) {
    const types = Array.from(defSelectedTypes) as ('expense' | 'advance' | 'return')[]
    setDefConfirming(true)
    try {
      await onConfirmContabilizado(h.id, types, defComprobante)
      setDefPanelId(null)
      setDefComprobante('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al confirmar contabilización')
    } finally {
      setDefConfirming(false)
    }
  }

  async function handleSaveTitle(reportId: string) {
    if (!editTitle.trim()) return
    setSavingTitle(true)
    setTitleError(null)
    try {
      await updateHistoricalImportTitle(reportId, editTitle.trim())
      onTitleUpdated(reportId, editTitle.trim())
      setEditingTitleId(null)
    } catch (err) {
      setTitleError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSavingTitle(false)
    }
  }

  function toggle(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Agrupar por fund_number. Los sin fondo forman grupos individuales.
  const groups = useMemo(() => {
    const map = new Map<string, HistoricalImport[]>()
    for (const h of imports) {
      const key = h.fund_number ?? `__solo__${h.id}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(h)
    }
    return Array.from(map.entries())
  }, [imports])

  const allCollapsed = collapsedGroups.size === groups.length
  function toggleAllGroups() {
    if (allCollapsed) {
      setCollapsedGroups(new Set())
    } else {
      setCollapsedGroups(new Set(groups.map(([key]) => key)))
    }
  }
  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-2">
        <History size={15} className="text-ink-400" />
        <h2 className="text-sm font-semibold text-ink-600">Carga histórica</h2>
        <span className="text-xs text-ink-400">({imports.length})</span>
        <button
          onClick={toggleAllGroups}
          className="ml-auto text-xs text-ink-400 hover:text-ink-700 border border-ink-200 rounded-item px-2.5 py-1 transition-colors flex items-center gap-1.5"
        >
          {allCollapsed
            ? <><ChevronDown size={12} /> Expandir todo</>
            : <><ChevronRight size={12} /> Contraer todo</>
          }
        </button>
      </div>

      {groups.map(([groupKey, group]) => {
        const hasFund       = !groupKey.startsWith('__solo__')
        const fundLabel     = hasFund ? `Fondo N°${groupKey}` : null
        const isCollapsed   = collapsedGroups.has(groupKey)

        // Balance consolidado del grupo
        const groupAdvance = group.reduce((s, h) => s + h.advance_total, 0)
        const groupExpense = group.reduce((s, h) => s + h.expense_total, 0)
        const groupReturn  = group.reduce((s, h) => s + h.return_total,  0)
        const groupDiff    = groupAdvance - groupExpense - groupReturn
        const isBalanced   = Math.abs(groupDiff) < 1
        const isPending    = groupAdvance > 0 && groupExpense === 0 && groupReturn === 0
        const isOweEmp     = groupDiff < -1
        const isOweComp    = !isPending && groupDiff > 1

        return (
          <div key={groupKey} className={`rounded-card shadow-card overflow-hidden ${hasFund ? 'border border-blue-100' : ''}`}>
            {/* Cabecera del grupo — siempre visible, clickeable para colapsar */}
            {hasFund && (
              <button
                onClick={() => toggleGroup(groupKey)}
                className="w-full bg-blue-50 px-4 py-2 flex items-center justify-between gap-3 border-b border-blue-100 hover:bg-blue-100 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-xs font-bold text-blue-700">
                  {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  {fundLabel}
                </span>
                <div className="flex items-center gap-3 text-xs">
                  {groupAdvance > 0 && (
                    <span className="text-blue-700 font-mono-amount">
                      <ArrowDownToLine size={10} className="inline mr-0.5" />
                      {formatCLP(groupAdvance)}
                    </span>
                  )}
                  {groupExpense > 0 && (
                    <span className="text-ink-600 font-mono-amount">
                      <Receipt size={10} className="inline mr-0.5" />
                      ({formatCLP(groupExpense)})
                    </span>
                  )}
                  {groupReturn > 0 && (
                    <span className="text-emerald-600 font-mono-amount">
                      <ArrowUpFromLine size={10} className="inline mr-0.5" />
                      ({formatCLP(groupReturn)})
                    </span>
                  )}
                  {isBalanced && (
                    <span className="font-bold text-emerald-600">✓ Cuadra</span>
                  )}
                  {isPending && (
                    <span className="font-bold text-amber-500">⏳ Pendiente de rendir</span>
                  )}
                  {isOweEmp && (
                    <span className="font-bold text-blue-600">↑ Reembolsar al empleado {formatCLP(Math.abs(groupDiff))}</span>
                  )}
                  {isOweComp && (
                    <span className="font-bold text-orange-500">↓ Devolver a empresa {formatCLP(groupDiff)}</span>
                  )}
                </div>
              </button>
            )}

            {/* Filas del grupo — ocultas cuando el grupo está colapsado */}
            {!isCollapsed && <div className="divide-y divide-ink-50">
              {group.map(h => {
                const isExpanded = expandedIds.has(h.id)
                // Determinar qué mostrar como monto principal
                const isAdvanceOnly = h.advance_total > 0 && h.expense_total === 0 && h.return_total === 0
                const isExpenseOnly = h.advance_total === 0 && h.expense_total > 0
                const displayAmount = isAdvanceOnly ? h.advance_total : h.expense_total || h.return_total || h.total_amount

                return (
                  <div key={h.id} className="bg-white">
                    <div className="p-4 flex items-center gap-3">
                      {/* Expand toggle */}
                      <button
                        onClick={() => toggle(h.id)}
                        className="text-ink-300 hover:text-ink-600 transition-colors shrink-0"
                        title={isExpanded ? 'Cerrar detalle' : 'Ver ítems'}
                      >
                        {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>

                      {/* Contenido */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {editingTitleId === h.id ? (
                            <div className="flex items-center gap-1 flex-1 min-w-0">
                              <input
                                value={editTitle}
                                onChange={e => setEditTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveTitle(h.id)
                                  if (e.key === 'Escape') setEditingTitleId(null)
                                }}
                                autoFocus
                                className="flex-1 min-w-0 px-2 py-0.5 text-sm border border-ink-300 rounded-item focus:outline-none focus:ring-1 focus:ring-brand-600 font-semibold text-ink-900"
                              />
                              <button onClick={() => handleSaveTitle(h.id)} disabled={savingTitle}
                                className="p-0.5 text-brand-600 hover:bg-brand-50 rounded disabled:opacity-40">
                                <Check size={13} />
                              </button>
                              <button onClick={() => { setEditingTitleId(null); setTitleError(null) }}
                                className="p-0.5 text-ink-400 hover:bg-ink-100 rounded">
                                <X size={13} />
                              </button>
                              {titleError && <span className="text-xs text-rose-500">{titleError}</span>}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 group/title min-w-0">
                              <p className="font-semibold text-ink-900 text-sm truncate">{h.title}</p>
                              {isManager && (
                                <button
                                  onClick={() => { setEditingTitleId(h.id); setEditTitle(h.title); setTitleError(null) }}
                                  title="Renombrar"
                                  className="p-0.5 text-ink-200 hover:text-ink-500 rounded opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0"
                                >
                                  <Pencil size={11} />
                                </button>
                              )}
                            </div>
                          )}
                          {!hasFund && h.fund_number && (
                            <span className="text-xs text-ink-400">Fondo N°{h.fund_number}</span>
                          )}
                        </div>
                        <p className="text-xs text-ink-400 mt-0.5">
                          {h.approved_at && <span>Fecha: {formatDate(h.approved_at.split('T')[0])}</span>}
                          <span className="ml-2 text-ink-300">· {h.submitter_name}</span>
                        </p>
                      </div>

                      {/* Monto y acciones */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          {isAdvanceOnly ? (
                            <p className="font-mono-amount font-bold text-blue-600 text-sm">
                              <ArrowDownToLine size={11} className="inline mr-0.5 mb-0.5" />
                              {formatCLP(h.advance_total)}
                            </p>
                          ) : isExpenseOnly ? (
                            <p className="font-mono-amount font-bold text-ink-900 text-sm">{formatCLP(h.expense_total)}</p>
                          ) : (
                            <div className="space-y-0.5">
                              {h.advance_total > 0 && <p className="font-mono-amount text-blue-600 text-xs">{formatCLP(h.advance_total)} adelanto</p>}
                              {h.expense_total > 0 && <p className="font-mono-amount text-ink-700 text-xs">({formatCLP(h.expense_total)}) gastos</p>}
                              {h.return_total  > 0 && <p className="font-mono-amount text-emerald-600 text-xs">({formatCLP(h.return_total)})</p>}
                            </div>
                          )}
                          {(() => {
                            const exportedCount = h.items.filter(i => i.defontana_exported_at).length
                            const totalExportable = h.items.filter(i => ['expense','advance','return'].includes(i.item_type || '')).length
                            return (
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap justify-end">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-ink-100 text-ink-500 font-medium">
                                  Histórica
                                </span>
                                {exportedCount > 0 && (
                                  <span
                                    className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium flex items-center gap-1"
                                    title={h.defontana_export_ref ? `Comprobante: ${h.defontana_export_ref}` : undefined}
                                  >
                                    <BookCheck size={10} />
                                    {exportedCount === totalExportable ? 'Contabilizado' : `${exportedCount}/${totalExportable} contabilizados`}
                                    {h.defontana_export_ref && (
                                      <span className="font-mono opacity-75 text-[10px]">{h.defontana_export_ref}</span>
                                    )}
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                        {isManager && (
                          <>
                            <button
                              onClick={() => onTransfer(h.id, h.submitter_id, h.advance_total || h.total_amount)}
                              title="Registrar traspaso a otro empleado"
                              className="p-1.5 text-violet-400 hover:text-violet-600 hover:bg-violet-50 rounded-item transition-colors"
                            >
                              <SendHorizontal size={14} />
                            </button>
                            <button
                              onClick={() => openDefPanel(h)}
                              title="Exportar a Defontana"
                              className={[
                                'p-1.5 rounded-item transition-colors',
                                defPanelId === h.id
                                  ? 'text-teal-700 bg-teal-100'
                                  : 'text-teal-500 hover:text-teal-700 hover:bg-teal-50',
                              ].join(' ')}
                            >
                              <FileSpreadsheet size={14} />
                            </button>
                            <button
                              onClick={() => onMove(h.id, h.title)}
                              disabled={movingHistId === h.id}
                              title="Mover a Rendiciones"
                              className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-item transition-colors disabled:opacity-40"
                            >
                              <ArrowRightLeft size={14} />
                            </button>
                            <button
                              onClick={() => onDelete(h.id, h.title)}
                              disabled={deletingHistId === h.id}
                              title="Eliminar"
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-item transition-colors disabled:opacity-40"
                            >
                              {deletingHistId === h.id ? <span className="text-xs">...</span> : <Trash2 size={14} />}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Panel Defontana export */}
                    {defPanelId === h.id && (() => {
                      const EXPORTABLE = ['expense', 'advance', 'return'] as const
                      const typeInfo = EXPORTABLE.map(type => {
                        const all      = h.items.filter(i => i.item_type === type)
                        const pending  = all.filter(i => !i.defontana_exported_at)
                        const exported = all.filter(i =>  i.defontana_exported_at)
                        const total    = pending.reduce((s, i) => s + i.amount_clp, 0)
                        return { type, all, pending, exported, total }
                      }).filter(t => t.all.length > 0)

                      const hasAnythingPending = typeInfo.some(t => t.pending.length > 0 && defSelectedTypes.has(t.type))
                      const LABEL: Record<string, string> = { expense: 'Gastos', advance: 'Adelantos', return: 'Devoluciones' }

                      return (
                        <div className="border-t border-teal-100 bg-teal-50 px-4 py-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-teal-900 flex items-center gap-1.5">
                              <FileSpreadsheet size={14} /> Exportar a Defontana
                            </h4>
                            <button onClick={() => setDefPanelId(null)} className="text-teal-400 hover:text-teal-700 transition-colors">
                              <X size={14} />
                            </button>
                          </div>

                          {typeInfo.length === 0 ? (
                            <p className="text-xs text-ink-500">Sin ítems exportables en esta carga.</p>
                          ) : (
                            <div className="space-y-2">
                              {typeInfo.map(({ type, pending, exported, total }) => {
                                const allDone   = pending.length === 0
                                const isChecked = defSelectedTypes.has(type)
                                return (
                                  <label
                                    key={type}
                                    className={`flex items-center gap-3 text-sm rounded-item px-2 py-1.5 bg-white border ${allDone ? 'border-teal-100 opacity-60' : 'border-ink-100 cursor-pointer hover:border-teal-200'}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked && !allDone}
                                      disabled={allDone}
                                      onChange={() => {
                                        setDefSelectedTypes(prev => {
                                          const next = new Set(prev)
                                          next.has(type) ? next.delete(type) : next.add(type)
                                          return next
                                        })
                                      }}
                                      className="accent-teal-600 w-4 h-4 shrink-0"
                                    />
                                    <span className="flex-1 text-ink-700 font-medium">{LABEL[type]}</span>
                                    {allDone ? (
                                      <span className="text-xs text-teal-600 font-medium flex items-center gap-1">
                                        <BookCheck size={11} /> {exported.length} contabilizados
                                      </span>
                                    ) : (
                                      <span className="text-xs text-ink-500">
                                        {pending.length} pendientes · {formatCLP(total)}
                                        {exported.length > 0 && <span className="text-teal-600 ml-1">(+{exported.length} ya contabilizados)</span>}
                                      </span>
                                    )}
                                  </label>
                                )
                              })}
                            </div>
                          )}

                          {defExportWarnings && (
                            <div className="bg-amber-50 border border-amber-200 rounded-item px-3 py-2 text-xs text-amber-700">
                              ⚠ Sin cuenta Defontana: {defExportWarnings.categories.join(', ')}
                              {defExportWarnings.unmappedCLP > 0 && ` — ${formatCLP(defExportWarnings.unmappedCLP)} no incluidos en el asiento`}
                            </div>
                          )}

                          {typeInfo.length > 0 && (
                            <div className="space-y-3 pt-1">
                              {/* Paso 1: descargar Excel */}
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => runExport(h)}
                                  disabled={defExporting || defConfirming || !hasAnythingPending}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-teal-700 bg-white border border-teal-300 hover:bg-teal-50 rounded-item transition-colors disabled:opacity-40"
                                >
                                  {defExporting
                                    ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full" /> Generando...</>
                                    : <><FileSpreadsheet size={13} /> Generar Excel para Defontana</>
                                  }
                                </button>
                              </div>

                              {/* Paso 2: confirmar después de cargar en Defontana */}
                              <div className="border-t border-teal-100 pt-3 space-y-2">
                                <p className="text-xs font-semibold text-teal-800">
                                  ✓ Confirmar contabilización
                                </p>
                                <p className="text-xs text-ink-500">
                                  Hacé clic aquí solo después de haber importado el Excel en Defontana exitosamente.
                                </p>
                                {h.defontana_export_ref && (
                                  <p className="text-xs text-teal-600 font-mono">
                                    Último comprobante registrado: {h.defontana_export_ref}
                                  </p>
                                )}
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    placeholder="N° comprobante Defontana (opcional)"
                                    value={defComprobante}
                                    onChange={e => setDefComprobante(e.target.value)}
                                    disabled={defExporting || defConfirming}
                                    className="flex-1 border border-ink-200 rounded-item px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
                                  />
                                </div>
                                <button
                                  onClick={() => runConfirmContabilizado(h)}
                                  disabled={defConfirming || defExporting || (!hasAnythingPending && !defComprobante.trim())}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-item transition-colors disabled:opacity-40"
                                >
                                  {defConfirming
                                    ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Guardando...</>
                                    : <><BookCheck size={13} /> Confirmar contabilización</>
                                  }
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Detalle expandido */}
                    {isExpanded && h.items.length > 0 && (
                      <HistoricalItemsTable reportId={h.id} items={h.items} onItemSaved={onItemSaved} />
                    )}
                    {isExpanded && h.items.length === 0 && (
                      <div className="bg-ink-50 border-t border-ink-100 px-6 py-3 text-xs text-ink-400 text-center">
                        Sin ítems registrados
                      </div>
                    )}
                  </div>
                )
              })}
            </div>}
          </div>
        )
      })}
    </div>
  )
}
