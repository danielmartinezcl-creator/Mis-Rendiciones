// Helper puro — NO 'use server'

export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quitar tildes/diacríticos
    .replace(/[^a-z0-9\s]/g, '')                        // solo alfanumérico y espacios
    .replace(/\s+/g, ' ')
    .trim()
}

export interface DuplicateMatch {
  reportId:    string
  reportTitle: string
  itemId:      string
  date:        string
  amount:      number
  merchant:    string
}
