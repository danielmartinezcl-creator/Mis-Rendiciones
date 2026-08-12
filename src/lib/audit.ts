'use server'
import { createAdminClient } from '@/lib/supabase/admin'

export type AuditAction =
  | 'deleted' | 'restored' | 'permanently_deleted'
  | 'created'  | 'updated'  | 'bulk_updated'
  | 'config_changed' | 'exported' | 'submitted' | 'approved' | 'rejected'

export type AuditEntityType =
  | 'expense_report' | 'expense_item'
  | 'petty_cash_fund' | 'petty_cash_item'
  | 'user' | 'category' | 'policy' | 'travel_policy'
  | 'defontana_settings' | 'defontana_supplier'
  | 'cost_center_assignment' | 'approver_assignment'
  | 'webhook'

export interface AuditLogEntry {
  orgId:        string
  actorId:      string | null
  actorName:    string | null
  action:       AuditAction
  entityType:   AuditEntityType
  entityId:     string
  entityLabel?: string
  oldValue?:    Record<string, unknown> | null
  newValue?:    Record<string, unknown> | null
  notes?:       string
}

export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('audit_log').insert({
      org_id:       entry.orgId,
      actor_id:     entry.actorId,
      actor_name:   entry.actorName,
      action:       entry.action,
      entity_type:  entry.entityType,
      entity_id:    entry.entityId,
      entity_label: entry.entityLabel ?? null,
      old_value:    entry.oldValue  ?? null,
      new_value:    entry.newValue  ?? null,
      notes:        entry.notes     ?? null,
    })
  } catch (err) {
    // Audit failures NUNCA deben bloquear la operación principal
    console.error('[audit] Failed to write audit log:', err)
  }
}
