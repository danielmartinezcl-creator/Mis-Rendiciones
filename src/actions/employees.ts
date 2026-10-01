'use server'

import { enviarLinkDeAcceso } from '@/lib/access-email'

import { createClient } from '@/lib/supabase/server'
import { revisarConfigCorreo } from '@/lib/email-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { validateRut } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import {
  resolverPlanilla,
  type FilaPlanilla, type Persona, type CentroCosto,
} from '@/lib/planilla-alta'

export type ImportEmployeeRow = {
  full_name:       string
  email:           string
  role:            'admin' | 'approver' | 'employee'
  rut?:            string
  department?:     string
  cost_center_id?: string
}

export type ImportResult = {
  email: string
  full_name: string
  success: boolean
  error?: string
}

export type InviteResult = {
  userId: string
  email: string
  full_name: string
  success: boolean
  error?: string
}

async function getAdminContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: profile } = await supabase
    .from('users')
    .select('org_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('Solo administradores pueden realizar esta acción')
  }

  return { supabase, profile, adminClient: createAdminClient() }
}

// ── Importar empleados (SIN enviar email) ────────────────────────────────────

export async function importEmployees(rows: ImportEmployeeRow[]): Promise<ImportResult[]> {
  const { profile, adminClient } = await getAdminContext()
  const results: ImportResult[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    // Validar RUT del empleado si viene en la fila
    if (row.rut) {
      const normalized = row.rut.trim().toUpperCase().replace(/\./g, '')
      if (!validateRut(normalized)) {
        results.push({ email: row.email, full_name: row.full_name, success: false, error: `RUT inválido "${row.rut}"` })
        continue
      }
    }

    /* Id de la cuenta de auth creada y todavía sin perfil. Si algo falla antes
       de insertar el perfil hay que borrarla: una cuenta sin perfil no puede
       entrar a la app pero deja su correo ocupado para siempre. Así quedó
       dmartinez@pentaingenieros.cl el 2026-07-20. */
    let authSinPerfil: string | null = null
    const deshacer = async (): Promise<string> => {
      if (!authSinPerfil) return ''
      const { error } = await adminClient.auth.admin.deleteUser(authSinPerfil)
      return error ? ` (y no se pudo deshacer la cuenta de acceso: ${error.message})` : ''
    }

    try {
      // createUser crea la cuenta SIN enviar email de invitación
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email:          row.email,
        email_confirm:  false,
        user_metadata:  { full_name: row.full_name },
      })

      if (createError) {
        const repetido = /already|registered|exists/i.test(createError.message)
        results.push({
          email: row.email, full_name: row.full_name, success: false,
          error: repetido ? `El correo ${row.email} ya lo usa otra cuenta` : createError.message,
        })
        continue
      }
      authSinPerfil = created.user.id

      const { error: insertError } = await adminClient
        .from('users')
        .insert({
          id:             created.user.id,
          org_id:         profile.org_id,
          full_name:      row.full_name.trim(),
          role:           row.role,
          rut:            row.rut?.trim() || null,
          department:     row.department?.trim() || null,
          can_submit:     row.role !== 'approver',
          can_approve:    row.role === 'approver' || row.role === 'admin',
          is_active:      true,
          cost_center_id: row.cost_center_id ?? null,
          // invited_at queda null — el admin envía la invitación manualmente
        })

      if (insertError) {
        results.push({ email: row.email, full_name: row.full_name, success: false, error: insertError.message + await deshacer() })
        continue
      }
      authSinPerfil = null

      results.push({ email: row.email, full_name: row.full_name, success: true })
    } catch (err) {
      results.push({ email: row.email, full_name: row.full_name, success: false, error: String(err) + await deshacer() })
    }
  }

  revalidatePath('/admin/employees')
  return results
}

// ── Enviar invitaciones (manual, controlado por el admin) ────────────────────

export async function sendInvitations(userIds: string[]): Promise<InviteResult[]> {
  const { adminClient } = await getAdminContext()
  const results: InviteResult[] = []

  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const correo      = revisarConfigCorreo(process.env.RESEND_API_KEY, process.env.RESEND_FROM_EMAIL)

  /* Si el correo no puede salir, se corta ACÁ y no se toca el `invited_at` de
     nadie. Antes se seguía igual: se marcaba a los 54 como invitados y se
     devolvía éxito aunque no saliera un solo mail. Ese campo solo se puede
     escribir bien UNA vez —después el botón desaparece y no hay forma de
     distinguir «llegó» de «se perdió»—, así que fallar acá es lo barato. */
  if (!correo.puedeEnviar) {
    const { data: perfiles } = await adminClient.from('users').select('id, full_name').in('id', userIds)
    const nombres = Object.fromEntries((perfiles ?? []).map(p => [p.id, p.full_name]))
    return userIds.map(userId => ({
      userId,
      email:     '',
      full_name: nombres[userId] ?? '',
      success:   false,
      error:     `No se envió ninguna invitación: ${correo.motivo}`,
    }))
  }

  /* Un solo cliente para las 54, no uno por vuelta. */
  const { Resend } = await import('resend')
  const resend = new Resend((process.env.RESEND_API_KEY ?? '').trim())

  for (const userId of userIds) {
    try {
      // Obtener email desde auth.users via admin API
      const { data: authUser, error: getUserError } = await adminClient.auth.admin.getUserById(userId)
      if (getUserError || !authUser?.user?.email) {
        results.push({ userId, email: '', full_name: '', success: false, error: 'No se pudo obtener el email del usuario' })
        continue
      }

      const email = authUser.user.email

      // Obtener nombre desde public.users
      const { data: profile } = await adminClient.from('users').select('full_name').eq('id', userId).single()
      const full_name = profile?.full_name ?? email

      /* El envío DECIDE el resultado. Antes iba con `.catch(() => {})` y las
         dos líneas de abajo corrían igual, pasara lo que pasara. */
      const envio = await enviarLinkDeAcceso({
        adminClient, resend, appUrl, email,
        desde:  correo.desde,
        nombre: full_name,
        motivo: 'invitacion',
      })

      if (!envio.ok) {
        results.push({ userId, email, full_name, success: false, error: envio.error })
        continue
      }

      // Marcar como invitado — solo se llega acá si el correo salió de verdad.
      await adminClient.from('users').update({ invited_at: new Date().toISOString() }).eq('id', userId)

      results.push({ userId, email, full_name, success: true })
    } catch (err) {
      results.push({ userId, email: '', full_name: '', success: false, error: String(err) })
    }
  }

  revalidatePath('/admin/employees')
  return results
}

// ── Validación de complejidad de contraseña ──────────────────────────────────

function validatePassword(pwd: string): string | null {
  if (pwd.length < 8)       return 'Mínimo 8 caracteres'
  if (!/[A-Z]/.test(pwd))  return 'Debe incluir al menos una mayúscula'
  if (!/[0-9]/.test(pwd))  return 'Debe incluir al menos un número'
  return null
}

// ── Establecer contraseña de empleado sin enviar email ───────────────────────

export async function setEmployeePassword(userId: string, newPassword: string): Promise<void> {
  const pwdError = validatePassword(newPassword)
  if (pwdError) throw new Error(pwdError)
  const { adminClient } = await getAdminContext()
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password:      newPassword,
    email_confirm: true,   // confirma el email para que pueda iniciar sesión
  })
  if (error) throw new Error(error.message)
}

// ── Planilla de alta ─────────────────────────────────────────────────────────
// La única carga de empleados: crea a quien no está y completa a quien sí.
// Spec: docs/superpowers/specs/2026-10-01-planilla-de-alta-design.md

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('org_id, role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('Acceso restringido a administradores')
  }
  return { supabase, userId: user.id, orgId: profile.org_id, actorName: profile.full_name }
}

// El correo vive en auth.users, no en public.users: hay que cruzarlos. Acá SÍ
// conviene un listUsers único —son 57 y los necesitamos todos para resolver
// aprobadores por correo—, al revés que en los avisos, donde se busca uno solo.
//
// En cost_centers el código ES el id (varchar) y el nombre está en
// `descripcion`: la tabla no tiene columnas `code` ni `name`.
export async function datosParaPlanilla(): Promise<{ personas: Persona[]; centros: CentroCosto[] }> {
  const { orgId } = await requireAdmin()
  const admin = createAdminClient()

  const [usuarios, centros] = await Promise.all([
    admin.from('users')
      .select('id, full_name, rut, is_active, blocked_at, deleted_at, can_submit, can_approve, can_manage_petty_cash, can_load_bank_transfer, can_authorize_bank_transfer, bank_load_backup, bank_auth_backup, approver_l1_id, approver_l2_id')
      .eq('org_id', orgId),
    admin.from('cost_centers')
      .select('id, descripcion')
      .eq('org_id', orgId)
      .eq('activo', true),
  ])
  if (usuarios.error) throw new Error(usuarios.error.message)
  if (centros.error)  throw new Error(centros.error.message)

  const { data: auth } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const correos = new Map((auth?.users ?? []).map(u => [u.id, u.email ?? '']))

  return {
    personas: (usuarios.data ?? []).map(u => ({
      id:     u.id,
      nombre: u.full_name ?? '',
      correo: correos.get(u.id) ?? '',
      rut:    u.rut,
      activo: u.is_active && !u.blocked_at && !u.deleted_at,
      can_submit:                  u.can_submit,
      can_approve:                 u.can_approve,
      can_manage_petty_cash:       u.can_manage_petty_cash,
      can_load_bank_transfer:      u.can_load_bank_transfer,
      can_authorize_bank_transfer: u.can_authorize_bank_transfer,
      bank_load_backup:            u.bank_load_backup,
      bank_auth_backup:            u.bank_auth_backup,
      approver_l1_id:              u.approver_l1_id,
      approver_l2_id:              u.approver_l2_id,
    })),
    centros: (centros.data ?? []).map(c => ({
      id: c.id, codigo: c.id, nombre: c.descripcion ?? '',
    })),
  }
}

// Un permiso no se reparte desde un Excel: lo da el admin a propósito, con los
// nombres a la vista (Daniel, 2026-10-01).
export async function otorgarPermisoAprobar(ids: string[]) {
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()
  const errores: string[] = []
  let ok = 0

  for (const id of ids) {
    const { data: antes } = await supabase
      .from('users').select('full_name, can_approve')
      .eq('id', id).eq('org_id', orgId).single()
    if (!antes) { errores.push(`No se encontró a ${id}`); continue }

    const { data, error } = await supabase
      .from('users').update({ can_approve: true })
      .eq('id', id).eq('org_id', orgId).select('id')
    if (error || !data?.length) {
      errores.push(`${antes.full_name}: ${error?.message ?? 'no se pudo guardar'}`)
      continue
    }
    await logAudit({
      orgId, actorId, actorName,
      action: 'config_changed', entityType: 'user', entityId: id,
      entityLabel: antes.full_name ?? id,
      oldValue: { can_approve: antes.can_approve },
      newValue: { can_approve: true },
    })
    ok++
  }
  revalidatePath('/admin/employees')
  return { ok, errores }
}

// El navegador NO es fuente de verdad: se vuelve a resolver y validar todo acá.
// Sin transacción que abarque las filas: cada una se escribe por su cuenta y es
// idempotente — volver a subir la misma planilla deja el mismo estado (spec).
export async function cargarPlanillaAlta(filas: FilaPlanilla[]) {
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()
  const admin = createAdminClient()
  const { personas, centros } = await datosParaPlanilla()
  const resueltas = resolverPlanilla(filas, personas, centros)

  const fallidas: { fila: number; nombre: string; motivo: string }[] = []
  let creadas = 0, actualizadas = 0

  for (const r of resueltas) {
    const quien = r.persona?.nombre ?? r.nuevo?.nombre ?? `fila ${r.fila}`
    if (r.errores.length) {
      fallidas.push({ fila: r.fila, nombre: quien, motivo: r.errores.join('. ') })
      continue
    }
    if (r.accion === 'ninguna') continue

    try {
      if (r.accion === 'crear' && r.nuevo) {
        const { data: creado, error: errAuth } = await admin.auth.admin.createUser({
          email: r.nuevo.correo, email_confirm: false,
        })
        if (errAuth || !creado?.user) {
          throw new Error(errAuth?.message ?? 'no se pudo crear la cuenta')
        }

        const { error: errFila } = await admin.from('users').insert({
          id: creado.user.id, org_id: orgId,
          full_name: r.nuevo.nombre,
          role: r.parche.role ?? 'employee',
          can_submit: true,
          ...r.parche,
          rut: r.nuevo.rut,
        })
        if (errFila) {
          // Sin esto queda una cuenta de Auth sin perfil, que nadie puede
          // arreglar desde la app.
          await admin.auth.admin.deleteUser(creado.user.id)
          throw new Error(errFila.message)
        }
        await logAudit({
          orgId, actorId, actorName,
          action: 'created', entityType: 'user', entityId: creado.user.id,
          entityLabel: r.nuevo.nombre,
          newValue: { ...r.nuevo, ...r.parche },
        })
        creadas++
        continue
      }

      const persona = r.persona
      if (!persona) continue

      if (Object.keys(r.parche).length > 0) {
        const { data, error } = await supabase
          .from('users').update(r.parche)
          .eq('id', persona.id).eq('org_id', orgId).select('id')
        if (error || !data?.length) throw new Error(error?.message ?? 'no se pudo guardar')
      }
      if (r.correoNuevo) {
        const { error } = await admin.auth.admin.updateUserById(
          persona.id, { email: r.correoNuevo, email_confirm: true })
        if (error) throw new Error(`correo: ${error.message}`)
      }
      await logAudit({
        orgId, actorId, actorName,
        action: 'config_changed', entityType: 'user', entityId: persona.id,
        entityLabel: quien,
        oldValue: { correo: persona.correo, rut: persona.rut },
        newValue: { ...r.parche, ...(r.correoNuevo ? { correo: r.correoNuevo } : {}) },
      })
      actualizadas++
    } catch (e) {
      fallidas.push({
        fila: r.fila, nombre: quien,
        motivo: e instanceof Error ? e.message : String(e),
      })
    }
  }

  revalidatePath('/admin/employees')
  return { creadas, actualizadas, fallidas }
}
