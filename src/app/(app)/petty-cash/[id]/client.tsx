'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  getFundDetail,
  submitFundForApproval,
  approveFund,
  rejectFund,
  requestBankLoad,
  confirmBankLoad,
  authorizeBank,
  submitLiquidation,
  elevateLiquidation,
  approveLiquidation,
  recordSettlement,
  removeFundItem,
} from '@/actions/petty-cash'
import type { FundDetail } from '@/actions/petty-cash'
import { InsigniaEstado } from '@/components/ui/InsigniaEstado'
import { FundTimeline }      from '@/components/petty-cash/FundTimeline'
import { AddFundItemForm }   from '@/components/petty-cash/AddFundItemForm'
import { EditFundItemForm }  from '@/components/petty-cash/EditFundItemForm'
import { VerticalTimeline }  from '@/components/ui/VerticalTimeline'
import { ItemAttachmentZone } from '@/components/ui/ItemAttachmentZone'
import { FundDefontanaPanel } from '@/components/petty-cash/FundDefontanaPanel'
import { ApprovalAttachments } from '@/components/approvals/ApprovalAttachments'
import { getApprovalAttachments } from '@/actions/approval-attachments'
import { calculateFundBalance, formatPeriod, canEmployeeAddItems, canEmployeeSubmitLiquidation } from '@/lib/petty-cash-helpers'
import { FUND_STEPS } from '@/lib/constants'
import { ArrowLeft, Plus, Trash2, AlertCircle, Pencil, Building2, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

type ApprovalAtt = Awaited<ReturnType<typeof getApprovalAttachments>>[number]

function fmtCLP(n: number) {
  return '$ ' + Math.round(n).toLocaleString('es-CL')
}

function today() {
  return new Date().toISOString().split('T')[0]
}

interface Props {
  id: string
  initialDetail: FundDetail | null
}

export function FundDetailClient({ id, initialDetail }: Props) {
  const [detail, setDetail]               = useState<FundDetail | null>(initialDetail)
  const [showAddItem, setShowAddItem]     = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [pending, startTrans]             = useTransition()
  const [error, setError]                 = useState<string | null>(null)

  // paneles de acción
  const [approvingFund, setApprovingFund] = useState(false)
  const [rejectingFund, setRejectingFund] = useState(false)
  const [bankLoadConfirming, setBankLoadConfirming] = useState(false)
  const [settling, setSettling]           = useState(false)
  const [decidingItems, setDecidingItems] = useState<Record<string, 'approved' | 'rejected'>>({})
  const [rejectionReasons, setRejReasons] = useState<Record<string, string>>({})

  // inputs de modales
  const [approvedAmount, setApprovedAmount] = useState(
    initialDetail?.fund.amount_approved ? String(initialDetail.fund.amount_approved) : ''
  )
  const [approveNotes, setApproveNotes]   = useState('')
  const [rejectNotes, setRejectNotes]     = useState('')
  const [disbAmount, setDisbAmount]       = useState(
    initialDetail?.fund.amount_approved ? String(initialDetail.fund.amount_approved) : ''
  )
  const [disbRef, setDisbRef]             = useState('')
  const [disbDate, setDisbDate]           = useState(today())
  const [settleType, setSettleType]       = useState<'refund_to_employee' | 'reimbursement_from_employee'>('refund_to_employee')
  const [settleAmount, setSettleAmount]   = useState('')
  const [settleRef, setSettleRef]         = useState('')
  const [settleDate, setSettleDate]       = useState(today())
  const [approvalAtts, setApprovalAtts]   = useState<ApprovalAtt[]>([])

  useEffect(() => {
    loadApprovalAtts()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function loadApprovalAtts() {
    const atts = await getApprovalAttachments({ fundId: id })
    setApprovalAtts(atts)
  }

  async function load() {
    const d = await getFundDetail(id)
    setDetail(d)
    if (d?.fund.amount_approved) setApprovedAmount(String(d.fund.amount_approved))
  }

  function act(fn: () => Promise<void>) {
    setError(null)
    startTrans(async () => {
      try { await fn(); await load() }
      catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    })
  }

  if (!detail) return (
    <div className="text-center py-16 text-ink-400">
      <AlertCircle size={36} className="mx-auto mb-3" />
      <p>Fondo no encontrado</p>
      <Link href="/petty-cash" className="text-brand-600 text-sm mt-2 inline-block">← Volver</Link>
    </div>
  )

  const { fund, items, audits, transfers, categories, employee_name, manager_name, currentUser } = detail
  const balance   = calculateFundBalance(fund.amount_approved, items)
  const isManager  = fund.manager_id === currentUser.id || currentUser.role === 'admin'
  const isEmployee = fund.employee_id === currentUser.id
  const isApprover = currentUser.can_approve || currentUser.role === 'admin'

  const ITEM_STATUS_CLASS: Record<string, string> = {
    pending:  'text-warning-600 bg-warning-50',
    approved: 'text-success-600 bg-success-50',
    rejected: 'text-danger-600 bg-danger-50',
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/petty-cash" className="p-2 text-ink-400 hover:text-ink-700 rounded-item hover:bg-ink-100 transition-colors mt-0.5">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display font-extrabold text-2xl tracking-tight tor-on-gradient">{fund.name}</h1>
            <InsigniaEstado tipo="fondo" estado={fund.status} />
          </div>
          <p className="text-xs tor-on-gradient-soft mt-1">
            Empleado: <span className="font-medium text-ink-700">{employee_name}</span>
            {' · '}EFF: <span className="font-medium text-ink-700">{manager_name}</span>
            {' · '}{formatPeriod(fund.period_start, fund.period_end)}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Monto aprobado',  value: fund.amount_approved ?? fund.amount_requested, sub: fund.amount_approved == null ? 'Pendiente de aprobación' : null },
          { label: 'Total gastado',   value: balance.spent,  sub: `${items.filter(i => i.status !== 'rejected').length} gasto${items.length !== 1 ? 's' : ''}` },
          { label: balance.difference >= 0 ? 'Pendiente de devolver' : 'A reembolsar a empresa',
            value: Math.abs(balance.difference),
            sub: balance.isBalanced ? 'Exacto' : null,
            highlight: Math.abs(balance.difference) > 0,
          },
          { label: 'Transferencias',  value: transfers.reduce((s, t) => s + t.amount, 0), sub: `${transfers.length} registro${transfers.length !== 1 ? 's' : ''}` },
        ].map((k, i) => (
          <div key={i} className={`hoja p-4 ${k.highlight ? 'border-t-2 border-t-warning-400' : ''}`}>
            <p className="text-xs text-ink-500 mb-1">{k.label}</p>
            <p className="font-mono-amount font-bold text-ink-900">{fmtCLP(k.value)}</p>
            {k.sub && <p className="text-xs text-ink-400 mt-0.5">{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* Progreso del fondo */}
      {fund.status !== 'rejected' && (
        <div className="hoja px-5 py-4">
          <p className="section-title text-ink-500 mb-4">Progreso</p>
          <VerticalTimeline steps={FUND_STEPS} currentStatus={fund.status} />
        </div>
      )}

      {fund.description && (
        <div className="bg-ink-50 rounded-card px-4 py-3 text-sm text-ink-600 border border-ink-100">
          {fund.description}
        </div>
      )}

      {/* Adjuntos del fondo (correos de aprobación, respaldos) */}
      <ApprovalAttachments
        attachments={approvalAtts}
        target={{ fundId: id }}
        onRefresh={loadApprovalAtts}
      />

      {error && (
        <p className="text-xs text-danger-600 bg-danger-50 px-3 py-2 rounded-item border border-danger-100">{error}</p>
      )}

      {/* ── ACCIONES POR ESTADO ─────────────────────────────────── */}

      {/* EFF: enviar a autorización */}
      {fund.status === 'draft' && isManager && (
        <div className="hoja p-4 border-t-2 border-t-warning-400">
          <p className="text-sm font-semibold text-ink-800 mb-3">Paso 1 — Enviar a autorización</p>
          <button
            disabled={pending}
            onClick={() => act(() => submitFundForApproval(fund.id))}
            className="w-full py-2 bg-warning-500 hover:bg-warning-600 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors"
          >
            {pending ? 'Enviando...' : 'Enviar a autorización'}
          </button>
        </div>
      )}

      {/* Aprobador: autorizar o rechazar fondo */}
      {fund.status === 'pending_approval' && isApprover && (
        <div className="hoja p-4 border-t-2 border-t-info-400 space-y-3">
          <p className="text-sm font-semibold text-ink-800">Autorización de fondo</p>
          {!approvingFund && !rejectingFund && (
            <div className="flex gap-2">
              <button onClick={() => setApprovingFund(true)} className="flex-1 py-2 bg-success-600 hover:bg-success-700 text-white text-sm font-bold rounded-item transition-colors">
                Autorizar fondo
              </button>
              <button onClick={() => setRejectingFund(true)} className="flex-1 py-2 bg-danger-600 hover:bg-danger-700 text-white text-sm font-bold rounded-item transition-colors">
                Rechazar
              </button>
            </div>
          )}
          {approvingFund && (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1">Monto autorizado (CLP)</label>
                <input type="number" value={approvedAmount} onChange={e => setApprovedAmount(e.target.value)} min="1"
                  className="campo w-full font-mono-amount" />
              </div>
              <input value={approveNotes} onChange={e => setApproveNotes(e.target.value)} placeholder="Notas (opcional)"
                className="campo w-full" />
              <div className="flex gap-2">
                <button disabled={pending} onClick={() => act(() => approveFund(fund.id, parseFloat(approvedAmount), approveNotes))}
                  className="flex-1 py-2 bg-success-600 hover:bg-success-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors">
                  {pending ? 'Autorizando...' : 'Confirmar autorización'}
                </button>
                <button onClick={() => setApprovingFund(false)} className="px-4 py-2 text-ink-500 hover:text-ink-800 rounded-item hover:bg-ink-100 transition-colors text-sm">Cancelar</button>
              </div>
            </div>
          )}
          {rejectingFund && (
            <div className="space-y-2">
              <textarea value={rejectNotes} onChange={e => setRejectNotes(e.target.value)} placeholder="Motivo de rechazo (obligatorio)" rows={2}
                className="campo w-full resize-none" />
              <div className="flex gap-2">
                <button disabled={pending || !rejectNotes.trim()} onClick={() => act(() => rejectFund(fund.id, rejectNotes))}
                  className="flex-1 py-2 bg-danger-600 hover:bg-danger-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors">
                  {pending ? 'Rechazando...' : 'Confirmar rechazo'}
                </button>
                <button onClick={() => setRejectingFund(false)} className="px-4 py-2 text-ink-500 hover:text-ink-800 rounded-item hover:bg-ink-100 transition-colors text-sm">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EFF: enviar al banco para carga */}
      {fund.status === 'approved' && isManager && (
        <div className="hoja p-4 border-t-2 border-t-info-400 space-y-2">
          <div className="flex items-center gap-2">
            <Building2 size={15} className="text-info-600" />
            <p className="text-sm font-semibold text-ink-800">Paso 2 — Enviar al banco</p>
          </div>
          <p className="text-xs text-ink-500">
            Solicita la carga al banco. El fondo pasará a estado "Carga bancaria pendiente".
          </p>
          <button
            disabled={pending}
            onClick={() => act(() => requestBankLoad(fund.id))}
            className="w-full py-2 bg-info-600 hover:bg-info-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors"
          >
            {pending ? 'Enviando...' : 'Enviar al banco'}
          </button>
        </div>
      )}

      {/* Banco: confirmar carga bancaria */}
      {fund.status === 'pending_bank_load' && (currentUser.role === 'admin' || currentUser.can_load_bank_transfer) && (
        <div className="hoja p-4 border-t-2 border-t-info-500 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 size={15} className="text-info-600" />
            <p className="text-sm font-semibold text-ink-800">Confirmar carga bancaria</p>
          </div>
          <p className="text-xs text-ink-500">Ingresa los datos de la transferencia realizada en el banco.</p>
          {!bankLoadConfirming ? (
            <button onClick={() => setBankLoadConfirming(true)} className="w-full py-2 bg-info-600 hover:bg-info-700 text-white text-sm font-bold rounded-item transition-colors">
              Ingresar datos de transferencia
            </button>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1">Monto transferido (CLP)</label>
                <input
                  type="number"
                  value={disbAmount}
                  onChange={e => setDisbAmount(e.target.value)}
                  min="1"
                  className="campo w-full font-mono-amount"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-1">Referencia bancaria</label>
                  <input value={disbRef} onChange={e => setDisbRef(e.target.value)} placeholder="TRF-00123"
                    className="campo w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-1">Fecha de transferencia</label>
                  <input type="date" value={disbDate} onChange={e => setDisbDate(e.target.value)}
                    className="campo w-full" />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={pending}
                  onClick={() => act(() => confirmBankLoad(fund.id, {
                    amount:         parseFloat(disbAmount) || (fund.amount_approved ?? fund.amount_requested),
                    reference:      disbRef || undefined,
                    transferred_at: disbDate,
                  }))}
                  className="flex-1 py-2 bg-info-600 hover:bg-info-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors"
                >
                  {pending ? 'Confirmando...' : 'Confirmar carga bancaria'}
                </button>
                <button onClick={() => setBankLoadConfirming(false)} className="px-4 py-2 text-ink-500 hover:text-ink-800 rounded-item hover:bg-ink-100 transition-colors text-sm">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Autorizador: autorizar transferencia */}
      {fund.status === 'pending_bank_auth' && (currentUser.role === 'admin' || currentUser.can_authorize_bank_transfer) && (
        <div className="hoja p-4 border-t-2 border-t-info-500 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-info-600" />
            <p className="text-sm font-semibold text-ink-800">Autorizar transferencia</p>
          </div>
          <p className="text-xs text-ink-500">
            La carga está lista. Al autorizar, los fondos quedarán disponibles para el empleado.
          </p>
          <button
            disabled={pending}
            onClick={() => act(() => authorizeBank(fund.id))}
            className="w-full py-2 bg-info-600 hover:bg-info-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors"
          >
            {pending ? 'Autorizando...' : 'Autorizar transferencia'}
          </button>
        </div>
      )}

      {/* ── ÍTEMS DE GASTO ─────────────────────────────────────── */}
      {['funds_sent','submitted','pending_liquidation_approval','settled'].includes(fund.status) && (
        <div className="hoja overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
            <h2 className="text-sm font-semibold text-ink-800">
              Gastos registrados
              <span className="ml-2 text-xs text-ink-400 font-normal">{items.length} ítem{items.length !== 1 ? 's' : ''}</span>
            </h2>
            {canEmployeeAddItems(fund.status) && isEmployee && !showAddItem && (
              <button onClick={() => setShowAddItem(true)} className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 transition-colors">
                <Plus size={13} /> Agregar gasto
              </button>
            )}
          </div>

          {showAddItem && (
            <div className="p-4 border-b border-ink-100 bg-ink-50">
              <AddFundItemForm fundId={fund.id} categories={categories} onDone={() => { setShowAddItem(false); load() }} />
            </div>
          )}

          {items.length === 0 ? (
            <div className="py-8 text-center text-ink-400">
              <p className="text-sm">Sin gastos registrados aún</p>
              {canEmployeeAddItems(fund.status) && isEmployee && (
                <button onClick={() => setShowAddItem(true)} className="text-brand-600 text-sm mt-2 hover:underline">+ Agregar primer gasto</button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-ink-50">
              {items.map(item => {
                const cls = ITEM_STATUS_CLASS[item.status] ?? 'text-ink-500 bg-ink-50'
                const canDelete = (fund.status === 'funds_sent' && isEmployee) || currentUser.role === 'admin'
                const canEdit   = (fund.status === 'funds_sent' && isEmployee) || currentUser.role === 'admin'
                const deciding  = fund.status === 'pending_liquidation_approval' && isApprover
                const isEditing = editingItemId === item.id

                return (
                  <div key={item.id} className="px-4 py-3">
                    {isEditing ? (
                      <EditFundItemForm
                        item={item}
                        categories={categories}
                        onDone={() => { setEditingItemId(null); load() }}
                      />
                    ) : (
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-ink-800 truncate">{item.description}</p>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cls}`}>
                              {item.status === 'pending' ? 'Pendiente' : item.status === 'approved' ? 'Aprobado' : 'Rechazado'}
                            </span>
                          </div>
                          <p className="text-xs text-ink-400 mt-0.5">
                            {new Date(item.date + 'T00:00:00').toLocaleDateString('es-CL')}
                            {item.merchant && ` · ${item.merchant}`}
                            {item.doc_type && ` · ${item.doc_type}`}
                          </p>
                          {item.rejection_reason && (
                            <p className="text-xs text-danger-600 mt-1 bg-danger-50 px-2 py-1 rounded-item">Rechazo: {item.rejection_reason}</p>
                          )}
                          {item.notes && <p className="text-xs text-ink-500 mt-0.5 italic">{item.notes}</p>}
                          {deciding && (
                            <div className="mt-2 space-y-1">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setDecidingItems(d => ({ ...d, [item.id]: 'approved' }))}
                                  className={`text-xs px-2 py-1 rounded-item font-bold border transition-colors ${decidingItems[item.id] === 'approved' ? 'bg-success-600 text-white border-success-600' : 'border-success-300 text-success-700 hover:bg-success-50'}`}
                                >✓ Aprobar</button>
                                <button
                                  onClick={() => setDecidingItems(d => ({ ...d, [item.id]: 'rejected' }))}
                                  className={`text-xs px-2 py-1 rounded-item font-bold border transition-colors ${decidingItems[item.id] === 'rejected' ? 'bg-danger-600 text-white border-danger-600' : 'border-danger-300 text-danger-700 hover:bg-danger-50'}`}
                                >✗ Rechazar</button>
                              </div>
                              {decidingItems[item.id] === 'rejected' && (
                                <input
                                  value={rejectionReasons[item.id] ?? ''}
                                  onChange={e => setRejReasons(r => ({ ...r, [item.id]: e.target.value }))}
                                  placeholder="Motivo de rechazo"
                                  className="w-full px-2 py-1 text-xs border border-danger-200 rounded-item focus:outline-none focus:ring-1 focus:ring-danger-400"
                                />
                              )}
                            </div>
                          )}
                          {!item.transfer_id && (
                            <ItemAttachmentZone
                              itemId={item.id}
                              itemType="petty_cash_item"
                              canUpload={canEdit || isApprover}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-mono-amount text-sm font-bold text-ink-800">{fmtCLP(item.amount_clp)}</span>
                          {canEdit && (
                            <button
                              onClick={() => setEditingItemId(item.id)}
                              className="p-1 text-ink-300 hover:text-brand-600 rounded transition-colors"
                              title="Editar ítem"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          {canDelete && !item.transfer_id && (
                            <button
                              disabled={pending}
                              onClick={() => {
                                if (window.confirm(`¿Eliminar "${item.description}"? Esta acción no se puede deshacer.`))
                                  act(() => removeFundItem(item.id))
                              }}
                              className="p-1 text-ink-300 hover:text-danger-500 rounded transition-colors"
                              title="Eliminar ítem"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="px-4 py-3 bg-ink-50 flex justify-between">
                <span className="text-sm font-semibold text-ink-700">Total gastos</span>
                <span className="font-mono-amount font-bold text-ink-900">{fmtCLP(balance.spent)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empleado: enviar liquidación */}
      {canEmployeeSubmitLiquidation(fund.status, items) && isEmployee && (
        <div className="hoja p-4 border-t-2 border-t-warning-400">
          <p className="text-sm font-semibold text-ink-800 mb-1">Cerrar y enviar liquidación</p>
          <p className="text-xs text-ink-500 mb-3">
            Total gastado: {fmtCLP(balance.spent)} de {fmtCLP(fund.amount_approved ?? fund.amount_requested)} aprobados.
            {balance.hasRefund && ` La empresa te devolverá ${fmtCLP(balance.difference)}.`}
            {balance.hasReimbursement && ` Reembolsarás ${fmtCLP(Math.abs(balance.difference))} a la empresa.`}
          </p>
          <button
            disabled={pending}
            onClick={() => act(() => submitLiquidation(fund.id))}
            className="w-full py-2 bg-warning-500 hover:bg-warning-600 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors"
          >
            {pending ? 'Enviando...' : 'Enviar liquidación'}
          </button>
        </div>
      )}

      {/* EFF: elevar liquidación */}
      {fund.status === 'submitted' && isManager && (
        <div className="hoja p-4 border-t-2 border-t-flare-400">
          <p className="text-sm font-semibold text-ink-800 mb-3">Elevar liquidación a aprobadores</p>
          <button
            disabled={pending}
            onClick={() => act(() => elevateLiquidation(fund.id))}
            className="w-full py-2 bg-flare-600 hover:bg-flare-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors"
          >
            {pending ? 'Elevando...' : 'Elevar a aprobadores'}
          </button>
        </div>
      )}

      {/* Aprobador: aprobar liquidación */}
      {fund.status === 'pending_liquidation_approval' && isApprover && (
        <div className="hoja p-4 border-t-2 border-t-info-400 space-y-3">
          <p className="text-sm font-semibold text-ink-800">Revisar y aprobar liquidación</p>
          <p className="text-xs text-ink-500">Revisá cada ítem arriba y marcalo como aprobado o rechazado antes de finalizar.</p>
          <input value={approveNotes} onChange={e => setApproveNotes(e.target.value)} placeholder="Notas de la liquidación (opcional)"
            className="campo w-full" />
          <button
            disabled={pending}
            onClick={() => act(() => approveLiquidation(
              fund.id,
              items.map(i => ({
                itemId: i.id,
                action: decidingItems[i.id] ?? 'approved',
                reason: rejectionReasons[i.id],
              })),
              approveNotes,
            ))}
            className="w-full py-2 bg-success-600 hover:bg-success-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors"
          >
            {pending ? 'Aprobando...' : 'Finalizar revisión y aprobar'}
          </button>
        </div>
      )}

      {/* EFF: registrar diferencia */}
      {fund.status === 'settled' && isManager && Math.abs(balance.difference) > 0 && (
        <div className="hoja p-4 border-t-2 border-t-success-400 space-y-3">
          <p className="text-sm font-semibold text-ink-800">Registrar transferencia de diferencia</p>
          <p className="text-xs text-ink-500">
            Diferencia: {fmtCLP(Math.abs(balance.difference))}{' '}
            ({balance.hasRefund ? 'empresa devuelve al empleado' : 'empleado reembolsa a empresa'})
          </p>
          {!settling ? (
            <button onClick={() => {
              setSettleType(balance.hasRefund ? 'refund_to_employee' : 'reimbursement_from_employee')
              setSettleAmount(String(Math.round(Math.abs(balance.difference))))
              setSettling(true)
            }} className="w-full py-2 bg-success-600 hover:bg-success-700 text-white text-sm font-bold rounded-item transition-colors">
              Registrar transferencia de diferencia
            </button>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-1">Referencia bancaria</label>
                  <input value={settleRef} onChange={e => setSettleRef(e.target.value)} placeholder="TRF-00124"
                    className="campo w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-1">Fecha</label>
                  <input type="date" value={settleDate} onChange={e => setSettleDate(e.target.value)}
                    className="campo w-full" />
                </div>
              </div>
              <div className="flex gap-2">
                <button disabled={pending} onClick={() => act(() => recordSettlement(fund.id, { type: settleType, amount: parseFloat(settleAmount), reference: settleRef, transferred_at: settleDate }))}
                  className="flex-1 py-2 bg-success-600 hover:bg-success-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors">
                  {pending ? 'Registrando...' : 'Confirmar'}
                </button>
                <button onClick={() => setSettling(false)} className="px-4 py-2 text-ink-500 hover:text-ink-800 rounded-item hover:bg-ink-100 transition-colors text-sm">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transferencias bancarias registradas */}
      {transfers.length > 0 && (
        <div className="hoja overflow-hidden">
          <h2 className="text-sm font-semibold text-ink-800 px-4 py-3 border-b border-ink-100">Transferencias bancarias</h2>
          <div className="divide-y divide-ink-50">
            {transfers.map(t => (
              <div key={t.id} className="px-4 py-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-ink-800">
                    {t.type === 'disbursement' ? '→ Fondos enviados al empleado' :
                     t.type === 'refund_to_employee' ? '→ Devolución al empleado' :
                     '← Reembolso del empleado'}
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    {new Date(t.transferred_at + 'T00:00:00').toLocaleDateString('es-CL')}
                    {t.reference && ` · Ref: ${t.reference}`}
                  </p>
                </div>
                <span className="font-mono-amount font-bold text-ink-900">{fmtCLP(t.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Contabilidad Defontana por movimiento — solo admin.
          Aparece desde que hay algo firme que contabilizar, sin esperar la liquidación. */}
      {currentUser.role === 'admin' && (
        <FundDefontanaPanel fundId={id} onChanged={load} />
      )}

      {/* Timeline de auditoría */}
      <div className="hoja p-5">
        <h2 className="text-sm font-semibold text-ink-800 mb-4">Historial del fondo</h2>
        <FundTimeline entries={audits} />
      </div>
    </div>
  )
}
