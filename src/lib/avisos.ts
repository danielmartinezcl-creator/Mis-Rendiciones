// Avisos: una notificación en la app + un correo, a las mismas personas.
//
// Módulo de servidor común, NO 'use server': antes vivía en
// src/actions/notifications.ts y cada `notify*` exportada era una acción del
// servidor que cualquier sesión podía invocar desde el navegador, con el id y el
// actor que quisiera — correos con nuestro remitente a quien la persona eligiera.
// Solo lo importan acciones del servidor (src/actions/), después de escribir.

import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { destinatarios, type Paso, type Persona } from '@/lib/permisos'
import { contextoRendicion, contextoFondo } from '@/lib/contexto-permisos'
import { escaparHtml, claveAvisoSinAprobador, destinatariosResultadoFondo } from '@/lib/avisos-helpers'
import { correoDeRecordatorios, filaDeRecordatorio, type Recordatorio } from '@/lib/recordatorios'

// Solo envía si Resend está configurado
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

// Busca emails reales en auth.users con la llave de servicio.
// Una llamada por usuario en paralelo — más eficiente que listar todos los usuarios
async function lookupEmails(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return []
  try {
    const admin = createAdminClient()
    const results = await Promise.all(
      userIds.map(id => admin.auth.admin.getUserById(id))
    )
    return results
      .map(r => r.data?.user?.email)
      .filter((e): e is string => !!e)
  } catch {
    return []
  }
}

type TipoAviso =
  | 'submission' | 'approval' | 'rejection' | 'reimbursement'
  | 'bank_load' | 'bank_auth' | 'funds_sent' | 'config_missing'

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? ''
// El nombre ya escapado: solo se usa dentro del HTML del correo
const nombreDe = (personas: Persona[], id: string) =>
  escaparHtml(personas.find(p => p.id === id)?.nombre ?? 'un empleado')
const nombrePlano = (personas: Persona[], id: string) =>
  personas.find(p => p.id === id)?.nombre ?? 'un empleado'

async function avisar(opts: {
  orgId:     string
  userIds:   string[]
  tipo:      TipoAviso
  reportId?: string
  fundId?:   string
  asunto:    string
  html:      string
}) {
  const ids = [...new Set(opts.userIds)]
  if (!ids.length) return
  const admin = createAdminClient()
  const { error } = await admin.from('notifications').insert(ids.map(id => ({
    org_id:    opts.orgId,
    user_id:   id,
    type:      opts.tipo,
    report_id: opts.reportId ?? null,
    fund_id:   opts.fundId ?? null,
    read:      false,
  })))
  if (error) console.error('[avisos] no se pudo guardar la notificación', opts.tipo, error)
  await trySendEmail(await lookupEmails(ids), opts.asunto, opts.html)
}

// ── Rendiciones ───────────────────────────────────────────────────────────────

// Le toca a la cadena: N1 (o solo su suplente, si está vigente) o N2.
export async function notifyReportApprovers(reportId: string, paso: 'decidir_l1' | 'decidir_l2', actorId: string) {
  const { reporte, personas, doc } = await contextoRendicion(reportId)
  const quien = nombreDe(personas, reporte.submitter_id)
  const plano = nombrePlano(personas, reporte.submitter_id)
  const n2    = paso === 'decidir_l2'
  await avisar({
    orgId:    reporte.org_id,
    userIds:  destinatarios(paso, doc, personas, [actorId]),
    tipo:     'submission',
    reportId,
    asunto:   n2 ? `Revisión N2 — rendición de ${plano}: ${reporte.title}` : `Aprobar rendición de ${plano}: ${reporte.title}`,
    html:     `<p>${n2
      ? `La rendición de <strong>${quien}</strong> fue aprobada en nivel 1 y requiere tu revisión final.`
      : `<strong>${quien}</strong> envió una rendición que requiere tu aprobación.`}</p>
     <p><a href="${appUrl()}/approvals/${reportId}">Revisar rendición →</a></p>`,
  })
}

export async function notifyReportBankStep(reportId: string, paso: 'cargar_pago' | 'autorizar_pago', actorId: string) {
  const { reporte, personas, doc } = await contextoRendicion(reportId)
  const quien  = nombreDe(personas, reporte.submitter_id)
  const plano  = nombrePlano(personas, reporte.submitter_id)
  const cargar = paso === 'cargar_pago'
  await avisar({
    orgId:    reporte.org_id,
    userIds:  destinatarios(paso, doc, personas, [actorId]),
    tipo:     cargar ? 'bank_load' : 'bank_auth',
    reportId,
    asunto:   cargar
      ? `Cargar reembolso — rendición de ${plano}: ${reporte.title}`
      : `Autorizar transferencia — rendición de ${plano}: ${reporte.title}`,
    html:     `<p>${cargar
      ? `La rendición de <strong>${quien}</strong> fue aprobada: falta cargar el reembolso en el banco.`
      : `El reembolso de la rendición de <strong>${quien}</strong> está cargado en el banco y espera tu autorización.`}</p>
     <p><a href="${appUrl()}/banco">Ir a la cola bancaria →</a></p>`,
  })
}

export async function notifySubmitterOfDecision(reportId: string, action: 'approved' | 'rejected' | 'partially_approved') {
  const { reporte } = await contextoRendicion(reportId)
  const asuntos = {
    approved:           `Rendición aprobada — ${reporte.title}`,
    rejected:           `Rendición rechazada — ${reporte.title}`,
    partially_approved: `Rendición aprobada parcialmente — ${reporte.title}`,
  }
  const cuerpos = {
    approved:           'Tu rendición fue aprobada. En breve se procesará el reembolso.',
    rejected:           'Tu rendición fue rechazada. Revisá los motivos y corrígela si corresponde.',
    partially_approved: 'Tu rendición fue aprobada parcialmente. Algunos ítems fueron rechazados.',
  }
  await avisar({
    orgId:    reporte.org_id,
    userIds:  [reporte.submitter_id],
    tipo:     action === 'rejected' ? 'rejection' : 'approval',
    reportId,
    asunto:   asuntos[action],
    html:     `<p>${cuerpos[action]}</p>
     <p><a href="${appUrl()}/expenses/${reportId}">Ver detalle →</a></p>`,
  })
}

export async function notifySubmitterOfReimbursement(reportId: string) {
  const { reporte } = await contextoRendicion(reportId)
  await avisar({
    orgId:    reporte.org_id,
    userIds:  [reporte.submitter_id],
    tipo:     'reimbursement',
    reportId,
    asunto:   `Reembolso procesado — ${reporte.title}`,
    html:     `<p>Tu reembolso fue autorizado y procesado. El dinero debería aparecer en tu cuenta bancaria en breve.</p>
     <p><a href="${appUrl()}/expenses/${reportId}">Ver rendición →</a></p>`,
  })
}

// El admin configura, no aprueba (D1): cuando alguien no puede enviar porque no
// tiene aprobador, al admin le llega el aviso para asignarlo. Una vez por día y
// por empleado: la persona puede reintentar el envío diez veces seguidas, y
// antes cada intento era un correo nuevo a todos los admins.
export async function notifyAdminsMissingApprover(
  orgId: string, empleadoNombre: string, que: 'una rendición' | 'un fondo' | 'una liquidación',
) {
  const admin = createAdminClient()
  const { data: admins, error } = await admin
    .from('users').select('id').eq('org_id', orgId).eq('role', 'admin').eq('is_active', true)
  if (error) { console.error('[avisos] no se pudo leer los admins', error); return }
  if (!admins?.length) return

  // La repetida del día choca con el índice único (org_id, dedup_key) y no se
  // inserta; `.select` devuelve solo las filas nuevas, y solo ellas reciben correo.
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: nuevas, error: insError } = await admin
    .from('notifications')
    .upsert(admins.map(a => ({
      org_id:    orgId,
      user_id:   a.id,
      type:      'config_missing' as const,
      read:      false,
      dedup_key: claveAvisoSinAprobador(empleadoNombre, hoy, a.id),
    })), { onConflict: 'org_id,dedup_key', ignoreDuplicates: true })
    .select('user_id')

  // Si la notificación no se pudo guardar, el correo igual sale: es el único
  // camino por el que el admin se entera de que alguien no puede enviar.
  const ids = insError ? admins.map(a => a.id) : (nuevas ?? []).map(n => n.user_id)
  if (insError) console.error('[avisos] no se pudo guardar el aviso de configuración', insError)
  if (!ids.length) return

  const nombre = escaparHtml(empleadoNombre)
  await trySendEmail(
    await lookupEmails(ids),
    `${empleadoNombre} no tiene aprobador asignado`,
    `<p>Se intentó enviar ${que} de <strong>${nombre}</strong>, pero no tiene aprobador de nivel 1 activo. Asígnale uno en Empleados.</p>
     <p><a href="${appUrl()}/admin/employees">Ir a Empleados →</a></p>`,
  )
}

// ── Fondos ────────────────────────────────────────────────────────────────────

export async function notifyFundStep(fundId: string, paso: Paso, actorId: string) {
  const { fondo, personas, doc } = await contextoFondo(fundId)
  const quien = nombreDe(personas, fondo.employee_id)
  const plano = nombrePlano(personas, fondo.employee_id)
  const liq   = doc.tipo === 'liquidacion'
  const textos: Record<Paso, { tipo: TipoAviso; asunto: string; cuerpo: string }> = {
    decidir_l1: {
      tipo:   'submission',
      asunto: liq ? `Revisar liquidación de ${plano}: ${fondo.name}` : `Aprobar fondo de ${plano}: ${fondo.name}`,
      cuerpo: liq
        ? `<strong>${quien}</strong> envió la liquidación del fondo y requiere tu revisión.`
        : `El fondo de <strong>${quien}</strong> requiere tu aprobación.`,
    },
    decidir_l2: {
      tipo:   'submission',
      asunto: liq ? `Revisión N2 — liquidación de ${plano}: ${fondo.name}` : `Revisión N2 — fondo de ${plano}: ${fondo.name}`,
      cuerpo: `Fue aprobado en nivel 1 y requiere tu revisión final.`,
    },
    cargar_pago: {
      tipo:   'bank_load',
      asunto: `Cargar fondo — ${plano}: ${fondo.name}`,
      cuerpo: `El fondo de <strong>${quien}</strong> fue aprobado: falta cargar la transferencia en el banco.`,
    },
    autorizar_pago: {
      tipo:   'bank_auth',
      asunto: `Autorizar transferencia — fondo de ${plano}: ${fondo.name}`,
      cuerpo: `La transferencia del fondo de <strong>${quien}</strong> está cargada y espera tu autorización.`,
    },
  }
  const t = textos[paso]
  await avisar({
    orgId:   fondo.org_id,
    userIds: destinatarios(paso, doc, personas, [actorId]),
    tipo:    t.tipo,
    fundId,
    asunto:  t.asunto,
    html:    `<p>${t.cuerpo}</p>
     <p><a href="${appUrl()}/petty-cash/${fundId}">Ver fondo →</a></p>`,
  })
}

// Resultados que solo informan (destinatariosResultadoFondo: spec §4).
export async function notifyFundOutcome(fundId: string, resultado: 'rejected' | 'funds_sent' | 'settled', actorId: string) {
  const { fondo } = await contextoFondo(fundId)
  const textos = {
    rejected:   { tipo: 'rejection' as const,  asunto: `Fondo rechazado — ${fondo.name}`,   cuerpo: 'El fondo fue rechazado. Revisa el motivo en la app.' },
    funds_sent: { tipo: 'funds_sent' as const, asunto: `Fondos enviados — ${fondo.name}`,   cuerpo: 'La transferencia fue autorizada: los fondos ya están disponibles.' },
    settled:    { tipo: 'approval' as const,   asunto: `Liquidación aprobada — ${fondo.name}`, cuerpo: 'La liquidación del fondo fue aprobada.' },
  }
  const t = textos[resultado]
  await avisar({
    orgId:   fondo.org_id,
    userIds: destinatariosResultadoFondo(resultado, fondo.manager_id, fondo.employee_id, actorId),
    tipo:    t.tipo,
    fundId,
    asunto:  t.asunto,
    html:    `<p>${t.cuerpo}</p>
     <p><a href="${appUrl()}/petty-cash/${fundId}">Ver fondo →</a></p>`,
  })
}

// ── Recordatorios (cron diario) ───────────────────────────────────────────────

// Una fila por documento y persona, y un correo por persona con todo lo suyo.
// La repetida choca con el índice único (org_id, dedup_key) y no entra; `.select`
// devuelve solo las nuevas, y solo ellas van al correo: correr el cron dos veces
// el mismo día no manda nada dos veces.
export async function enviarRecordatorios(recordatorios: Recordatorio[]): Promise<{ nuevos: number; personas: number }> {
  if (!recordatorios.length) return { nuevos: 0, personas: 0 }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('notifications')
    .upsert(recordatorios.map(filaDeRecordatorio), { onConflict: 'org_id,dedup_key', ignoreDuplicates: true })
    .select('org_id, dedup_key')
  // Sin la fila no queda registro de que ya se recordó: mejor ningún correo que
  // el mismo todos los días. El cron lo reporta como falla.
  if (error) throw new Error(`No se pudieron guardar los recordatorios: ${error.message}`)

  const nuevas = new Set((data ?? []).map(n => `${n.org_id}:${n.dedup_key}`))
  const porPersona = new Map<string, Recordatorio[]>()
  for (const r of recordatorios) {
    if (nuevas.has(`${r.orgId}:${r.clave}`)) porPersona.set(r.userId, [...(porPersona.get(r.userId) ?? []), r])
  }

  let primero = true
  for (const [userId, suyos] of porPersona) {
    // Resend acepta 2 envíos por segundo; trySendEmail se traga el rechazo y el
    // correo se perdería, porque la fila ya quedó guardada.
    if (!primero) await new Promise(r => setTimeout(r, 600))
    primero = false
    const { asunto, html } = correoDeRecordatorios(suyos, appUrl())
    await trySendEmail(await lookupEmails([userId]), asunto, html)
  }
  return { nuevos: nuevas.size, personas: porPersona.size }
}
