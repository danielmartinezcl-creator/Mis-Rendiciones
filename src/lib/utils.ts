import { type ReportStatus, type Currency, CURRENCY_SYMBOLS, STATUS_COLORS } from './constants'

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

export function getStatusColor(status: ReportStatus): string {
  return STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
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
