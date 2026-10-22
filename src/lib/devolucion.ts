/**
 * Qué marcas por ítem viajan cuando se devuelve una rendición para corregir.
 *
 * Son dos reglas chicas y ninguna de las dos es obvia, así que viven acá con
 * sus pruebas en vez de sueltas en el componente de la bandeja.
 */

export type MarcaItem = { action: 'approve' | 'reject' | null; reason: string }

export type ItemDecidido = { itemId: string; action: 'approve' | 'reject'; reason?: string }

export type MarcasAlDevolver =
  | { ok: true;  payload: ItemDecidido[] }
  | { ok: false; motivo: string }

/**
 * **Solo viajan los ítems ya marcados, al revés que una decisión final.** Al
 * enviar una decisión hay que haber juzgado todos (si no, los que quedan en
 * `pending` se quedan así para siempre y la rendición avanza igual). Devolver es
 * justo el caso contrario: sirve para cuando NO se pudo terminar de juzgar
 * —«falta un dato», «especificá los EPP»—, así que exigir el juicio completo lo
 * volvería inútil. Lo que quede pendiente se decide cuando la reenvíen.
 *
 * **Un ítem marcado rechazado necesita motivo, igual que en una decisión.** Acá
 * la razón es más fuerte: las marcas se conservan, así que al reenviar ese ítem
 * ya no está `pending` y `submitApprovalDecision` no lo vuelve a preguntar.
 * Sobreviviría como un «no» sin ninguna explicación, y quien rindió no tendría
 * forma de saber qué arreglar.
 */
export function marcasAlDevolver(decisions: Record<string, MarcaItem>): MarcasAlDevolver {
  const sinMotivo = Object.values(decisions).filter(d => d.action === 'reject' && !d.reason.trim())
  if (sinMotivo.length) {
    return {
      ok: false,
      motivo: sinMotivo.length === 1
        ? 'El ítem que marcaste rechazado necesita un motivo'
        : `Los ${sinMotivo.length} ítems que marcaste rechazados necesitan un motivo`,
    }
  }

  return {
    ok: true,
    payload: Object.entries(decisions)
      .filter(([, d]) => d.action !== null)
      .map(([itemId, d]) => ({
        itemId,
        action: d.action as 'approve' | 'reject',
        // `undefined` y no '': la columna es nullable y un texto vacío no es un motivo
        reason: d.reason.trim() || undefined,
      })),
  }
}
