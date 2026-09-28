// «Adjuntos de respaldo» de una rendición o un fondo: tabla `approval_attachments`,
// bucket `approval-attachments`. Reglas (Daniel, 2026-09-25):
//
//   · Ver y subir: quien ve el documento. Eso ya lo decide la RLS de
//     `expense_reports` / `petty_cash_funds`, y no se repite acá: el servidor lee
//     el documento con la sesión y, si no lo encuentra, para esa persona no existe.
//   · Borrar: solo quien lo subió, y solo mientras nadie haya dado un paso en el
//     documento después de la subida. Lo que alguien tuvo a la vista al aprobar,
//     rechazar o pagar queda en el registro; el admin tampoco lo borra.
//
// Las usan src/actions/approval-attachments.ts, que escribe con la llave de
// servicio (desde la migración 037 ninguna sesión escribe en la tabla ni toca el
// bucket), y la pantalla, para ofrecer el borrado solo a quien lo tiene permitido.

export const RESPALDO_SIN_DESTINO   = 'Debe especificar una rendición o un fondo'
export const RESPALDO_DOBLE_DESTINO = 'Solo se puede vincular a una rendición o un fondo, no ambos'
export const RESPALDO_EN_PAPELERA   = 'No se pueden agregar respaldos a un documento en la papelera'
export const RESPALDO_AJENO         = 'Solo quien subió este respaldo puede eliminarlo'
export const RESPALDO_FIRME         = 'Este respaldo ya es parte del registro: alguien actuó sobre el documento después de que se subió'

export type DestinoRespaldo = { tipo: 'rendicion' | 'fondo'; id: string }

type Resultado = { ok: true } | { ok: false; motivo: string }

// La base exige exactamente uno de los dos (chk_one_target)
export function destinoDelRespaldo(reportId: string | null, fundId: string | null): DestinoRespaldo {
  if (reportId && fundId) throw new Error(RESPALDO_DOBLE_DESTINO)
  if (reportId) return { tipo: 'rendicion', id: reportId }
  if (fundId)   return { tipo: 'fondo', id: fundId }
  throw new Error(RESPALDO_SIN_DESTINO)
}

export function puedeSubirRespaldo(doc: { deleted_at: string | null }): Resultado {
  return doc.deleted_at ? { ok: false, motivo: RESPALDO_EN_PAPELERA } : { ok: true }
}

/**
 * `pasos`: las fechas del historial del documento. En un fondo, las de
 * `petty_cash_approvals`, donde ya queda todo (envío, decisiones, banco,
 * liquidación). En una rendición, las de `expense_report_approvals` más
 * `submitted_at`: el envío no queda en ese historial, y sin él quien rinde
 * podría retirar un respaldo mientras el N1 lo está mirando.
 */
export function puedeBorrarRespaldo(
  respaldo: { uploaded_by: string | null; created_at: string },
  pasos: (string | null)[],
  userId: string,
): Resultado {
  if (respaldo.uploaded_by !== userId) return { ok: false, motivo: RESPALDO_AJENO }

  // Un paso cuenta salvo que conste que fue ANTES de la subida: en el mismo
  // instante, o con una fecha ilegible, el respaldo se queda. Es evidencia, y
  // ante la duda no se borra.
  const subido = Date.parse(respaldo.created_at)
  const huboPasoDespues = pasos.some(p => p !== null && !(Date.parse(p) < subido))
  return huboPasoDespues ? { ok: false, motivo: RESPALDO_FIRME } : { ok: true }
}
