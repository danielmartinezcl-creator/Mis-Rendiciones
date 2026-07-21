import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

/**
 * REFORMA VISUAL — Penta Rend
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
  title: 'Penta Rend',
  description: 'Gestión de rendiciones de gastos — Penta Ingenieros Asociados',
  manifest: '/manifest.json',
  icons: {
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Penta Rend',
  },
}

export const viewport: Viewport = {
  themeColor: '#4A50A0',   /* violeta PENTA */
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
