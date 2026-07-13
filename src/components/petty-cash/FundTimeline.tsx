import { FUND_AUDIT_LABELS } from '@/lib/constants'
import {
  FilePlus, Send, CheckCircle2, XCircle, Banknote,
  ClipboardCheck, CornerUpRight, CheckCheck, Flag,
} from 'lucide-react'

const ACTION_ICON: Record<string, React.ElementType> = {
  created:                 FilePlus,
  submitted_for_approval:  Send,
  approved:                CheckCircle2,
  rejected:                XCircle,
  funds_sent:              Banknote,
  liquidation_submitted:   ClipboardCheck,
  liquidation_elevated:    CornerUpRight,
  liquidation_approved:    CheckCheck,
  settled:                 Flag,
}

const ACTION_COLOR: Record<string, string> = {
  created:                 'bg-slate-100 text-slate-500',
  submitted_for_approval:  'bg-amber-100 text-amber-600',
  approved:                'bg-emerald-100 text-emerald-600',
  rejected:                'bg-rose-100 text-rose-600',
  funds_sent:              'bg-violet-100 text-violet-600',
  liquidation_submitted:   'bg-amber-100 text-amber-600',
  liquidation_elevated:    'bg-violet-100 text-violet-600',
  liquidation_approved:    'bg-emerald-100 text-emerald-600',
  settled:                 'bg-emerald-100 text-emerald-700',
}

type AuditEntry = {
  id: string
  action: string
  actor_name: string
  notes: string | null
  amount: number | null
  created_at: string
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtCLP(n: number) {
  return '$ ' + Math.round(n).toLocaleString('es-CL')
}

export function FundTimeline({ entries }: { entries: AuditEntry[] }) {
  if (!entries.length) {
    return <p className="text-sm text-ink-400 py-4">Sin actividad registrada.</p>
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-ink-100" />
      <ul className="space-y-4">
        {entries.map((e, idx) => {
          const Icon  = ACTION_ICON[e.action] ?? FilePlus
          const color = ACTION_COLOR[e.action] ?? 'bg-slate-100 text-slate-500'
          const isLast = idx === entries.length - 1

          return (
            <li key={e.id} className="flex gap-3 relative">
              <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${color}`}>
                <Icon size={14} />
              </div>
              <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-ink-800">
                    {FUND_AUDIT_LABELS[e.action] ?? e.action}
                  </span>
                  {e.amount != null && (
                    <span className="font-mono-amount text-xs text-ink-600">{fmtCLP(e.amount)}</span>
                  )}
                </div>
                <p className="text-xs text-ink-400 mt-0.5">
                  {e.actor_name} · {fmtDate(e.created_at)}
                </p>
                {e.notes && (
                  <p className="text-xs text-ink-600 mt-1 bg-ink-50 rounded-item px-2 py-1 border border-ink-100">
                    {e.notes}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
