// Archivos que caen con un borrado de verdad. La cascada de la base se lleva las
// filas de `attachments` (comprobantes) y `approval_attachments` (respaldos),
// pero no los archivos: Storage no tiene llaves foráneas y el archivo queda en el
// bucket sin nada que lo vincule. Ninguna sesión escribe en esos buckets
// (migraciones 035 y 037): se retiran con la llave de servicio.
//
// El orden es el de siempre al borrar un adjunto. Primero se juntan las rutas
// (después la cascada ya se llevó las filas), luego se borra la fila y recién
// entonces se retiran los archivos. Si falla el retiro queda un huérfano que
// nadie ve, nunca una fila sin archivo:
//
//   const archivos = await archivosQueCaen(admin, { tipo: 'rendicion', id })
//   …borrar con .select('id'): si no cayó ninguna fila, no se retira nada
//   await retirarArchivos(admin, archivos, `la rendición ${id}`)
//
// Módulo común, NO 'use server': exportado desde una acción, cualquier sesión
// podría pedir que se retiren las rutas que quisiera.

import type { createAdminClient } from '@/lib/supabase/admin'

type ClienteServicio = ReturnType<typeof createAdminClient>

export const BUCKET_COMPROBANTES = 'expense-attachments'
export const BUCKET_RESPALDOS    = 'approval-attachments'

// Tope de `storage.remove()` por llamada, según la documentación de Supabase
const MAX_RUTAS_POR_LLAMADA = 1000

export type ArchivosPorRetirar = { comprobantes: string[]; respaldos: string[] }

// Un gasto de fondo no arrastra respaldos: son del fondo, que sigue vivo. Un
// traspaso deja un gasto en cada lado, y cada lado es una rendición o un fondo.
export type Borrado = { tipo: 'rendicion' | 'fondo' | 'gasto_fondo' | 'traspaso'; id: string }

type Consulta = PromiseLike<{ data: unknown; error: { message: string } | null }>

async function rutasDeGastos(consulta: Consulta): Promise<string[]> {
  const { data, error } = await consulta
  if (error) throw new Error(error.message)
  return ((data ?? []) as { attachments: { storage_path: string }[] }[])
    .flatMap(gasto => gasto.attachments.map(a => a.storage_path))
}

async function rutasDeRespaldos(consulta: Consulta): Promise<string[]> {
  const { data, error } = await consulta
  if (error) throw new Error(error.message)
  return ((data ?? []) as { storage_path: string }[]).map(r => r.storage_path)
}

/**
 * Las rutas de los archivos que la cascada deja sin fila al borrar `borrado`.
 * Lee con la llave de servicio: la cascada no mira la RLS, así que la lista
 * tampoco. Los comprobantes se piden desde el gasto (sus adjuntos embebidos),
 * con el filtro en la tabla principal: si la consulta sale mal, trae de menos,
 * nunca archivos de otro documento. PostgREST corta en 1000 gastos; una
 * rendición no pasa de unas decenas (26 el 2026-09-28).
 */
export async function archivosQueCaen(admin: ClienteServicio, { tipo, id }: Borrado): Promise<ArchivosPorRetirar> {
  switch (tipo) {
    case 'rendicion': {
      const [comprobantes, respaldos] = await Promise.all([
        rutasDeGastos(admin.from('expense_items').select('attachments(storage_path)').eq('report_id', id)),
        rutasDeRespaldos(admin.from('approval_attachments').select('storage_path').eq('report_id', id)),
      ])
      return { comprobantes, respaldos }
    }
    case 'fondo': {
      const [comprobantes, respaldos] = await Promise.all([
        rutasDeGastos(admin.from('petty_cash_items').select('attachments(storage_path)').eq('fund_id', id)),
        rutasDeRespaldos(admin.from('approval_attachments').select('storage_path').eq('fund_id', id)),
      ])
      return { comprobantes, respaldos }
    }
    case 'gasto_fondo':
      return {
        comprobantes: await rutasDeGastos(admin.from('petty_cash_items').select('attachments(storage_path)').eq('id', id)),
        respaldos:    [],
      }
    case 'traspaso': {
      const [enRendiciones, enFondos] = await Promise.all([
        rutasDeGastos(admin.from('expense_items').select('attachments(storage_path)').eq('transfer_id', id)),
        rutasDeGastos(admin.from('petty_cash_items').select('attachments(storage_path)').eq('transfer_id', id)),
      ])
      return { comprobantes: [...enRendiciones, ...enFondos], respaldos: [] }
    }
  }
}

/**
 * Retira los archivos de a 1000 por llamada. Nunca lanza: corre después de
 * borrar la fila, y un error acá le mostraría a la persona una falla sobre algo
 * que ya se borró. Lo que no sale queda en el registro, con sus rutas.
 */
export async function retirarArchivos(
  admin: ClienteServicio,
  archivos: ArchivosPorRetirar,
  contexto: string,
): Promise<void> {
  const porBucket: [string, string[]][] = [
    [BUCKET_COMPROBANTES, archivos.comprobantes],
    [BUCKET_RESPALDOS,    archivos.respaldos],
  ]
  for (const [bucket, rutas] of porBucket) {
    for (let i = 0; i < rutas.length; i += MAX_RUTAS_POR_LLAMADA) {
      const lote = rutas.slice(i, i + MAX_RUTAS_POR_LLAMADA)
      try {
        const { error } = await admin.storage.from(bucket).remove(lote)
        if (error) throw error
      } catch (error) {
        console.error(`[archivos] se borró ${contexto}, pero no sus archivos de ${bucket}`, lote, error)
      }
    }
  }
}
