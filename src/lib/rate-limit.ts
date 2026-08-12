import { createAdminClient } from '@/lib/supabase/admin'

export function buildDedupKey(type: string, entityId: string, date: string): string {
  return `${type}:${entityId}:${date}`
}

export async function checkRateLimit(
  userId: string,
  action: string,
  maxPerHour: number
): Promise<{ allowed: boolean; remaining: number }> {
  const admin = createAdminClient()
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  // Contar llamadas en la última hora
  const { count } = await admin
    .from('rate_limit_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', windowStart)

  const used = count ?? 0
  const allowed = used < maxPerHour

  if (allowed) {
    // Registrar esta llamada
    await admin.from('rate_limit_log').insert({ user_id: userId, action })
    // Limpiar registros > 2h (housekeeping, fire and forget)
    admin.from('rate_limit_log')
      .delete()
      .lt('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .then(() => {})
  }

  return { allowed, remaining: Math.max(0, maxPerHour - used - (allowed ? 1 : 0)) }
}
