'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Wallet, History, Clock } from 'lucide-react'
import type { PendingToRenderList } from '@/actions/admin'

function fmtCLP(n: number) {
  return '$ ' + Math.round(n).toLocaleString('es-CL')
}

interface Props {
  list: PendingToRenderList
}

export function PendingToRenderPanel({ list }: Props) {
  const [expanded, setExpanded] = useState(false)

  const count  = list.pettyCashFunds.length + list.historicalImports.length
  const amount = list.pettyCashFunds.reduce((s, f) => s + f.amount, 0)
              + list.historicalImports.reduce((s, h) => s + h.amount, 0)
  const isEmpty = count === 0

  return (
    <div className="bg-white rounded-card shadow-card border-t-[3px] border-t-violet-400 overflow-hidden">
      {/* Cabecera — clickeable */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full p-5 text-left hover:bg-ink-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-ink-500 leading-tight mb-3">Pendiente de rendición</p>
            <p className="text-2xl font-bold text-ink-900 mb-0.5">{count}</p>
            <p className={`text-sm font-mono-amount font-semibold ${amount > 0 ? 'text-violet-600' : 'text-ink-400'}`}>
              {fmtCLP(amount)}
            </p>
          </div>
          <span className="mt-1 text-ink-400">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        </div>
      </button>

      {/* Lista expandible */}
      {expanded && (
        <div className="border-t border-ink-100">
          {isEmpty ? (
            <p className="px-5 py-4 text-sm text-ink-400 text-center">Sin fondos pendientes de rendir</p>
          ) : (
            <div className="divide-y divide-ink-50 max-h-72 overflow-y-auto">
              {/* Fondos de caja chica */}
              {list.pettyCashFunds.map(f => (
                <Link
                  key={f.id}
                  href={`/petty-cash/${f.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50 transition-colors"
                >
                  <Wallet size={14} className="text-violet-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-800 truncate">{f.name}</p>
                    <p className="text-xs text-ink-400">{f.employeeName}</p>
                  </div>
                  <span className="font-mono-amount text-sm font-bold text-violet-700 shrink-0">
                    {fmtCLP(f.amount)}
                  </span>
                </Link>
              ))}

              {/* Importaciones históricas con adelanto sin rendir */}
              {list.historicalImports.map(h => (
                <Link
                  key={h.id}
                  href={`/petty-cash`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50 transition-colors"
                >
                  <History size={14} className="text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-800 truncate">{h.title}</p>
                    <p className="text-xs text-ink-400">{h.employeeName} · Carga histórica</p>
                  </div>
                  <span className="font-mono-amount text-sm font-bold text-amber-700 shrink-0">
                    {fmtCLP(h.amount)}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {/* Footer con total */}
          {!isEmpty && (
            <div className="px-5 py-3 bg-violet-50 border-t border-violet-100 flex justify-between items-center">
              <span className="text-xs font-medium text-violet-700 flex items-center gap-1.5">
                <Clock size={12} />
                Total pendiente de rendición
              </span>
              <span className="font-mono-amount text-sm font-bold text-violet-800">{fmtCLP(amount)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
