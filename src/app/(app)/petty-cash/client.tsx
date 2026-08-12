'use client'

import Link from 'next/link'
import { Plus, FileSpreadsheet, Download, Link2, Pencil, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { usePettyCashState, fmtCLP } from './usePettyCashState'
import type { Category, HistoricalImport, FundListItem, FundTransferRow } from './usePettyCashState'
import { FundFilters } from './FundFilters'
import { FundList } from './FundList'
import { FundModals } from './FundModals'
import { HistoricalSection } from './HistoricalSection'

interface Props {
  initialFunds:      FundListItem[]
  initialCategories: Category[]
  isManager:         boolean
  historicalImports: HistoricalImport[]
  orgEmployees:      { id: string; full_name: string }[]
  pendingTransfers:  FundTransferRow[]
}

export function PettyCashClient({
  initialFunds,
  initialCategories,
  isManager,
  historicalImports: initialHistoricalImports,
  orgEmployees,
  pendingTransfers: initialPendingTransfers,
}: Props) {
  const state = usePettyCashState({
    initialFunds,
    initialHistoricalImports,
    orgEmployees,
    initialPendingTransfers,
  })

  const {
    filtered,
    reportData,
    generating,
    pendingTransfers,
    deletingTransferId,
    historicalImports,
    handleExport,
    openLinkModal,
    openEditTransferModal,
    handleDeleteTransfer,
    handleMoveToRendicion,
    handleDeleteHistorical,
    handleExportDefontanaFund,
    handleConfirmContabilizado,
    handleItemSaved,
    handleItemDeleted,
    handleTitleUpdated,
    openTransferModal,
    openEditLinkedTransfer,
    handleDeleteLinkedTransfer,
    clearListFilters,
  } = state

  return (
    <div className="space-y-4">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
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
                {generating ? 'Exportando…' : 'Excel'}
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={!!generating || !reportData?.items.length}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item disabled:opacity-40 transition-all shadow-sm hover:shadow-md active:scale-[.97]"
                style={{ background: 'linear-gradient(130deg, #12152E 0%, #e11d48 100%)' }}
              >
                <Download size={14} />
                {generating ? 'Exportando…' : 'PDF'}
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

      {/* ── Panel unificado de filtros ─────────────────────────────────────────── */}
      <FundFilters
        isManager={isManager}
        initialCategories={initialCategories}
        employees={state.employees}
        statusFilter={state.statusFilter}
        dateFrom={state.dateFrom}
        dateTo={state.dateTo}
        selectedEmpIds_list={state.selectedEmpIds_list}
        periodPreset_list={state.periodPreset_list}
        empDropdownOpen={state.empDropdownOpen}
        catDropdownOpen={state.catDropdownOpen}
        activeFilters={state.activeFilters}
        reportDateFrom={state.reportDateFrom}
        reportDateTo={state.reportDateTo}
        selectedCatIds={state.selectedCatIds}
        itemStatusFilter={state.itemStatusFilter}
        loadingSearch={state.loadingSearch}
        generating={state.generating}
        reportData={state.reportData}
        reportError={state.reportError}
        setStatusFilter={state.setStatusFilter}
        setDateFrom={state.setDateFrom}
        setDateTo={state.setDateTo}
        setSelectedEmpIds_list={state.setSelectedEmpIds_list}
        setPeriodPreset_list={state.setPeriodPreset_list}
        setEmpDropdownOpen={state.setEmpDropdownOpen}
        setCatDropdownOpen={state.setCatDropdownOpen}
        setReportDateFrom={state.setReportDateFrom}
        setReportDateTo={state.setReportDateTo}
        setItemStatusFilter={state.setItemStatusFilter}
        toggleCat={state.toggleCat}
        clearListFilters={state.clearListFilters}
        clearSearchFilters={state.clearSearchFilters}
        fetchReportItems={state.fetchReportItems}
        handleExport={state.handleExport}
      />

      {/* ── Traspasos sin vincular ─────────────────────────────────────────────── */}
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
              <div key={t.id} className="flex items-center gap-2 bg-white rounded-item border border-amber-100 px-3 py-2">
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
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openLinkModal(t)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-700 border border-amber-300 rounded-item hover:bg-amber-100 transition-colors"
                  >
                    <Link2 size={11} />
                    Vincular
                  </button>
                  <button
                    onClick={() => openEditTransferModal(t)}
                    title="Editar traspaso"
                    className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded-item transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDeleteTransfer(t)}
                    disabled={deletingTransferId === t.id}
                    title="Eliminar traspaso"
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-item transition-colors disabled:opacity-40"
                  >
                    {deletingTransferId === t.id ? <span className="text-xs">…</span> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Lista de fondos ────────────────────────────────────────────────────── */}
      <FundList
        funds={state.funds}
        filtered={filtered}
        isManager={isManager}
        deletingId={state.deletingId}
        selectedEmpIds_list={state.selectedEmpIds_list}
        initialFundsLength={initialFunds.length}
        openTransferModal={openTransferModal}
        handleDeleteFund={state.handleDeleteFund}
        clearListFilters={clearListFilters}
      />

      {/* ── Carga histórica ────────────────────────────────────────────────────── */}
      {historicalImports.length > 0 && (
        <HistoricalSection
          imports={historicalImports}
          isManager={isManager}
          movingHistId={state.movingHistId}
          deletingHistId={state.deletingHistId}
          onMove={handleMoveToRendicion}
          onDelete={handleDeleteHistorical}
          onExportDefontana={handleExportDefontanaFund}
          onConfirmContabilizado={handleConfirmContabilizado}
          onItemSaved={handleItemSaved}
          onItemDeleted={handleItemDeleted}
          onTitleUpdated={handleTitleUpdated}
          onTransfer={(reportId, submitterId, defaultAmount) => openTransferModal({
            reportId,
            defaultAmount,
            payerEmpId: submitterId,
          })}
          onEditLinkedTransfer={openEditLinkedTransfer}
          onDeleteLinkedTransfer={handleDeleteLinkedTransfer}
        />
      )}

      {/* ── Modales ────────────────────────────────────────────────────────────── */}
      <FundModals
        orgEmployees={orgEmployees}
        // Transfer modal
        transferSource={state.transferSource}
        trReceiverId={state.trReceiverId}
        trAmount={state.trAmount}
        trDate={state.trDate}
        trDesc={state.trDesc}
        trSaving={state.trSaving}
        trError={state.trError}
        trTargets={state.trTargets}
        trTargetId={state.trTargetId}
        trTargetType={state.trTargetType}
        loadingTrTargets={state.loadingTrTargets}
        setTransferSource={state.setTransferSource}
        setTrAmount={state.setTrAmount}
        setTrDate={state.setTrDate}
        setTrDesc={state.setTrDesc}
        setTrTargetId={state.setTrTargetId}
        setTrTargetType={state.setTrTargetType}
        trDestMode={state.trDestMode}
        setTrDestMode={state.setTrDestMode}
        orgReports={state.orgReports}
        loadingOrgReports={state.loadingOrgReports}
        trReportId={state.trReportId}
        setTrReportId={state.setTrReportId}
        handleTrReceiverChange={state.handleTrReceiverChange}
        handleCreateTransfer={state.handleCreateTransfer}
        // Edit unlinked transfer modal
        editingTransfer={state.editingTransfer}
        editAmount={state.editAmount}
        editDate={state.editDate}
        editDesc={state.editDesc}
        editReceiverId={state.editReceiverId}
        editSaving={state.editSaving}
        editError={state.editError}
        setEditingTransfer={state.setEditingTransfer}
        setEditAmount={state.setEditAmount}
        setEditDate={state.setEditDate}
        setEditDesc={state.setEditDesc}
        setEditReceiverId={state.setEditReceiverId}
        handleSaveEditTransfer={state.handleSaveEditTransfer}
        // Edit linked transfer modal
        editingLinkedTransfer={state.editingLinkedTransfer}
        editLinkedAmount={state.editLinkedAmount}
        editLinkedDate={state.editLinkedDate}
        editLinkedDesc={state.editLinkedDesc}
        editLinkedSaving={state.editLinkedSaving}
        editLinkedError={state.editLinkedError}
        setEditingLinkedTransfer={state.setEditingLinkedTransfer}
        setEditLinkedAmount={state.setEditLinkedAmount}
        setEditLinkedDate={state.setEditLinkedDate}
        setEditLinkedDesc={state.setEditLinkedDesc}
        handleSaveEditLinked={state.handleSaveEditLinked}
        // Link modal
        linkingTransfer={state.linkingTransfer}
        linkTargets={state.linkTargets}
        linkTargetId={state.linkTargetId}
        linkTargetType={state.linkTargetType}
        loadingTargets={state.loadingTargets}
        linkSaving={state.linkSaving}
        linkError={state.linkError}
        setLinkingTransfer={state.setLinkingTransfer}
        setLinkTargetId={state.setLinkTargetId}
        setLinkTargetType={state.setLinkTargetType}
        handleLinkTransfer={state.handleLinkTransfer}
      />
    </div>
  )
}
