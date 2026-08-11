'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

// Helper — solo envía si está configurado Resend
async function trySendEmail(to: string[], subject: string, html: string) {
  if (!to.length) return
  const apiKey = process.env.RESEND_API_KEY
  const from   = process.env.RESEND_FROM_EMAIL ?? 'noreply@rindegastos.app'
  if (!apiKey || apiKey === 'placeholder') return
  const resend = new Resend(apiKey)
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

  // Obtener el aprobador L1 asignado al rendidor (y suplente si está activo)
  const { data: submitter } = await supabase
    .from('users')
    .select('approver_l1_id, approver_l1_backup_id, backup_active_from, backup_active_until')
    .eq('id', report.submitter_id)
    .single()

  let approverIds: string[] = []

  if (submitter?.approver_l1_id) {
    approverIds.push(submitter.approver_l1_id)

    // Agregar suplente si está activo hoy
    if (submitter.approver_l1_backup_id) {
      const today = new Date().toISOString().split('T')[0]
      const from  = submitter.backup_active_from as string | null
      const until = submitter.backup_active_until as string | null
      if (from && until && from <= today && today <= until) {
        approverIds.push(submitter.approver_l1_backup_id)
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

  const emails  = await lookupEmails(approverIds)
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? ''
  await trySendEmail(
    emails,
    `Nueva rendición para revisar: ${report.title}`,
    `<p>Hay una nueva rendición esperando tu aprobación.</p>
     <p><a href="${appUrl}/approvals/${report.id}">Ver rendición →</a></p>`
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

  const { data: submitter } = await supabase
    .from('users')
    .select('approver_l2_id')
    .eq('id', report.submitter_id)
    .single()

  if (!submitter?.approver_l2_id) return

  const l2Id = submitter.approver_l2_id

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
    `Rendición lista para revisión N2: ${report.title}`,
    `<p>Una rendición aprobada por el nivel 1 requiere tu revisión final.</p>
     <p><a href="${appUrl}/approvals/${report.id}">Ver rendición →</a></p>`
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
    approved:           'Tu rendición fue aprobada',
    rejected:           'Tu rendición fue rechazada',
    partially_approved: 'Tu rendición fue aprobada parcialmente',
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const emails = await lookupEmails([report.submitter_id])
  await trySendEmail(
    emails,
    `${subjectMap[action]}: ${report.title}`,
    `<p>${subjectMap[action]}.</p>
     <p><a href="${appUrl}/expenses/${report.id}">Ver detalle →</a></p>`
  )
}

// ── Cadena bancaria ───────────────────────────────────────────────────────────

// Avisa a quienes cargan transferencias bancarias que hay una rendición aprobada lista
export async function notifyBankLoadersOfApproval(reportId: string) {
  const supabase = await createClient()

  const { data: report } = await supabase
    .from('expense_reports')
    .select('id, title, org_id')
    .eq('id', reportId)
    .single()

  if (!report) return

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
    `Rendición aprobada, lista para reembolso: ${report.title}`,
    `<p>Una rendición fue aprobada y está lista para procesar el reembolso bancario.</p>
     <p><a href="${appUrl}/admin/reports">Ver rendiciones →</a></p>`
  )
}

// Avisa a quienes autorizan transferencias bancarias que hay una carga pendiente
export async function notifyBankAuthorizersOfLoad(reportId: string) {
  const supabase = await createClient()

  const { data: report } = await supabase
    .from('expense_reports')
    .select('id, title, org_id')
    .eq('id', reportId)
    .single()

  if (!report) return

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
    `Transferencia cargada, pendiente de autorización: ${report.title}`,
    `<p>La transferencia bancaria fue cargada y está pendiente de tu autorización.</p>
     <p><a href="${appUrl}/admin/reports">Ver rendiciones →</a></p>`
  )
}

// Avisa al rendidor que su reembolso fue procesado y transferido
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
    `Tu reembolso fue procesado: ${report.title}`,
    `<p>Tu reembolso ha sido autorizado y procesado. El dinero debería aparecer en tu cuenta bancaria en breve.</p>
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
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
}
