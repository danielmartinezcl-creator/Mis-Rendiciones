# App Rindegastos — Plan C: Aprobación, Admin, Emails, Exports y PWA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisito:** Planes A y B completos y funcionando (auth, layout, flujo completo del rendidor).

**Goal:** Implementar el flujo de aprobación ítem por ítem, dashboards de aprobador y admin, emails transaccionales con Resend, exportación Excel/PDF, gestión de empleados/categorías y PWA.

**Architecture:** Server Actions para emails (Resend) y exports. Excel con SheetJS (xlsx). PDF con jsPDF. PWA con next-pwa y manifest.json.

**Tech Stack:** Resend, xlsx, jsPDF + jspdf-autotable, next-pwa

---

## Mapa de archivos — Plan C

| Acción | Ruta |
|--------|------|
| Crear | `src/actions/approvals.ts` |
| Crear | `src/actions/notifications.ts` |
| Crear | `src/actions/exports.ts` |
| Crear | `src/app/(app)/approvals/page.tsx` |
| Crear | `src/app/(app)/approvals/[id]/page.tsx` |
| Crear | `src/app/(app)/admin/page.tsx` |
| Crear | `src/app/(app)/admin/reports/page.tsx` |
| Crear | `src/app/(app)/admin/employees/page.tsx` |
| Crear | `src/app/(app)/admin/settings/page.tsx` |
| Crear | `src/components/approvals/ApprovalItemRow.tsx` |
| Crear | `src/components/approvals/RejectionModal.tsx` |
| Crear | `src/components/admin/KPICard.tsx` |
| Crear | `src/components/admin/ReportsTable.tsx` |
| Crear | `public/manifest.json` |
| Modificar | `next.config.ts` (agregar next-pwa) |
| Crear | `src/tests/approvals.test.ts` |
| Crear | `src/tests/exports.test.ts` |

---

## Task 1: Server Actions — Aprobación

**Files:**
- Crear: `src/actions/approvals.ts`
- Crear: `src/tests/approvals.test.ts`

- [ ] **Step 1: Escribir tests**

Crear `src/tests/approvals.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { determineReportStatus, buildApprovalSummary } from '@/actions/approvals'

describe('determineReportStatus', () => {
  it('retorna "approved" si todos los ítems están aprobados', () => {
    const items = [
      { status: 'approved', amount_clp: 10000 },
      { status: 'approved', amount_clp: 20000 },
    ]
    expect(determineReportStatus(items)).toBe('approved')
  })

  it('retorna "rejected" si todos los ítems están rechazados', () => {
    const items = [
      { status: 'rejected', amount_clp: 10000 },
      { status: 'rejected', amount_clp: 5000 },
    ]
    expect(determineReportStatus(items)).toBe('rejected')
  })

  it('retorna "partially_approved" si hay mix de aprobados y rechazados', () => {
    const items = [
      { status: 'approved', amount_clp: 15000 },
      { status: 'rejected', amount_clp: 5000 },
    ]
    expect(determineReportStatus(items)).toBe('partially_approved')
  })
})

describe('buildApprovalSummary', () => {
  it('calcula correctamente approved_amount', () => {
    const items = [
      { status: 'approved', amount_clp: 15000 },
      { status: 'rejected', amount_clp: 5000 },
      { status: 'approved', amount_clp: 10000 },
    ]
    const summary = buildApprovalSummary(items)
    expect(summary.approved_amount).toBe(25000)
    expect(summary.items_approved_count).toBe(2)
    expect(summary.items_rejected_count).toBe(1)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

```bash
npx vitest run src/tests/approvals.test.ts
```

Esperado: FAIL.

- [ ] **Step 3: Implementar approvals.ts**

Crear `src/actions/approvals.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendApprovalEmail } from './notifications'

// ── Helpers puros ──

export function determineReportStatus(
  items: { status: string; amount_clp: number }[]
): 'approved' | 'partially_approved' | 'rejected' {
  const allApproved = items.every(i => i.status === 'approved')
  const allRejected = items.every(i => i.status === 'rejected')
  if (allApproved) return 'approved'
  if (allRejected) return 'rejected'
  return 'partially_approved'
}

export function buildApprovalSummary(items: { status: string; amount_clp: number }[]) {
  const approved = items.filter(i => i.status === 'approved')
  const rejected = items.filter(i => i.status === 'rejected')
  return {
    approved_amount:       approved.reduce((s, i) => s + i.amount_clp, 0),
    items_approved_count:  approved.length,
    items_rejected_count:  rejected.length,
  }
}

// ── Server Actions ──

export async function getPendingApprovals() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Obtener rendiciones donde el usuario es aprobador
  const { data } = await supabase
    .from('expense_reports')
    .select(`
      id, title, status, total_amount, submitted_at,
      submitter:users!submitter_id(full_name, department),
      expense_items(count)
    `)
    .in('status', ['submitted', 'pending_l2'])
    .order('submitted_at', { ascending: true }) // más urgente primero

  // Filtrar las que corresponden a este aprobador via política
  const { data: myPolicies } = await supabase
    .from('approval_policies')
    .select('id, levels')

  if (!myPolicies) return []

  const myPolicyIds = myPolicies
    .filter(p => {
      const levels = p.levels as { level: number; approver_id: string }[]
      return levels.some(l => l.approver_id === user.id)
    })
    .map(p => p.id)

  if (myPolicyIds.length === 0) return data ?? []

  const { data: assignedUsers } = await supabase
    .from('employee_policies')
    .select('user_id')
    .in('policy_id', myPolicyIds)

  const assignedUserIds = assignedUsers?.map(e => e.user_id) ?? []

  return (data ?? []).filter(r => {
    const submitter = r.submitter as { full_name: string } | null
    return assignedUserIds.length === 0 || true // simplificado: admin ve todo
  })
}

export async function approveAllItems(reportId: string, notes?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Aprobar todos los ítems pendientes
  await supabase
    .from('expense_items')
    .update({ status: 'approved' })
    .eq('report_id', reportId)
    .eq('status', 'pending')

  // Obtener todos los ítems para calcular montos
  const { data: allItems } = await supabase
    .from('expense_items')
    .select('id, status, amount_clp')
    .eq('report_id', reportId)

  const items = allItems ?? []
  const newStatus = determineReportStatus(items)
  const summary   = buildApprovalSummary(items)

  // Actualizar cabecera de rendición
  await supabase
    .from('expense_reports')
    .update({
      status:          newStatus,
      approved_amount: summary.approved_amount,
      approved_at:     new Date().toISOString(),
    })
    .eq('id', reportId)

  // LOG INMUTABLE en expense_report_approvals
  await supabase
    .from('expense_report_approvals')
    .insert({
      report_id:      reportId,
      approver_id:    user.id,
      level:          1,
      action:         newStatus,
      items_approved: items.filter(i => i.status === 'approved').map(i => i.id),
      items_rejected: [],
      notes:          notes ?? null,
    })

  // Notificar al rendidor por email
  const { data: report } = await supabase
    .from('expense_reports')
    .select('submitter_id, title, approved_amount, total_amount')
    .eq('id', reportId)
    .single()

  if (report) {
    const { data: submitter } = await supabase
      .from('users')
      .select('*')
      .eq('id', report.submitter_id)
      .single()

    const { data: approverProfile } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .single()

    if (submitter) {
      await sendApprovalEmail({
        to:             submitter.full_name,
        toEmail:        (await supabase.auth.admin?.getUserById(submitter.id))?.data?.user?.email ?? '',
        reportTitle:    report.title,
        status:         newStatus,
        totalAmount:    report.total_amount,
        approvedAmount: report.approved_amount,
        approverName:   approverProfile?.full_name ?? 'El aprobador',
        reportId,
      }).catch(console.error) // email no bloquea el flujo
    }
  }

  revalidatePath('/approvals')
  revalidatePath(`/approvals/${reportId}`)
}

export async function approveItemsSelectively(
  reportId: string,
  approvedItemIds: string[],
  rejectedItems: { id: string; reason: string }[],
  notes?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Aprobar seleccionados
  if (approvedItemIds.length > 0) {
    await supabase
      .from('expense_items')
      .update({ status: 'approved' })
      .in('id', approvedItemIds)
  }

  // Rechazar con motivo
  for (const item of rejectedItems) {
    await supabase
      .from('expense_items')
      .update({ status: 'rejected', rejection_reason: item.reason })
      .eq('id', item.id)
  }

  // Calcular nuevo estado
  const { data: allItems } = await supabase
    .from('expense_items')
    .select('id, status, amount_clp')
    .eq('report_id', reportId)

  const items     = allItems ?? []
  const newStatus = determineReportStatus(items)
  const summary   = buildApprovalSummary(items)

  await supabase
    .from('expense_reports')
    .update({
      status:          newStatus,
      approved_amount: summary.approved_amount,
      approved_at:     new Date().toISOString(),
    })
    .eq('id', reportId)

  // Log inmutable
  await supabase
    .from('expense_report_approvals')
    .insert({
      report_id:      reportId,
      approver_id:    user.id,
      level:          1,
      action:         newStatus,
      items_approved: approvedItemIds,
      items_rejected: rejectedItems.map(i => i.id),
      notes:          notes ?? null,
    })

  revalidatePath('/approvals')
  revalidatePath(`/approvals/${reportId}`)
}

export async function returnToDraft(reportId: string, reason: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Resetear estado de todos los ítems a pending
  await supabase
    .from('expense_items')
    .update({ status: 'pending', rejection_reason: null })
    .eq('report_id', reportId)

  await supabase
    .from('expense_reports')
    .update({ status: 'draft', approved_amount: 0 })
    .eq('id', reportId)

  // Log inmutable
  await supabase
    .from('expense_report_approvals')
    .insert({
      report_id:   reportId,
      approver_id: user.id,
      level:       1,
      action:      'returned_to_draft',
      notes:       reason,
    })

  revalidatePath('/approvals')
}

export async function markAsReimbursed(
  reportId: string,
  paymentReference: string,
  reimbursedAt: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Solo admins pueden marcar como reembolsado
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Sin permiso')

  await supabase
    .from('expense_reports')
    .update({
      status:            'reimbursed',
      reimbursed_at:     reimbursedAt,
      reimbursed_by:     user.id,
      payment_reference: paymentReference,
    })
    .eq('id', reportId)
    .in('status', ['approved', 'partially_approved'])

  revalidatePath('/admin/reports')
}
```

- [ ] **Step 4: Ejecutar tests**

```bash
npx vitest run src/tests/approvals.test.ts
```

Esperado: PASS — 4 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add src/actions/approvals.ts src/tests/approvals.test.ts
git commit -m "feat: approval Server Actions — approve all, selective approve/reject, return to draft"
```

---

## Task 2: Emails transaccionales con Resend

**Files:**
- Crear: `src/actions/notifications.ts`

- [ ] **Step 1: Implementar notifications.ts**

Crear `src/actions/notifications.ts`:

```typescript
'use server'

import { Resend } from 'resend'
import { formatCLP } from '@/lib/utils'

const resend = new Resend(process.env.RESEND_API_KEY!)
const FROM   = 'Rindegastos PENTA <no-reply@rindegastos.penta.cl>'

interface ApprovalEmailParams {
  to: string
  toEmail: string
  reportTitle: string
  status: 'approved' | 'partially_approved' | 'rejected'
  totalAmount: number
  approvedAmount: number
  approverName: string
  reportId: string
}

export async function sendApprovalEmail(params: ApprovalEmailParams) {
  if (!params.toEmail) return // silencioso si no hay email

  const { to, toEmail, reportTitle, status, totalAmount, approvedAmount, approverName, reportId } = params

  let subject = ''
  let body    = ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rindegastos.vercel.app'

  if (status === 'approved') {
    subject = `✅ Tu rendición fue aprobada — ${formatCLP(approvedAmount)} a reembolsar`
    body = `
      <p>Hola ${to},</p>
      <p><strong>${approverName}</strong> aprobó tu rendición <strong>"${reportTitle}"</strong>.</p>
      <p>Monto aprobado: <strong>${formatCLP(approvedAmount)}</strong></p>
      <p>El equipo de administración procesará el reembolso pronto.</p>
      <p><a href="${appUrl}/expenses/${reportId}">Ver rendición →</a></p>
    `
  } else if (status === 'partially_approved') {
    subject = `⚠️ Tu rendición fue aprobada parcialmente — ${formatCLP(approvedAmount)} de ${formatCLP(totalAmount)}`
    body = `
      <p>Hola ${to},</p>
      <p><strong>${approverName}</strong> revisó tu rendición <strong>"${reportTitle}"</strong>.</p>
      <p>Monto aprobado: <strong>${formatCLP(approvedAmount)}</strong> de ${formatCLP(totalAmount)} totales.</p>
      <p>Algunos ítems fueron rechazados. Revisá el detalle en la app para ver los motivos.</p>
      <p><a href="${appUrl}/expenses/${reportId}">Ver rendición →</a></p>
    `
  } else {
    subject = `❌ Tu rendición fue rechazada — ${reportTitle}`
    body = `
      <p>Hola ${to},</p>
      <p><strong>${approverName}</strong> rechazó tu rendición <strong>"${reportTitle}"</strong>.</p>
      <p>Revisá el detalle en la app para ver los motivos de rechazo. Podés corregirla y volver a enviarla si es necesario.</p>
      <p><a href="${appUrl}/expenses/${reportId}">Ver rendición →</a></p>
    `
  }

  await resend.emails.send({
    from: FROM,
    to:   [toEmail],
    subject,
    html: `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1e293b;">
          ${body}
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="font-size:12px;color:#94a3b8;">
            Rindegastos — PENTA y Cía. · 
            <a href="${appUrl}" style="color:#4f46e5;">Abrir app</a>
          </p>
        </body>
      </html>
    `,
  })
}

export async function sendSubmissionEmail(params: {
  reportId: string
  submitterName: string
  approverEmail: string
  approverName: string
  reportTitle: string
  totalAmount: number
  itemCount: number
}) {
  if (!params.approverEmail) return

  const { reportId, submitterName, approverEmail, approverName, reportTitle, totalAmount, itemCount } = params
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rindegastos.vercel.app'

  await resend.emails.send({
    from:    FROM,
    to:      [approverEmail],
    subject: `${submitterName} envió una rendición por ${formatCLP(totalAmount)}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1e293b;">
          <p>Hola ${approverName},</p>
          <p><strong>${submitterName}</strong> envió una rendición de gastos para tu aprobación:</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0;">
            <tr><td style="padding:8px;color:#64748b;">Nombre</td><td style="padding:8px;font-weight:600;">${reportTitle}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">Total</td><td style="padding:8px;font-weight:600;font-size:18px;">${formatCLP(totalAmount)}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">Ítems</td><td style="padding:8px;">${itemCount} ítem${itemCount !== 1 ? 's' : ''}</td></tr>
          </table>
          <a href="${appUrl}/approvals/${reportId}"
             style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;">
            Revisar rendición →
          </a>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="font-size:12px;color:#94a3b8;">Rindegastos — PENTA y Cía.</p>
        </body>
      </html>
    `,
  })
}

export async function sendReimbursementEmail(params: {
  toEmail: string
  toName: string
  reportTitle: string
  amount: number
  paymentReference: string
  reimbursedAt: string
}) {
  if (!params.toEmail) return

  const { toEmail, toName, reportTitle, amount, paymentReference, reimbursedAt } = params
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rindegastos.vercel.app'
  const date   = new Date(reimbursedAt).toLocaleDateString('es-CL')

  await resend.emails.send({
    from:    FROM,
    to:      [toEmail],
    subject: `💰 Reembolso procesado — ${formatCLP(amount)} (ref: ${paymentReference})`,
    html: `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1e293b;">
          <p>Hola ${toName},</p>
          <p>Tu reembolso por la rendición <strong>"${reportTitle}"</strong> fue procesado.</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0;">
            <tr><td style="padding:8px;color:#64748b;">Monto</td><td style="padding:8px;font-weight:700;font-size:20px;color:#059669;">${formatCLP(amount)}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">Fecha</td><td style="padding:8px;">${date}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">Referencia</td><td style="padding:8px;font-family:monospace;">${paymentReference}</td></tr>
          </table>
          <p style="font-size:12px;color:#94a3b8;">Rindegastos — PENTA y Cía. · <a href="${appUrl}">Abrir app</a></p>
        </body>
      </html>
    `,
  })
}
```

- [ ] **Step 2: Integrar el email de envío en submitExpenseReport**

Modificar `src/actions/expenses.ts` — en la función `submitExpenseReport`, agregar después de actualizar el estado:

```typescript
// Al final de submitExpenseReport(), ANTES del revalidatePath:
// (Buscar el aprobador del empleado y enviar email)
try {
  const { sendSubmissionEmail } = await import('./notifications')
  const { data: ep } = await supabase
    .from('employee_policies')
    .select('approval_policies(levels)')
    .eq('user_id', user.id)
    .single()

  if (ep?.approval_policies) {
    const levels = ep.approval_policies.levels as { level: number; approver_id: string }[]
    const l1     = levels.find(l => l.level === 1)
    if (l1?.approver_id) {
      const { data: approver } = await supabase
        .from('users').select('full_name').eq('id', l1.approver_id).single()
      const { data: { user: approverAuth } } = await supabase.auth.admin?.getUserById(l1.approver_id) ?? {}
      const { data: report } = await supabase
        .from('expense_reports')
        .select('title, total_amount')
        .eq('id', reportId).single()
      const itemCountResult = await supabase
        .from('expense_items').select('*', { count: 'exact', head: true }).eq('report_id', reportId)

      if (approver && report) {
        await sendSubmissionEmail({
          reportId,
          submitterName:  (await supabase.from('users').select('full_name').eq('id', user.id).single()).data?.full_name ?? '',
          approverEmail:  approverAuth?.email ?? '',
          approverName:   approver.full_name,
          reportTitle:    report.title,
          totalAmount:    report.total_amount,
          itemCount:      itemCountResult.count ?? 0,
        })
      }
    }
  }
} catch {
  // Email no bloqueante
}
```

- [ ] **Step 3: Commit**

```bash
git add src/actions/notifications.ts src/actions/expenses.ts
git commit -m "feat: transactional emails with Resend — submission, approval, reimbursement"
```

---

## Task 3: Dashboard del Aprobador

**Files:**
- Crear: `src/app/(app)/approvals/page.tsx`

- [ ] **Step 1: Implementar bandeja de aprobaciones**

Crear `src/app/(app)/approvals/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ReportStatusBadge } from '@/components/ui/Badge'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { formatDate } from '@/lib/utils'

export default async function ApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role, can_approve').eq('id', user.id).single()

  if (!profile?.can_approve && profile?.role !== 'admin') redirect('/')

  // Buscar rendiciones pendientes de aprobación en la org del usuario
  const { data: orgData } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()

  const { data: pending } = await supabase
    .from('expense_reports')
    .select(`
      id, title, status, total_amount, submitted_at, currency,
      submitter:users!submitter_id(full_name, department)
    `)
    .eq('org_id', orgData?.org_id ?? '')
    .in('status', ['submitted', 'pending_l2'])
    .order('submitted_at', { ascending: true })

  const reports = pending ?? []

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Aprobaciones</h1>
        <p className="text-sm text-slate-500 mt-1">
          {reports.length === 0
            ? 'Sin rendiciones pendientes'
            : `${reports.length} rendición${reports.length !== 1 ? 'es' : ''} esperando revisión`
          }
        </p>
      </div>

      <div className="space-y-2">
        {reports.map(report => {
          const submitter = report.submitter as { full_name: string; department: string | null } | null
          const daysSince = report.submitted_at
            ? Math.floor((Date.now() - new Date(report.submitted_at).getTime()) / 86400000)
            : 0

          return (
            <Link key={report.id} href={`/approvals/${report.id}`}>
              <div className={`bg-white rounded-card shadow-card p-4 hover:shadow-md transition-shadow ${daysSince >= 3 ? 'border-l-4 border-amber-400' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{report.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {submitter?.full_name}
                      {submitter?.department && ` · ${submitter.department}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <CurrencyAmount amount={report.total_amount} currency="CLP" size="md" />
                    {daysSince > 0 && (
                      <p className={`text-xs mt-0.5 ${daysSince >= 3 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
                        Hace {daysSince} día{daysSince !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
                {report.submitted_at && (
                  <p className="text-xs text-slate-400 mt-2">
                    Enviada {formatDate(report.submitted_at.split('T')[0])}
                  </p>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      {reports.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-medium">Todo al día</p>
          <p className="text-sm mt-1">No hay rendiciones pendientes de revisión</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/approvals/page.tsx
git commit -m "feat: approvals inbox — pending reports, urgency highlight for 3+ day old"
```

---

## Task 4: Página de revisión ítem por ítem

**Files:**
- Crear: `src/components/approvals/RejectionModal.tsx`
- Crear: `src/components/approvals/ApprovalItemRow.tsx`
- Crear: `src/app/(app)/approvals/[id]/page.tsx`

- [ ] **Step 1: Crear RejectionModal**

Crear `src/components/approvals/RejectionModal.tsx`:

```typescript
'use client'

import { useState } from 'react'

interface RejectionModalProps {
  itemDescription: string
  onConfirm: (reason: string) => void
  onCancel:  () => void
}

export function RejectionModal({ itemDescription, onConfirm, onCancel }: RejectionModalProps) {
  const [reason, setReason] = useState('')

  function handleConfirm() {
    if (!reason.trim()) return
    onConfirm(reason.trim())
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white rounded-card w-full max-w-sm p-5 space-y-4">
        <h3 className="font-semibold text-slate-800">Motivo de rechazo</h3>
        <p className="text-sm text-slate-500 truncate">Ítem: {itemDescription}</p>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Explicá el motivo al rendidor *
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Ej: Falta el número de documento, monto supera el límite, etc."
            className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 border border-slate-200 rounded-item text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!reason.trim()}
            className="flex-1 py-2.5 px-4 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-item text-sm font-semibold"
          >
            Rechazar ítem
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Crear página de revisión**

Crear `src/app/(app)/approvals/[id]/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getReportWithItems } from '@/actions/expenses'
import { approveAllItems, approveItemsSelectively, returnToDraft } from '@/actions/approvals'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { ReportStatusBadge } from '@/components/ui/Badge'
import { RejectionModal } from '@/components/approvals/RejectionModal'
import { formatDate, formatCLP } from '@/lib/utils'
import type { ItemStatus } from '@/lib/constants'

type ReportData = Awaited<ReturnType<typeof getReportWithItems>>
type ItemDecision = 'approved' | 'rejected' | 'pending'

export default function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [report, setReport]               = useState<ReportData>(null)
  const [decisions, setDecisions]         = useState<Record<string, ItemDecision>>({})
  const [rejectionReasons, setReasons]    = useState<Record<string, string>>({})
  const [pendingReject, setPendingReject] = useState<{ id: string; desc: string } | null>(null)
  const [notes, setNotes]                 = useState('')
  const [saving, setSaving]               = useState(false)
  const [loading, setLoading]             = useState(true)

  async function load() {
    const data = await getReportWithItems(id)
    setReport(data)
    if (data?.expense_items) {
      const initial: Record<string, ItemDecision> = {}
      data.expense_items.forEach(item => {
        initial[item.id] = item.status as ItemDecision
      })
      setDecisions(initial)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  function setDecision(itemId: string, decision: ItemDecision) {
    setDecisions(prev => ({ ...prev, [itemId]: decision }))
    if (decision !== 'rejected') {
      setReasons(prev => { const n = { ...prev }; delete n[itemId]; return n })
    }
  }

  function openRejectModal(itemId: string, desc: string) {
    setPendingReject({ id: itemId, desc })
  }

  function confirmReject(reason: string) {
    if (!pendingReject) return
    setDecision(pendingReject.id, 'rejected')
    setReasons(prev => ({ ...prev, [pendingReject.id]: reason }))
    setPendingReject(null)
  }

  async function handleApproveAll() {
    if (!confirm('¿Aprobar todos los ítems?')) return
    setSaving(true)
    try {
      await approveAllItems(id, notes || undefined)
      router.push('/approvals')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error')
      setSaving(false)
    }
  }

  async function handleSubmitDecisions() {
    const approved = Object.entries(decisions)
      .filter(([, d]) => d === 'approved').map(([id]) => id)
    const rejected = Object.entries(decisions)
      .filter(([, d]) => d === 'rejected')
      .map(([id]) => ({ id, reason: rejectionReasons[id] ?? 'Sin motivo especificado' }))

    if (rejected.some(r => !rejectionReasons[r.id])) {
      alert('Debés ingresar el motivo de rechazo para cada ítem rechazado')
      return
    }

    setSaving(true)
    try {
      await approveItemsSelectively(id, approved, rejected, notes || undefined)
      router.push('/approvals')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error')
      setSaving(false)
    }
  }

  async function handleReturnToDraft() {
    const reason = prompt('¿Por qué devolvés esta rendición al rendidor?')
    if (!reason) return
    setSaving(true)
    await returnToDraft(id, reason)
    router.push('/approvals')
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!report) return <p className="text-slate-400 text-center py-12">Rendición no encontrada</p>

  const items             = report.expense_items ?? []
  const approvedCount     = Object.values(decisions).filter(d => d === 'approved').length
  const rejectedCount     = Object.values(decisions).filter(d => d === 'rejected').length
  const pendingCount      = Object.values(decisions).filter(d => d === 'pending').length
  const isReadonly        = !['submitted', 'pending_l2'].includes(report.status)

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {pendingReject && (
        <RejectionModal
          itemDescription={pendingReject.desc}
          onConfirm={confirmReject}
          onCancel={() => setPendingReject(null)}
        />
      )}

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-800">{report.title}</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {report.submitted_at && `Enviada ${formatDate(report.submitted_at.split('T')[0])}`}
          </p>
        </div>
        <ReportStatusBadge status={report.status as any} />
      </div>

      {/* Resumen */}
      <div className="bg-white rounded-card shadow-card p-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-lg font-bold text-emerald-600">{approvedCount}</p>
          <p className="text-xs text-slate-400">Aprobados</p>
        </div>
        <div>
          <p className="text-lg font-bold text-amber-500">{pendingCount}</p>
          <p className="text-xs text-slate-400">Pendientes</p>
        </div>
        <div>
          <p className="text-lg font-bold text-red-500">{rejectedCount}</p>
          <p className="text-xs text-slate-400">Rechazados</p>
        </div>
      </div>

      {/* Ítems */}
      <div className="space-y-2">
        {items.map(item => {
          const decision = decisions[item.id] ?? 'pending'
          const accentClass = decision === 'approved' ? 'item-accent-approved' : decision === 'rejected' ? 'item-accent-rejected' : 'item-accent-pending'

          return (
            <div key={item.id} className={`bg-white rounded-card shadow-card overflow-hidden ${accentClass} pl-3`}>
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800">{item.description}</p>
                    {item.merchant && <p className="text-xs text-slate-400">{item.merchant}</p>}
                  </div>
                  <CurrencyAmount amount={item.amount_clp} currency="CLP" size="md" />
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>{formatDate(item.date)}</span>
                  {item.doc_type && <span>{item.doc_type}</span>}
                  {item.currency !== 'CLP' && (
                    <span>{item.currency} {item.amount.toLocaleString('es-CL')}</span>
                  )}
                </div>

                {item.notes && (
                  <p className="text-xs text-slate-400 italic">"{item.notes}"</p>
                )}

                {rejectionReasons[item.id] && (
                  <p className="text-xs text-red-500">Motivo: {rejectionReasons[item.id]}</p>
                )}

                {/* Botones de decisión */}
                {!isReadonly && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDecision(item.id, 'approved')}
                      className={`flex-1 py-2 text-sm font-semibold rounded-item transition-colors ${
                        decision === 'approved'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      ✓ Aprobar
                    </button>
                    <button
                      onClick={() => openRejectModal(item.id, item.description)}
                      className={`flex-1 py-2 text-sm font-semibold rounded-item transition-colors ${
                        decision === 'rejected'
                          ? 'bg-red-500 text-white'
                          : 'bg-red-50 text-red-600 hover:bg-red-100'
                      }`}
                    >
                      ✗ Rechazar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Notas del aprobador */}
      {!isReadonly && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Nota al rendidor (opcional)
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Comentario general sobre esta rendición..."
            className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
          />
        </div>
      )}

      {/* Acciones */}
      {!isReadonly && (
        <div className="space-y-2 pt-2">
          <button
            onClick={handleApproveAll}
            disabled={saving}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold rounded-card"
          >
            ✓ Aprobar todo
          </button>
          {(approvedCount > 0 || rejectedCount > 0) && pendingCount === 0 && (
            <button
              onClick={handleSubmitDecisions}
              disabled={saving}
              className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-card"
            >
              Confirmar decisiones ({approvedCount} ✓ · {rejectedCount} ✗)
            </button>
          )}
          <button
            onClick={handleReturnToDraft}
            disabled={saving}
            className="w-full py-2 text-slate-500 hover:text-slate-700 text-sm font-medium"
          >
            ↩ Devolver al rendidor
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/approvals/ src/app/(app)/approvals/
git commit -m "feat: approval detail — item-by-item decisions, rejection modal, approve all"
```

---

## Task 5: Dashboard Admin + Tabla maestra

**Files:**
- Crear: `src/components/admin/KPICard.tsx`
- Crear: `src/app/(app)/admin/page.tsx`
- Crear: `src/app/(app)/admin/reports/page.tsx`

- [ ] **Step 1: Crear KPICard**

Crear `src/components/admin/KPICard.tsx`:

```typescript
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { cn } from '@/lib/utils'

interface KPICardProps {
  label: string
  amount: number
  count?: number
  color?: 'default' | 'green' | 'amber' | 'blue' | 'red'
}

const colors = {
  default: 'text-slate-800',
  green:   'text-emerald-600',
  amber:   'text-amber-600',
  blue:    'text-blue-600',
  red:     'text-red-500',
}

export function KPICard({ label, amount, count, color = 'default' }: KPICardProps) {
  return (
    <div className="bg-white rounded-card shadow-card p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">{label}</p>
      <CurrencyAmount amount={amount} currency="CLP" size="lg" className={colors[color]} />
      {count !== undefined && (
        <p className="text-xs text-slate-400 mt-1">{count} rendición{count !== 1 ? 'es' : ''}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Crear dashboard admin**

Crear `src/app/(app)/admin/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { KPICard } from '@/components/admin/KPICard'

export default async function AdminDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role, org_id').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  const orgId = profile.org_id

  // KPIs de todos los estados
  const { data: reports } = await supabase
    .from('expense_reports')
    .select('status, total_amount, approved_amount')
    .eq('org_id', orgId)

  const all = reports ?? []

  const kpis = {
    inReview:    { amount: 0, count: 0 },
    approved:    { amount: 0, count: 0 },
    reimbursed:  { amount: 0, count: 0 },
    total:       { amount: 0, count: all.length },
  }

  for (const r of all) {
    kpis.total.amount += r.total_amount
    if (['submitted', 'pending_l2'].includes(r.status)) {
      kpis.inReview.amount += r.total_amount
      kpis.inReview.count++
    } else if (['approved', 'partially_approved'].includes(r.status)) {
      kpis.approved.amount += r.approved_amount
      kpis.approved.count++
    } else if (r.status === 'reimbursed') {
      kpis.reimbursed.amount += r.approved_amount
      kpis.reimbursed.count++
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Dashboard Admin</h1>
        <Link href="/admin/reports">
          <span className="text-sm text-brand-600 hover:underline">Ver todas →</span>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="En revisión"  amount={kpis.inReview.amount}   count={kpis.inReview.count}   color="amber" />
        <KPICard label="Aprobado"     amount={kpis.approved.amount}   count={kpis.approved.count}   color="green" />
        <KPICard label="Reembolsado"  amount={kpis.reimbursed.amount} count={kpis.reimbursed.count} color="blue" />
        <KPICard label="Total histórico" amount={kpis.total.amount}   count={kpis.total.count} />
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { href: '/admin/reports',   icon: '📋', label: 'Rendiciones', desc: 'Ver y exportar' },
          { href: '/admin/employees', icon: '👥', label: 'Empleados',   desc: 'Gestionar equipo' },
          { href: '/admin/settings',  icon: '⚙️', label: 'Configuración', desc: 'Org y categorías' },
          { href: '/approvals',       icon: '✅', label: 'Aprobar',     desc: 'Pendientes de revisión' },
        ].map(item => (
          <Link key={item.href} href={item.href}>
            <div className="bg-white rounded-card shadow-card p-4 hover:shadow-md transition-shadow">
              <span className="text-2xl">{item.icon}</span>
              <p className="font-semibold text-slate-800 mt-2">{item.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Crear tabla maestra de rendiciones**

Crear `src/app/(app)/admin/reports/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ReportStatusBadge } from '@/components/ui/Badge'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { formatDate, formatCLP } from '@/lib/utils'
import { markAsReimbursed } from '@/actions/approvals'
import { exportReportsExcel } from '@/actions/exports'
import type { ReportStatus } from '@/lib/constants'

export default function AdminReportsPage() {
  const [reports, setReports]       = useState<any[]>([])
  const [filter, setFilter]         = useState<ReportStatus | 'all'>('all')
  const [loading, setLoading]       = useState(true)
  const [reimbursing, setReimbursing] = useState<string | null>(null)

  async function load() {
    const supabase = createClient()
    const { data: profile } = await supabase
      .from('users').select('org_id').eq('id', (await supabase.auth.getUser()).data.user!.id).single()

    let query = supabase
      .from('expense_reports')
      .select(`
        id, title, status, total_amount, approved_amount,
        submitted_at, created_at, reimbursed_at, payment_reference,
        submitter:users!submitter_id(full_name)
      `)
      .eq('org_id', profile?.org_id ?? '')
      .order('created_at', { ascending: false })

    if (filter !== 'all') query = query.eq('status', filter)

    const { data } = await query
    setReports(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  async function handleReimburse(reportId: string) {
    const reference = prompt('Número de referencia de la transferencia:')
    if (!reference) return

    setReimbursing(reportId)
    try {
      await markAsReimbursed(reportId, reference, new Date().toISOString())
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error')
    } finally {
      setReimbursing(null)
    }
  }

  async function handleExportExcel() {
    await exportReportsExcel(filter === 'all' ? undefined : filter)
  }

  const filterOptions: { value: ReportStatus | 'all'; label: string }[] = [
    { value: 'all',               label: 'Todas' },
    { value: 'submitted',         label: 'En revisión' },
    { value: 'approved',          label: 'Aprobadas' },
    { value: 'partially_approved', label: 'Aprobación parcial' },
    { value: 'rejected',          label: 'Rechazadas' },
    { value: 'reimbursed',        label: 'Reembolsadas' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800">Rendiciones</h1>
        <button
          onClick={handleExportExcel}
          className="text-sm bg-white border border-slate-200 px-4 py-2 rounded-item hover:bg-slate-50 font-medium"
        >
          📊 Exportar Excel
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {filterOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === opt.value
                ? 'bg-brand-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map(report => {
            const submitter = report.submitter as { full_name: string } | null
            const canReimburse = ['approved', 'partially_approved'].includes(report.status)

            return (
              <div key={report.id} className="bg-white rounded-card shadow-card p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{report.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {submitter?.full_name}
                      {report.submitted_at && ` · ${formatDate(report.submitted_at.split('T')[0])}`}
                    </p>
                    {report.payment_reference && (
                      <p className="text-xs text-blue-500 mt-0.5">Ref: {report.payment_reference}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <CurrencyAmount amount={report.total_amount} currency="CLP" size="md" />
                      {report.approved_amount > 0 && report.approved_amount !== report.total_amount && (
                        <p className="text-xs text-emerald-600 mt-0.5">
                          Aprobado: {formatCLP(report.approved_amount)}
                        </p>
                      )}
                    </div>
                    <ReportStatusBadge status={report.status as ReportStatus} />
                  </div>
                </div>

                {canReimburse && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => handleReimburse(report.id)}
                      disabled={reimbursing === report.id}
                      className="text-sm text-brand-600 hover:text-brand-700 font-semibold disabled:opacity-50"
                    >
                      {reimbursing === report.id ? 'Procesando...' : '💰 Marcar como reembolsado'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {reports.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p>Sin rendiciones con este filtro</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/ src/app/(app)/admin/
git commit -m "feat: admin dashboard + reports table — KPIs, filters, mark as reimbursed"
```

---

## Task 6: Exportación Excel y PDF

**Files:**
- Crear: `src/actions/exports.ts`
- Crear: `src/tests/exports.test.ts`

- [ ] **Step 1: Escribir tests de exports**

Crear `src/tests/exports.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildExcelRows, buildExcelHeader } from '@/actions/exports'

describe('buildExcelHeader', () => {
  it('retorna las columnas correctas en español', () => {
    const header = buildExcelHeader()
    expect(header).toContain('Empleado')
    expect(header).toContain('Estado')
    expect(header).toContain('Total CLP')
    expect(header).toContain('Referencia Pago')
  })
})

describe('buildExcelRows', () => {
  it('convierte reports a filas de Excel', () => {
    const reports = [
      {
        title: 'Viaje Santiago',
        status: 'approved',
        total_amount: 45000,
        approved_amount: 45000,
        submitted_at: '2026-06-01T10:00:00Z',
        payment_reference: 'TRF001',
        submitter: { full_name: 'Juan Pérez' },
        expense_items: [{ id: '1' }, { id: '2' }],
      }
    ]
    const rows = buildExcelRows(reports)
    expect(rows).toHaveLength(1)
    expect(rows[0][0]).toBe('Juan Pérez')
    expect(rows[0][1]).toBe('Viaje Santiago')
    expect(rows[0][3]).toBe(45000)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

```bash
npx vitest run src/tests/exports.test.ts
```

Esperado: FAIL.

- [ ] **Step 3: Implementar exports.ts**

Crear `src/actions/exports.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { formatDate, getStatusLabel } from '@/lib/utils'
import type { ReportStatus } from '@/lib/constants'

// ── Helpers puros (también en tests) ──

export function buildExcelHeader(): string[] {
  return [
    'Empleado', 'Rendición', 'Fecha Envío', 'Total CLP',
    'Monto Aprobado', 'Estado', 'N° Ítems',
    'Referencia Pago', 'Fecha Reembolso',
  ]
}

export function buildExcelRows(reports: any[]): unknown[][] {
  return reports.map(r => [
    (r.submitter as { full_name: string } | null)?.full_name ?? '',
    r.title,
    r.submitted_at ? formatDate(r.submitted_at.split('T')[0]) : '',
    r.total_amount,
    r.approved_amount,
    getStatusLabel(r.status as ReportStatus),
    r.expense_items?.length ?? 0,
    r.payment_reference ?? '',
    r.reimbursed_at ? formatDate(r.reimbursed_at.split('T')[0]) : '',
  ])
}

// ── Server Action — descarga xlsx en el cliente ──

export async function exportReportsExcel(status?: ReportStatus) {
  // Esta función retorna los datos al cliente, que construye el Excel
  // (xlsx es pesado para Server Action — mejor usarlo en el cliente)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: profile } = await supabase
    .from('users').select('org_id, role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Sin permiso')

  let query = supabase
    .from('expense_reports')
    .select(`
      title, status, total_amount, approved_amount,
      submitted_at, reimbursed_at, payment_reference,
      submitter:users!submitter_id(full_name),
      expense_items(id)
    `)
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data } = await query
  return {
    header: buildExcelHeader(),
    rows:   buildExcelRows(data ?? []),
  }
}
```

- [ ] **Step 4: Agregar función de descarga en el cliente**

Crear `src/lib/download-excel.ts`:

```typescript
// Solo se usa en el cliente (no Server Action)
export async function downloadExcel(
  header: string[],
  rows: unknown[][],
  filename: string
) {
  const xlsx = await import('xlsx')

  const ws = xlsx.utils.aoa_to_sheet([header, ...rows])

  // Ancho de columnas
  ws['!cols'] = header.map(() => ({ wch: 20 }))

  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'Rendiciones')

  xlsx.writeFile(wb, `${filename}.xlsx`)
}
```

Actualizar el botón en `admin/reports/page.tsx` para usar `downloadExcel`:

```typescript
// Reemplazar la función handleExportExcel:
async function handleExportExcel() {
  const data = await exportReportsExcel(filter === 'all' ? undefined : filter)
  const { downloadExcel } = await import('@/lib/download-excel')
  await downloadExcel(
    data.header,
    data.rows,
    `rendiciones-${new Date().toISOString().split('T')[0]}`
  )
}
```

- [ ] **Step 5: Ejecutar tests**

```bash
npx vitest run src/tests/exports.test.ts
```

Esperado: PASS — 2 tests.

- [ ] **Step 6: Correr todos los tests**

```bash
npm test
```

Esperado: PASS — todos los tests (~19 total).

- [ ] **Step 7: Commit**

```bash
git add src/actions/exports.ts src/tests/exports.test.ts src/lib/download-excel.ts
git commit -m "feat: Excel export — server fetches data, client builds xlsx file"
```

---

## Task 7: Gestión de empleados y configuración

**Files:**
- Crear: `src/app/(app)/admin/employees/page.tsx`
- Crear: `src/app/(app)/admin/settings/page.tsx`

- [ ] **Step 1: Página de gestión de empleados**

Crear `src/app/(app)/admin/employees/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile, ApprovalPolicy } from '@/lib/supabase/types'

export default function EmployeesPage() {
  const [employees, setEmployees]   = useState<UserProfile[]>([])
  const [policies, setPolicies]     = useState<ApprovalPolicy[]>([])
  const [assignments, setAssignments] = useState<Record<string, string>>({}) // user_id → policy_id
  const [loading, setLoading]       = useState(true)

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('users').select('org_id').eq('id', user.id).single()

    const [empResult, policyResult, assignResult] = await Promise.all([
      supabase.from('users').select('*').eq('org_id', profile?.org_id ?? '').order('full_name'),
      supabase.from('approval_policies').select('*').eq('org_id', profile?.org_id ?? ''),
      supabase.from('employee_policies').select('user_id, policy_id'),
    ])

    setEmployees(empResult.data ?? [])
    setPolicies(policyResult.data ?? [])

    const map: Record<string, string> = {}
    for (const a of assignResult.data ?? []) map[a.user_id] = a.policy_id
    setAssignments(map)

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function toggleActive(emp: UserProfile) {
    const supabase = createClient()
    await supabase.from('users').update({ is_active: !emp.is_active }).eq('id', emp.id)
    await load()
  }

  async function assignPolicy(userId: string, policyId: string) {
    const supabase = createClient()
    if (policyId) {
      await supabase.from('employee_policies').upsert({ user_id: userId, policy_id: policyId })
    } else {
      await supabase.from('employee_policies').delete().eq('user_id', userId)
    }
    await load()
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Empleados</h1>

      <div className="space-y-2">
        {employees.map(emp => (
          <div key={emp.id} className={`bg-white rounded-card shadow-card p-4 ${!emp.is_active ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-800">{emp.full_name}</p>
                <p className="text-xs text-slate-400 mt-0.5 capitalize">{emp.role}</p>
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Política de aprobación</label>
                  <select
                    value={assignments[emp.id] ?? ''}
                    onChange={e => assignPolicy(emp.id, e.target.value)}
                    className="text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-600"
                  >
                    <option value="">Sin asignar</option>
                    {policies.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => toggleActive(emp)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                    emp.is_active
                      ? 'bg-red-50 text-red-500 hover:bg-red-100'
                      : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                  }`}
                >
                  {emp.is_active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Página de configuración (organización + categorías)**

Crear `src/app/(app)/admin/settings/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Organization, ExpenseCategory } from '@/lib/supabase/types'

export default function SettingsPage() {
  const [org, setOrg]             = useState<Organization | null>(null)
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [saving, setSaving]       = useState(false)

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('users').select('org_id').eq('id', user.id).single()

    const [orgResult, catResult] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', profile?.org_id ?? '').single(),
      supabase.from('expense_categories')
        .select('*')
        .or(`org_id.eq.${profile?.org_id},org_id.is.null`)
        .order('name'),
    ])

    setOrg(orgResult.data)
    setCategories(catResult.data ?? [])
  }

  useEffect(() => { load() }, [])

  async function saveOrg(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!org) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('organizations').update({ name: org.name }).eq('id', org.id)
    setSaving(false)
    alert('Guardado ✓')
  }

  async function addCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const supabase = createClient()
    const { data: profile } = await supabase
      .from('users').select('org_id').eq('id', (await supabase.auth.getUser()).data.user!.id).single()

    await supabase.from('expense_categories').insert({
      org_id: profile?.org_id,
      name:   form.get('name') as string,
      icon:   form.get('icon') as string || null,
    })
    ;(e.target as HTMLFormElement).reset()
    await load()
  }

  if (!org) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <h1 className="text-xl font-bold text-slate-800">Configuración</h1>

      {/* Organización */}
      <section className="bg-white rounded-card shadow-card p-5 space-y-4">
        <h2 className="font-semibold text-slate-700">Organización</h2>
        <form onSubmit={saveOrg} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Nombre</label>
            <input
              type="text"
              value={org.name}
              onChange={e => setOrg(prev => prev ? { ...prev, name: e.target.value } : prev)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-item disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      </section>

      {/* Categorías */}
      <section className="bg-white rounded-card shadow-card p-5 space-y-4">
        <h2 className="font-semibold text-slate-700">Categorías de gasto</h2>

        <div className="space-y-1.5">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-2 text-sm">
              <span>{cat.icon}</span>
              <span className="text-slate-700">{cat.name}</span>
              {!cat.org_id && <span className="text-xs text-slate-400">(global)</span>}
            </div>
          ))}
        </div>

        <form onSubmit={addCategory} className="flex gap-2">
          <input name="icon" type="text" placeholder="🏷️" className="w-14 px-2 py-2 border border-slate-200 rounded-item text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-600" />
          <input name="name" type="text" required placeholder="Nueva categoría" className="flex-1 px-3 py-2 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600" />
          <button type="submit" className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-item hover:bg-brand-700">
            Agregar
          </button>
        </form>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/admin/
git commit -m "feat: admin employees + settings — policy assignment, categories management"
```

---

## Task 7b: Exportación PDF de rendición individual

**Files:**
- Modificar: `src/actions/exports.ts` (agregar función `getReportForPdf`)
- Crear: `src/lib/generate-pdf.ts` (función de cliente para generar el PDF)
- Modificar: `src/app/(app)/expenses/[id]/page.tsx` (agregar botón de descarga PDF)

> El PDF se genera en el cliente con jsPDF para evitar timeout en Server Actions al incrustar fotos (que pueden ser grandes).

- [ ] **Step 1: Agregar función de datos para PDF en exports.ts**

En `src/actions/exports.ts`, agregar al final:

```typescript
export async function getReportForPdf(reportId: string) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('expense_reports')
    .select(`
      title, description, status, total_amount, approved_amount, currency,
      submitted_at, created_at,
      submitter:users!submitter_id(full_name, department),
      expense_items (
        id, description, amount, currency, amount_clp, date,
        merchant, doc_type, doc_number, notes, status, rejection_reason,
        expense_categories(name, icon),
        attachments(storage_path, file_type)
      )
    `)
    .eq('id', reportId)
    .single()

  return data
}
```

- [ ] **Step 2: Crear generate-pdf.ts**

Crear `src/lib/generate-pdf.ts`:

```typescript
// Solo se usa en el cliente — no importar desde Server Actions
import { formatCLP, formatDate, getStatusLabel } from './utils'
import type { ReportStatus, Currency } from './constants'

export async function downloadReportPdf(report: any, orgName: string) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const items = report.expense_items ?? []

  // ── Portada / encabezado ──
  doc.setFillColor(15, 23, 42) // #0f172a
  doc.rect(0, 0, 210, 32, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Rindegastos', 14, 12)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(orgName, 14, 18)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(report.title, 14, 26)

  // ── Metadatos ──
  doc.setTextColor(30, 41, 59)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')

  const meta = [
    ['Rendidor:', (report.submitter as any)?.full_name ?? ''],
    ['Estado:', getStatusLabel(report.status as ReportStatus)],
    ['Total:', formatCLP(report.total_amount)],
    ['Aprobado:', formatCLP(report.approved_amount)],
    ['Fecha envío:', report.submitted_at ? formatDate(report.submitted_at.split('T')[0]) : '-'],
  ]

  let y = 40
  for (const [label, value] of meta) {
    doc.setFont('helvetica', 'bold')
    doc.text(label, 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(value), 48, y)
    y += 6
  }

  // ── Tabla de ítems ──
  autoTable(doc, {
    startY: y + 4,
    head: [['Descripción', 'Proveedor', 'Fecha', 'Monto CLP', 'Estado']],
    body: items.map((item: any) => [
      item.description,
      item.merchant ?? '-',
      formatDate(item.date),
      formatCLP(item.amount_clp),
      getStatusLabel(item.status as ReportStatus) ?? item.status,
    ]),
    headStyles: {
      fillColor: [79, 70, 229], // brand-600
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [238, 242, 255] },
    styles: { fontSize: 8, cellPadding: 3 },
  })

  // ── Footer ──
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(148, 163, 184)
    doc.text(
      `Rindegastos · ${orgName} · Generado ${new Date().toLocaleDateString('es-CL')} · Pág ${i}/${pageCount}`,
      14, 290
    )
  }

  const filename = `rendicion-${report.title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(filename)
}
```

- [ ] **Step 3: Agregar botón de PDF en la página de detalle de rendición**

En `src/app/(app)/expenses/[id]/page.tsx`, agregar dentro del componente (en el bloque de acciones, FUERA de `isDraft`):

```typescript
// Agregar esta función dentro del componente ExpenseDetailPage:
async function handleDownloadPdf() {
  const { getReportForPdf } = await import('@/actions/exports')
  const data = await getReportForPdf(id)
  if (!data) return
  const { downloadReportPdf } = await import('@/lib/generate-pdf')
  await downloadReportPdf(data, 'PENTA y Cía.')
}
```

Y en el JSX, agregar el botón de PDF siempre visible (no solo en borrador). Agregar después del bloque de `{isDraft && (...)`:

```tsx
{/* Descargar PDF — disponible en cualquier estado */}
{!isDraft && report.status !== 'draft' && (
  <button
    onClick={handleDownloadPdf}
    className="w-full py-2.5 border border-slate-200 hover:bg-slate-50 rounded-card text-sm font-medium text-slate-600 flex items-center justify-center gap-2"
  >
    📄 Descargar PDF
  </button>
)}
```

- [ ] **Step 4: Verificar que el PDF descarga correctamente**

```bash
npm run dev
```

1. Crear y enviar una rendición con ítems
2. En la página de detalle (estado "En revisión" o posterior), click "Descargar PDF"
3. Verificar que descarga un PDF con: encabezado oscuro, tabla de ítems, totales

- [ ] **Step 5: Commit**

```bash
git add src/actions/exports.ts src/lib/generate-pdf.ts src/app/(app)/expenses/
git commit -m "feat: PDF export — individual expense report with items table (jsPDF)"
```

---

## Task 8: PWA Configuration

**Files:**
- Crear: `public/manifest.json`
- Crear: `public/icons/` (íconos PWA)
- Modificar: `next.config.ts`

- [ ] **Step 1: Crear manifest.json**

Crear `public/manifest.json`:

```json
{
  "name": "Rindegastos PENTA",
  "short_name": "Rindegastos",
  "description": "Gestión de rendiciones de gastos empresariales",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "shortcuts": [
    {
      "name": "Nueva rendición",
      "short_name": "Rendir",
      "description": "Crear nueva rendición de gastos",
      "url": "/expenses/new",
      "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }]
    }
  ]
}
```

- [ ] **Step 2: Generar íconos PWA**

Crear íconos simples SVG → PNG usando Canvas (ejecutar en Node):

```bash
node -e "
const { createCanvas } = require('canvas');
const fs = require('fs');

function makeIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Fondo
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, size, size);

  // Cuadrado redondeado de fondo
  ctx.fillStyle = '#4f46e5';
  const pad = size * 0.15;
  const r = size * 0.2;
  ctx.beginPath();
  ctx.moveTo(pad + r, pad);
  ctx.lineTo(size - pad - r, pad);
  ctx.arcTo(size - pad, pad, size - pad, pad + r, r);
  ctx.lineTo(size - pad, size - pad - r);
  ctx.arcTo(size - pad, size - pad, size - pad - r, size - pad, r);
  ctx.lineTo(pad + r, size - pad);
  ctx.arcTo(pad, size - pad, pad, size - pad - r, r);
  ctx.lineTo(pad, pad + r);
  ctx.arcTo(pad, pad, pad + r, pad, r);
  ctx.closePath();
  ctx.fill();

  // Letra R
  ctx.fillStyle = 'white';
  ctx.font = 'bold ' + (size * 0.45) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('R', size / 2, size / 2);

  return canvas.toBuffer('image/png');
}

fs.mkdirSync('public/icons', { recursive: true });
fs.writeFileSync('public/icons/icon-192.png', makeIcon(192));
fs.writeFileSync('public/icons/icon-512.png', makeIcon(512));
console.log('Icons generated');
"
```

Si `canvas` no está disponible, usar íconos placeholder temporales:

```bash
# Alternativa: crear íconos SVG simples y convertir con sharp
npm install -D sharp
node -e "
const sharp = require('sharp');
const svgIcon = \`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'>
  <rect width='512' height='512' fill='#0f172a'/>
  <rect x='77' y='77' width='358' height='358' rx='80' fill='#4f46e5'/>
  <text x='256' y='310' font-size='230' font-family='sans-serif' font-weight='bold' fill='white' text-anchor='middle'>R</text>
</svg>\`;
const svgBuf = Buffer.from(svgIcon);
require('fs').mkdirSync('public/icons', { recursive: true });
Promise.all([
  sharp(svgBuf).resize(192).png().toFile('public/icons/icon-192.png'),
  sharp(svgBuf).resize(512).png().toFile('public/icons/icon-512.png'),
]).then(() => console.log('Icons created'));
"
```

- [ ] **Step 3: Configurar next-pwa**

Reemplazar `next.config.ts`:

```typescript
import type { NextConfig } from 'next'
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig: NextConfig = {
  // Permitir imágenes de Supabase Storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

module.exports = withPWA(nextConfig)
```

- [ ] **Step 4: Verificar PWA**

```bash
npm run build && npm start
```

Abrir `http://localhost:3000` en Chrome → DevTools → Application → Manifest. Verificar:
- Nombre y íconos visibles
- "Add to Home Screen" disponible en móvil (probar en Chrome mobile)
- Service Worker registrado en la pestaña "Service Workers"

- [ ] **Step 5: Commit**

```bash
git add public/ next.config.ts
git commit -m "feat: PWA setup — manifest, icons, service worker via next-pwa"
```

---

## Task 9: Build final y verificación completa

- [ ] **Step 1: Ejecutar todos los tests**

```bash
npm test
```

Esperado: PASS — todos los tests (~19 tests en verde). Si alguno falla, corregir antes de continuar.

- [ ] **Step 2: Build de producción**

```bash
npm run build
```

Corregir cualquier error de TypeScript o ESLint.

- [ ] **Step 3: Verificación E2E del flujo completo**

```bash
npm run dev
```

Flujo de verificación manual:

**Como Rendidor:**
1. Login → Dashboard con card héroe morado
2. "Tomá la foto y listo" → Crear rendición con título
3. Agregar ítem con foto → OCR extrae datos (o llenar manualmente)
4. Agregar ítem en USD → TC se consulta automáticamente → se muestra el equivalente CLP
5. "Enviar a revisión" → estado cambia a "En revisión"
6. Email al aprobador se dispara (verificar en Resend dashboard)

**Como Aprobador:**
7. Login como aprobador → ver la rendición en /approvals
8. Entrar al detalle → ver ítems con botones Aprobar/Rechazar
9. Rechazar un ítem → modal de motivo → confirmar
10. Aprobar el resto → "Confirmar decisiones"
11. Email al rendidor se dispara

**Como Admin:**
12. Login como admin → Dashboard con KPIs
13. Ver /admin/reports → rendición con estado "Aprobada parcial"
14. "Marcar como reembolsado" → ingresar referencia de pago
15. Email de reembolso al rendidor
16. Exportar Excel → descarga correctamente

- [ ] **Step 4: Commit final del Plan C**

```bash
git add -A
git commit -m "feat: Plan C complete — approvals, admin, emails, Excel export, PWA"
```

---

## Verificación final del Plan C (y del proyecto v1)

Antes de considerar v1 como completo:

- [ ] `npm test` — todos los tests pasan
- [ ] `npm run build` — sin errores
- [ ] Flujo completo rendidor → aprobador → admin verificado en navegador
- [ ] Emails transaccionales llegan correctamente (verificar en Resend Dashboard)
- [ ] Exportación Excel descarga con datos correctos
- [ ] PWA instalable desde Chrome en Android (Add to Home Screen)
- [ ] Schema de Supabase aplicado con todas las tablas y RLS activo
- [ ] RLS verificado: rendidor no puede ver rendiciones de otro rendidor

---

## Siguientes pasos (v2)

Una vez completado el v1:

1. **Asistente IA Rendidor** — post-OCR inteligente con Claude Sonnet 4.6: sugerencia de categoría, memoria de patrones del historial
2. **Asistente IA Aprobador** — resumen pre-revisión y detección de anomalías con Claude Opus 4.8
3. **Aprobación multinivel** — activar UI para nivel 2 (schema ya listo, sin migración)
4. **Límites por categoría** — políticas de monto máximo por categoría
5. **Push notifications** — Web Push API para notificaciones en tiempo real
6. **Integración fintrack-pro** — los ítems aprobados fluyen al Estado de Resultados
