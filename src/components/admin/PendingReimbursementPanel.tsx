'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, ReceiptText, Wallet, Banknote } from 'lucide-react'
import type { PendingReimbursementList } from '@/actions/admin'

function fmtCLP(n: number) {
  return '$ ' + Math.round(n).toLocaleString('es-CL')
}

interface Props {
  count:  number
  amount: number
  list:   PendingReimbursementList
}

export function PendingReimbursementPanel({ count, amount, list }: Props) {
  const [expanded, setExpanded] = useState(false)
  const isEmpty = list.reports.length === 0 && list.pettyCashFunds.length === 0

  return (
    <div className="bg-white rounded-card shadow-card border-t-[3px] border-t-emerald-400 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full p-5 text-left hover:bg-ink-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-ink-500 leading-tight mb-3">Pendientes de reembolsar</p>
            <p className="text-2xl font-bold text-ink-900 mb-0.5">{count}</p>
            <p className="text-sm font-mono-amount font-semibold text-emerald-600">{fmtCLP(amount)}</p>
          </div>
          <span className="mt-1 text-ink-400">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-ink-100">
          {isEmpty ? (
            <p className="px-5 py-4 text-sm text-ink-400 text-center">Sin reembolsos pendientes</p>
          ) : (
            <div className="divide-y divide-ink-50 max-h-72 overflow-y-auto">
              {list.reports.map(r => (
                <Link key={r.id} href={`/admin/reports`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50 transition-colors">
                  <ReceiptText size={14} className="text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-800 truncate">{r.title}</p>
                    <p className="text-xs text-ink-400">{r.employeeName}</p>
                  </div>
                  <span className="font-mono-amount text-sm font-bold text-emerald-700 shrink-0">
                    {fmtCLP(r.amount)}
                  </span>
                </Link>
              ))}
              {list.pettyCashFunds.map(f => (
                <Link key={f.id} href={`/petty-cash/${f.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50 transition-colors">
                  <Wallet size={14} className="text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-800 truncate">{f.name}</p>
                    <p className="text-xs text-ink-400">{f.employeeName}</p>
                  </div>
                  <span className="font-mono-amount text-sm font-bold text-emerald-700 shrink-0">
                    {fmtCLP(f.amount)}
                  </span>
                </Link>
              ))}
            </div>
          )}
          {!isEmpty && (
            <div className="px-5 py-3 bg-emerald-50 border-t border-emerald-100 flex justify-between items-center">
              <span className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                <Banknote size={12} />
                Total a reembolsar a empleados
              </span>
              <span className="font-mono-amount text-sm font-bold text-emerald-800">{fmtCLP(amount)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
