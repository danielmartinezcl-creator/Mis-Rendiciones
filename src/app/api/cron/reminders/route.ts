import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cargarPersonas, contextoFondo, contextoRendicion } from '@/lib/contexto-permisos'
import { enviarRecordatorios } from '@/lib/avisos'
import { estadosQueEsperan, type Persona } from '@/lib/permisos'
import {
  tanda, diasEsperando, esperandoDesde, recordatoriosDePaso, recordatoriosDeBorrador, recordatoriosDeSaldo,
  UMBRAL_DIAS, CADA_DIAS, type Recordatorio,
} from '@/lib/recordatorios'
import type { ReportStatus } from '@/lib/constants'
import type { FundStatus, PettyCashItem, PettyCashTransfer } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

// Recordatorios de lunes a viernes (vercel.json). Qué recordar y a quién lo
// deciden las funciones puras de src/lib/recordatorios.ts; acá solo se lee la
// base y se le entrega el resultado a avisos.ts.

// Vercel firma cada llamada del cron con `Authorization: Bearer $CRON_SECRET`,
// pero solo si la variable existe en el proyecto. Hasta el 2026-09-25 no
// existía: el cron respondía 401 todos los días sin llegar nunca a la base.
function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

type Historial = { created_at: string }[]

type FilaReporte = {
  id: string; org_id: string; status: string; title: string
  submitted_at: string | null; updated_at: string; expense_report_approvals: Historial | null
}
type FilaFondo = {
  id: string; org_id: string; status: string; name: string
  updated_at: string; petty_cash_approvals: Historial | null
}
type FilaFondoVivo = {
  id: string; org_id: string; name: string; employee_id: string | null; manager_id: string | null
  amount_approved: number | null
  petty_cash_items:     Pick<PettyCashItem, 'amount_clp' | 'status'>[] | null
  petty_cash_transfers: Pick<PettyCashTransfer, 'type' | 'amount'>[] | null
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const ahora = new Date()
  const recordatorios: Recordatorio[] = []
  const fallas: string[] = []
  // El contexto completo son 4 consultas por documento: antes, descartar lo que hoy no toca
  const toca = (desde: string) => tanda(diasEsperando(desde, ahora), UMBRAL_DIAS, CADA_DIAS) !== null

  // ── Te toca actuar: rendiciones ─────────────────────────────────────────────
  const { data: reportes, error: errReportes } = await admin
    .from('expense_reports')
    .select('id, org_id, status, title, submitted_at, updated_at, expense_report_approvals (created_at)')
    .in('status', estadosQueEsperan('rendicion') as ReportStatus[])
    .eq('is_historical_import', false)
    .is('deleted_at', null)
  if (errReportes) fallas.push(`rendiciones: ${errReportes.message}`)

  for (const r of (reportes ?? []) as unknown as FilaReporte[]) {
    // Cada transición deja su entrada en el historial; el envío, submitted_at.
    // Nunca updated_at: lo mueve también guardar el análisis IA.
    const historial = (r.expense_report_approvals ?? []).map(a => a.created_at)
    const desde = esperandoDesde([r.submitted_at, ...historial]) ?? r.updated_at
    if (!toca(desde)) continue
    try {
      const { reporte, personas, doc } = await contextoRendicion(r.id)
      if (reporte.status !== r.status) continue   // cambió mientras corría el cron
      recordatorios.push(...recordatoriosDePaso(
        { orgId: r.org_id, docId: r.id, estado: r.status, titulo: r.title, desde, doc }, personas, ahora))
    } catch (e) {
      fallas.push(`rendición ${r.id}: ${mensaje(e)}`)
    }
  }

  // ── Te toca actuar: fondos y liquidaciones ──────────────────────────────────
  const estadosFondo = [...estadosQueEsperan('fondo'), ...estadosQueEsperan('liquidacion')]
  const { data: fondos, error: errFondos } = await admin
    .from('petty_cash_funds')
    .select('id, org_id, status, name, updated_at, petty_cash_approvals (created_at)')
    .in('status', estadosFondo as FundStatus[])
    .eq('is_historical_import', false)
    .is('deleted_at', null)
  if (errFondos) fallas.push(`fondos: ${errFondos.message}`)

  for (const f of (fondos ?? []) as unknown as FilaFondo[]) {
    const desde = esperandoDesde((f.petty_cash_approvals ?? []).map(a => a.created_at)) ?? f.updated_at
    if (!toca(desde)) continue
    try {
      const { fondo, personas, doc } = await contextoFondo(f.id)
      if (fondo.status !== f.status) continue
      recordatorios.push(...recordatoriosDePaso(
        { orgId: f.org_id, docId: f.id, estado: f.status, titulo: f.name, desde, doc }, personas, ahora))
    } catch (e) {
      fallas.push(`fondo ${f.id}: ${mensaje(e)}`)
    }
  }

  // Personas de cada organización, para borradores y saldos (los pasos ya traen las suyas)
  const personasPorOrg = new Map<string, Promise<Persona[]>>()
  const personasDe = (orgId: string) => {
    if (!personasPorOrg.has(orgId)) personasPorOrg.set(orgId, cargarPersonas(admin, orgId))
    return personasPorOrg.get(orgId)!
  }

  // ── Borradores sin enviar ───────────────────────────────────────────────────
  const { data: borradores, error: errBorradores } = await admin
    .from('expense_reports')
    .select('id, org_id, title, submitter_id, created_at')
    .eq('status', 'draft')
    .eq('is_historical_import', false)
    .is('deleted_at', null)
  if (errBorradores) fallas.push(`borradores: ${errBorradores.message}`)

  for (const b of borradores ?? []) {
    try {
      recordatorios.push(...recordatoriosDeBorrador(
        { orgId: b.org_id, reportId: b.id, titulo: b.title, userId: b.submitter_id, creado: b.created_at },
        await personasDe(b.org_id), ahora))
    } catch (e) {
      fallas.push(`borrador ${b.id}: ${mensaje(e)}`)
    }
  }

  // ── Fondos vivos con poco saldo ─────────────────────────────────────────────
  const { data: vivos, error: errVivos } = await admin
    .from('petty_cash_funds')
    .select('id, org_id, name, employee_id, manager_id, amount_approved, petty_cash_items (amount_clp, status), petty_cash_transfers (type, amount)')
    .eq('status', 'funds_sent')
    .eq('is_historical_import', false)
    .is('deleted_at', null)
  if (errVivos) fallas.push(`saldos: ${errVivos.message}`)

  for (const f of (vivos ?? []) as unknown as FilaFondoVivo[]) {
    try {
      recordatorios.push(...recordatoriosDeSaldo({
        orgId: f.org_id, fundId: f.id, nombre: f.name,
        beneficiarioId: f.employee_id, managerId: f.manager_id, aprobado: f.amount_approved,
        items: f.petty_cash_items ?? [], transferencias: f.petty_cash_transfers ?? [],
      }, await personasDe(f.org_id)))
    } catch (e) {
      fallas.push(`saldo del fondo ${f.id}: ${mensaje(e)}`)
    }
  }

  // ?simular: qué saldría hoy, sin guardar ni enviar nada. Incluye lo que ya se
  // recordó antes en esta misma tanda, que en la corrida real no se repite.
  if (new URL(req.url).searchParams.has('simular')) {
    const vencidos = await Promise.all(recordatorios.map(async r => ({
      para:  (await personasDe(r.orgId)).find(p => p.id === r.userId)?.nombre ?? r.userId,
      texto: r.texto,
      dias:  r.dias,
      clave: r.clave,
    })))
    return NextResponse.json({ simulacion: true, fecha: ahora.toISOString(), vencidos, fallas })
  }

  // ── Envío ───────────────────────────────────────────────────────────────────
  let enviados = { nuevos: 0, personas: 0 }
  try {
    enviados = await enviarRecordatorios(recordatorios)
  } catch (e) {
    fallas.push(`envío: ${mensaje(e)}`)
  }

  for (const f of fallas) console.error('[cron recordatorios]', f)
  // Lo que se pudo igual salió; el 500 es para que Vercel marque la ejecución como fallida
  return NextResponse.json({
    ok:        fallas.length === 0,
    fecha:     ahora.toISOString(),
    vencidos:  recordatorios.length,
    nuevos:    enviados.nuevos,
    personas:  enviados.personas,
    fallas,
  }, { status: fallas.length ? 500 : 200 })
}
