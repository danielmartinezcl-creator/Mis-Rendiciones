import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

/**
 * REFORMA VISUAL — Mi rendición
 *
 * Fuentes nuevas (reemplazan Plus Jakarta Sans + Manrope):
 *   - Bricolage Grotesque → display/títulos/heroes (variable: --font-bricolage)
 *   - Hanken Grotesk      → UI/body/labels/inputs  (variable: --font-hanken)
 *   - Geist Mono          → cifras/montos/tabular   (variable: --font-geist-mono)
 *
 * Prerequisito: npm install geist
 */

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Mi rendición',
  description: 'Gestión de rendiciones de gastos con IA',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mi rendición',
  },
}

export const viewport: Viewport = {
  themeColor: '#0D9488',   /* teal — antes: #0f172a (slate) */
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${bricolage.variable} ${hanken.variable} ${GeistMono.variable}`}
    >
      <body className="font-hanken bg-ink-50 text-ink-800 antialiased">
        {children}
      </body>
    </html>
  )
}
