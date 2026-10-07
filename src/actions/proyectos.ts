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
  const jefeValido = await jefeHabilitado(admin, perfil.org_id, jefeId)

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

/**
 * Comprueba que un id que vino del navegador sea de verdad un jefe de proyecto
 * habilitado, activo y de esta organización. Lo usan el alta por uso y la
 * corrección desde admin: una sola regla, escrita una vez.
 */
async function jefeHabilitado(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  jefeId: string | null,
): Promise<string | null> {
  if (!jefeId) return null
  const { data: jefe } = await admin
    .from('users')
    .select('id')
    .eq('id', jefeId)
    .eq('org_id', orgId)
    .eq('es_jefe_proyecto', true)
    .eq('is_active', true)
    .is('blocked_at', null)
    .is('deleted_at', null)
    .maybeSingle()
  if (!jefe) throw new Error('Esa persona no está habilitada como jefe de proyecto')
  return jefe.id
}

async function exigirAdmin() {
  const perfil = await getAuthProfile()
  if (!perfil || perfil.role !== 'admin') throw new Error('Acceso restringido a administradores')
  return perfil
}

interface FilaProyecto {
  id:          string
  numero:      string
  nombre:      string | null
  jefe_id:     string | null
  jefe_nombre: string | null
  activo:      boolean
  documentos:  number
  updated_at:  string
}

/**
 * El catálogo completo, para corregirlo. Con la cantidad de documentos de cada
 * obra: una obra con cero documentos es un número mal tecleado que nadie volvió
 * a usar, y es lo primero que conviene mirar.
 */
export async function listarProyectos(): Promise<FilaProyecto[]> {
  const perfil = await exigirAdmin()
  const admin = createAdminClient()

  const [{ data: proyectos }, { data: reps }, { data: fondos }] = await Promise.all([
    admin.from('proyectos')
      .select('id, numero, nombre, jefe_id, activo, updated_at')
      .eq('org_id', perfil.org_id)
      .order('numero'),
    admin.from('expense_reports').select('proyecto_id')
      .eq('org_id', perfil.org_id).not('proyecto_id', 'is', null).is('deleted_at', null),
    admin.from('petty_cash_funds').select('proyecto_id')
      .eq('org_id', perfil.org_id).not('proyecto_id', 'is', null).is('deleted_at', null),
  ])

  const cuenta = new Map<string, number>()
  for (const r of [...(reps ?? []), ...(fondos ?? [])]) {
    if (r.proyecto_id) cuenta.set(r.proyecto_id, (cuenta.get(r.proyecto_id) ?? 0) + 1)
  }

  const jefeIds = [...new Set((proyectos ?? []).map(p => p.jefe_id).filter(Boolean))] as string[]
  const { data: jefes } = jefeIds.length
    ? await admin.from('users').select('id, full_name').in('id', jefeIds)
    : { data: [] as { id: string; full_name: string }[] }
  const nombreJefe = new Map((jefes ?? []).map(j => [j.id, j.full_name]))

  return (proyectos ?? []).map(p => ({
    ...p,
    jefe_nombre: p.jefe_id ? nombreJefe.get(p.jefe_id) ?? null : null,
    documentos:  cuenta.get(p.id) ?? 0,
  }))
}

/**
 * Corregir una obra: el nombre, el jefe sugerido, o marcarla cerrada. El número
 * no se toca — es lo que la identifica y lo que ya está en los documentos.
 *
 * Cambiar el jefe acá cambia la SUGERENCIA para los documentos nuevos; los ya
 * enviados no se mueven, porque su cadena está congelada.
 */
export async function corregirProyecto(
  id: string,
  cambios: { nombre?: string | null; jefe_id?: string | null; activo?: boolean },
) {
  const perfil = await exigirAdmin()
  const admin = createAdminClient()

  const patch: { nombre?: string | null; jefe_id?: string | null; activo?: boolean } = {}
  if (cambios.nombre !== undefined)  patch.nombre  = cambios.nombre?.trim() || null
  if (cambios.activo !== undefined)  patch.activo  = cambios.activo
  if (cambios.jefe_id !== undefined) patch.jefe_id = await jefeHabilitado(admin, perfil.org_id, cambios.jefe_id)

  // `.eq('org_id')` además del id: el id viene del navegador, y sin esto un
  // admin podría corregir una obra de otra organización conociendo su id.
  const { data, error } = await admin
    .from('proyectos')
    .update(patch)
    .eq('id', id)
    .eq('org_id', perfil.org_id)
    .select('id')
  if (error || !data?.length) throw new Error('No se pudo guardar la corrección')
}
