import { describe, it, expect } from 'vitest'
import { jefeQueSeEntera, escaparHtml, claveAvisoSinAprobador, destinatariosResultadoFondo } from '@/lib/avisos-helpers'

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

/* El jefe del beneficiario se entera, no autoriza (Daniel, 2026-10-07).
   El caso que esto cubre: administración le pide un fondo a alguien de terreno.
   Quien autoriza es el jefe de la obra; el jefe de la persona tiene derecho a
   saber que a su gente le van a entregar plata, pero no decide. */
describe('jefeQueSeEntera', () => {
  const base = {
    solicitanteId:         'admin',
    beneficiarioId:        'empleado',
    jefeDelBeneficiario:   'jefe-directo',
    aprobadorDelDocumento: 'jefe-de-obra',
  }

  it('avisa al jefe del beneficiario cuando lo pidió otra persona', () => {
    expect(jefeQueSeEntera(base)).toBe('jefe-directo')
  })

  it('no avisa a nadie si el empleado pidió el suyo', () => {
    expect(jefeQueSeEntera({ ...base, solicitanteId: 'empleado' })).toBeNull()
  })

  // Daniel fue explícito: sin jefe definido no se envía nada a nadie
  it('sin jefe definido, no avisa', () => {
    expect(jefeQueSeEntera({ ...base, jefeDelBeneficiario: null })).toBeNull()
  })

  it('no duplica: si el jefe del beneficiario ya es quien aprueba, no se le avisa dos veces', () => {
    expect(jefeQueSeEntera({ ...base, aprobadorDelDocumento: 'jefe-directo' })).toBeNull()
  })

  it('tampoco se avisa a sí mismo si el beneficiario fuera su propio jefe', () => {
    expect(jefeQueSeEntera({ ...base, jefeDelBeneficiario: 'empleado' })).toBeNull()
  })
})
