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
    case 'approved':           return { label: 'Aprobada',         cls: 'bg-success-50 text-success-700 border-success-200' }
    case 'partially_approved': return { label: 'Aprobada parcial', cls: 'bg-warning-50 text-warning-700 border-warning-200' }
    case 'pending_bank_load':  return { label: 'Carga bancaria',   cls: 'bg-accent-50 text-accent-700 border-accent-200' }
    case 'pending_bank_auth':  return { label: 'Autorización',     cls: 'bg-info-50 text-info-700 border-info-200' }
    default:                   return { label: status,             cls: 'bg-ink-50 text-ink-600 border-ink-200' }
  }
}

function borderColor(status: string) {
  switch (status) {
    case 'approved':
    case 'partially_approved': return 'border-l-warning-400'
    case 'pending_bank_load':  return 'border-l-accent-500'
    case 'pending_bank_auth':  return 'border-l-info-500'
    default:                   return 'border-l-ink-300'
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

  /**
   * Una etapa abierta por vez.
   *
   * Antes se pintaban las tres completas: 14,9 pantallas de desplazamiento en
   * escritorio y 20 en teléfono, el peor número de la app después de la lista
   * de empleados. Y el conteo de cada etapa aparecía DOS veces —en su KPI y en
   * el encabezado de su sección—, así que la pantalla se hacía larga repitiendo.
   *
   * Ahora el KPI ES el control de su etapa. El resumen deja de ser un cartel
   * que repite y pasa a ser la puerta de entrada, que es la idea de la §7 del
   * piloto de caja chica.
   *
   * Para un operador esto no cambia nada: `getBankQueue()` ya devuelve solo los
   * estados que su rol puede accionar, así que ve una sola etapa. Las tres
   * juntas eran la vista del admin.
   */
  type Etapa = 'enviar' | 'carga' | 'autorizar'

  /* Arranca en la primera etapa QUE TENGA TRABAJO, no siempre en la misma:
     abrir una etapa vacía obligaría a un clic para encontrar dónde está lo
     pendiente. */
  const primeraConTrabajo: Etapa =
    queue.isAdmin && ready.length    ? 'enviar' :
    queue.canLoad  && loading.length  ? 'carga'  :
    queue.canAuth  && authoriz.length ? 'autorizar' :
    queue.isAdmin ? 'enviar' : queue.canLoad ? 'carga' : 'autorizar'

  const [etapa, setEtapa] = useState<Etapa>(primeraConTrabajo)
  /* La cola de envío es la única con volumen real (78 hoy). De a 25: el total
     ya lo dice el contador de arriba, así que paginar no esconde la magnitud
     del atraso, solo el scroll. */
  const [visibles, setVisibles] = useState(25)

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
        <div className="w-10 h-10 rounded-item bg-accent-50 flex items-center justify-center shrink-0">
          <Landmark size={20} className="text-accent-600" />
        </div>
        <div>
          <h1 className="font-display font-semibold text-xl tor-on-gradient">Cola Bancaria</h1>
          <p className="text-sm tor-on-gradient-soft">Gestión de pagos y reembolsos pendientes</p>
        </div>
      </div>

      {/* Los KPI son el control: cada uno abre su etapa. El conteo vive acá y
          en ningún otro lado. */}
      <div className="grid grid-cols-3 gap-3">
        {queue.isAdmin && (
          <button
            onClick={() => setEtapa('enviar')}
            aria-pressed={etapa === 'enviar'}
            className={`bg-warning-50 border rounded-card p-3 text-center transition-all ${
              etapa === 'enviar' ? 'border-warning-500 ring-2 ring-warning-200' : 'border-warning-200 hover:border-warning-400'
            }`}
          >
            <p className="text-2xl font-mono-amount font-semibold text-warning-700">{ready.length}</p>
            <p className="text-xs text-warning-600 mt-0.5">Para enviar</p>
          </button>
        )}
        {queue.canLoad && (
          <button
            onClick={() => setEtapa('carga')}
            aria-pressed={etapa === 'carga'}
            className={`bg-accent-50 border rounded-card p-3 text-center transition-all ${
              etapa === 'carga' ? 'border-accent-500 ring-2 ring-accent-200' : 'border-accent-200 hover:border-accent-400'
            }`}
          >
            <p className="text-2xl font-mono-amount font-semibold text-accent-700">{loading.length}</p>
            <p className="text-xs text-accent-600 mt-0.5">Carga pendiente</p>
          </button>
        )}
        {queue.canAuth && (
          <button
            onClick={() => setEtapa('autorizar')}
            aria-pressed={etapa === 'autorizar'}
            className={`bg-info-50 border rounded-card p-3 text-center transition-all ${
              etapa === 'autorizar' ? 'border-info-500 ring-2 ring-info-200' : 'border-info-200 hover:border-info-400'
            }`}
          >
            <p className="text-2xl font-mono-amount font-semibold text-info-700">{authoriz.length}</p>
            <p className="text-xs text-info-600 mt-0.5">Por autorizar</p>
          </button>
        )}
      </div>

      {isEmpty && (
        <div className="text-center py-16 text-ink-400">
          <CheckCircle2 size={40} className="mx-auto mb-3 text-accent-300" />
          <p className="font-medium text-ink-600">Todo al día</p>
          <p className="text-sm mt-1">No hay rendiciones pendientes de acción bancaria</p>
        </div>
      )}

      {/* Sección 1: Para enviar al banco (solo admin) */}
      {etapa === 'enviar' && queue.isAdmin && ready.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="flex items-center gap-2 section-title text-warning-700">
              <SendHorizonal size={14} />
              Aprobadas — enviar al banco ({ready.length})
            </h2>
            {/* La frase es de la etapa, no de cada rendición: antes se repetía
                idéntica en las 78 filas. */}
            <p className="card-meta">
              Aprobadas y listas para iniciar la transferencia bancaria.
            </p>
          </div>

          {ready.slice(0, visibles).map(r => (
            <FilaEnviar
              key={r.id}
              report={r}
              enviando={savingId === r.id}
              bloqueada={!!savingId}
              errorMsg={errorId === r.id ? errorMsg : ''}
              onEnviar={() => handleSendToBank(r.id)}
            />
          ))}

          {ready.length > visibles && (
            <button
              onClick={() => setVisibles(v => v + 25)}
              className="hoja border border-ink-200 w-full px-4 py-3 text-sm font-semibold text-accent-700 hover:bg-ink-50 transition-colors"
            >
              Mostrar {Math.min(25, ready.length - visibles)} más
              <span className="font-normal text-ink-500"> · quedan {ready.length - visibles}</span>
            </button>
          )}
        </section>
      )}

      {/* Sección 2: Confirmación de carga bancaria */}
      {etapa === 'carga' && queue.canLoad && loading.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 section-title text-accent-700">
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
                      className="campo w-full px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-ink-500 mb-1">
                      Fecha de transferencia <span className="text-danger-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.transferredAt}
                      onChange={e => setLoadForms(prev => ({ ...prev, [r.id]: { ...form, transferredAt: e.target.value } }))}
                      className="campo w-full px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
                <button
                  onClick={() => handleConfirmLoad(r.id)}
                  disabled={!!savingId}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white px-4 py-2 rounded-item transition-colors"
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
      {etapa === 'autorizar' && queue.canAuth && authoriz.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 section-title text-info-700">
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
                    className="campo w-full max-w-sm px-2.5 py-1.5 text-xs focus:ring-info-500"
                  />
                </div>
                <button
                  onClick={() => handleAuthorize(r.id)}
                  disabled={!!savingId}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-info-600 hover:bg-info-700 disabled:opacity-50 text-white px-4 py-2 rounded-item transition-colors"
                >
                  <ShieldCheck size={13} />
                  {savingId === r.id ? 'Autorizando…' : 'Autorizar y marcar reembolsada'}
                </button>
              </ReportCard>
            )
          })}
        </section>
      )}

      {/* La etapa elegida está vacía, pero la cola no. Sin esto, tocar un KPI en
          cero dejaba la pantalla en blanco debajo de los contadores y parecía
          que algo había fallado. */}
      {!isEmpty && (
        (etapa === 'enviar'    && ready.length    === 0) ||
        (etapa === 'carga'     && loading.length  === 0) ||
        (etapa === 'autorizar' && authoriz.length === 0)
      ) && (
        <div className="hoja p-8 text-center">
          <CheckCircle2 size={28} className="mx-auto mb-2 text-success-400" />
          <p className="card-label font-semibold text-ink-700">Nada en esta etapa</p>
          <p className="card-meta text-ink-500 mt-1">
            Tocá otro contador de arriba para ver lo que sí está pendiente.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Tarjeta de report ──────────────────────────────────────────────────────

/**
 * Fila de la cola de envío.
 *
 * No usa ReportCard a propósito: esa tarjeta existe para alojar el formulario
 * de dos campos de la etapa de carga, y mide ~165 px. Acá la acción es un
 * botón solo, así que el ítem es una fila. Repetir la tarjeta en las 78
 * rendiciones aprobadas daba 14 pantallas de scroll para una decisión que se
 * toma leyendo nombre y monto.
 */
function FilaEnviar({
  report,
  enviando,
  bloqueada,
  errorMsg,
  onEnviar,
}: {
  report: BankQueueReport
  enviando: boolean
  bloqueada: boolean
  errorMsg: string
  onEnviar: () => void
}) {
  return (
    <div className={`hoja border border-ink-200 border-l-4 border-l-warning-400 px-4 py-2.5 ${enviando ? 'opacity-60' : ''}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink-900 sm:truncate">{report.title}</p>
          <p className="text-xs text-ink-500 truncate">
            {report.submitter_name}
            {report.department && ` · ${report.department}`}
            {report.approved_at && ` · aprobada ${formatDate(report.approved_at.split('T')[0])}`}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
        <p className="font-mono-amount font-semibold text-sm text-ink-900 shrink-0 tabular-nums">
          {formatCLP(report.approved_amount > 0 ? report.approved_amount : report.total_amount)}
        </p>
        <button
          onClick={onEnviar}
          disabled={bloqueada}
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-item transition-colors"
        >
          <Landmark size={13} />
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
        </div>
      </div>

      {errorMsg && (
        <p className="text-xs text-danger-600 bg-danger-50 border border-danger-200 rounded-item px-3 py-2 mt-2">{errorMsg}</p>
      )}
    </div>
  )
}

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
    <div className={`hoja border border-ink-200 border-l-4 ${border} p-4 ${isSaving ? 'opacity-60 pointer-events-none' : ''}`}>
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
        <p className="text-xs text-danger-600 bg-danger-50 border border-danger-200 rounded-item px-3 py-2 mb-3">{errorMsg}</p>
      )}

      {children}
    </div>
  )
}
