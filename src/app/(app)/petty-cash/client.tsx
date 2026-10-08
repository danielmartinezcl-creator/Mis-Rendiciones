'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Plus, FileSpreadsheet, Download, Link2, Pencil, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { usePettyCashState, fmtCLP } from './usePettyCashState'
import type { HistoricalImport, FundListItem, FundTransferRow } from './usePettyCashState'
import { FundList } from './FundList'
import { FundModals } from './FundModals'
import { HistoricalSection } from './HistoricalSection'
import { BarraFiltros } from '@/components/filtros/BarraFiltros'
import type { Dimension } from '@/lib/filtros/dimensiones'
import { aFiltro, aValores, dimensionDocumento } from '@/lib/filtros/adaptador-documentos'
import {
  aplicarFiltro, contarPorCategoria, hayFiltro, ETIQUETAS_ESTADO, FILTRO_VACIO, ORDEN_FAMILIAS, SIN_PROYECTO,
  type Filtro, type OpcionesFiltro,
} from '@/lib/filtro-documentos'
import { depurarFiltro } from '@/lib/filtro-url'
import { etiquetaDeProyecto, textoCoincidencia, textoResumen } from '@/lib/filtro-etiquetas'

interface Props {
  initialFunds:      FundListItem[]
  isManager:         boolean
  historicalImports: HistoricalImport[]
  orgEmployees:      { id: string; full_name: string }[]
  pendingTransfers:  FundTransferRow[]
  opciones:          OpcionesFiltro
  filtroInicial:     Filtro
  /** La fecha de hoy en Chile, del servidor: así servidor y navegador calculan lo mismo */
  hoy:               string
}

export function PettyCashClient({
  initialFunds,
  isManager,
  historicalImports: initialHistoricalImports,
  orgEmployees,
  pendingTransfers: initialPendingTransfers,
  opciones,
  filtroInicial,
  hoy,
}: Props) {
  // Empleados para el chip: los beneficiarios de los fondos que ve
  const empleadosFondos = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of initialFunds) m.set(f.employee_id, f.employee_name)
    return [...m].map(([id, etiqueta]) => ({ id, etiqueta })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))
  }, [initialFunds])

  const filtroDepurado = useMemo(() => depurarFiltro(filtroInicial, {
    proyectos:  opciones.proyectos.map(p => p.id),
    categorias: opciones.categorias.map(c => c.id),
    empleados:  isManager ? empleadosFondos.map(e => e.id) : [],
  }), [filtroInicial, opciones, isManager, empleadosFondos])

  const state = usePettyCashState({
    initialFunds,
    initialHistoricalImports,
    orgEmployees,
    initialPendingTransfers,
    filtroInicial: filtroDepurado,
    hoy,
  })

  const {
    filtered,
    filtro,
    setFiltro,
    resultado,
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
    handleRevertContabilizado,
    handleItemSaved,
    handleItemDeleted,
    handleTitleUpdated,
    openTransferModal,
    openEditLinkedTransfer,
    handleDeleteLinkedTransfer,
  } = state

  const categorias = opciones.categorias.map(c => ({ id: c.id, etiqueta: c.name }))
  const conteo = contarPorCategoria(state.funds)
  const dimensiones: Dimension[] = [
    dimensionDocumento('proyectos', [
      { id: SIN_PROYECTO, etiqueta: 'Sin proyecto' },
      ...opciones.proyectos.map(p => ({ id: p.id, etiqueta: etiquetaDeProyecto(p) })),
    ]),
    dimensionDocumento('categorias', categorias.map(c => {
      const n = conteo.get(c.id) ?? 0
      return { ...c, detalle: n === 1 ? '1 gasto' : `${n} gastos` }
    })),
    dimensionDocumento('fecha', []),
    dimensionDocumento('estados', ORDEN_FAMILIAS.map(f => ({ id: f, etiqueta: ETIQUETAS_ESTADO.fondo[f] }))),
    // El empleado ve solo sus fondos: filtrar por empleado es de quien administra
    ...(isManager ? [dimensionDocumento('empleados', empleadosFondos)] : []),
  ]
  const coincidencia = (fundId: string) => {
    if (!filtro.categorias.length) return null
    const v = resultado.visibles.find(x => x.doc.id === fundId)
    return v ? textoCoincidencia({ gastos: v.gastos.length, montoClp: v.montoClp }, filtro, categorias) : null
  }

  return (
    <div className="space-y-4">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-extrabold text-2xl tracking-tight tor-on-gradient">Caja Chica</h1>
          <p className="text-sm tor-on-gradient-soft mt-1">
            {filtered.length !== state.funds.length
              ? `${filtered.length} de ${state.funds.length} fondos`
              : `${state.funds.length} fondo${state.funds.length !== 1 ? 's' : ''} registrado${state.funds.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isManager && (
            <>
              <button
                onClick={() => handleExport('excel')}
                disabled={!!generating}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item disabled:opacity-40 transition-all shadow-sm hover:shadow-md active:scale-[.97]"
                style={{ background: 'var(--cta-success)' }}
              >
                <FileSpreadsheet size={14} />
                {generating ? 'Exportando…' : 'Excel'}
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={!!generating}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item disabled:opacity-40 transition-all shadow-sm hover:shadow-md active:scale-[.97]"
                style={{ background: 'var(--cta-danger)' }}
              >
                <Download size={14} />
                {generating ? 'Exportando…' : 'PDF'}
              </button>
            </>
          )}
          <Link
            href="/petty-cash/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item transition-all shadow-sm hover:shadow-md active:scale-[.97]"
            style={{ background: 'var(--cta-brand)' }}
          >
            <Plus size={14} />
            Nuevo fondo
          </Link>
        </div>
      </div>

      {/* ── Filtro: la barra de chips (diseño A) ─────────────────────────────── */}
      <BarraFiltros
        valores={aValores(filtro)}
        onCambio={v => setFiltro(aFiltro(v))}
        dimensiones={dimensiones}
        contar={v => aplicarFiltro(state.funds, aFiltro(v), hoy).visibles.length}
        sustantivo={['fondo', 'fondos']}
        resumen={hayFiltro(filtro)
          ? textoResumen({ visibles: filtered.length, total: state.funds.length, totalClp: resultado.totalClp }, filtro, categorias)
          : null}
      />

      {/* ── Traspasos sin vincular ─────────────────────────────────────────────── */}
      {isManager && pendingTransfers.length > 0 && (
        <div className="bg-warning-50 border border-warning-200 rounded-card p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Link2 size={14} className="text-warning-600" />
            <span className="text-sm font-bold text-warning-800">
              {pendingTransfers.length === 1
                ? '1 traspaso sin vincular'
                : `${pendingTransfers.length} traspasos sin vincular`}
            </span>
          </div>
          <div className="space-y-1.5">
            {pendingTransfers.map(t => (
              <div key={t.id} className="flex items-center gap-2 bg-white rounded-item border border-warning-100 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-ink-800">
                    <span className="text-warning-600 mr-1">↙</span>
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
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-warning-700 border border-warning-300 rounded-item hover:bg-warning-100 transition-colors"
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
                    className="p-1.5 text-danger-400 hover:text-danger-600 hover:bg-danger-50 rounded-item transition-colors disabled:opacity-40"
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
        compacta={filtro.empleados.length > 0}
        initialFundsLength={initialFunds.length}
        openTransferModal={openTransferModal}
        handleDeleteFund={state.handleDeleteFund}
        limpiarFiltro={() => setFiltro(FILTRO_VACIO)}
        coincidencia={coincidencia}
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
          onRevertContabilizado={handleRevertContabilizado}
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
