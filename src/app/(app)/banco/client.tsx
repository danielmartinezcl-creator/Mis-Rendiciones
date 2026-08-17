'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  requestReportBankLoad,
  confirmReportBankLoad,
  authorizeReportBank,
} from '@/actions/approvals'
import { formatCLP, formatDate } from '@/lib/utils'
import {
  Landmark,
  Upload,
  ShieldCheck,
  SendHorizonal,
  CheckCircle2,
  Clock,
  User,
  Building2,
} from 'lucide-react'
import type { BankQueueReport } from '@/actions/admin'

interface BankQueue {
  isAdmin: boolean
  canLoad: boolean
  canAuth: boolean
  reports: BankQueueReport[]
}

interface Props {
  queue: BankQueue
}

function statusMeta(status: string) {
  switch (status) {
    case 'approved':           return { label: 'Aprobada',         cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'partially_approved': return { label: 'Aprobada parcial', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'pending_bank_load':  return { label: 'Carga bancaria',   cls: 'bg-teal-50 text-teal-700 border-teal-200' }
    case 'pending_bank_auth':  return { label: 'Autorización',     cls: 'bg-blue-50 text-blue-700 border-blue-200' }
    default:                   return { label: status,             cls: 'bg-slate-50 text-slate-600 border-slate-200' }
  }
}

function borderColor(status: string) {
  switch (status) {
    case 'approved':
    case 'partially_approved': return 'border-l-amber-400'
    case 'pending_bank_load':  return 'border-l-teal-500'
    case 'pending_bank_auth':  return 'border-l-blue-500'
    default:                   return 'border-l-slate-300'
  }
}

type LoadForm  = { paymentReference: string; transferredAt: string }
type AuthForm  = { paymentReference: string }

export function BancoClient({ queue }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [savingId,   setSavingId]   = useState<string | null>(null)
  const [errorId,    setErrorId]    = useState<string | null>(null)
  const [errorMsg,   setErrorMsg]   = useState('')

  const [loadForms,  setLoadForms]  = useState<Record<string, LoadForm>>({})
  const [authForms,  setAuthForms]  = useState<Record<string, AuthForm>>({})

  const ready    = queue.reports.filter(r => r.status === 'approved' || r.status === 'partially_approved')
  const loading  = queue.reports.filter(r => r.status === 'pending_bank_load')
  const authoriz = queue.reports.filter(r => r.status === 'pending_bank_auth')

  function setError(reportId: string, msg: string) {
    setErrorId(reportId)
    setErrorMsg(msg)
  }

  function clearError() { setErrorId(null); setErrorMsg('') }

  async function handleSendToBank(reportId: string) {
    clearError()
    setSavingId(reportId)
    try {
      await requestReportBankLoad(reportId)
      startTransition(() => router.refresh())
    } catch (e: unknown) {
      setError(reportId, e instanceof Error ? e.message : 'Error al enviar al banco')
    } finally {
      setSavingId(null)
    }
  }

  async function handleConfirmLoad(reportId: string) {
    clearError()
    const form = loadForms[reportId] ?? { paymentReference: '', transferredAt: '' }
    if (!form.transferredAt) {
      setError(reportId, 'Ingresa la fecha de la transferencia')
      return
    }
    setSavingId(reportId)
    try {
      await confirmReportBankLoad(reportId, {
        paymentReference: form.paymentReference,
        transferredAt:    form.transferredAt,
      })
      startTransition(() => router.refresh())
    } catch (e: unknown) {
      setError(reportId, e instanceof Error ? e.message : 'Error al confirmar la carga')
    } finally {
      setSavingId(null)
    }
  }

  async function handleAuthorize(reportId: string) {
    clearError()
    const form = authForms[reportId] ?? { paymentReference: '' }
    setSavingId(reportId)
    try {
      await authorizeReportBank(reportId, form.paymentReference)
      startTransition(() => router.refresh())
    } catch (e: unknown) {
      setError(reportId, e instanceof Error ? e.message : 'Error al autorizar')
    } finally {
      setSavingId(null)
    }
  }

  const isEmpty = queue.reports.length === 0

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-item bg-teal-50 flex items-center justify-center shrink-0">
          <Landmark size={20} className="text-teal-600" />
        </div>
        <div>
          <h1 className="font-display font-semibold text-xl text-ink-900">Cola Bancaria</h1>
          <p className="text-sm text-ink-500">Gestión de pagos y reembolsos pendientes</p>
        </div>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-3 gap-3">
        {queue.isAdmin && (
          <div className="bg-amber-50 border border-amber-200 rounded-card p-3 text-center">
            <p className="text-2xl font-mono-amount font-semibold text-amber-700">{ready.length}</p>
            <p className="text-xs text-amber-600 mt-0.5">Para enviar</p>
          </div>
        )}
        {queue.canLoad && (
          <div className="bg-teal-50 border border-teal-200 rounded-card p-3 text-center">
            <p className="text-2xl font-mono-amount font-semibold text-teal-700">{loading.length}</p>
            <p className="text-xs text-teal-600 mt-0.5">Carga pendiente</p>
          </div>
        )}
        {queue.canAuth && (
          <div className="bg-blue-50 border border-blue-200 rounded-card p-3 text-center">
            <p className="text-2xl font-mono-amount font-semibold text-blue-700">{authoriz.length}</p>
            <p className="text-xs text-blue-600 mt-0.5">Por autorizar</p>
          </div>
        )}
      </div>

      {isEmpty && (
        <div className="text-center py-16 text-ink-400">
          <CheckCircle2 size={40} className="mx-auto mb-3 text-teal-300" />
          <p className="font-medium text-ink-600">Todo al día</p>
          <p className="text-sm mt-1">No hay rendiciones pendientes de acción bancaria</p>
        </div>
      )}

      {/* Sección 1: Para enviar al banco (solo admin) */}
      {queue.isAdmin && ready.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 section-title text-amber-700">
            <SendHorizonal size={14} />
            Aprobadas — enviar al banco ({ready.length})
          </h2>
          {ready.map(r => (
            <ReportCard
              key={r.id}
              report={r}
              isSaving={savingId === r.id}
              errorMsg={errorId === r.id ? errorMsg : ''}
            >
              <p className="text-xs text-ink-500 mb-3">
                Rendición aprobada y lista para iniciar el proceso de transferencia bancaria.
              </p>
              <button
                onClick={() => handleSendToBank(r.id)}
                disabled={!!savingId}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-2 rounded-item transition-colors"
              >
                <Landmark size={13} />
                {savingId === r.id ? 'Enviando…' : 'Enviar al banco'}
              </button>
            </ReportCard>
          ))}
        </section>
      )}

      {/* Sección 2: Confirmación de carga bancaria */}
      {queue.canLoad && loading.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 section-title text-teal-700">
            <Upload size={14} />
            Pendientes de confirmación de carga ({loading.length})
          </h2>
          {loading.map(r => {
            const form = loadForms[r.id] ?? { paymentReference: '', transferredAt: '' }
            return (
              <ReportCard
                key={r.id}
                report={r}
                isSaving={savingId === r.id}
                errorMsg={errorId === r.id ? errorMsg : ''}
              >
                <p className="text-xs text-ink-500 mb-3">
                  Ya realizaste la transferencia en el banco. Registra los datos para continuar.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-ink-500 mb-1">Referencia bancaria</label>
                    <input
                      type="text"
                      value={form.paymentReference}
                      onChange={e => setLoadForms(prev => ({ ...prev, [r.id]: { ...form, paymentReference: e.target.value } }))}
                      placeholder="N° transferencia, orden de pago…"
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-item text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-ink-500 mb-1">
                      Fecha de transferencia <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.transferredAt}
                      onChange={e => setLoadForms(prev => ({ ...prev, [r.id]: { ...form, transferredAt: e.target.value } }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-item text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
                <button
                  onClick={() => handleConfirmLoad(r.id)}
                  disabled={!!savingId}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-2 rounded-item transition-colors"
                >
                  <Upload size={13} />
                  {savingId === r.id ? 'Guardando…' : 'Confirmar carga bancaria'}
                </button>
              </ReportCard>
            )
          })}
        </section>
      )}

      {/* Sección 3: Autorización bancaria */}
      {queue.canAuth && authoriz.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 section-title text-blue-700">
            <ShieldCheck size={14} />
            Pendientes de autorización ({authoriz.length})
          </h2>
          {authoriz.map(r => {
            const form = authForms[r.id] ?? { paymentReference: '' }
            return (
              <ReportCard
                key={r.id}
                report={r}
                isSaving={savingId === r.id}
                errorMsg={errorId === r.id ? errorMsg : ''}
              >
                <p className="text-xs text-ink-500 mb-3">
                  La transferencia fue cargada al banco. Autoriza para completar el reembolso.
                </p>
                <div className="mb-3">
                  <label className="block text-xs text-ink-500 mb-1">Referencia de autorización (opcional)</label>
                  <input
                    type="text"
                    value={form.paymentReference}
                    onChange={e => setAuthForms(prev => ({ ...prev, [r.id]: { paymentReference: e.target.value } }))}
                    placeholder="N° de autorización, código de operación…"
                    className="w-full max-w-sm px-2.5 py-1.5 border border-slate-200 rounded-item text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={() => handleAuthorize(r.id)}
                  disabled={!!savingId}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-item transition-colors"
                >
                  <ShieldCheck size={13} />
                  {savingId === r.id ? 'Autorizando…' : 'Autorizar y marcar reembolsada'}
                </button>
              </ReportCard>
            )
          })}
        </section>
      )}
    </div>
  )
}

// ── Tarjeta de report ──────────────────────────────────────────────────────

function ReportCard({
  report,
  isSaving,
  errorMsg,
  children,
}: {
  report: BankQueueReport
  isSaving: boolean
  errorMsg: string
  children: React.ReactNode
}) {
  const meta = statusMeta(report.status)
  const border = borderColor(report.status)

  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${border} rounded-card p-4 shadow-sm ${isSaving ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-medium text-sm text-ink-900 truncate">{report.title}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-ink-500">
            <User size={11} />
            <span>{report.submitter_name}</span>
            {report.department && (
              <>
                <span>·</span>
                <Building2 size={11} />
                <span>{report.department}</span>
              </>
            )}
            {report.approved_at && (
              <>
                <span>·</span>
                <Clock size={11} />
                <span>Aprobada {formatDate(report.approved_at.split('T')[0])}</span>
              </>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono-amount font-semibold text-sm text-ink-900">
            {formatCLP(report.approved_amount > 0 ? report.approved_amount : report.total_amount)}
          </p>
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full border mt-1 ${meta.cls}`}>
            {meta.label}
          </span>
        </div>
      </div>

      {errorMsg && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-item px-3 py-2 mb-3">{errorMsg}</p>
      )}

      {children}
    </div>
  )
}
