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
 * Los valores son los de Tornasol (etapa 2). La zona de identidad es lo único
 * que cambia si otra organización trae su propia marca.
 */

/* ── ZONA 1 · IDENTIDAD — reemplazable por cliente ────────────────────────
   Espeja la zona de identidad de globals.css. Si otra organización trae su
   propia marca, este bloque y el de allá son los dos únicos que cambian. */
export const BRAND = {
  /** brand-600 · tor-3, el color de acción de Tornasol */
  primary:      '#0D7F81',
  /** brand-700 — hover y estados presionados */
  primaryDeep:  '#005F63',
  /** brand-300 — texto secundario sobre superficies oscuras */
  primarySoft:  '#6BDDD6',
  /** brand-950 · tor-1 abismo — el oscuro del riel y de los degradados */
  surfaceDark:  '#03191C',
  /** brand-800 · tor-2 petróleo */
  inkDeep:      '#054448',
  /** accent-600 — en Tornasol el acento es el mismo teal de marca */
  accent:       '#0D7F81',
  /** brand-400 · tor-4 aqua — el brillo del logotipo */
  accentBright: '#20C8C4',
} as const

/* ── ZONA 2 · SEMÁNTICOS — fijos, no cambian con el cliente ───────────────
   Versión "sólida" (tono 600/700) para SVG y email, donde no hay tokens CSS. */
export const SEMANTIC = {
  success:      '#387F62',   // success-600
  danger:       '#863433',   // danger-700
  dangerBright: '#E15D55',   // danger-500
  warning:      '#A95334',   // warning-600
  warningDeep:  '#5D2B1D',   // warning-800
  flare:        '#6666AF',   // flare-600
} as const

/* ── Neutros que consume JavaScript ───────────────────────────────────── */
export const NEUTRAL = {
  /** ink-400 — color por defecto de una categoría sin color propio */
  muted:   '#809B9E',
  /** ink-500 — etiquetas de los ejes en los gráficos */
  axis:    '#536E71',
  /** ink-900 — cifras dentro de los gráficos */
  figure:  '#041517',
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
  '#009196', // teal — el de marca, para la categoría principal
  '#726DC7', // lila
  '#BB5A37', // coral
  '#009264', // verde
  '#BC5365', // rojo
  '#9D5DAB', // magenta
  '#2F7EC6', // azul
  '#8A7A15', // oliva
  '#0089B6', // acero
  '#B36303', // ocre
] as const

/**
 * Tonos claros para texto y acentos sobre el hero oscuro del panel de
 * administración. Son versiones -300 de cada familia: sobre un fondo
 * `surfaceDark` los tonos -600 no tienen contraste suficiente.
 */
export const ON_DARK = {
  teal:    '#6BDDD6', // brand-300
  amber:   '#FFA875', // warning-300
  emerald: '#8ADCB2', // success-300
  sky:     '#BFBBFF', // info-300 — en Tornasol no hay azul, se pliega a lila
  rose:    '#FF9E8F', // danger-300
  violet:  '#BFBBFF', // flare-300
  white:   '#FFFFFF',
} as const

/**
 * Color de la barra de estado del sistema operativo cuando la PWA corre
 * instalada. Debe coincidir con `theme_color` de `public/manifest.json`:
 * son dos archivos distintos que describen la misma barra.
 *
 * Es el abismo de Tornasol (#03191C), como pide la spec §8.5.
 */
export const PWA_THEME_COLOR = BRAND.surfaceDark
