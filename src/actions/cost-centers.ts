'use server'

// Los centros de costo: leerlos (cualquiera, para los desplegables) y
// administrarlos (solo admin).
//
// Hasta el 2026-10-08 esto era solo lectura: los 46 de PENTA venían sembrados
// por la migración 012 y agregar uno exigía SQL a mano. Las reglas del código
// —que es el centro de negocios de Defontana y se lee de tres en tres— están
// en `src/lib/centros-costo.ts`, con sus pruebas.

import { createClient } from '@/lib/supabase/server'
import { getAuthProfile } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import type { CostCenter } from '@/lib/supabase/types'
import {
  armarCodigo, erroresDeAlta, sePuedeBorrar, codigoDePadre,
  type AltaCentro,
} from '@/lib/centros-costo'

// Cualquier usuario autenticado puede leer cost_centers (necesario para dropdowns)
export async function getCostCenters(): Promise<CostCenter[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('cost_centers')
    .select('*')
    .eq('activo', true)
    .order('descripcion')
  return data ?? []
}

export async function getImputableCostCenters(): Promise<CostCenter[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('cost_centers')
    .select('*')
    .eq('activo', true)
    .eq('imputable', true)
    .order('descripcion')
  return data ?? []
}

// ── Administración ───────────────────────────────────────────────────────────

async function exigirAdmin() {
  const perfil = await getAuthProfile()
  if (!perfil || perfil.role !== 'admin') throw new Error('Acceso restringido a administradores')
  return perfil
}

export type FilaCentro = {
  id:          string
  descripcion: string
  imputable:   boolean
  activo:      boolean
  /** Fichas de empleado que lo tienen por defecto. */
  personas:    number
  /** Gastos ya imputados: si hay uno, el centro está en la contabilidad. */
  gastos:      number
  /** Centros que cuelgan de él. */
  hijos:       number
}

/**
 * El catálogo completo, **incluidos los inactivos**: esta es la pantalla donde
 * se los vuelve a activar, así que esconderlos los dejaría sin puerta.
 *
 * Trae lo que impide borrar cada uno. No hace falta filtrar los gastos por
 * organización: `cost_centers.id` es clave primaria global (migración 016), así
 * que un gasto que nombra este código es necesariamente de esta organización.
 */
export async function listarCentrosCosto(): Promise<FilaCentro[]> {
  const perfil = await exigirAdmin()
  const supabase = await createClient()

  const [centros, usuarios, items] = await Promise.all([
    supabase.from('cost_centers')
      .select('id, descripcion, imputable, activo')
      .eq('org_id', perfil.org_id)
      .order('id'),
    supabase.from('users')
      .select('cost_center_id')
      .eq('org_id', perfil.org_id)
      .not('cost_center_id', 'is', null),
    supabase.from('expense_items')
      .select('cost_center_id')
      .eq('org_id', perfil.org_id)
      .not('cost_center_id', 'is', null),
  ])
  if (centros.error) throw new Error(centros.error.message)

  const contar = (filas: { cost_center_id: string | null }[] | null) => {
    const m = new Map<string, number>()
    for (const f of filas ?? []) {
      if (f.cost_center_id) m.set(f.cost_center_id, (m.get(f.cost_center_id) ?? 0) + 1)
    }
    return m
  }
  const porPersona = contar(usuarios.data)
  const porGasto   = contar(items.data)

  const hijos = new Map<string, number>()
  for (const c of centros.data ?? []) {
    const padre = codigoDePadre(c.id)
    if (padre) hijos.set(padre, (hijos.get(padre) ?? 0) + 1)
  }

  return (centros.data ?? []).map(c => ({
    id:          c.id,
    descripcion: c.descripcion ?? '',
    imputable:   c.imputable,
    activo:      c.activo,
    personas:    porPersona.get(c.id) ?? 0,
    gastos:      porGasto.get(c.id)   ?? 0,
    hijos:       hijos.get(c.id)      ?? 0,
  }))
}

/**
 * Crear un centro. El código lo arma el servidor con el padre y las tres letras
 * —nunca lo recibe entero— y las reglas se vuelven a aplicar acá: la vista
 * previa del navegador no es fuente de verdad.
 *
 * Devuelve los errores en vez de lanzarlos: un código repetido es esperable, y
 * Next redacta en producción el mensaje de lo que se lanza.
 */
export async function crearCentroCosto(
  alta: AltaCentro & { imputable: boolean },
): Promise<{ id?: string; errores?: string[] }> {
  const perfil = await exigirAdmin()
  const supabase = await createClient()

  const { data: existentes, error: errLectura } = await supabase
    .from('cost_centers')
    .select('id, descripcion')
    .eq('org_id', perfil.org_id)
  if (errLectura) return { errores: [errLectura.message] }

  const errores = erroresDeAlta(alta, existentes ?? [])
  if (errores.length) return { errores }

  const id = armarCodigo(alta.padre, alta.sufijo)
  const descripcion = alta.descripcion.trim()

  const { error } = await supabase
    .from('cost_centers')
    .insert({ id, descripcion, imputable: alta.imputable, activo: true, org_id: perfil.org_id })

  if (error) {
    /* El id es clave primaria GLOBAL, no por organización (migración 016): un
       código que ya usa otra empresa del sistema choca acá y no en la lista de
       arriba, que solo trae los propios. */
    if (/duplicate|unique|already exists/i.test(error.message)) {
      return { errores: [`El código ${id} ya está en uso en el sistema. Elegí otras tres letras.`] }
    }
    return { errores: [error.message] }
  }

  await logAudit({
    orgId: perfil.org_id, actorId: perfil.id, actorName: perfil.full_name,
    action: 'created', entityType: 'cost_center', entityId: id,
    entityLabel: `${id} — ${descripcion}`,
    newValue: { descripcion, imputable: alta.imputable },
  })

  return { id }
}

/**
 * Corregir un centro: su nombre, si recibe asientos, o retirarlo de los
 * desplegables. **El código no se toca**: es lo que lo identifica, lo que ya
 * está en las fichas y en los gastos imputados, y lo que viaja a Defontana. Un
 * código mal escrito se arregla creando el correcto y borrando el otro, que se
 * puede mientras nadie lo haya usado.
 */
export async function corregirCentroCosto(
  id: string,
  cambios: { descripcion?: string; imputable?: boolean; activo?: boolean },
): Promise<{ error?: string }> {
  const perfil = await exigirAdmin()
  const supabase = await createClient()

  const patch: { descripcion?: string; imputable?: boolean; activo?: boolean } = {}
  if (cambios.descripcion !== undefined) {
    const d = cambios.descripcion.trim()
    if (!d) return { error: 'El nombre no puede quedar vacío' }
    patch.descripcion = d
  }
  if (cambios.imputable !== undefined) patch.imputable = cambios.imputable
  if (cambios.activo    !== undefined) patch.activo    = cambios.activo
  if (Object.keys(patch).length === 0) return {}

  const { data: antes } = await supabase
    .from('cost_centers')
    .select('descripcion, imputable, activo')
    .eq('id', id).eq('org_id', perfil.org_id)
    .maybeSingle()

  // `.eq('org_id')` además del id: el id viene del navegador, y sin esto un
  // admin corregiría el centro de otra organización conociendo su código.
  const { data, error } = await supabase
    .from('cost_centers')
    .update(patch)
    .eq('id', id)
    .eq('org_id', perfil.org_id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'No se encontró el centro de costo' }

  await logAudit({
    orgId: perfil.org_id, actorId: perfil.id, actorName: perfil.full_name,
    action: 'updated', entityType: 'cost_center', entityId: id,
    entityLabel: `${id} — ${antes?.descripcion ?? ''}`,
    oldValue: antes ?? null,
    newValue: patch,
  })

  return {}
}

/**
 * Borrar de verdad, solo si nada lo nombra: es para arreglar un código recién
 * escrito mal. Lo cuenta el servidor, no la pantalla — el botón se esconde,
 * pero la acción se puede llamar igual, y sin esto el borrado fallaría con el
 * error crudo de la llave foránea.
 */
export async function eliminarCentroCosto(id: string): Promise<{ error?: string }> {
  const perfil = await exigirAdmin()
  const supabase = await createClient()

  const filas = await listarCentrosCosto()
  const fila = filas.find(f => f.id === id)
  if (!fila) return { error: 'No se encontró el centro de costo' }

  /* Los conteos de la lista salen de traer las filas y contarlas, que sirve para
     mostrar pero no para decidir: el día que los gastos pasen el tope de filas de
     la API, un centro con gastos se vería en cero y el borrado llegaría a la base
     para morir en la llave foránea con su error crudo. Acá se preguntan exactos,
     que son dos consultas que no traen ninguna fila. */
  const [personas, gastos] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true })
      .eq('org_id', perfil.org_id).eq('cost_center_id', id),
    supabase.from('expense_items').select('id', { count: 'exact', head: true })
      .eq('org_id', perfil.org_id).eq('cost_center_id', id),
  ])
  const usos = {
    personas: personas.count ?? fila.personas,
    gastos:   gastos.count   ?? fila.gastos,
    hijos:    fila.hijos,
  }

  if (!sePuedeBorrar(usos)) {
    const partes = [
      usos.personas ? `${usos.personas} ${usos.personas === 1 ? 'persona lo tiene' : 'personas lo tienen'} asignado` : null,
      usos.gastos   ? `${usos.gastos} ${usos.gastos === 1 ? 'gasto imputado' : 'gastos imputados'}` : null,
      usos.hijos    ? `${usos.hijos} ${usos.hijos === 1 ? 'centro cuelga' : 'centros cuelgan'} de él` : null,
    ].filter(Boolean)
    return {
      error: `No se puede borrar: ${partes.join(', ')}. Desactivalo para que deje de ofrecerse, sin tocar lo ya imputado.`,
    }
  }

  const { data, error } = await supabase
    .from('cost_centers')
    .delete()
    .eq('id', id)
    .eq('org_id', perfil.org_id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'No se pudo borrar el centro de costo' }

  await logAudit({
    orgId: perfil.org_id, actorId: perfil.id, actorName: perfil.full_name,
    action: 'permanently_deleted', entityType: 'cost_center', entityId: id,
    entityLabel: `${id} — ${fila.descripcion}`,
    oldValue: { descripcion: fila.descripcion, imputable: fila.imputable },
    notes: 'Borrado definitivo: no lo nombraba ninguna ficha ni ningún gasto',
  })

  return {}
}
