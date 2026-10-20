import Link from 'next/link'
import { getPendingApprovals, getPendingFundApprovals } from '@/actions/approvals'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { formatDate, formatDisplayTitle } from '@/lib/utils'
import { CheckCircle2, Receipt, Wallet } from 'lucide-react'
import type { Currency } from '@/lib/constants'

/**
 * La bandeja mostraba SOLO rendiciones, aunque los fondos de caja chica pasan por
 * la misma cadena de aprobación: quien tenía uno esperando no tenía dónde verlo,
 * y había que entrar a «Caja chica» sabiendo cuál mirar.
 *
 * Las dos listas se piden en paralelo y se muestran juntas, ordenadas por
 * antigüedad: para quien aprueba son lo mismo —algo que espera su decisión— y
 * separarlas en dos pestañas obligaría a revisar dos lugares.
 *
 * Cada fila dice qué es y a dónde lleva: la rendición a `/approvals/[id]`, el
 * fondo a `/petty-cash/[id]`, que es donde están sus botones.
 */

type Fila = {
  key:       string
  href:      string
  titulo:    string
  persona:   string
  fecha:     string | null
  monto:     number
  moneda:    Currency
  /** Qué documento es: cambia el ícono, el color del borde y el rótulo. */
  clase:     'rendicion' | 'fondo' | 'liquidacion'
  nivel:     number
}

const ESTILO = {
  rendicion:   { icono: Receipt, borde: 'border-l-warning-400', chip: 'bg-warning-100 text-warning-700', rotulo: 'Rendición' },
  fondo:       { icono: Wallet,  borde: 'border-l-info-400',    chip: 'bg-info-100 text-info-700',       rotulo: 'Caja chica' },
  liquidacion: { icono: Wallet,  borde: 'border-l-flare-400',   chip: 'bg-flare-100 text-flare-700',     rotulo: 'Liquidación' },
} as const

export default async function ApprovalsPage() {
  const [reports, fondos] = await Promise.all([
    getPendingApprovals(),
    getPendingFundApprovals(),
  ])

  const filas: Fila[] = [
    ...reports.map(r => ({
      key:     `r-${r.id}`,
      href:    `/approvals/${r.id}`,
      titulo:  formatDisplayTitle(r.title),
      persona: r.submitter_name,
      fecha:   r.submitted_at,
      monto:   r.total_amount,
      moneda:  (r.currency as Currency) ?? 'CLP',
      clase:   'rendicion' as const,
      nivel:   r.approval_level,
    })),
    ...fondos.map(f => ({
      key:     `f-${f.id}`,
      href:    `/petty-cash/${f.id}`,
      titulo:  f.name,
      persona: f.employee_name,
      fecha:   f.created_at,
      monto:   f.amount,
      moneda:  'CLP' as Currency,
      clase:   f.etapa,
      nivel:   f.approval_level,
    })),
  ].sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''))

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="font-display font-extrabold text-2xl tracking-tight tor-on-gradient">Bandeja de aprobaciones</h1>
        <p className="card-label tor-on-gradient-soft mt-1">
          {filas.length > 0
            ? `${filas.length} documento${filas.length !== 1 ? 's' : ''} esperando tu decisión`
            : 'No hay documentos pendientes'}
        </p>
      </div>

      {filas.length === 0 && (
        <div className="text-center py-16 text-ink-400">
          <CheckCircle2 size={44} className="mx-auto mb-3 opacity-40" />
          <p className="card-eyebrow">Todo al día</p>
          <p className="card-label mt-1">No hay rendiciones ni fondos esperando tu aprobación.</p>
        </div>
      )}

      <div className="space-y-3">
        {filas.map(fila => {
          const estilo = ESTILO[fila.clase]
          const Icono  = estilo.icono
          return (
            <Link
              key={fila.key}
              href={fila.href}
              className={`block bg-white rounded-item shadow-[0_1px_4px_rgba(0,0,0,.08)] border border-l-4 border-ink-200 ${estilo.borde} p-3.5 hover:shadow-[0_2px_8px_rgba(0,0,0,.12)] transition-shadow`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icono size={14} className="text-ink-400 shrink-0" aria-hidden />
                    <p className="text-[16px] leading-snug font-semibold text-ink-800">{fila.titulo}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${estilo.chip}`}>
                      {estilo.rotulo}
                    </span>
                    {/* El nivel solo se nombra cuando es N2: en N1 no agrega nada */}
                    {fila.nivel === 2 && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-ink-100 text-ink-600">
                        Nivel 2
                      </span>
                    )}
                  </div>
                  <p className="card-meta text-ink-400 mt-0.5">
                    {fila.persona}
                    {fila.fecha && ` · ${formatDate(fila.fecha.split('T')[0])}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <CurrencyAmount amount={fila.monto} currency={fila.moneda} size="md" />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
