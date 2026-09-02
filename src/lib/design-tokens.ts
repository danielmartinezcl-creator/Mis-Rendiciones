/**
 * Tokens de diseño para los consumidores que NO leen CSS.
 *
 * ¿Por qué existe este archivo si `globals.css` ya tiene toda la paleta?
 * Porque la app tiene tres consumidores de color que no pueden usar variables
 * CSS, y cada uno por un motivo distinto:
 *
 *   1. **Gráficos SVG** — `CategoryDonutChart` y `AdminKpiHero` pasan strings
 *      de color a atributos `fill` y `stroke` desde JavaScript.
 *   2. **Plantillas de email** — se renderizan en Gmail y Outlook, que ignoran
 *      `var(--color-brand-600)`. El hexadecimal tiene que viajar literal.
 *   3. **Metadata de la PWA** — `themeColor` en `layout.tsx` y `manifest.json`
 *      son literales que Next serializa a `<meta>`, no CSS.
 *
 * REGLA: al cambiar la paleta hay que tocar DOS archivos, `globals.css` y este.
 * Los valores de acá deben coincidir con los de allá. Si divergen, los gráficos
 * quedan de un color y la interfaz de otro — que es exactamente el síntoma que
 * este archivo existe para evitar.
 *
 * Etapa 1c del rediseño Tornasol. Los valores son los ACTUALES (violeta PENTA);
 * la etapa 2 los reemplaza por los de Tornasol.
 */

/* ── Marca y superficies ──────────────────────────────────────────────── */
export const BRAND = {
  /** brand-600 · violeta PENTA — color primario */
  primary:   '#4A50A0',
  /** brand-700 — hover y extremo claro de los degradados */
  primaryDeep: '#3B4090',
  /** brand-300 — texto secundario sobre superficies oscuras */
  primarySoft: '#9EA0DF',
  /** sidebar — el azul-violeta oscuro del riel */
  surfaceDark: '#12152E',
  /** ink-900 — el otro oscuro que usan los degradados de CTA */
  inkDeep:     '#0B1120',
  /** accent-600 · el teal del ícono GP */
  accent:      '#0D9488',
  /** el teal claro del logotipo en el sidebar */
  accentBright: '#3DBAB5',
} as const

/* ── Semánticos, en su versión "sólida" para SVG y email ──────────────── */
export const SEMANTIC = {
  success: '#059669',   // success-600
  danger:  '#BE123C',   // danger-700 (era rose-700)
  dangerBright: '#E11D48',
  warning: '#D97706',   // warning-600
  warningDeep: '#92400E',
  flare:   '#7C3AED',   // flare-600
} as const

/* ── Neutros que consume JavaScript ───────────────────────────────────── */
export const NEUTRAL = {
  /** ink-400 — color por defecto de una categoría sin color propio */
  muted:   '#8A95AD',
  /** ink-500 — etiquetas de los ejes en los gráficos */
  axis:    '#5B6883',
  /** ink-900 — cifras dentro de los gráficos */
  figure:  '#0B1120',
} as const

/**
 * Paleta cualitativa de los gráficos de categorías.
 *
 * El orden importa: la categoría N recibe el color N. Cambiar el orden
 * repinta gráficos que la gente ya tiene memorizados, así que se agrega
 * al final, no al medio.
 *
 * Son diez tonos distinguibles entre sí, no una rampa: acá el color
 * identifica, no ordena.
 */
export const CHART_SERIES = [
  '#4A50A0', // violeta — marca
  '#3DBAB5', // teal
  '#F59E0B', // ámbar
  '#EF4444', // rojo
  '#8B5CF6', // violeta claro
  '#10B981', // esmeralda
  '#F97316', // naranja
  '#EC4899', // rosa
  '#06B6D4', // cyan
  '#84CC16', // lima
] as const

/**
 * Tonos claros para texto y acentos sobre el hero oscuro del panel de
 * administración. Son versiones -300 de cada familia: sobre un fondo
 * `surfaceDark` los tonos -600 no tienen contraste suficiente.
 */
export const ON_DARK = {
  teal:    '#5EEAD4',
  amber:   '#FCD34D',
  emerald: '#6EE7B7',
  sky:     '#7DD3FC',
  rose:    '#FDA4AF',
  violet:  '#C4B5FD',
  white:   '#FFFFFF',
} as const

/**
 * Color de la barra de estado del sistema operativo cuando la PWA corre
 * instalada. Debe coincidir con `theme_color` de `public/manifest.json`:
 * son dos archivos distintos que describen la misma barra.
 *
 * La spec de Tornasol (§8.5) lo cambia a `#03191C` en la etapa 2.
 */
export const PWA_THEME_COLOR = BRAND.primary
