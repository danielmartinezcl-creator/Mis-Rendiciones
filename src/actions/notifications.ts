'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

// Helper — solo envía si está configurado Resend
async function trySendEmail(to: string[], subject: string, html: string) {
  if (!to.length) return
  const apiKey     = process.env.RESEND_API_KEY
  const fromEmail  = process.env.RESEND_FROM_EMAIL ?? 'noreply@mi-rendicion.com'
  if (!apiKey || apiKey === 'placeholder') return
  const resend = new Resend(apiKey)
  // Nombre visible en el campo "De:" del correo
  const from = `Mi Rendición <${fromEmail}>`
  await resend.emails.send({ from, to, subject, html }).catch(() => {
    // Email no crítico — fallo silencioso
  })
}

// Busca emails reales en auth.users usando el admin client (service role)
async function lookupEmails(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return []
  try {
    const admin = createAdminClient()
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const emailMap = new Map(data.users.map(u => [u.id, u.email ?? '']))
    return userIds.map(id => emailMap.get(id) ?? '').filter(Boolean)
  } catch {
    return []
  }
}

// ── Envío de rendición ────────────────────────────────────────────────────────

export async function notifyApproversOfSubmission(reportId: string) {
  const supabase = await createClient()

  const { data: report } = await supabase
    .from('expense_reports')
    .select('id, title, total_amount, org_id, submitter_id')
    .eq('id', reportId)
    .single()

  if (!report) return

  // Nombre del rendidor para el asunto del correo
  const { data: submitterProfile } = await supabase
    .from('users')
    .select('full_name, approver_l1_id, approver_l1_backup_id, backup_active_from, backup_active_until')
    .eq('id', report.submitter_id)
    .single()

  const submitterName = submitterProfile?.full_name ?? 'un empleado'
  let approverIds: string[] = []

  if (submitterProfile?.approver_l1_id) {
    approverIds.push(submitterProfile.approver_l1_id)

    // Agregar suplente si está activo hoy
    if (submitterProfile.approver_l1_backup_id) {
      const today = new Date().toISOString().split('T')[0]
      const from  = submitterProfile.backup_active_from as string | null
      const until = submitterProfile.backup_active_until as string | null
      if (from && until && from <= today && today <= until) {
        approverIds.push(submitterProfile.approver_l1_backup_id)
      }
    }
  } else {
    // Sin L1 configurado → fallback: solo los admins de la org
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('org_id', report.org_id)
      .eq('role', 'admin')
      .eq('is_active', true)
    approverIds = (admins ?? []).map(a => a.id)
  }

  // Nunca notificar al propio rendidor
  approverIds = approverIds.filter(id => id !== report.submitter_id)
  if (approverIds.length === 0) return

  await supabase.from('notifications').insert(
    approverIds.map(id => ({
      org_id:    report.org_id,
      user_id:   id,
      type:      'submission' as const,
      report_id: report.id,
      read:      false,
    }))
  )

  const emails = await lookupEmails(approverIds)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  await trySendEmail(
    emails,
    `Aprobar rendición de ${submitterName}: ${report.title}`,
    `<p><strong>${submitterName}</strong> envió una rendición que requiere tu aprobación.</p>
     <p><a href="${appUrl}/approvals/${report.id}">Revisar rendición →</a></p>`
  )
}

// ── Cadena de aprobación ──────────────────────────────────────────────────────

export async function notifyL2ApproverOfPromotion(reportId: string) {
  const supabase = await createClient()

  const { data: report } = await supabase
    .from('expense_reports')
    .select('id, title, org_id, submitter_id')
    .eq('id', reportId)
    .single()

  if (!report) return

  const { data: submitterProfile } = await supabase
    .from('users')
    .select('full_name, approver_l2_id')
    .eq('id', report.submitter_id)
    .single()

  if (!submitterProfile?.approver_l2_id) return

  const submitterName = submitterProfile.full_name ?? 'un empleado'
  const l2Id = submitterProfile.approver_l2_id

  await supabase.from('notifications').insert({
    org_id:    report.org_id,
    user_id:   l2Id,
    type:      'submission' as const,
    report_id: report.id,
    read:      false,
  })

  const emails = await lookupEmails([l2Id])
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  await trySendEmail(
    emails,
    `Revisión N2 — rendición de ${submitterName}: ${report.title}`,
    `<p>La rendición de <strong>${submitterName}</strong> fue aprobada en nivel 1 y requiere tu revisión final.</p>
     <p><a href="${appUrl}/approvals/${report.id}">Revisar rendición →</a></p>`
  )
}

export async function notifySubmitterOfDecision(reportId: string, action: 'approved' | 'rejected' | 'partially_approved') {
  const supabase = await createClient()

  const { data: report } = await supabase
    .from('expense_reports')
    .select('id, title, org_id, submitter_id')
    .eq('id', reportId)
    .single()

  if (!report) return

  const typeMap = {
    approved:           'approval',
    rejected:           'rejection',
    partially_approved: 'approval',
  } as const

  await supabase.from('notifications').insert({
    org_id:    report.org_id,
    user_id:   report.submitter_id,
    type:      typeMap[action],
    report_id: report.id,
    read:      false,
  })

  const subjectMap = {
    approved:           `Rendición aprobada — ${report.title}`,
    rejected:           `Rendición rechazada — ${report.title}`,
    partially_approved: `Rendición aprobada parcialmente — ${report.title}`,
  }

  const bodyMap = {
    approved:           'Tu rendición fue aprobada. En breve se procesará el reembolso.',
    rejected:           'Tu rendición fue rechazada. Revisá los motivos y corrígela si corresponde.',
    partially_approved: 'Tu rendición fue aprobada parcialmente. Algunos ítems fueron rechazados.',
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const emails = await lookupEmails([report.submitter_id])
  await trySendEmail(
    emails,
    subjectMap[action],
    `<p>${bodyMap[action]}</p>
     <p><a href="${appUrl}/expenses/${report.id}">Ver detalle →</a></p>`
  )
}

// ── Cadena bancaria ───────────────────────────────────────────────────────────

export async function notifyBankLoadersOfApproval(reportId: string) {
  const supabase = await createClient()

  const { data: report } = await supabase
    .from('expense_reports')
    .select('id, title, org_id, submitter_id')
    .eq('id', reportId)
    .single()

  if (!report) return

  const { data: submitterProfile } = await supabase
    .from('users').select('full_name').eq('id', report.submitter_id).single()
  const submitterName = submitterProfile?.full_name ?? 'un empleado'

  const { data: loaders } = await supabase
    .from('users')
    .select('id')
    .eq('org_id', report.org_id)
    .eq('can_load_bank_transfer', true)
    .eq('is_active', true)

  const loaderIds = (loaders ?? []).map(l => l.id)
  if (loaderIds.length === 0) return

  await supabase.from('notifications').insert(
    loaderIds.map(id => ({
      org_id:    report.org_id,
      user_id:   id,
      type:      'approval' as const,
      report_id: report.id,
      read:      false,
    }))
  )

  const emails = await lookupEmails(loaderIds)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  await trySendEmail(
    emails,
    `Cargar reembolso — rendición aprobada de ${submitterName}: ${report.title}`,
    `<p>La rendición de <strong>${submitterName}</strong> fue aprobada y está lista para procesar el reembolso bancario.</p>
     <p><a href="${appUrl}/admin/reports">Ver rendiciones →</a></p>`
  )
}

export async function notifyBankAuthorizersOfLoad(reportId: string) {
  const supabase = await createClient()

  const { data: report } = await supabase
    .from('expense_reports')
    .select('id, title, org_id, submitter_id')
    .eq('id', reportId)
    .single()

  if (!report) return

  const { data: submitterProfile } = await supabase
    .from('users').select('full_name').eq('id', report.submitter_id).single()
  const submitterName = submitterProfile?.full_name ?? 'un empleado'

  const { data: authorizers } = await supabase
    .from('users')
    .select('id')
    .eq('org_id', report.org_id)
    .eq('can_authorize_bank_transfer', true)
    .eq('is_active', true)

  const authIds = (authorizers ?? []).map(a => a.id)
  if (authIds.length === 0) return

  await supabase.from('notifications').insert(
    authIds.map(id => ({
      org_id:    report.org_id,
      user_id:   id,
      type:      'approval' as const,
      report_id: report.id,
      read:      false,
    }))
  )

  const emails = await lookupEmails(authIds)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  await trySendEmail(
    emails,
    `Autorizar transferencia — rendición de ${submitterName}: ${report.title}`,
    `<p>La transferencia bancaria para la rendición de <strong>${submitterName}</strong> fue cargada y está pendiente de tu autorización.</p>
     <p><a href="${appUrl}/admin/reports">Ver rendiciones →</a></p>`
  )
}

export async function notifySubmitterOfReimbursement(reportId: string) {
  const supabase = await createClient()

  const { data: report } = await supabase
    .from('expense_reports')
    .select('id, title, org_id, submitter_id')
    .eq('id', reportId)
    .single()

  if (!report) return

  await supabase.from('notifications').insert({
    org_id:    report.org_id,
    user_id:   report.submitter_id,
    type:      'reimbursement' as const,
    report_id: report.id,
    read:      false,
  })

  const emails = await lookupEmails([report.submitter_id])
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  await trySendEmail(
    emails,
    `Reembolso procesado — ${report.title}`,
    `<p>Tu reembolso fue autorizado y procesado. El dinero debería aparecer en tu cuenta bancaria en breve.</p>
     <p><a href="${appUrl}/expenses/${report.id}">Ver rendición →</a></p>`
  )
}

// ── In-app ───────────────────────────────────────────────────────────────────

export async function getMyNotifications() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return data ?? []
}

export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('user_id', user.id)  // solo marcar las propias notificaciones
}
