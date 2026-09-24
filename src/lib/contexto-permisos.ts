// Arma, desde la base, lo que src/lib/permisos.ts necesita para decidir.
//
// Lee con la llave de servicio: las reglas tienen que ver a TODAS las personas
// de la organización y TODO el historial, no solo lo que la RLS le deja ver a
// quien pregunta. Solo lo importan acciones del servidor (src/actions/).

import { createAdminClient } from '@/lib/supabase/admin'
import {
  suplenteVigente, pasoSegunEstado, puedeActuar, destinatarios, tipoDeFondo,
  type Cadena, type Documento, type Paso, type Persona,
} from '@/lib/permisos'

export type AdminClient = ReturnType<typeof createAdminClient>

const hoy = () => new Date().toISOString().slice(0, 10)

export async function cargarPersonas(admin: AdminClient, orgId: string): Promise<Persona[]> {
  const { data, error } = await admin
    .from('users')
    .select('id, full_name, is_active, blocked_at, deleted_at, can_submit, can_approve, can_manage_petty_cash, can_load_bank_transfer, can_authorize_bank_transfer, bank_load_backup, bank_auth_backup')
    .eq('org_id', orgId)
  if (error) throw new Error(error.message)

  return (data ?? []).map(u => ({
    id:                          u.id,
    nombre:                      u.full_name,
    activo:                      u.is_active && !u.blocked_at && !u.deleted_at,
    can_submit:                  u.can_submit,
    can_approve:                 u.can_approve,
    can_manage_petty_cash:       u.can_manage_petty_cash,
    can_load_bank_transfer:      u.can_load_bank_transfer,
    can_authorize_bank_transfer: u.can_authorize_bank_transfer,
    bank_load_backup:            u.bank_load_backup,
    bank_auth_backup:            u.bank_auth_backup,
  }))
}

export async function cargarCadena(admin: AdminClient, userId: string): Promise<Cadena> {
  const { data, error } = await admin
    .from('users')
    .select('approver_l1_id, approver_l2_id, approver_l1_backup_id, backup_active_from, backup_active_until')
    .eq('id', userId)
    .single()
  if (error || !data) throw new Error('No se encontró la cadena de aprobación')

  return {
    l1:                data.approver_l1_id,
    l2:                data.approver_l2_id,
    suplenteL1Vigente: suplenteVigente(data.approver_l1_backup_id, data.backup_active_from, data.backup_active_until, hoy()),
  }
}

export interface ContextoRendicion {
  admin:    AdminClient
  reporte:  {
    id: string; org_id: string; submitter_id: string; status: string; title: string
    approved_amount: number | null; is_historical_import: boolean
  }
  personas: Persona[]
  doc:      Documento
}

export async function contextoRendicion(reportId: string): Promise<ContextoRendicion> {
  const admin = createAdminClient()
  const { data: reporte } = await admin
    .from('expense_reports')
    .select('id, org_id, submitter_id, status, title, approved_amount, is_historical_import')
    .eq('id', reportId)
    .is('deleted_at', null)
    .single()
  if (!reporte) throw new Error('Rendición no encontrada')

  const [personas, cadena, { data: log }] = await Promise.all([
    cargarPersonas(admin, reporte.org_id),
    cargarCadena(admin, reporte.submitter_id),
    admin.from('expense_report_approvals')
      .select('approver_id, action, level')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true }),
  ])

  return {
    admin,
    reporte,
    personas,
    doc: {
      tipo:           'rendicion',
      beneficiarioId: reporte.submitter_id,
      cadena,
      historial:      (log ?? []).map(a => ({ actorId: a.approver_id, accion: a.action, nivel: a.level })),
    },
  }
}

export interface ContextoFondo {
  admin:    AdminClient
  fondo:    {
    id: string; org_id: string; employee_id: string; manager_id: string; status: string
    name: string; amount_requested: number; amount_approved: number | null
  }
  personas: Persona[]
  doc:      Documento
}

export async function contextoFondo(fundId: string): Promise<ContextoFondo> {
  const admin = createAdminClient()
  const { data: fondo } = await admin
    .from('petty_cash_funds')
    .select('id, org_id, employee_id, manager_id, status, name, amount_requested, amount_approved')
    .eq('id', fundId)
    .is('deleted_at', null)
    .single()
  if (!fondo) throw new Error('Fondo no encontrado')

  const [personas, cadena, { data: log }] = await Promise.all([
    cargarPersonas(admin, fondo.org_id),
    cargarCadena(admin, fondo.employee_id),
    admin.from('petty_cash_approvals')
      .select('actor_id, action, level')
      .eq('fund_id', fundId)
      .order('created_at', { ascending: true }),
  ])

  return {
    admin,
    fondo,
    personas,
    doc: {
      tipo:           tipoDeFondo(fondo.status),
      beneficiarioId: fondo.employee_id,
      cadena,
      historial:      (log ?? []).map(a => ({ actorId: a.actor_id, accion: a.action, nivel: a.level })),
    },
  }
}

// Verifica que quien llama pueda dar el paso que el documento espera. Lanza con
// el motivo tal cual; la pantalla muestra el suyo desde `permisoEn`.
export function exigirPaso(
  ctx: { personas: Persona[]; doc: Documento },
  estado: string,
  userId: string,
  pasosValidos: Paso[],
  yaNoEspera: string,
): { yo: Persona; paso: Paso } {
  const yo = ctx.personas.find(p => p.id === userId)
  if (!yo) throw new Error('Documento no encontrado')
  const paso = pasoSegunEstado(ctx.doc.tipo, estado)
  if (!paso || !pasosValidos.includes(paso)) throw new Error(yaNoEspera)
  const permiso = puedeActuar(yo, paso, ctx.doc, ctx.personas)
  if (!permiso.ok) throw new Error(permiso.motivo)
  return { yo, paso }
}

// Lo mismo, sin lanzar: para decidir qué botones mostrar y a quién se espera.
export function permisoEn(
  ctx: { personas: Persona[]; doc: Documento },
  estado: string,
  userId: string,
): { paso: Paso | null; ok: boolean; motivo: string | null; esperandoA: string[] } {
  const paso = pasoSegunEstado(ctx.doc.tipo, estado)
  if (!paso) return { paso: null, ok: false, motivo: null, esperandoA: [] }

  const nombres = destinatarios(paso, ctx.doc, ctx.personas)
    .map(id => ctx.personas.find(p => p.id === id)?.nombre ?? '')
    .filter(Boolean)
  const yo = ctx.personas.find(p => p.id === userId)
  if (!yo) return { paso, ok: false, motivo: 'Documento no encontrado', esperandoA: nombres }

  const r = puedeActuar(yo, paso, ctx.doc, ctx.personas)
  return { paso, ok: r.ok, motivo: r.ok ? null : r.motivo, esperandoA: nombres }
}
