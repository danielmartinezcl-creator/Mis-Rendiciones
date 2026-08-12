'use client'

import { useState, useMemo } from 'react'
import { getPettyCashItemsForReport, deletePettyCashFund } from '@/actions/petty-cash'
import {
  changeHistoricalImportType,
  markHistoricalImportDefontana,
  getHistoricalFundDefontanaData,
  markExpenseItemsDefontanaExported,
} from '@/actions/admin'
import type { getHistoricalCajaChicaImports } from '@/actions/admin'
import { adminDeleteExpenseReport } from '@/actions/expenses'
import {
  createFundTransfer,
  linkFundTransfer,
  getEmployeeTargets,
  deleteFundTransfer,
  updateFundTransfer,
  deleteLinkedFundTransfer,
  updateLinkedFundTransfer,
} from '@/actions/fund-transfers'
import type { FundListItem } from '@/actions/petty-cash'
import type { FundTransferRow, EmployeeTarget } from '@/actions/fund-transfers'
import type { PeriodPreset } from '@/lib/report-helpers'

// ── Shared types ──────────────────────────────────────────────────────────────

export type Category = { id: string; name: string; color: string | null }
export type HistoricalImport = Awaited<ReturnType<typeof getHistoricalCajaChicaImports>>[number]
export type HistItem = HistoricalImport['items'][number]

export type ItemSavedPatch = {
  item_type:   'expense' | 'advance' | 'return' | 'transfer'
  description: string
  amount_clp:  number
  date:        string
  merchant:    string | null
}

export type TransferSource = {
  fundId?:       string
  reportId?:     string
  defaultAmount: number
  payerEmpId:    string
}

export type ReportResult = Awaited<ReturnType<typeof getPettyCashItemsForReport>>
export type EditingLinkedTransfer = { id: string; amount: number; date: string; description: string | null }

// Re-export for convenience
export type { FundListItem, FundTransferRow, EmployeeTarget }

// ── Shared helpers ────────────────────────────────────────────────────────────

export function fmtCLP(n: number) {
  return '$ ' + Math.round(n).toLocaleString('es-CL')
}

export function toggle_ids(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
}

// ── Hook props ────────────────────────────────────────────────────────────────

export interface UsePettyCashStateProps {
  initialFunds:             FundListItem[]
  initialHistoricalImports: HistoricalImport[]
  orgEmployees:             { id: string; full_name: string }[]
  initialPendingTransfers:  FundTransferRow[]
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePettyCashState({
  initialFunds,
  initialHistoricalImports,
  orgEmployees,
  initialPendingTransfers,
}: UsePettyCashStateProps) {

  // ── Estado local de fondos ────────────────────────────────────────────────
  const [funds,     setFunds]     = useState<FundListItem[]>(initialFunds)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ── Estado local de históricas ────────────────────────────────────────────
  const [historicalImports,  setHistoricalImports]  = useState(initialHistoricalImports)
  const [movingHistId,       setMovingHistId]       = useState<string | null>(null)
  const [deletingHistId,     setDeletingHistId]     = useState<string | null>(null)
  const [defontanaMarkingId, setDefontanaMarkingId] = useState<string | null>(null)

  // ── Estado de traspasos ───────────────────────────────────────────────────
  const [pendingTransfers, setPendingTransfers] = useState<FundTransferRow[]>(initialPendingTransfers)

  // Modal crear traspaso
  const [transferSource,   setTransferSource]   = useState<TransferSource | null>(null)
  const [trReceiverId,     setTrReceiverId]     = useState('')
  const [trAmount,         setTrAmount]         = useState('')
  const [trDate,           setTrDate]           = useState('')
  const [trDesc,           setTrDesc]           = useState('')
  const [trSaving,         setTrSaving]         = useState(false)
  const [trError,          setTrError]          = useState<string | null>(null)
  const [trTargets,        setTrTargets]        = useState<EmployeeTarget[]>([])
  const [trTargetId,       setTrTargetId]       = useState('')
  const [trTargetType,     setTrTargetType]     = useState<'fund' | 'report'>('fund')
  const [loadingTrTargets, setLoadingTrTargets] = useState(false)

  // Modal vincular traspaso
  const [linkingTransfer, setLinkingTransfer] = useState<FundTransferRow | null>(null)
  const [linkTargets,     setLinkTargets]     = useState<EmployeeTarget[]>([])
  const [linkTargetId,    setLinkTargetId]    = useState('')
  const [linkTargetType,  setLinkTargetType]  = useState<'fund' | 'report'>('fund')
  const [loadingTargets,  setLoadingTargets]  = useState(false)
  const [linkSaving,      setLinkSaving]      = useState(false)
  const [linkError,       setLinkError]       = useState<string | null>(null)

  // Modal editar traspaso sin vincular
  const [editingTransfer,    setEditingTransfer]    = useState<FundTransferRow | null>(null)
  const [editAmount,         setEditAmount]         = useState('')
  const [editDate,           setEditDate]           = useState('')
  const [editDesc,           setEditDesc]           = useState('')
  const [editReceiverId,     setEditReceiverId]     = useState('')
  const [editSaving,         setEditSaving]         = useState(false)
  const [editError,          setEditError]          = useState<string | null>(null)
  const [deletingTransferId, setDeletingTransferId] = useState<string | null>(null)

  // Modal editar traspaso vinculado
  const [editingLinkedTransfer, setEditingLinkedTransfer] = useState<EditingLinkedTransfer | null>(null)
  const [editLinkedAmount,      setEditLinkedAmount]      = useState('')
  const [editLinkedDate,        setEditLinkedDate]        = useState('')
  const [editLinkedDesc,        setEditLinkedDesc]        = useState('')
  const [editLinkedSaving,      setEditLinkedSaving]      = useState(false)
  const [editLinkedError,       setEditLinkedError]       = useState<string | null>(null)

  // ── Filtros de lista (cliente) ────────────────────────────────────────────
  const [statusFilter,        setStatusFilter]        = useState('all')
  const [dateFrom,            setDateFrom]            = useState('')
  const [dateTo,              setDateTo]              = useState('')
  const [selectedEmpIds_list, setSelectedEmpIds_list] = useState<string[]>([])
  const [periodPreset_list,   setPeriodPreset_list]   = useState<PeriodPreset>({ type: 'custom' })
  const [empDropdownOpen,     setEmpDropdownOpen]     = useState(false)
  const [catDropdownOpen,     setCatDropdownOpen]     = useState(false)

  // ── Panel de informe ──────────────────────────────────────────────────────
  const [reportDateFrom,   setReportDateFrom]   = useState('')
  const [reportDateTo,     setReportDateTo]     = useState('')
  const [selectedCatIds,   setSelectedCatIds]   = useState<string[]>([])
  const [itemStatusFilter, setItemStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [generating,       setGenerating]       = useState(false)
  const [loadingSearch,    setLoadingSearch]    = useState(false)
  const [reportData,       setReportData]       = useState<ReportResult | null>(null)
  const [reportError,      setReportError]      = useState<string | null>(null)

  // ── Valores computados ────────────────────────────────────────────────────

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

  const activeFilters = statusFilter !== 'all' || dateFrom !== '' || dateTo !== '' || selectedEmpIds_list.length > 0

  // ── Handlers de ítems históricos ──────────────────────────────────────────

  // Actualiza items Y recalcula totales del grupo sin recargar página
  function handleItemSaved(reportId: string, itemId: string, patch: ItemSavedPatch) {
    setHistoricalImports(prev => prev.map(h => {
      if (h.id !== reportId) return h
      const updatedItems = h.items.map(i => i.id === itemId ? { ...i, ...patch } : i)
      const advance_total = updatedItems.filter(i => i.item_type === 'advance').reduce((s, i) => s + i.amount_clp, 0)
      const expense_total = updatedItems.filter(i => i.item_type === 'expense').reduce((s, i) => s + i.amount_clp, 0)
      const return_total  = updatedItems.filter(i => i.item_type === 'return' ).reduce((s, i) => s + i.amount_clp, 0)
      // transfer_out_total y transfer_in_total NO cambian al editar ítems (vienen de fund_transfers)
      return { ...h, items: updatedItems, advance_total, expense_total, return_total }
    }))
  }

  function handleItemDeleted(reportId: string, itemId: string) {
    setHistoricalImports(prev => prev.map(h => {
      if (h.id !== reportId) return h
      const updatedItems = h.items.filter(i => i.id !== itemId)
      const advance_total = updatedItems.filter(i => i.item_type === 'advance').reduce((s, i) => s + i.amount_clp, 0)
      const expense_total = updatedItems.filter(i => i.item_type === 'expense').reduce((s, i) => s + i.amount_clp, 0)
      const return_total  = updatedItems.filter(i => i.item_type === 'return' ).reduce((s, i) => s + i.amount_clp, 0)
      return { ...h, items: updatedItems, advance_total, expense_total, return_total }
    }))
  }

  // ── Handlers de traspasos vinculados ──────────────────────────────────────

  async function handleDeleteLinkedTransfer(transferId: string) {
    if (!confirm('¿Eliminar este traspaso?\n\nSe eliminarán los ítems de traspaso en ambos fondos y el registro quedará deshecho.')) return
    try {
      await deleteLinkedFundTransfer(transferId)
      // Recargar para reflejar los cambios en transfer_in/out totals
      window.location.reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar traspaso')
    }
  }

  function openEditLinkedTransfer(transferId: string, amount: number, date: string, description: string | null) {
    setEditingLinkedTransfer({ id: transferId, amount, date, description })
    setEditLinkedAmount(String(Math.round(amount)))
    setEditLinkedDate(date)
    setEditLinkedDesc(description ?? '')
    setEditLinkedError(null)
  }

  async function handleSaveEditLinked() {
    if (!editingLinkedTransfer) return
    const amount = parseFloat(editLinkedAmount)
    if (isNaN(amount) || amount <= 0) { setEditLinkedError('Monto inválido'); return }
    if (!editLinkedDate) { setEditLinkedError('Fecha requerida'); return }
    setEditLinkedSaving(true)
    setEditLinkedError(null)
    try {
      await updateLinkedFundTransfer(editingLinkedTransfer.id, {
        amount,
        date: editLinkedDate,
        description: editLinkedDesc.trim() || null,
      })
      setEditingLinkedTransfer(null)
      window.location.reload()
    } catch (err) {
      setEditLinkedError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setEditLinkedSaving(false)
    }
  }

  function handleTitleUpdated(reportId: string, title: string) {
    setHistoricalImports(prev => prev.map(h => h.id === reportId ? { ...h, title } : h))
  }

  // ── Handlers de traspaso ──────────────────────────────────────────────────

  function openTransferModal(source: TransferSource) {
    setTransferSource(source)
    setTrReceiverId('')
    setTrAmount(String(Math.round(source.defaultAmount)))
    setTrDate(new Date().toISOString().split('T')[0])
    setTrDesc('')
    setTrError(null)
    setTrTargets([])
    setTrTargetId('')
    setTrTargetType('fund')
  }

  async function handleTrReceiverChange(empId: string) {
    setTrReceiverId(empId)
    setTrTargetId('')
    setTrTargets([])
    if (!empId) return
    setLoadingTrTargets(true)
    try {
      const targets = await getEmployeeTargets(empId)
      setTrTargets(targets)
    } catch {
      setTrTargets([])
    } finally {
      setLoadingTrTargets(false)
    }
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
        receiver_fund_id:     trTargetId && trTargetType === 'fund'   ? trTargetId : undefined,
        receiver_report_id:   trTargetId && trTargetType === 'report' ? trTargetId : undefined,
      })
      setTransferSource(null)
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
      await adminDeleteExpenseReport(id)
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

  // ── Handlers editar/eliminar traspasos sin vincular ───────────────────────

  function openEditTransferModal(t: FundTransferRow) {
    setEditingTransfer(t)
    setEditAmount(String(Math.round(t.amount)))
    setEditDate(t.date)
    setEditDesc(t.description ?? '')
    setEditReceiverId(t.receiver_employee_id)
    setEditError(null)
  }

  async function handleSaveEditTransfer() {
    if (!editingTransfer) return
    const amount = parseFloat(editAmount)
    if (isNaN(amount) || amount <= 0) { setEditError('Ingresa un monto válido'); return }
    if (!editDate) { setEditError('Selecciona una fecha'); return }
    if (!editReceiverId) { setEditError('Selecciona un receptor'); return }
    setEditSaving(true)
    setEditError(null)
    try {
      await updateFundTransfer(editingTransfer.id, {
        amount,
        date: editDate,
        description: editDesc.trim() || null,
        receiver_employee_id: editReceiverId !== editingTransfer.receiver_employee_id ? editReceiverId : undefined,
      })
      const newRecName = orgEmployees.find(e => e.id === editReceiverId)?.full_name ?? editingTransfer.receiver_employee_name
      setPendingTransfers(prev => prev.map(t =>
        t.id === editingTransfer.id
          ? { ...t, amount, date: editDate, description: editDesc.trim() || null, receiver_employee_id: editReceiverId, receiver_employee_name: newRecName }
          : t
      ))
      setEditingTransfer(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDeleteTransfer(t: FundTransferRow) {
    if (!confirm(`¿Eliminar el traspaso de ${fmtCLP(t.amount)} hacia ${t.receiver_employee_name}?\n\nSe eliminará también el ítem correspondiente en el fondo origen.`)) return
    setDeletingTransferId(t.id)
    try {
      await deleteFundTransfer(t.id)
      setPendingTransfers(prev => prev.filter(x => x.id !== t.id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar el traspaso')
    } finally {
      setDeletingTransferId(null)
    }
  }

  // ── Handlers de filtros ───────────────────────────────────────────────────

  function toggleCat(id: string) {
    setSelectedCatIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function clearListFilters() {
    setStatusFilter('all')
    setDateFrom('')
    setDateTo('')
    setSelectedEmpIds_list([])
    setPeriodPreset_list({ type: 'custom' })
  }

  function clearSearchFilters() {
    setReportDateFrom('')
    setReportDateTo('')
    setSelectedCatIds([])
    setItemStatusFilter('all')
    setReportData(null)
    setReportError(null)
  }

  // ── Handlers de reporte ───────────────────────────────────────────────────

  async function fetchReportItems() {
    setLoadingSearch(true)
    setReportError(null)
    setReportData(null)
    try {
      const result = await getPettyCashItemsForReport({
        dateFrom:    reportDateFrom || undefined,
        dateTo:      reportDateTo   || undefined,
        itemStatus:  itemStatusFilter,
        employeeIds: selectedEmpIds_list.length ? selectedEmpIds_list : undefined,
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

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    // Funds list
    funds,
    filtered,
    deletingId,
    // Historical
    historicalImports,
    movingHistId,
    deletingHistId,
    defontanaMarkingId,
    // Pending transfers
    pendingTransfers,
    deletingTransferId,
    // Employees (computed + raw)
    employees,
    orgEmployees,
    // Filters state + setters
    statusFilter,    setStatusFilter,
    dateFrom,        setDateFrom,
    dateTo,          setDateTo,
    selectedEmpIds_list, setSelectedEmpIds_list,
    periodPreset_list,   setPeriodPreset_list,
    empDropdownOpen, setEmpDropdownOpen,
    catDropdownOpen, setCatDropdownOpen,
    activeFilters,
    // Report search state + setters
    reportDateFrom,   setReportDateFrom,
    reportDateTo,     setReportDateTo,
    selectedCatIds,   setSelectedCatIds,
    itemStatusFilter, setItemStatusFilter,
    generating,
    loadingSearch,
    reportData,
    reportError,
    // Transfer modal state + setters
    transferSource, setTransferSource,
    trReceiverId,   setTrReceiverId,
    trAmount,       setTrAmount,
    trDate,         setTrDate,
    trDesc,         setTrDesc,
    trSaving,
    trError,
    trTargets,
    trTargetId,     setTrTargetId,
    trTargetType,   setTrTargetType,
    loadingTrTargets,
    // Link modal state + setters
    linkingTransfer, setLinkingTransfer,
    linkTargets,
    linkTargetId,    setLinkTargetId,
    linkTargetType,  setLinkTargetType,
    loadingTargets,
    linkSaving,
    linkError,
    // Edit transfer modal state + setters
    editingTransfer, setEditingTransfer,
    editAmount,      setEditAmount,
    editDate,        setEditDate,
    editDesc,        setEditDesc,
    editReceiverId,  setEditReceiverId,
    editSaving,
    editError,
    // Edit linked transfer modal state + setters
    editingLinkedTransfer, setEditingLinkedTransfer,
    editLinkedAmount,      setEditLinkedAmount,
    editLinkedDate,        setEditLinkedDate,
    editLinkedDesc,        setEditLinkedDesc,
    editLinkedSaving,
    editLinkedError,
    // Handlers
    handleItemSaved,
    handleItemDeleted,
    handleDeleteLinkedTransfer,
    openEditLinkedTransfer,
    handleSaveEditLinked,
    handleTitleUpdated,
    openTransferModal,
    handleTrReceiverChange,
    handleCreateTransfer,
    openLinkModal,
    handleLinkTransfer,
    handleDeleteHistorical,
    handleMarkDefontana,
    handleExportDefontanaFund,
    handleConfirmContabilizado,
    handleDeleteFund,
    handleMoveToRendicion,
    openEditTransferModal,
    handleSaveEditTransfer,
    handleDeleteTransfer,
    toggleCat,
    toggle_ids,
    clearListFilters,
    clearSearchFilters,
    fetchReportItems,
    handleExport,
  }
}

export type PettyCashStateReturn = ReturnType<typeof usePettyCashState>
