import { describe, it, expect } from 'vitest'
import { formatCLP, formatDate, getStatusLabel, formatExchangeRate, formatDisplayTitle, isLongStatusLabel, fitAmountFontSize } from '@/lib/utils'
import { FAMILIA_REPORTE, FAMILIA_FONDO, FAMILIA_CLASES, REPORT_STATUSES, FUND_STATUSES } from '@/lib/constants'

describe('formatDisplayTitle', () => {
  it('convierte un título en mayúsculas dejando los nombres capitalizados', () => {
    expect(formatDisplayTitle('RENDICION N°2 DANIEL MARTINEZ')).toBe('Rendicion N°2 Daniel Martinez')
  })

  it('deja los conectores en minúscula, salvo el primero', () => {
    expect(formatDisplayTitle('GASTOS DE VIAJE A SANTIAGO')).toBe('Gastos de Viaje a Santiago')
    expect(formatDisplayTitle('DE MAYO')).toBe('De Mayo')
  })

  it('respeta el texto si el autor ya mezcló mayúsculas y minúsculas', () => {
    expect(formatDisplayTitle('Rendición de mayo')).toBe('Rendición de mayo')
    expect(formatDisplayTitle('Gastos iPhone 15')).toBe('Gastos iPhone 15')
  })

  it('también arregla un título escrito todo en minúsculas', () => {
    expect(formatDisplayTitle('rendicion mayo')).toBe('Rendicion Mayo')
  })

  it('no toca los tokens que llevan dígitos', () => {
    expect(formatDisplayTitle('RENDICION N°12 DEL 2026')).toBe('Rendicion N°12 del 2026')
  })

  it('capitaliza ambas partes de un apellido con guion', () => {
    expect(formatDisplayTitle('ANA GARCIA-LOPEZ')).toBe('Ana Garcia-Lopez')
  })

  it('normaliza espacios de más', () => {
    expect(formatDisplayTitle('  RENDICION   N°1  ')).toBe('Rendicion N°1')
  })

  it('devuelve string vacío para nulo, indefinido o vacío', () => {
    expect(formatDisplayTitle(null)).toBe('')
    expect(formatDisplayTitle(undefined)).toBe('')
    expect(formatDisplayTitle('   ')).toBe('')
  })
})

describe('formatCLP', () => {
  it('formatea número positivo con símbolo y separador de miles', () => {
    expect(formatCLP(1234567)).toBe('$ 1.234.567')
  })
  it('formatea cero como $ 0', () => {
    expect(formatCLP(0)).toBe('$ 0')
  })
  it('formatea negativo con signo', () => {
    expect(formatCLP(-50000)).toBe('-$ 50.000')
  })
})

describe('formatDate', () => {
  it('formatea YYYY-MM-DD a DD/MM/YYYY', () => {
    expect(formatDate('2026-06-01')).toBe('01/06/2026')
  })
})

describe('getStatusLabel', () => {
  it('retorna etiquetas en español', () => {
    expect(getStatusLabel('draft')).toBe('Borrador')
    expect(getStatusLabel('submitted')).toBe('En revisión')
    expect(getStatusLabel('approved')).toBe('Aprobada')
    expect(getStatusLabel('partially_approved')).toBe('Aprobada parcial')
    expect(getStatusLabel('rejected')).toBe('Rechazada')
    expect(getStatusLabel('reimbursed')).toBe('Reembolsada')
  })
})

describe('formatExchangeRate', () => {
  it('formatea el TC con 4 decimales', () => {
    expect(formatExchangeRate(0.5694)).toBe('0,5694')
  })
})

describe('isLongStatusLabel', () => {
  it('deja en línea los estados que caben', () => {
    ;['Borrador', 'En revisión', 'Aprobada', 'Reembolsada'].forEach(e =>
      expect(isLongStatusLabel(e)).toBe(false))
  })

  it('marca como largos los dos estados bancarios', () => {
    expect(isLongStatusLabel('Carga bancaria pendiente')).toBe(true)
    expect(isLongStatusLabel('Autorización bancaria pendiente')).toBe(true)
  })

  it('el límite son 16 caracteres inclusive', () => {
    expect(isLongStatusLabel('Revisión nivel 2')).toBe(false)
    expect(isLongStatusLabel('Revisión nivel 22')).toBe(true)
  })

  it('ignora espacios al borde', () => {
    expect(isLongStatusLabel('   Aprobada   ')).toBe(false)
  })
})

describe('fitAmountFontSize', () => {
  it('mantiene el tamaño completo cuando la cifra es corta', () => {
    expect(fitAmountFontSize('$ 0', 'xl')).toBe(40)
    expect(fitAmountFontSize('$ 137.425', 'md')).toBe(24)
  })

  it('achica el monto secundario que se salía de su columna', () => {
    expect(fitAmountFontSize('$ 1.234.567', 'md')).toBe(20)
  })

  it('achica el monto principal que no entraba en un celular de 320px', () => {
    expect(fitAmountFontSize('$ 12.345.678', 'xl')).toBe(34)
  })

  it('usa el tramo más chico para cifras muy largas', () => {
    expect(fitAmountFontSize('$ 123.456.789', 'xl')).toBe(28)
    expect(fitAmountFontSize('$ 123.456.789', 'md')).toBe(18)
  })
})

describe('familias visuales de estado', () => {
  it('cada estado de rendición tiene familia', () => {
    for (const s of REPORT_STATUSES) {
      expect(FAMILIA_REPORTE[s], `falta familia para "${s}"`).toBeDefined()
      expect(FAMILIA_CLASES[FAMILIA_REPORTE[s]]).toBeDefined()
    }
  })

  it('cada estado de fondo tiene familia', () => {
    for (const s of FUND_STATUSES) {
      expect(FAMILIA_FONDO[s], `falta familia para "${s}"`).toBeDefined()
      expect(FAMILIA_CLASES[FAMILIA_FONDO[s]]).toBeDefined()
    }
  })

  /* La spec de Tornasol define CUATRO familias. Si alguien agrega una quinta
     para un caso puntual, el sistema vuelve a la deriva que tenía antes: 19
     estados con 19 colores. Este test es el que lo impide. */
  it('no hay más de cuatro familias', () => {
    expect(Object.keys(FAMILIA_CLASES).sort()).toEqual(
      ['atencion', 'en-curso', 'neutro', 'resuelto']
    )
  })

  it('los estados terminales positivos son «resuelto»', () => {
    expect(FAMILIA_REPORTE.approved).toBe('resuelto')
    expect(FAMILIA_REPORTE.reimbursed).toBe('resuelto')
    expect(FAMILIA_FONDO.settled).toBe('resuelto')
  })

  it('lo rechazado pide atención, no se pierde entre lo neutro', () => {
    expect(FAMILIA_REPORTE.rejected).toBe('atencion')
    expect(FAMILIA_FONDO.rejected).toBe('atencion')
  })
})
