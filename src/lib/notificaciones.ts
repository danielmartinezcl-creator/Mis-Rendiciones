// El texto del aviso flotante que aparece cuando llega una notificación por
// Realtime (RealtimeProvider).
//
// La fila de `notifications` no trae texto: solo el tipo y a qué documento
// apunta. El mensaje se arma acá, en paralelo con los asuntos de los correos de
// src/lib/avisos.ts. Hasta el 2026-09-25 el aviso leía `title` y `body`, dos
// columnas que la tabla nunca tuvo: cada notificación pintaba una caja vacía.

import type { Notification } from '@/lib/supabase/types'

// `type` como string y no como la unión: el payload de Realtime llega de la red
// sin tipar, y la base puede sumar un tipo antes que types.ts.
type FilaNotificacion = Pick<Notification, 'report_id' | 'fund_id'> & { type: string }

// Un texto para cualquier documento, o uno por cada clase de documento.
type Textos = string | { rendicion: string; fondo: string }

// Record sobre la unión de types.ts: si se suma un tipo, esto no compila hasta
// que tenga su texto.
const TEXTOS: Record<Notification['type'], Textos> = {
  submission: {
    rendicion: 'Una rendición espera tu aprobación.',
    fondo:     'Un fondo de caja chica espera tu aprobación.',
  },
  approval: {
    rendicion: 'Tu rendición fue aprobada.',
    fondo:     'La liquidación de un fondo de caja chica fue aprobada.',
  },
  rejection: {
    rendicion: 'Tu rendición fue rechazada.',
    fondo:     'Un fondo de caja chica fue rechazado.',
  },
  reimbursement: 'Tu reembolso fue autorizado y procesado.',
  bank_load: {
    rendicion: 'Hay un reembolso por cargar en el banco.',
    fondo:     'Hay una transferencia de fondo por cargar en el banco.',
  },
  bank_auth: {
    rendicion: 'Un reembolso está cargado y espera tu autorización.',
    fondo:     'Una transferencia de fondo está cargada y espera tu autorización.',
  },
  funds_sent:     'La transferencia fue autorizada: tus fondos ya están disponibles.',
  config_missing: 'Alguien no pudo enviar porque no tiene aprobador. Asígnale uno en Empleados.',
  // Recordatorio del cron (migración 036). Un solo tipo para tres casos —te toca
  // actuar, tu borrador sigue sin enviar, tu fondo tiene poco saldo— y la fila no
  // dice cuál: el texto vale para todos, y el detalle con sus links va en el correo.
  // «Recordatorio:» lo distingue de los avisos de algo que acaba de pasar.
  reminder: {
    rendicion: 'Recordatorio: tienes una rendición pendiente.',
    fondo:     'Recordatorio: un fondo de caja chica necesita tu atención.',
  },
}

// null = no mostrar nada. Un tipo desconocido, o uno que depende del documento
// en una fila que no apunta a ninguno, no se adivina: mejor ningún aviso que uno
// vacío o equivocado.
export function textoNotificacion(n: FilaNotificacion): string | null {
  // hasOwn y no `in`: un `type` como "constructor" encontraría el prototipo
  if (!Object.hasOwn(TEXTOS, n.type)) return null
  const textos = TEXTOS[n.type as Notification['type']]
  if (typeof textos === 'string') return textos
  if (n.fund_id)   return textos.fondo
  if (n.report_id) return textos.rendicion
  return null
}
