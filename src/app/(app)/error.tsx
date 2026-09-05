'use client'

/**
 * Frontera de error del área autenticada.
 *
 * Hasta ahora la app no tenía NINGUNA: cualquier excepción llegaba a la
 * pantalla genérica de Next, que en producción no dice nada útil ni ofrece
 * salida. Cuatro caminos distintos terminaban ahí —sesión vencida, acceso
 * restringido a admin, acceso restringido a informes, perfil no encontrado—.
 *
 * Vive dentro de `(app)`, no en la raíz, a propósito: así el menú lateral
 * sigue dibujado y la persona puede irse a otro lado en vez de quedar varada
 * con un botón de recargar.
 *
 * **`error.message` no sirve en producción.** Next redacta los errores de
 * servidor y deja solo `digest`, así que acá no se puede distinguir «no tenés
 * permiso» de «se rompió algo». Por eso el texto es honesto y genérico, y el
 * digest se muestra: es lo único que permite cruzar este error con el registro
 * de Vercel cuando alguien llame para reportarlo.
 */

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCw, Home } from 'lucide-react'

export default function ErrorDeApp({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[frontera de error]', error)
  }, [error])

  return (
    <div className="hoja max-w-lg mx-auto my-10 p-8 text-center">
      <span className="w-12 h-12 rounded-full bg-warning-50 text-warning-700 inline-flex items-center justify-center mb-4">
        <AlertTriangle size={22} />
      </span>

      <h1 className="font-display text-xl font-bold text-ink-900">
        Algo se rompió en esta pantalla
      </h1>

      <p className="text-sm text-ink-500 mt-2 max-w-sm mx-auto">
        No es culpa tuya y no se perdió nada de lo que ya estaba guardado.
        Probá de nuevo; si vuelve a pasar, avisá con el código de abajo.
      </p>

      <div className="flex gap-2 justify-center mt-6 flex-wrap">
        <button onClick={reset} className="btn-primario inline-flex items-center gap-1.5 px-4 py-2 text-sm">
          <RotateCw size={14} />
          Probar de nuevo
        </button>
        <Link href="/" className="btn-secundario inline-flex items-center gap-1.5 px-4 py-2 text-sm">
          <Home size={14} />
          Ir al inicio
        </Link>
      </div>

      {error.digest && (
        <p className="mt-6 pt-4 border-t border-ink-100 text-xs text-ink-400">
          Código del error:{' '}
          <span className="font-mono-amount text-ink-600 select-all">{error.digest}</span>
        </p>
      )}
    </div>
  )
}
