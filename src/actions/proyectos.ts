'use server'

// El catálogo de obras no se carga: se arma con el uso. La primera vez que
// alguien rinde al 2991 le pone nombre y jefe, y desde ahí los demás lo
// encuentran escrito igual. Por eso no hay pantalla de alta en ningún lado —
// con 150 obras activas y 50 nuevas al año, un catálogo que hay que cargar a
// mano envejece más rápido de lo que se mantiene.
//
// Spec: docs/superpowers/specs/2026-10-07-aprobador-por-proyecto-design.md

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthProfile } from '@/lib/auth'
import { normalizarNumeroProyecto } from '@/lib/cadena-proyecto'

/** Lo que el autocompletado necesita cuando alguien terminó de teclear un número. */
export async function buscarProyecto(numero: string) {
  const perfil = await getAuthProfile()
  if (!perfil) return null

  const n = normalizarNumeroProyecto(numero)
  if (!n) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('proyectos')
    .select('id, numero, nombre, jefe_id, activo')
    .eq('org_id', perfil.org_id)
    .eq('numero', n)
    .maybeSingle()
  return data
}

/**
 * Los jefes que el empleado puede elegir. Nunca los 57: es una lista corta, y
 * que sea corta es parte del control — en una lista de cinco se nota quién
 * aprueba qué, en una de cincuenta y siete no.
 */
export async function jefesDeProyecto() {
  const perfil = await getAuthProfile()
  if (!perfil) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id, full_name')
    .eq('org_id', perfil.org_id)
    .eq('es_jefe_proyecto', true)
    .eq('is_active', true)
    .is('blocked_at', null)
    .is('deleted_at', null)
    .order('full_name')
  return data ?? []
}

/**
 * Devuelve el id del proyecto, creándolo si el número es nuevo.
 *
 * Escribe con la llave de servicio porque crea filas que el empleado no puede
 * insertar por RLS, y **la organización sale del perfil, nunca del navegador**.
 *
 * El `jefeId` SÍ viene del navegador, así que se comprueba contra la base antes
 * de guardarlo: sin esa comprobación, cualquiera podría mandar el id que
 * quisiera y dejar a un cómplice como aprobador de su propia obra. Una acción
 * del servidor recibe lo que el cliente mande, no lo que el formulario mostró.
 */
export async function resolverOCrearProyecto(
  numero: string,
  nombre: string | null,
  jefeId: string | null,
): Promise<string> {
  const perfil = await getAuthProfile()
  if (!perfil) throw new Error('Sesión no encontrada')

  const n = normalizarNumeroProyecto(numero)
  if (!n) throw new Error('El número de proyecto no puede estar vacío')

  const admin = createAdminClient()

  let jefeValido: string | null = null
  if (jefeId) {
    const { data: jefe } = await admin
      .from('users')
      .select('id')
      .eq('id', jefeId)
      .eq('org_id', perfil.org_id)
      .eq('es_jefe_proyecto', true)
      .eq('is_active', true)
      .is('blocked_at', null)
      .is('deleted_at', null)
      .maybeSingle()
    if (!jefe) throw new Error('Esa persona no está habilitada como jefe de proyecto')
    jefeValido = jefe.id
  }

  const { data: existente } = await admin
    .from('proyectos')
    .select('id, jefe_id')
    .eq('org_id', perfil.org_id)
    .eq('numero', n)
    .maybeSingle()

  if (existente) {
    // Si viene un jefe distinto, se actualiza la sugerencia: apartarse del jefe
    // sugerido es la señal de que la obra cambió de manos. Queda a la vista de
    // quien mire el catálogo, que es la contrapartida de no tener que cargarlo.
    if (jefeValido && jefeValido !== existente.jefe_id) {
      await admin.from('proyectos').update({ jefe_id: jefeValido }).eq('id', existente.id)
    }
    return existente.id
  }

  const { data, error } = await admin
    .from('proyectos')
    .insert({
      org_id:     perfil.org_id,
      numero:     n,
      nombre:     nombre?.trim() || null,
      jefe_id:    jefeValido,
      creado_por: perfil.id,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error('No se pudo registrar el proyecto')
  return data.id
}
