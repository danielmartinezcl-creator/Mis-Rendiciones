'use client'

import Link from 'next/link'
import { Wallet, Plus, Filter, Trash2, SendHorizontal } from 'lucide-react'
import { FundStatusBadge } from '@/components/petty-cash/FundStatusBadge'
import { CompactStepper } from '@/components/ui/CompactStepper'
import { FUND_STEPS } from '@/lib/constants'
import { formatPeriod } from '@/lib/petty-cash-helpers'
import { fmtCLP } from './usePettyCashState'
import type { FundListItem, TransferSource } from './usePettyCashState'

export interface FundListProps {
  funds:               FundListItem[]
  filtered:            FundListItem[]
  isManager:           boolean
  deletingId:          string | null
  selectedEmpIds_list: string[]
  initialFundsLength:  number
  openTransferModal:   (source: TransferSource) => void
  handleDeleteFund:    (id: string, name: string) => Promise<void>
  clearListFilters:    () => void
}

export function FundList({
  funds,
  filtered,
  isManager,
  deletingId,
  selectedEmpIds_list,
  initialFundsLength,
  openTransferModal,
  handleDeleteFund,
  clearListFilters,
}: FundListProps) {
  if (filtered.length === 0) {
    if (funds.length === 0) {
      return (
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
      )
    }
    return (
      <div className="text-center py-12 text-ink-400">
        <Filter size={32} className="mx-auto mb-3 opacity-25" />
        <p className="text-sm font-medium">Sin resultados con los filtros actuales</p>
        <button
          onClick={clearListFilters}
          className="mt-2 text-brand-600 text-sm hover:underline"
        >
          Limpiar filtros
        </button>
      </div>
    )
  }

  if (selectedEmpIds_list.length > 0) {
    /* C-01: Vista compacta cuando hay filtro de empleado activo */
    return (
      <div className="space-y-1">
        {filtered.map(f => (
          <div key={f.id} className="bg-white rounded-item border border-ink-100 hover:border-brand-200 transition-colors flex items-center">
            <Link href={`/petty-cash/${f.id}`} className="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0">
              <FundStatusBadge status={f.status} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-800 truncate">{f.name}</p>
                <p className="text-xs text-ink-400">
                  {f.employee_name} · {formatPeriod(f.period_start, f.period_end)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono-amount text-sm font-bold text-ink-900">{fmtCLP(f.amount_approved ?? f.amount_requested)}</p>
                {f.amount_approved != null && f.amount_approved !== f.amount_requested && (
                  <p className="text-xs text-ink-400">Sol: {fmtCLP(f.amount_requested)}</p>
                )}
              </div>
            </Link>
            {isManager && (
              <div className="flex items-stretch border-l border-ink-100">
                <button
                  onClick={() => openTransferModal({ fundId: f.id, defaultAmount: f.amount_approved ?? f.amount_requested, payerEmpId: f.employee_id })}
                  title="Registrar traspaso"
                  className="px-2.5 text-violet-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                >
                  <SendHorizontal size={14} />
                </button>
                <button
                  onClick={() => handleDeleteFund(f.id, f.name)}
                  disabled={deletingId === f.id}
                  title="Eliminar fondo"
                  className="px-3 border-l border-ink-100 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 rounded-r-item"
                >
                  {deletingId === f.id ? <span className="text-xs">...</span> : <Trash2 size={15} />}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  /* Vista detallada por defecto */
  return (
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
                {f.status !== 'rejected' && (
                  <div className="mt-2 max-w-[220px]">
                    <CompactStepper steps={FUND_STEPS} currentStatus={f.status} />
                  </div>
                )}
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
  )
}
