'use server'

/**
 * ⚠ Las funciones de onboarding (createOrganization, seedPentaCostCenters,
 * createCostCenter, listOrganizations) fueron movidas a:
 *
 *   scripts/onboarding.ts
 *
 * Usan el admin client y están pensadas para ejecución manual (bootstrap de una
 * org nueva), no como server actions públicas. **No volver a exponerlas acá:**
 * todo lo que viva en este archivo entra al bundle como server action.
 *
 * Lo que sí vive acá es la marca de la organización — lectura y escritura de
 * `name` y `logo_url`—, que sí es una operación de la app y está restringida a
 * `role === 'admin'` en cada función.
 */

import { getAuthProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * Marca de la organización — white-label.
 *
 * Las columnas `name` y `logo_url` ya existían en `organizations` desde el
 * schema inicial y no las leía nadie. No hizo falta migración para esto.
 */

export interface MarcaOrg {
  nombre: string
  logo:   string | null
}

/**
 * Exige sesión y rol admin, y devuelve el perfil. Los tres mutadores de marca
 * repetían el mismo bloque de seis líneas.
 *
 * NO se exporta: en un archivo `'use server'` todo lo exportado entra al bundle
 * como server action, y esto es un guard interno — ver la nota de arriba.
 */
async function exigirAdmin() {
  const perfil = await getAuthProfile()
  if (!perfil)              throw new Error('Sin sesión')
  if (!perfil.org_id)       throw new Error('Sin organización')
  if (perfil.role !== 'admin') throw new Error('Solo un administrador puede cambiar la marca')
  return perfil
}

/** Nombre y logo de la organización del usuario actual. */
export async function getMyOrgBranding(): Promise<MarcaOrg | null> {
  /* `getAuthProfile` está envuelto en el `cache()` de React y el layout ya lo
     pide en el mismo request, así que esta llamada no cuesta una consulta: sale
     del caché. Resolver el `org_id` por cuenta propia agregaba una vuelta a la
     base en CADA carga de página, que es el camino más caliente de la app. */
  const perfil = await getAuthProfile()
  if (!perfil?.org_id) return null

  /* Cliente NORMAL, no el admin: el usuario está leyendo su propia
     organización y RLS ya lo permite. Escalar privilegios en el camino más
     transitado de la app para leer un nombre y una URL sería regalar el bypass
     de RLS a cambio de nada. Los mutadores sí usan el admin, porque escribir en
     `organizations` no está abierto a nadie. */
  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations').select('name, logo_url').eq('id', perfil.org_id).single()
  if (!org) return null

  return { nombre: org.name, logo: org.logo_url }
}

const TIPOS_PERMITIDOS = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const MAXIMO_BYTES     = 512 * 1024   // 512 KB: es un logo, no una foto

/**
 * Sube el logo de la organización y deja la URL en `organizations.logo_url`.
 *
 * El archivo va a `org-logos/{org_id}/logo.{ext}` con `upsert`, así una
 * organización tiene UN logo y no acumula versiones huérfanas en el bucket.
 */
export async function uploadOrgLogo(archivo: File): Promise<string> {
  const perfil = await exigirAdmin()

  if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
    throw new Error('El logo tiene que ser PNG, JPG, WEBP o SVG.')
  }
  if (archivo.size > MAXIMO_BYTES) {
    throw new Error(`El logo pesa ${Math.round(archivo.size / 1024)} KB y el máximo son 512 KB.`)
  }

  const ext    = archivo.name.split('.').pop()?.toLowerCase() ?? 'png'
  const ruta   = `${perfil.org_id}/logo.${ext}`
  const admin  = await createAdminClient()

  const { error: errSubida } = await admin.storage
    .from('org-logos')
    .upload(ruta, archivo, { upsert: true, contentType: archivo.type })
  if (errSubida) throw new Error(errSubida.message)

  const { data: publica } = admin.storage.from('org-logos').getPublicUrl(ruta)
  /* El sufijo de tiempo rompe el caché del navegador y del CDN: sin él, cambiar
     el logo no se ve hasta que expire el caché, y parece que no se guardó. */
  const url = `${publica.publicUrl}?v=${Date.now()}`

  const { error: errOrg } = await admin
    .from('organizations').update({ logo_url: url }).eq('id', perfil.org_id)
  if (errOrg) throw new Error(errOrg.message)

  revalidatePath('/', 'layout')
  return url
}

/** Vuelve al respaldo: el cuadrado con la inicial. No borra el archivo. */
export async function removeOrgLogo(): Promise<void> {
  const perfil = await exigirAdmin()

  const admin = await createAdminClient()
  const { error } = await admin
    .from('organizations').update({ logo_url: null }).eq('id', perfil.org_id)
  if (error) throw new Error(error.message)

  revalidatePath('/', 'layout')
}

/** Nombre visible de la organización. Es el que se ve en el riel. */
export async function updateOrgName(nombre: string): Promise<void> {
  const limpio = nombre.trim()
  if (limpio.length < 2)  throw new Error('El nombre necesita al menos 2 caracteres.')
  if (limpio.length > 60) throw new Error('El nombre no puede pasar de 60 caracteres.')

  const perfil = await exigirAdmin()

  const admin = await createAdminClient()
  const { error } = await admin
    .from('organizations').update({ name: limpio }).eq('id', perfil.org_id)
  if (error) throw new Error(error.message)

  revalidatePath('/', 'layout')
}
