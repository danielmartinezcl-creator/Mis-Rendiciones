// Qué impide eliminar de verdad un documento de la papelera. Hoy: aparecer en
// un traspaso. Las FK de fund_transfers no tienen ON DELETE, y borrar el
// traspaso desde la papelera de uno sorprendería al otro (Daniel, D2).
// El motivo lo muestra la papelera desde su cargador; la acción lo vuelve a
// exigir como defensa. Módulo común: traspasosDe usa la llave de servicio.

import type { createAdminClient } from '@/lib/supabase/admin'

type ClienteServicio = ReturnType<typeof createAdminClient>

export type FilaTraspaso = {
  payer_report_id: string | null; receiver_report_id: string | null
  payer_fund_id: string | null;   receiver_fund_id: string | null
}

export function traspasosPorDocumento(traspasos: FilaTraspaso[]): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const t of traspasos) {
    for (const id of [t.payer_report_id, t.receiver_report_id, t.payer_fund_id, t.receiver_fund_id]) {
      if (id) mapa.set(id, (mapa.get(id) ?? 0) + 1)
    }
  }
  return mapa
}

export function motivoBloqueoPorTraspasos(tipo: 'rendicion' | 'fondo', traspasos: number): string | null {
  if (traspasos <= 0) return null
  const doc = tipo === 'rendicion' ? 'Esta rendición' : 'Este fondo'
  return traspasos === 1
    ? `${doc} aparece en un traspaso. Elimínalo primero desde Caja chica y vuelve a intentarlo.`
    : `${doc} aparece en ${traspasos} traspasos. Elimínalos primero desde Caja chica y vuelve a intentarlo.`
}

export async function traspasosDe(
  admin: ClienteServicio,
  { tipo, id }: { tipo: 'rendicion' | 'fondo'; id: string },
): Promise<number> {
  const columnas = tipo === 'rendicion'
    ? (['payer_report_id', 'receiver_report_id'] as const)
    : (['payer_fund_id', 'receiver_fund_id'] as const)
  const conteos = await Promise.all(columnas.map(columna =>
    admin.from('fund_transfers').select('id', { count: 'exact', head: true }).eq(columna, id)))
  for (const { error } of conteos) if (error) throw new Error(error.message)
  return conteos.reduce((suma, { count }) => suma + (count ?? 0), 0)
}
