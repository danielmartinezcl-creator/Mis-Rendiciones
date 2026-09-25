import { describe, it, expect } from 'vitest'
import { escaparHtml, claveAvisoSinAprobador, destinatariosResultadoFondo } from '@/lib/avisos-helpers'

describe('escaparHtml', () => {
  it('neutraliza las etiquetas y las comillas', () => {
    expect(escaparHtml('<a href="https://otro.sitio">Revisar</a>'))
      .toBe('&lt;a href=&quot;https://otro.sitio&quot;&gt;Revisar&lt;/a&gt;')
    expect(escaparHtml("O'Higgins & Cía")).toBe('O&#39;Higgins &amp; Cía')
  })

  it('no toca un texto normal, con tildes y eñes', () => {
    expect(escaparHtml('Viaje a Concepción — Muñoz')).toBe('Viaje a Concepción — Muñoz')
  })

  it('el & va primero: no escapa dos veces lo que ya escapó', () => {
    expect(escaparHtml('<')).toBe('&lt;')
    expect(escaparHtml('&lt;')).toBe('&amp;lt;')
  })
})

describe('claveAvisoSinAprobador', () => {
  const admin = '00000000-0000-0000-0000-000000000abc'

  it('una clave por empleado, día y admin', () => {
    expect(claveAvisoSinAprobador('Francisco Díaz', '2026-09-24', admin))
      .toBe(`config_missing:Francisco Díaz:2026-09-24:${admin}`)
    expect(claveAvisoSinAprobador('Francisco Díaz', '2026-09-25', admin))
      .not.toBe(claveAvisoSinAprobador('Francisco Díaz', '2026-09-24', admin))
  })

  it('cabe en la columna (varchar 150) aunque el nombre sea larguísimo', () => {
    expect(claveAvisoSinAprobador('x'.repeat(500), '2026-09-24', admin).length).toBeLessThanOrEqual(150)
  })
})

describe('destinatariosResultadoFondo (F16)', () => {
  it('fondos enviados: solo el beneficiario, que es quien los recibe', () => {
    expect(destinatariosResultadoFondo('funds_sent', 'kc', 'fd', 'fh')).toEqual(['fd'])
    // Nunca a quien acaba de actuar
    expect(destinatariosResultadoFondo('funds_sent', 'kc', 'fh', 'fh')).toEqual([])
  })

  it('rechazo y liquidación cerrada: el EFF y el beneficiario, sin quien actuó', () => {
    expect(destinatariosResultadoFondo('rejected', 'kc', 'fd', 'fh')).toEqual(['kc', 'fd'])
    expect(destinatariosResultadoFondo('settled', 'kc', 'fd', 'kc')).toEqual(['fd'])
  })
})
