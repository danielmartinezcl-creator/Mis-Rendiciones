import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Verificar que la request viene de Vercel Cron (o del header de desarrollo)
function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true  // Dev: sin secret configurado → permitir
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now      = new Date()
  const results: string[] = []

  // ── (a) Borradores > 7 días → notificar al empleado ─────────────────────────
  const draftCutoff = new Date(now)
  draftCutoff.setDate(draftCutoff.getDate() - 7)

  const { data: oldDrafts } = await supabase
    .from('expense_reports')
    .select('id, title, submitter_id')
    .eq('status', 'draft')
    .is('deleted_at', null)
    .is('is_historical_import', null)
    .lt('created_at', draftCutoff.toISOString())
    .limit(50)

  if (oldDrafts?.length) {
    const notifs = oldDrafts.map(r => ({
      user_id: r.submitter_id,
      type:    'reminder_draft',
      title:   'Rendición sin enviar',
      body:    `"${r.title}" lleva más de 7 días como borrador. ¿La enviás a revisión?`,
      link:    `/expenses/${r.id}`,
    }))
    await supabase.from('notifications').insert(notifs as never[])
    results.push(`Borradores > 7 días: ${oldDrafts.length} notificaciones`)
  }

  // ── (b) Fondos con saldo < 20% → notificar al empleado ──────────────────────
  type FundRow = { id: string; name: string; employee_id: string; petty_cash_items: { amount_clp: number; item_type: string }[] }

  const { data: activeFundsRaw } = await supabase
    .from('petty_cash_funds')
    .select(`id, name, employee_id, petty_cash_items (amount_clp, item_type)`)
    .in('status', ['funds_sent', 'submitted'])
    .is('deleted_at', null)
    .limit(100)

  const activeFunds = (activeFundsRaw ?? []) as unknown as FundRow[]

  if (activeFunds.length > 0) {
    const lowFundNotifs: object[] = []
    for (const fund of activeFunds) {
      const items   = fund.petty_cash_items ?? []
      const advance = items.filter(i => i.item_type === 'advance').reduce((s, i) => s + i.amount_clp, 0)
      const expense = items.filter(i => i.item_type === 'expense').reduce((s, i) => s + i.amount_clp, 0)
      const returns = items.filter(i => i.item_type === 'return').reduce((s, i) => s + i.amount_clp, 0)
      const balance = advance - expense + returns
      const pct     = advance > 0 ? (balance / advance) * 100 : 100
      if (pct < 20) {
        lowFundNotifs.push({
          user_id: fund.employee_id,
          type:    'reminder_low_balance',
          title:   'Saldo bajo en caja chica',
          body:    `El fondo "${fund.name}" tiene solo ${Math.round(pct)}% de saldo disponible.`,
          link:    `/petty-cash/${fund.id}`,
        })
      }
    }
    if (lowFundNotifs.length > 0) {
      await supabase.from('notifications').insert(lowFundNotifs as never[])
      results.push(`Fondos saldo < 20%: ${lowFundNotifs.length} notificaciones`)
    }
  }

  // ── (c) Rendiciones en submitted > 3 días → notificar al aprobador L1 ───────
  const submittedCutoff = new Date(now)
  submittedCutoff.setDate(submittedCutoff.getDate() - 3)

  const { data: staleSubmitted } = await supabase
    .from('expense_reports')
    .select('id, title, submitter_id, users!submitter_id (approver_l1_id)')
    .in('status', ['submitted', 'pending_l2'])
    .is('deleted_at', null)
    .lt('updated_at', submittedCutoff.toISOString())
    .limit(50)

  if (staleSubmitted?.length) {
    const approverNotifs: object[] = []
    for (const report of staleSubmitted) {
      const user = report.users as unknown as { approver_l1_id: string | null } | null
      const approverId = user?.approver_l1_id ?? null
      if (approverId) {
        approverNotifs.push({
          user_id: approverId,
          type:    'reminder_pending_approval',
          title:   'Rendición esperando tu aprobación',
          body:    `"${report.title}" lleva más de 3 días esperando revisión.`,
          link:    `/approvals/${report.id}`,
        })
      }
    }
    if (approverNotifs.length > 0) {
      await supabase.from('notifications').insert(approverNotifs as never[])
      results.push(`Pendientes de aprobación > 3 días: ${approverNotifs.length} notificaciones`)
    }
  }

  return NextResponse.json({
    ok:        true,
    timestamp: now.toISOString(),
    results:   results.length > 0 ? results : ['Sin recordatorios para enviar'],
  })
}
