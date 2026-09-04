import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { PWA_THEME_COLOR } from '@/lib/design-tokens'
import './globals.css'

/**
 * Tipografía — rediseño Tornasol
 *
 *   Bricolage Grotesque → títulos y display   (--font-bricolage)
 *   Hanken Grotesk      → cuerpo, etiquetas   (--font-hanken)
 *   Manrope             → montos y cifras     (--font-amount)
 *
 * LOCALES, no `next/font/google`. Antes venían de Google en tiempo de build, y
 * eso tiró un deploy cuando Google no respondió: el build entero falla por una
 * fuente. Con los archivos en el repo, compilar no depende de la red.
 *
 * Importa más ahora que la marca es reemplazable: la identidad de un cliente no
 * puede quedar sujeta a que un CDN ajeno esté disponible en el momento del build.
 *
 * Son las tres VARIABLES, subconjunto latin (cubre acentos y ñ). Un archivo por
 * familia cubre todo el rango de pesos: 136 KB en total para las tres.
 */

const bricolage = localFont({
  src: './fonts/bricolage.woff2',
  variable: '--font-bricolage',
  weight: '200 800',
  display: 'swap',
})

const hanken = localFont({
  src: './fonts/hanken.woff2',
  variable: '--font-hanken',
  weight: '100 900',
  display: 'swap',
})

/* Manrope reemplaza a Geist Mono en los montos. El motivo es la regla del
   proyecto sobre cifras legibles para adultos mayores: el cero de Manrope no
   lleva barra ni punto, y sus números son proporcionalmente anchos sin ser
   monoespaciados, que es lo que hace que un monto se lea como cifra y no como
   texto. La alineación en columnas la da `font-variant-numeric: tabular-nums`,
   no la fuente. */
const manrope = localFont({
  src: './fonts/manrope.woff2',
  variable: '--font-manrope',
  weight: '200 800',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Mi Rendición',
  description: 'Rendiciones de gastos, caja chica y aprobaciones para empresas chilenas.',
  manifest: '/manifest.json',
  icons: {
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mi Rendición',
  },
}

export const viewport: Viewport = {
  themeColor: PWA_THEME_COLOR,   /* tor-1 abismo #03191C */
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${bricolage.variable} ${hanken.variable} ${manrope.variable}`}
    >
      <body className="font-hanken text-ink-800 antialiased">
        {children}
      </body>
    </html>
  )
}
