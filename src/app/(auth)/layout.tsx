import { MarcaProducto } from '@/components/layout/Marca'

/**
 * El marco de las pantallas sin sesión — `/login` y `/set-password`.
 *
 * ⛔ ESTE CONTENEDOR NO PINTA FONDO, Y NO ES UN OLVIDO.
 *
 * El chasis de Tornasol vive en `body::before` (el degradado) y `body::after`
 * (los destellos), las dos capas fijas al viewport con z-index negativo. Dentro
 * de un contexto de apilamiento, el fondo de un bloque se pinta DESPUÉS de sus
 * descendientes con z-index negativo: cualquier fondo opaco acá los tapa por
 * completo, sin error y sin aviso.
 *
 * Acá había un `bg-sidebar`. Como `--color-sidebar` es `#03191C` —justo el
 * primer punto de la rampa— el resultado no se veía roto: se veía como un
 * degradado que nunca arranca. La pantalla que más gente mira de toda la app
 * era la única sin el sistema visual, y las tres auditorías daban verde, cada
 * una con razón: el texto SÍ tenía superficie debajo (la tapa), `bg-sidebar` SÍ
 * es un token legítimo, y respecto al día anterior no había cambiado nada.
 *
 * La misma trampa está documentada en `globals.css`, donde se aprendió la
 * primera vez sobre el `body`. Si alguna vez hace falta un fondo acá, va en una
 * capa con z-index propio, nunca como color del contenedor.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          {/* La marca del PRODUCTO, no la de la organización: acá todavía no se
              sabe quién está mirando. `organizations.name` recién se puede leer
              con sesión, así que el nombre de la empresa no va en esta pantalla
              —estuvo escrito a mano hasta el 2026-09-21 y cualquier cliente
              nuevo habría visto el de PENTA en su propio acceso—. */}
          <MarcaProducto tamano="acceso" />

          {/* Al 70% y no al 40%: sobre el degradado, un blanco tan tenue queda
              por debajo del mínimo AA, y el público incluye adultos mayores. */}
          <p className="text-white/70 text-sm mt-1.5">Rendiciones de gastos</p>
        </div>

        {children}
      </div>
    </div>
  )
}
