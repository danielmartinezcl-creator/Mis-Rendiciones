'use client'

import { SendHorizontal, X, Pencil, Link2, ArrowRightLeft } from 'lucide-react'
import { fmtCLP } from './usePettyCashState'
import type { TransferSource, FundTransferRow, EmployeeTarget, EditingLinkedTransfer, OrgReportSimple } from './usePettyCashState'

export interface FundModalsProps {
  orgEmployees: { id: string; full_name: string }[]
  // ── Modal crear traspaso ──────────────────────────────────────────────────
  transferSource:    TransferSource | null
  trReceiverId:      string
  trAmount:          string
  trDate:            string
  trDesc:            string
  trSaving:          boolean
  trError:           string | null
  trTargets:         EmployeeTarget[]
  trTargetId:        string
  trTargetType:      'fund' | 'report'
  loadingTrTargets:  boolean
  trDestMode:        'fund' | 'report'
  orgReports:        OrgReportSimple[]
  loadingOrgReports: boolean
  trReportId:        string
  setTransferSource: (v: TransferSource | null) => void
  setTrAmount:       (v: string) => void
  setTrDate:         (v: string) => void
  setTrDesc:         (v: string) => void
  setTrTargetId:     (v: string) => void
  setTrTargetType:   (v: 'fund' | 'report') => void
  setTrDestMode:     (v: 'fund' | 'report') => void
  setTrReportId:     (v: string) => void
  handleTrReceiverChange: (empId: string) => Promise<void>
  handleCreateTransfer:   () => Promise<void>
  // ── Modal editar traspaso sin vincular ────────────────────────────────────
  editingTransfer:    FundTransferRow | null
  editAmount:         string
  editDate:           string
  editDesc:           string
  editReceiverId:     string
  editSaving:         boolean
  editError:          string | null
  setEditingTransfer: (v: FundTransferRow | null) => void
  setEditAmount:      (v: string) => void
  setEditDate:        (v: string) => void
  setEditDesc:        (v: string) => void
  setEditReceiverId:  (v: string) => void
  handleSaveEditTransfer: () => Promise<void>
  // ── Modal editar traspaso vinculado ───────────────────────────────────────
  editingLinkedTransfer:    EditingLinkedTransfer | null
  editLinkedAmount:         string
  editLinkedDate:           string
  editLinkedDesc:           string
  editLinkedSaving:         boolean
  editLinkedError:          string | null
  setEditingLinkedTransfer: (v: EditingLinkedTransfer | null) => void
  setEditLinkedAmount:      (v: string) => void
  setEditLinkedDate:        (v: string) => void
  setEditLinkedDesc:        (v: string) => void
  handleSaveEditLinked:     () => Promise<void>
  // ── Modal vincular traspaso ───────────────────────────────────────────────
  linkingTransfer:    FundTransferRow | null
  linkTargets:        EmployeeTarget[]
  linkTargetId:       string
  linkTargetType:     'fund' | 'report'
  loadingTargets:     boolean
  linkSaving:         boolean
  linkError:          string | null
  setLinkingTransfer: (v: FundTransferRow | null) => void
  setLinkTargetId:    (v: string) => void
  setLinkTargetType:  (v: 'fund' | 'report') => void
  handleLinkTransfer: () => Promise<void>
}

export function FundModals({
  orgEmployees,
  // Transfer modal
  transferSource, setTransferSource,
  trReceiverId,
  trAmount, setTrAmount,
  trDate, setTrDate,
  trDesc, setTrDesc,
  trSaving, trError,
  trTargets, trTargetId, setTrTargetId,
  trTargetType, setTrTargetType,
  loadingTrTargets,
  trDestMode, setTrDestMode,
  orgReports, loadingOrgReports,
  trReportId, setTrReportId,
  handleTrReceiverChange,
  handleCreateTransfer,
  // Edit unlinked transfer modal
  editingTransfer, setEditingTransfer,
  editAmount, setEditAmount,
  editDate, setEditDate,
  editDesc, setEditDesc,
  editReceiverId, setEditReceiverId,
  editSaving, editError,
  handleSaveEditTransfer,
  // Edit linked transfer modal
  editingLinkedTransfer, setEditingLinkedTransfer,
  editLinkedAmount, setEditLinkedAmount,
  editLinkedDate, setEditLinkedDate,
  editLinkedDesc, setEditLinkedDesc,
  editLinkedSaving, editLinkedError,
  handleSaveEditLinked,
  // Link modal
  linkingTransfer, setLinkingTransfer,
  linkTargets, linkTargetId, setLinkTargetId,
  linkTargetType, setLinkTargetType,
  loadingTargets, linkSaving, linkError,
  handleLinkTransfer,
}: FundModalsProps) {
  return (
    <>
      {/* ── Modal crear traspaso ─────────────────────────────────────────────── */}
      {transferSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="hoja shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-ink-900 flex items-center gap-2">
                <SendHorizontal size={18} className="text-flare-600" />
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
              {/* Toggle Caja Chica / Rendición */}
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1">Tipo de destino</label>
                <div className="grid grid-cols-2 gap-1 bg-ink-100 rounded-item p-1">
                  {(['fund', 'report'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTrDestMode(mode)}
                      className={[
                        'py-1.5 rounded-xs text-xs font-semibold transition-colors',
                        trDestMode === mode
                          ? 'bg-white text-ink-900 shadow-sm'
                          : 'text-ink-500 hover:text-ink-700',
                      ].join(' ')}
                    >
                      {mode === 'fund' ? '🟣 Caja Chica' : '📋 Rendición'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Modo Caja Chica: seleccionar empleado → su fondo */}
              {trDestMode === 'fund' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-ink-600 mb-1">Empleado receptor</label>
                    <select
                      value={trReceiverId}
                      onChange={e => handleTrReceiverChange(e.target.value)}
                      className="campo w-full"
                    >
                      <option value="">— Seleccionar empleado —</option>
                      {orgEmployees
                        .filter(e => e.id !== transferSource.payerEmpId)
                        .map(e => (
                          <option key={e.id} value={e.id}>{e.full_name}</option>
                        ))}
                    </select>
                  </div>
                  {trReceiverId && (
                    <div>
                      <label className="block text-xs font-semibold text-ink-600 mb-1">
                        Fondo específico <span className="text-ink-400 font-normal">(opcional)</span>
                      </label>
                      {loadingTrTargets ? (
                        <p className="text-xs text-ink-400 py-1">Cargando fondos…</p>
                      ) : trTargets.filter(t => t.type === 'fund').length === 0 ? (
                        <p className="text-xs text-ink-400 italic py-1">Sin fondos disponibles — el traspaso quedará pendiente de vinculación.</p>
                      ) : (
                        <select
                          value={trTargetId}
                          onChange={e => {
                            setTrTargetId(e.target.value)
                            setTrTargetType('fund')
                          }}
                          className="campo w-full"
                        >
                          <option value="">— Sin vincular (quedará pendiente) —</option>
                          {trTargets.filter(t => t.type === 'fund').map(t => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Modo Rendición: buscar directamente en todas las rendiciones de la org */}
              {trDestMode === 'report' && (
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-1">Rendición de destino</label>
                  {loadingOrgReports ? (
                    <p className="text-xs text-ink-400 py-1">Cargando rendiciones…</p>
                  ) : orgReports.length === 0 ? (
                    <p className="text-xs text-ink-400 italic py-1">No hay rendiciones disponibles en la organización.</p>
                  ) : (
                    <>
                      <select
                        value={trReportId}
                        onChange={e => setTrReportId(e.target.value)}
                        className="campo w-full"
                      >
                        <option value="">— Seleccionar rendición —</option>
                        {orgReports.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.submitter_name} · {r.title}
                          </option>
                        ))}
                      </select>
                      {trReportId && (() => {
                        const r = orgReports.find(x => x.id === trReportId)
                        return r ? (
                          <p className="text-xs text-ink-500 mt-1">
                            Receptor: <span className="font-semibold text-ink-700">{r.submitter_name}</span>
                          </p>
                        ) : null
                      })()}
                    </>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-1">Monto (CLP)</label>
                  <input
                    type="number"
                    value={trAmount}
                    onChange={e => setTrAmount(e.target.value)}
                    min="1"
                    className="campo w-full font-mono-amount"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={trDate}
                    onChange={e => setTrDate(e.target.value)}
                    className="campo w-full"
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
                  className="campo w-full"
                />
              </div>
            </div>
            {trError && (
              <p className="text-xs text-danger-600 bg-danger-50 px-3 py-2 rounded-item">{trError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCreateTransfer}
                disabled={trSaving}
                className="flex-1 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all"
                style={{ background: 'var(--cta-flare)' }}
              >
                {trSaving ? 'Registrando…' : 'Registrar traspaso'}
              </button>
              <button
                onClick={() => setTransferSource(null)}
                className="btn-secundario px-4 py-2 text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal editar traspaso sin vincular ──────────────────────────────── */}
      {editingTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="hoja shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-ink-900 flex items-center gap-2">
                <Pencil size={18} className="text-ink-600" />
                Editar traspaso
              </h2>
              <button onClick={() => setEditingTransfer(null)} className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1">Empleado receptor</label>
                <select
                  value={editReceiverId}
                  onChange={e => setEditReceiverId(e.target.value)}
                  className="campo w-full"
                >
                  <option value="">— Seleccionar empleado —</option>
                  {orgEmployees
                    .filter(e => e.id !== editingTransfer.payer_employee_id)
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
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    min="1"
                    className="campo w-full font-mono-amount"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="campo w-full"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1">Descripción (opcional)</label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="Motivo del traspaso…"
                  className="campo w-full"
                />
              </div>
            </div>
            {editError && (
              <p className="text-xs text-danger-600 bg-danger-50 px-3 py-2 rounded-item">{editError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveEditTransfer}
                disabled={editSaving}
                className="flex-1 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all"
                style={{ background: 'var(--cta-accent)' }}
              >
                {editSaving ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button
                onClick={() => setEditingTransfer(null)}
                className="btn-secundario px-4 py-2 text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal editar traspaso VINCULADO ─────────────────────────────────── */}
      {editingLinkedTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="hoja shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-ink-900 flex items-center gap-2">
                <ArrowRightLeft size={18} className="text-flare-600" />
                Editar traspaso vinculado
              </h2>
              <button onClick={() => setEditingLinkedTransfer(null)} className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>
            <div className="bg-flare-50 border border-flare-100 rounded-item px-3 py-2 text-xs text-flare-800">
              Los cambios se aplicarán en ambos lados del traspaso (fondo pagador y fondo receptor).
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-1">Monto (CLP)</label>
                  <input
                    type="number"
                    value={editLinkedAmount}
                    onChange={e => setEditLinkedAmount(e.target.value)}
                    min="1"
                    className="campo w-full font-mono-amount focus:ring-flare-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={editLinkedDate}
                    onChange={e => setEditLinkedDate(e.target.value)}
                    className="campo w-full focus:ring-flare-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1">Descripción (opcional)</label>
                <input
                  type="text"
                  value={editLinkedDesc}
                  onChange={e => setEditLinkedDesc(e.target.value)}
                  placeholder="Motivo del traspaso…"
                  className="campo w-full focus:ring-flare-500"
                />
              </div>
            </div>
            {editLinkedError && (
              <p className="text-xs text-danger-600 bg-danger-50 px-3 py-2 rounded-item">{editLinkedError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveEditLinked}
                disabled={editLinkedSaving}
                className="flex-1 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all"
                style={{ background: 'var(--cta-flare)' }}
              >
                {editLinkedSaving ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button
                onClick={() => setEditingLinkedTransfer(null)}
                className="btn-secundario px-4 py-2 text-sm"
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
          <div className="hoja shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-ink-900 flex items-center gap-2">
                <Link2 size={18} className="text-warning-600" />
                Vincular traspaso
              </h2>
              <button onClick={() => setLinkingTransfer(null)} className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>
            <div className="bg-warning-50 border border-warning-100 rounded-item px-3 py-2 text-xs text-warning-800 space-y-0.5">
              <p><span className="font-semibold">De:</span> {linkingTransfer.payer_employee_name}
                {linkingTransfer.payer_fund_name && ` · ${linkingTransfer.payer_fund_name}`}
                {linkingTransfer.payer_report_title && ` · ${linkingTransfer.payer_report_title}`}
              </p>
              <p><span className="font-semibold">Para:</span> {linkingTransfer.receiver_employee_name}</p>
              <p><span className="font-semibold">Monto:</span> {fmtCLP(linkingTransfer.amount)} · {linkingTransfer.date}</p>
              {linkingTransfer.description && <p className="text-warning-600 italic">{linkingTransfer.description}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1">
                Vincular al fondo o rendición de <span className="text-ink-900">{linkingTransfer.receiver_employee_name}</span>
              </label>
              {loadingTargets ? (
                <p className="text-xs text-ink-400 py-2">Cargando fondos…</p>
              ) : linkTargets.length === 0 ? (
                <p className="text-xs text-danger-600 bg-danger-50 px-3 py-2 rounded-item">
                  No hay fondos ni rendiciones disponibles para este empleado.
                </p>
              ) : (
                <select
                  value={linkTargetId}
                  onChange={e => {
                    setLinkTargetId(e.target.value)
                    const target = linkTargets.find(t => t.id === e.target.value)
                    if (target) setLinkTargetType(target.type)
                  }}
                  className="campo w-full"
                >
                  <option value="">— Seleccionar destino —</option>
                  {linkTargets.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.type === 'fund' ? '🟣 Fondo: ' : '📋 '}{t.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {linkError && (
              <p className="text-xs text-danger-600 bg-danger-50 px-3 py-2 rounded-item">{linkError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleLinkTransfer}
                disabled={linkSaving || !linkTargetId || loadingTargets}
                className="flex-1 py-2 text-sm font-bold text-white rounded-item disabled:opacity-50 transition-all"
                style={{ background: 'var(--cta-warning)' }}
              >
                {linkSaving ? 'Vinculando…' : 'Vincular traspaso'}
              </button>
              <button
                onClick={() => setLinkingTransfer(null)}
                className="btn-secundario px-4 py-2 text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
