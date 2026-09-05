import { ReceiptText } from 'lucide-react'
import { BRAND } from '@/lib/design-tokens'

/**
 * La marca de la organización — un solo componente para los dos lugares donde
 * aparece.
 *
 * Existe por dos motivos. El primero es el white-label: cada empresa que use la
 * app tiene que poder verse a sí misma, y para eso lee `organizations.name` y
 * `organizations.logo_url`.
 *
 * El segundo es que los dos lugares habían divergido. El riel dibujaba un
 * cuadrado con el degradado de marca y un ícono de recibo; el encabezado móvil,
 * un cuadrado teal con la letra «P» suelta. Eran dos marcas distintas en la
 * misma app, y nadie lo notaba porque nunca se ven juntas: una es de escritorio
 * y la otra de teléfono.
 *
 * **El respaldo es el caso normal, no la excepción.** Ninguna organización tiene
 * logo cargado hoy, así que la rama sin `logo` es la que se ve siempre: el
 * cuadrado con degradado, con la inicial de la organización en vez del ícono
 * genérico cuando hay un nombre del cual sacarla.
 */
interface Props {
  nombre: string
  logo:   string | null
  /** El riel tiene más aire que la barra del teléfono. */
  tamano?: 'riel' | 'barra'
}

export function Marca({ nombre, logo, tamano = 'riel' }: Props) {
  const lado  = tamano === 'riel' ? 'w-9 h-9' : 'w-9 h-9'
  const fuente = tamano === 'riel' ? 17 : 16

  /* Una sola letra: dos o tres iniciales en 36 px quedan ilegibles, y el
     nombre completo va al lado de todos modos. */
  const inicial = nombre.trim().charAt(0).toUpperCase()

  return (
    <div className="flex items-center gap-3 min-w-0">
      {logo ? (
        /* `object-contain` y no `cover`: un logo recortado deja de ser el logo.
           El fondo claro es para los logos con transparencia, que sobre el
           vidrio oscuro desaparecerían.

           `<img>` y no `next/image` a propósito: son 36 px, así que la
           optimización no compra nada, y `next/image` obligaría a declarar el
           dominio de Supabase en `remotePatterns` — acoplar la configuración
           del build a dónde está hospedado el logo, por una miniatura. El repo
           ya usa `<img>` en otros tres lugares por el mismo motivo. */
        <img
          src={logo}
          alt={nombre}
          className={`${lado} rounded-item object-contain bg-white/90 p-0.5 shrink-0`}
        />
      ) : (
        <div
          className={`${lado} rounded-item flex items-center justify-center shrink-0`}
          style={{ background: 'var(--cta-brand)' }}
        >
          {inicial
            ? <span className="font-display font-extrabold text-white text-[17px] leading-none">{inicial}</span>
            : <ReceiptText size={18} className="text-white" />}
        </div>
      )}

      {/* Trunca en una línea: el riel mide 256 px y un nombre largo empujaría
          la navegación. El nombre completo está en el `title`. */}
      <span
        className="font-display font-extrabold tracking-tight leading-none text-white truncate"
        style={{ fontSize: fuente }}
        title={nombre}
      >
        {nombre}
      </span>
    </div>
  )
}

/**
 * La marca del producto, para las pantallas sin sesión — el login no sabe
 * todavía a qué organización pertenece quien está mirando.
 */
export function MarcaProducto({ tamano = 'riel' }: { tamano?: 'riel' | 'barra' }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-9 h-9 rounded-item flex items-center justify-center shrink-0"
           style={{ background: 'var(--cta-brand)' }}>
        <ReceiptText size={18} className="text-white" />
      </div>
      <span className="font-display font-extrabold tracking-tight leading-none"
            style={{ fontSize: tamano === 'riel' ? 17 : 16 }}>
        <span style={{ color: BRAND.accentBright }}>Mi</span>
        <span className="text-white"> Rendición</span>
      </span>
    </div>
  )
}
