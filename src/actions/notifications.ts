'use server'

import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

// Helper — solo envía si está configurado Resend
async function trySendEmail(to: string[], subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY
  const from   = process.env.RESEND_FROM_EMAIL ?? 'noreply@rindegastos.app'
  if (!apiKey || apiKey === 'placeholder') return
  const resend = new Resend(apiKey)
  await resend.emails.send({ from, to, subject, html }).catch(() => {
    // Email no crítico — fallo silencioso
  })
}

export async function notifyApproversOfSubmission(reportId: string) {
  const supabase = await createClient()

  const { data: report } = await supabase
    .from('expense_reports')
    .select('id, title, total_amount, org_id, submitter_id')
    .eq('id', reportId)
    .single()

  if (!report) return

  // Aprobadores de la misma org
  const { data: approvers } = await supabase
    .from('users')
    .select('id')
    .eq('org_id', report.org_id)
    .eq('can_approve', true)
    .eq('is_active', true)

  if (!approvers || approvers.length === 0) return

  // In-app notifications
  await supabase.from('notifications').insert(
    approvers.map(a => ({
      org_id:    report.org_id,
      user_id:   a.id,
      type:      'submission' as const,
      report_id: report.id,
      read:      false,
    }))
  )

  // Email (opcional — requiere RESEND_API_KEY)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  await trySendEmail(
    approvers.map(a => a.id), // placeholder — requiere servicio de email lookup
    `Nueva rendición para revisar: ${report.title}`,
    `<p>Hay una nueva rendición esperando tu aprobación.</p>
     <p><a href="${appUrl}/approvals/${report.id}">Ver rendición</a></p>`
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
  await trySendEmail(
    [report.submitter_id], // placeholder — requiere lookup de email
    `${subjectMap[action]}: ${report.title}`,
    `<p>${subjectMap[action]}.</p>
     <p><a href="${appUrl}/expenses/${report.id}">Ver detalle</a></p>`
  )
}

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
