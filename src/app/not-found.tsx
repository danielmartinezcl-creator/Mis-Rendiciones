import Link from 'next/link'
import { Compass, Home } from 'lucide-react'

/**
 * 404. No existía: una URL mal escrita caía en la pantalla genérica de Next.
 *
 * Se renderiza dentro del layout raíz, así que tiene las fuentes y el
 * degradado, pero NO el menú lateral —que vive en el layout de `(app)`—.
 * Por eso el botón de vuelta al inicio es lo único que ofrece: desde acá no
 * hay dónde más ir.
 */
export default function NoEncontrado() {
  return (
    <main className="content-area min-h-screen flex items-center justify-center p-6">
      <div className="hoja max-w-md w-full p-8 text-center">
        <span className="w-12 h-12 rounded-full bg-ink-100 text-ink-500 inline-flex items-center justify-center mb-4">
          <Compass size={22} />
        </span>

        <h1 className="font-display text-xl font-bold text-ink-900">
          Esta página no existe
        </h1>

        <p className="text-sm text-ink-500 mt-2">
          Puede que el enlace esté mal escrito, o que lo que buscabas se haya
          movido o eliminado.
        </p>

        <Link
          href="/"
          className="btn-primario inline-flex items-center gap-1.5 px-4 py-2 text-sm mt-6"
        >
          <Home size={14} />
          Ir al inicio
        </Link>
      </div>
    </main>
  )
}
