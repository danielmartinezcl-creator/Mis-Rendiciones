import { describe, it, expect } from 'vitest'
import {
  BANCOS, TIPOS_DE_CUENTA, normalizarBanco, normalizarTipoCuenta,
  etiquetaTipoCuenta, opcionesDeBanco,
} from '@/lib/bancos'

/* Lo que hay REALMENTE en la base al 2026-10-09, sobre 58 personas con banco
   cargado por la planilla. Si el normalizador no resuelve esta tabla, la
   pantalla de Empleados dibuja desplegables vacíos. */
const LO_QUE_CARGÓ_LA_PLANILLA: [string, string, number][] = [
  ['Banco de Chile',           'Banco de Chile',  18],
  ['BCI',                      'BCI',              8],
  ['Falabella',                'Banco Falabella',  8],
  ['Banco Estado',             'Banco Estado',    10],
  ['Santander',                'Santander',        5],
  ['Scotiabank',               'Scotiabank',       5],
  ['Itau',                     'Itaú',             3],
  ['Mercadopago Emisora S.A.', 'Mercado Pago',     1],
]

describe('normalizarBanco', () => {
  it.each(LO_QUE_CARGÓ_LA_PLANILLA)('«%s» es %s (%i personas)', (escrito, esperado) => {
    expect(normalizarBanco(escrito)).toBe(esperado)
  })

  it('lo que ya está bien no se toca', () => {
    for (const b of BANCOS) expect(normalizarBanco(b)).toBe(b)
  })

  it('sin tildes, con mayúsculas o con «Banco» adelante, da igual', () => {
    expect(normalizarBanco('BANCO SANTANDER')).toBe('Santander')
    expect(normalizarBanco('itaú')).toBe('Itaú')
    expect(normalizarBanco('Chile')).toBe('Banco de Chile')
  })

  it('vacío es vacío', () => {
    expect(normalizarBanco('')).toBeNull()
    expect(normalizarBanco('   ')).toBeNull()
    expect(normalizarBanco(null)).toBeNull()
    expect(normalizarBanco(undefined)).toBeNull()
  })

  /* Perder el banco de alguien por no reconocerlo es peor que guardarlo con
     un nombre raro: el dato lo cargó una persona y se puede corregir, pero
     solo si sigue ahí. */
  it('un banco que no está en la lista se conserva tal cual', () => {
    expect(normalizarBanco('Coopeuch')).toBe('Coopeuch')
    expect(normalizarBanco('  Tenpo  ')).toBe('Tenpo')
  })

  /* Un prefijo corto pisaría a cualquiera: «BCI» tiene tres letras y «BICE»
     cuatro, y ninguno debe arrastrar al otro. */
  it('no confunde bancos de nombre corto', () => {
    expect(normalizarBanco('BCI')).toBe('BCI')
    expect(normalizarBanco('BICE')).toBe('BICE')
    expect(normalizarBanco('BC')).toBe('BC')
  })
})

describe('normalizarTipoCuenta', () => {
  /* Las dos formas que conviven hoy en la misma columna: la planilla escribe
     «Corriente» y el perfil del empleado guarda 'corriente'. */
  it.each([
    ['Corriente',        'corriente'],
    ['corriente',        'corriente'],
    ['Cuenta Corriente', 'corriente'],
    ['Cta Cte',          'corriente'],
    ['Vista',            'vista'],
    ['vista',            'vista'],
    ['Cuenta Vista',     'vista'],
    ['Ahorro',           'ahorro'],
    ['Cuenta de Ahorro', 'ahorro'],
  ])('«%s» es %s', (escrito, esperado) => {
    expect(normalizarTipoCuenta(escrito)).toBe(esperado)
  })

  it('cada valor de la lista se normaliza a sí mismo', () => {
    for (const t of TIPOS_DE_CUENTA) expect(normalizarTipoCuenta(t.valor)).toBe(t.valor)
    for (const t of TIPOS_DE_CUENTA) expect(normalizarTipoCuenta(t.etiqueta)).toBe(t.valor)
  })

  /* Acá sí se descarta lo que no reconoce: son tres y un cuarto valor no le
     sirve a nadie. */
  it('lo que no es ninguno de los tres queda en nada', () => {
    expect(normalizarTipoCuenta('Chequera electrónica')).toBeNull()
    expect(normalizarTipoCuenta('')).toBeNull()
    expect(normalizarTipoCuenta(null)).toBeNull()
  })
})

describe('etiquetaTipoCuenta', () => {
  it('muestra el nombre largo venga como venga', () => {
    expect(etiquetaTipoCuenta('Corriente')).toBe('Cuenta Corriente')
    expect(etiquetaTipoCuenta('vista')).toBe('Cuenta Vista')
  })
  it('sin tipo no hay etiqueta', () => {
    expect(etiquetaTipoCuenta(null)).toBeNull()
    expect(etiquetaTipoCuenta('cualquier cosa')).toBeNull()
  })
})

describe('opcionesDeBanco', () => {
  it('sin nada guardado, la lista de siempre', () => {
    expect(opcionesDeBanco(null)).toEqual([...BANCOS])
    expect(opcionesDeBanco('')).toEqual([...BANCOS])
  })

  it('un banco de la lista no se repite', () => {
    expect(opcionesDeBanco('BCI')).toEqual([...BANCOS])
  })

  /* La red de seguridad de verdad: un <select> cuyo value no figura entre sus
     opciones se dibuja en blanco, y el siguiente «Guardar» escribe ese
     blanco. Mientras el valor actual sea una opción, abrir el panel y guardar
     no puede borrar nada. */
  it('un banco desconocido entra como primera opción', () => {
    const op = opcionesDeBanco('Coopeuch')
    expect(op[0]).toBe('Coopeuch')
    expect(op).toHaveLength(BANCOS.length + 1)
  })
})
