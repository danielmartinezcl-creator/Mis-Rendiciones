import { validateRut } from '@/lib/validators'

export function validateRutFormat(rut: string): boolean {
  return validateRut(rut)
}

export function formatRutDisplay(rut: string): string {
  const clean = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase()
  if (clean.length < 2) return rut
  const body    = clean.slice(0, -1)
  const digit   = clean.slice(-1)
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${grouped}-${digit}`
}

export type RutValidationResult =
  | { valid: true;  formatted: string }
  | { valid: false; error: string }

export function validateAndFormatRut(rut: string): RutValidationResult {
  if (!rut || rut.trim() === '') return { valid: false, error: 'RUT requerido' }
  const normalized = rut.trim().toUpperCase().replace(/\./g, '')
  if (!validateRut(normalized)) return { valid: false, error: 'RUT inválido — revisa el dígito verificador' }
  return { valid: true, formatted: formatRutDisplay(normalized) }
}
