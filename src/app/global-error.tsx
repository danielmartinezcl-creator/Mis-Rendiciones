'use client'

/**
 * Último recurso: sólo se usa cuando falla el layout raíz mismo.
 *
 * Reemplaza al layout entero, así que `globals.css` NO se aplica y las fuentes
 * tampoco están cargadas. Todo va en estilos en línea a propósito: esta
 * pantalla tiene que verse bien justo cuando lo demás está roto, y depender de
 * la hoja de estilos sería depender de lo que acaba de fallar.
 *
 * Por la misma razón no usa iconos de librería ni componentes propios.
 */

export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#071417',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          color: '#080C16',
        }}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: 18,
            padding: '32px 28px',
            maxWidth: 420,
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 14px 40px rgba(3,25,28,.2)',
          }}
        >
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-.01em' }}>
            La aplicación no pudo cargar
          </h1>

          <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.6, color: '#527370' }}>
            No se perdió nada de lo que ya estaba guardado. Volvé a cargar la
            página; si el problema sigue, avisá con el código de abajo.
          </p>

          <button
            onClick={reset}
            style={{
              marginTop: 24,
              background: '#0F7370',
              color: '#fff',
              border: 'none',
              borderRadius: 14,
              padding: '11px 22px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Volver a cargar
          </button>

          {error.digest && (
            <p
              style={{
                margin: '24px 0 0',
                paddingTop: 16,
                borderTop: '1px solid #E3E9EC',
                fontSize: 12,
                color: '#527370',
              }}
            >
              Código del error:{' '}
              <span style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', color: '#080C16', userSelect: 'all' }}>
                {error.digest}
              </span>
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
