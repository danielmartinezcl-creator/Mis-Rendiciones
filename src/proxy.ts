import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Dominios viejos que TODAVÍA apuntan a este proyecto en Vercel.
 *
 * `rindegastos.vercel.app` era el nombre de prueba y sigue respondiendo 200,
 * así que quien tenga ese marcador —o la app instalada desde ahí— sigue
 * usándola por ese dominio sin enterarse. Se nota en los diálogos nativos del
 * navegador, que muestran el origen: «rindegastos.vercel.app dice: ¿Enviar
 * esta rendición a revisión?». Así lo detectó Daniel.
 *
 * Se redirige SOLO esta lista, nunca «cualquier host que no sea el canónico»:
 * cada despliegue de vista previa de Vercel tiene su propia URL y hay que
 * poder usarla para probar antes de mezclar.
 */
const HOSTS_VIEJOS = new Set(['rindegastos.vercel.app'])

export async function proxy(request: NextRequest) {
  /* Antes que nada: si viene por un dominio viejo, se lo manda al bueno
     conservando ruta y parámetros. 308 y no 302 para que el navegador lo
     recuerde y no repita el salto en cada carga. */
  const host = request.headers.get('host') ?? ''
  const canonico = process.env.NEXT_PUBLIC_APP_URL
  if (canonico && HOSTS_VIEJOS.has(host)) {
    const destino = new URL(request.nextUrl.pathname + request.nextUrl.search, canonico)
    return NextResponse.redirect(destino, 308)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  /* `getUser()` LANZA cuando el token de refresco caducó, y el proxy corre
     antes que todo: no hay frontera de error que lo atrape, así que la persona
     veía un 500 en vez del login. En producción pasó 6 veces en una semana con
     UN solo usuario activo; con 54 dejando la pestaña abierta de un día para
     el otro, es un llamado de soporte por día.

     Un token vencido no es una falla del sistema: es exactamente lo que
     significa «tu sesión expiró». Se trata como sesión ausente y sigue el
     mismo camino de siempre — redirección al login. */
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    user = null
  }

  const { pathname } = request.nextUrl

  /* `/set-password` es pública: la sesión se crea DENTRO de la página, al
     canjear el token del correo (ver `src/lib/access-link.ts`). Sin sesión y
     sin token, la propia página devuelve al login. */
  const publicPaths = ['/login', '/register', '/api/auth', '/set-password']
  const isPublic = publicPaths.some(p => pathname.startsWith(p))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons).*)',
  ],
}
