import { twMerge } from 'tailwind-merge'
import { type ReportStatus, type Currency, CURRENCY_SYMBOLS } from './constants'

export function formatCLP(amount: number): string {
  const abs = Math.abs(Math.round(amount))
  const formatted = abs.toLocaleString('es-CL')
  const sign = amount < 0 ? '-' : ''
  return `${sign}$ ${formatted}`
}

export function formatAmount(amount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOLS[currency]
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('es-CL', {
    minimumFractionDigits: currency === 'CLP' ? 0 : 2,
    maximumFractionDigits: currency === 'CLP' ? 0 : 2,
  })
  return `${amount < 0 ? '-' : ''}${symbol} ${formatted}`
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

export function formatExchangeRate(rate: number): string {
  return rate.toLocaleString('es-CL', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

export function getStatusLabel(status: ReportStatus): string {
  const labels: Record<ReportStatus, string> = {
    draft:               'Borrador',
    submitted:           'En revisión',
    pending_l2:          'Revisión nivel 2',
    approved:            'Aprobada',
    partially_approved:  'Aprobada parcial',
    rejected:            'Rechazada',
    pending_bank_load:   'Carga bancaria pendiente',
    pending_bank_auth:   'Autorización bancaria pendiente',
    reimbursed:          'Reembolsada',
  }
  return labels[status] ?? status
}


/**
 * Une clases de Tailwind resolviendo conflictos: la última gana.
 *
 * Antes era un `join(' ')` a secas, y eso hacía inservible la biblioteca de
 * componentes. Un `<Card className="p-6">` dejaba `p-4 p-6` en el DOM y ganaba
 * la que Tailwind hubiera emitido después — o sea, un resultado que no depende
 * de quien escribe el componente sino del orden interno del CSS generado.
 *
 * El síntoma se veía en los números: la hoja blanca aparecía **46 veces escrita
 * a mano** mientras `ui/Card` se importaba en 2 archivos. No era desconocimiento:
 * un componente que no se puede ajustar no sirve en el segundo lugar donde lo
 * necesitás, así que se copian las clases.
 *
 * `twMerge` no conoce nuestras clases propias (`rounded-card`, `shadow-card`,
 * `tor-glass`…) y las deja pasar tal cual, que es el comportamiento anterior.
 * Solo cambia el caso que importa: dos utilidades del mismo grupo.
 */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return twMerge(classes.filter(Boolean).join(' '))
}

/** Conectores que quedan en minúscula salvo que abran el título. */
const TITLE_STOPWORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u',
  'en', 'a', 'al', 'por', 'para', 'con', 'sin', 'un', 'una', 'unos', 'unas',
])

function capitalizeFirstLetter(part: string): string {
  const i = part.search(/\p{L}/u)
  if (i === -1) return part
  return part.slice(0, i) + part[i].toLocaleUpperCase('es-CL') + part.slice(i + 1)
}

/**
 * Normaliza para mostrar un título escrito TODO EN MAYÚSCULAS (o todo en minúsculas).
 *
 * Es una transformación **de presentación**: no toca el dato guardado, así que también
 * arregla las rendiciones que ya están cargadas.
 *
 * Reglas:
 * - Si el texto mezcla mayúsculas y minúsculas, se respeta tal cual: el autor eligió
 *   ese formato a propósito y no nos corresponde pisarlo.
 * - Cada palabra arranca en mayúscula, para que los nombres propios queden bien
 *   ("DANIEL MARTINEZ" → "Daniel Martinez"). No hay forma confiable de distinguir un
 *   nombre de un sustantivo común, así que también se capitaliza "Viaje" en
 *   "Gastos de Viaje" — es el precio de que los nombres nunca queden en minúscula.
 * - Los conectores (de, del, la, en, a…) quedan en minúscula, salvo el primero.
 * - Los tokens con dígitos se dejan intactos: "N°2" sigue siendo "N°2".
 *
 * NO recupera tildes: "RENDICION" → "Rendicion". El acento no está en el dato original
 * y adivinarlo requeriría un diccionario. Para eso hay que corregir el título de origen.
 */
export function formatDisplayTitle(raw: string | null | undefined): string {
  if (!raw) return ''
  const text = raw.trim()
  if (!text) return ''

  const hasLower = /\p{Ll}/u.test(text)
  const hasUpper = /\p{Lu}/u.test(text)
  if (hasLower && hasUpper) return text

  return text
    .split(/\s+/)
    .map((token, i) => {
      if (/\d/.test(token)) return token
      const lower = token.toLocaleLowerCase('es-CL')
      if (i > 0 && TITLE_STOPWORDS.has(lower)) return lower
      return lower.split('-').map(capitalizeFirstLetter).join('-')
    })
    .join(' ')
}

/**
 * ¿La etiqueta de estado es tan larga que ahoga al título si va en la misma fila?
 *
 * La etiqueta lleva `shrink-0` — nunca cede ancho — así que con textos como
 * "Autorización bancaria pendiente" (244px medidos) al título le quedaban 61px
 * de los 313px de la tarjeta y se apilaba casi letra por letra.
 *
 * Umbral en 16 caracteres: "Revisión nivel 2" y "Aprobada parcial" (16) siguen
 * cabiendo en línea; los dos estados bancarios (24 y 31) bajan a su propia fila.
 */
export function isLongStatusLabel(label: string): boolean {
  return label.trim().length > 16
}

/**
 * Tamaño en px de un monto para que no se salga de su columna.
 *
 * Los montos llevan `shrink-0` y se cortaban contra el borde: en el card de
 * inicio la columna mide 149px y "$ 1.234.567" a 24px mide 156px.
 * En vez de recortar, la cifra se achica por tramos según su largo.
 *
 * Los tramos están calculados para el caso más angosto (celular de 320-375px);
 * en pantallas grandes sobra espacio, así que achicar de más no molesta.
 */
export function fitAmountFontSize(formatted: string, base: 'sm' | 'md' | 'lg' | 'xl'): number {
  const escalas: Record<typeof base, [number, number, number]> = {
    // [hasta 9 caracteres, 10-12, 13 o más]
    sm: [19, 17, 15],
    md: [24, 20, 18],
    lg: [28, 24, 20],
    xl: [40, 34, 28],
  }
  const [corto, medio, largo] = escalas[base]
  const n = formatted.length
  if (n <= 9)  return corto
  if (n <= 12) return medio
  return largo
}
