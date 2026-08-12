// Dígito verificador chileno (módulo 11)
function rutDigit(body: string): string {
  const digits = body.replace(/\./g, '').split('').reverse().map(Number)
  const sum = digits.reduce((acc, d, i) => acc + d * ((i % 6) + 2), 0)
  const rem = 11 - (sum % 11)
  if (rem === 11) return '0'
  if (rem === 10) return 'K'
  return String(rem)
}

export function validateRut(rut: string): boolean {
  if (!rut || rut.trim() === '') return false
  const clean = rut.trim().toUpperCase().replace(/\./g, '')
  const match = clean.match(/^(\d{1,8})-([0-9K])$/)
  if (!match) return false
  return rutDigit(match[1]) === match[2]
}

export function validateStringLength(str: string, max: number, min = 1): boolean {
  if (!str || str.trim().length < min) return false
  return str.trim().length <= max
}

export function validateAmount(amount: number): boolean {
  return typeof amount === 'number' && amount > 0 && isFinite(amount)
}

export function validatePositiveNumber(n: number): boolean {
  return typeof n === 'number' && n >= 0 && isFinite(n)
}

export function validateDateRange(from: string, to: string): boolean {
  if (!from || !to) return false
  return new Date(from) <= new Date(to)
}

export function validateHexColor(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)
}

export function normalizeRut(rut: string): string {
  return rut.trim().toUpperCase().replace(/\./g, '')
}
