// Webhook outbound helper — NO 'use server', importable desde server actions

import { createAdminClient } from '@/lib/supabase/admin'

export type WebhookEvent =
  | 'report.approved'
  | 'report.partially_approved'
  | 'report.rejected'
  | 'report.reimbursed'
  | 'defontana.exported'

async function signPayload(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function dispatchWebhooks(
  orgId:   string,
  event:   WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient()
  const { data: hooks } = await admin
    .from('webhooks')
    .select('url, secret')
    .eq('org_id', orgId)
    .eq('activo', true)
    .contains('events', [event])

  if (!hooks?.length) return

  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload })

  await Promise.allSettled(
    hooks.map(async hook => {
      const signature = await signPayload(body, hook.secret)
      try {
        await fetch(hook.url, {
          method: 'POST',
          headers: {
            'Content-Type':        'application/json',
            'X-Signature-SHA256':  signature,
            'X-MiRendicion-Event': event,
          },
          body,
          signal: AbortSignal.timeout(8000),
        })
      } catch (err) {
        console.error(`[webhook] Failed to dispatch to ${hook.url}:`, err)
      }
    })
  )
}
