'use server'

// Las vistas guardadas del admin: combinaciones de filtros con nombre.
//
// Son de la ORGANIZACIÓN, no de cada persona (decisión de Daniel, 2026-10-08):
// lo que se arma para exportar a Defontana le sirve a cualquiera que tenga que
// hacerlo, y si entra otro administrador encuentra el trabajo hecho.
//
// La lee cualquier miembro; la escribe solo el admin. Lo impone la RLS de la
// migración 040, y también estas funciones: una acción del servidor la puede
// llamar cualquiera con sesión.
//
// Las reglas puras (depurar, comparar, validar el nombre) están en
// `src/lib/filtros/vistas.ts`, con pruebas.

import { createClient } from '@/lib/supabase/server'
import { getAuthProfile } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { erroresDeNombre, type Vista } from '@/lib/filtros/vistas'
import type { Valores } from '@/lib/filtros/dimensiones'

/** Las cuatro pantallas del admin que filtran. */
export type Pantalla = 'rendiciones' | 'informes' | 'auditoria' | 'empleados'

async function exigirAdmin() {
  const perfil = await getAuthProfile()
  if (!perfil || perfil.role !== 'admin') throw new Error('Acceso restringido a administradores')
  return perfil
}

/**
 * Las vistas de una pantalla. **No depura nada**: para saber qué opción ya no
 * existe hace falta la lista de dimensiones, que solo la pantalla conoce. Ella
 * llama a `depurarVista` al leerlas.
 */
export async function listarVistas(pantalla: Pantalla): Promise<Vista[]> {
  const perfil = await getAuthProfile()
  if (!perfil) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('vistas_filtro')
    .select('id, nombre, filtro, orden, de_fabrica')
    .eq('org_id', perfil.org_id)
    .eq('pantalla', pantalla)
    .order('orden')
    .order('nombre')

  return (data ?? []).map(v => ({
    id:         v.id,
    nombre:     v.nombre,
    filtro:     (v.filtro ?? {}) as Valores,
    orden:      v.orden,
    de_fabrica: v.de_fabrica,
  }))
}

/**
 * Devuelve los errores en vez de lanzarlos: un nombre repetido es esperable, y
 * Next redacta en producción el mensaje de lo que se lanza.
 */
export async function crearVista(
  pantalla: Pantalla, nombre: string, filtro: Valores,
): Promise<{ id?: string; errores?: string[] }> {
  const perfil = await exigirAdmin()
  const supabase = await createClient()

  const existentes = (await listarVistas(pantalla)).map(v => v.nombre)
  const errores = erroresDeNombre(nombre, existentes)
  if (errores.length) return { errores }

  const { data: ultima } = await supabase
    .from('vistas_filtro')
    .select('orden')
    .eq('org_id', perfil.org_id).eq('pantalla', pantalla)
    .order('orden', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await supabase
    .from('vistas_filtro')
    .insert({
      org_id: perfil.org_id,
      pantalla,
      nombre: nombre.trim(),
      filtro: filtro as never,
      orden: (ultima?.orden ?? -1) + 1,
      creada_por: perfil.id,
    })
    .select('id')
    .single()

  if (error) {
    // El índice único de la base, por si dos admins guardan a la vez: el
    // chequeo de arriba mira una foto de hace un instante.
    if (/duplicate|unique/i.test(error.message)) {
      return { errores: [`Ya existe una vista que se llama «${nombre.trim()}»`] }
    }
    return { errores: [error.message] }
  }

  await logAudit({
    orgId: perfil.org_id, actorId: perfil.id, actorName: perfil.full_name,
    action: 'created', entityType: 'vista_filtro', entityId: data.id,
    entityLabel: `${pantalla} · ${nombre.trim()}`,
    newValue: { filtro: filtro as Record<string, unknown> },
  })

  return { id: data.id }
}

/**
 * Renombrar o reescribir el filtro de una vista. Guardar encima de una vista
 * existente **nunca es lo que pasa por omisión** (spec §5.5): la pantalla lo
 * ofrece como una acción aparte, para que una vista de la empresa no cambie
 * porque alguien estaba revisando.
 */
export async function actualizarVista(
  id: string, cambios: { nombre?: string; filtro?: Valores },
): Promise<{ errores?: string[] }> {
  const perfil = await exigirAdmin()
  const supabase = await createClient()

  const { data: antes } = await supabase
    .from('vistas_filtro')
    .select('nombre, pantalla, filtro')
    .eq('id', id).eq('org_id', perfil.org_id)
    .maybeSingle()
  if (!antes) return { errores: ['No se encontró la vista'] }

  const patch: { nombre?: string; filtro?: never } = {}

  if (cambios.nombre !== undefined) {
    const otras = (await listarVistas(antes.pantalla as Pantalla))
      .map(v => v.nombre).filter(n => n !== antes.nombre)
    const errores = erroresDeNombre(cambios.nombre, otras, antes.nombre)
    if (errores.length) return { errores }
    patch.nombre = cambios.nombre.trim()
  }
  if (cambios.filtro !== undefined) patch.filtro = cambios.filtro as never

  if (Object.keys(patch).length === 0) return {}

  // `.eq('org_id')` además del id: el id viene del navegador.
  const { data, error } = await supabase
    .from('vistas_filtro').update(patch)
    .eq('id', id).eq('org_id', perfil.org_id)
    .select('id')
  if (error) return { errores: [error.message] }
  if (!data?.length) return { errores: ['No se pudo guardar la vista'] }

  await logAudit({
    orgId: perfil.org_id, actorId: perfil.id, actorName: perfil.full_name,
    action: 'updated', entityType: 'vista_filtro', entityId: id,
    entityLabel: `${antes.pantalla} · ${antes.nombre}`,
    oldValue: { nombre: antes.nombre, filtro: antes.filtro as Record<string, unknown> },
    newValue: patch as Record<string, unknown>,
  })

  return {}
}

/**
 * Borrar una vista. **También las de fábrica**: son de la empresa y la empresa
 * decide. La marca `de_fabrica` existe para distinguirlas en la auditoría, no
 * para protegerlas.
 */
export async function borrarVista(id: string): Promise<{ error?: string }> {
  const perfil = await exigirAdmin()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('vistas_filtro').delete()
    .eq('id', id).eq('org_id', perfil.org_id)
    .select('id, nombre, pantalla, de_fabrica')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'No se encontró la vista' }

  await logAudit({
    orgId: perfil.org_id, actorId: perfil.id, actorName: perfil.full_name,
    action: 'deleted', entityType: 'vista_filtro', entityId: id,
    entityLabel: `${data[0].pantalla} · ${data[0].nombre}`,
    notes: data[0].de_fabrica ? 'Era una vista de fábrica' : undefined,
  })

  return {}
}

/** El orden de las pestañas. Llega la lista entera, en el orden que queda. */
export async function reordenarVistas(pantalla: Pantalla, ids: string[]): Promise<{ error?: string }> {
  const perfil = await exigirAdmin()
  const supabase = await createClient()

  for (const [i, id] of ids.entries()) {
    const { error } = await supabase
      .from('vistas_filtro').update({ orden: i })
      .eq('id', id).eq('org_id', perfil.org_id).eq('pantalla', pantalla)
    if (error) return { error: error.message }
  }

  await logAudit({
    orgId: perfil.org_id, actorId: perfil.id, actorName: perfil.full_name,
    action: 'updated', entityType: 'vista_filtro', entityId: pantalla,
    entityLabel: `Orden de las vistas de ${pantalla}`,
    newValue: { orden: ids },
  })

  return {}
}
