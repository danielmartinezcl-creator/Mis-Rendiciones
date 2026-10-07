import { describe, it, expect } from 'vitest'
import {
  resolverCadena, requiereN2, umbralAplicable, normalizarNumeroProyecto, entradaDesdeFilas,
  type EntradaCadena,
} from '@/lib/cadena-proyecto'

const base: EntradaCadena = {
  jefeProyecto: null, jefePropio: null, defectoOrg: null,
  n2Propio: null, n2Org: null,
  umbralPropio: null, umbralOrg: null,
  totalSolicitado: 100_000,
}

describe('resolverCadena — de dónde sale el N1', () => {
  it('el jefe de proyecto le gana a todo', () => {
    const c = resolverCadena({ ...base, jefeProyecto: 'jp', jefePropio: 'propio', defectoOrg: 'org' })
    expect(c.l1).toBe('jp')
    expect(c.origen).toBe('proyecto')
  })

  it('sin proyecto, manda el jefe propio', () => {
    const c = resolverCadena({ ...base, jefePropio: 'propio', defectoOrg: 'org' })
    expect(c.l1).toBe('propio')
    expect(c.origen).toBe('jefe-propio')
  })

  it('sin proyecto ni jefe propio, el de la organización', () => {
    const c = resolverCadena({ ...base, defectoOrg: 'org' })
    expect(c.l1).toBe('org')
    expect(c.origen).toBe('organizacion')
  })

  // Es el único caso que sigue bloqueando el envío, como hoy
  it('sin nada, no hay N1', () => {
    expect(resolverCadena(base).l1).toBeNull()
    expect(resolverCadena(base).origen).toBe('ninguno')
  })
})

describe('resolverCadena — cuándo aparece el N2', () => {
  // Daniel, 2026-10-07: un N2 sin monto firma siempre, como antes de la 039.
  // Con «sin monto = nunca», quien ya tenía N2 en la ficha lo perdía en
  // silencio al desplegar, porque nadie había cargado un número todavía.
  it('un N2 propio sin monto firma siempre', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', n2Propio: 'n2', totalSolicitado: 1 })
    expect(c.l2).toBe('n2')
    expect(c.umbral).toBeNull()
  })

  it('el N2 de la organización sin monto también firma siempre', () => {
    const c = resolverCadena({ ...base, defectoOrg: 'org', n2Org: 'n2org', totalSolicitado: 1 })
    expect(c.l2).toBe('n2org')
  })

  it('sin ningún N2 no hay segunda firma, haya o no monto', () => {
    expect(resolverCadena({ ...base, jefePropio: 'p' }).l2).toBeNull()
    expect(resolverCadena({ ...base, jefePropio: 'p', umbralPropio: 100, totalSolicitado: 500 }).l2).toBeNull()
  })

  it('umbral 0 significa siempre', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', n2Propio: 'n2', umbralPropio: 0, totalSolicitado: 1 })
    expect(c.l2).toBe('n2')
  })

  it('alcanzar el umbral ya escala', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', n2Propio: 'n2', umbralPropio: 500_000, totalSolicitado: 500_000 })
    expect(c.l2).toBe('n2')
    expect(c.umbral).toBe(500_000)
  })

  it('por debajo del umbral, no escala', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', n2Propio: 'n2', umbralPropio: 500_000, totalSolicitado: 499_999 })
    expect(c.l2).toBeNull()
  })

  it('el N2 de la organización respeta el monto de la organización', () => {
    expect(resolverCadena({ ...base, defectoOrg: 'org', n2Org: 'n2org', umbralOrg: 500, totalSolicitado: 499 }).l2).toBeNull()
    expect(resolverCadena({ ...base, defectoOrg: 'org', n2Org: 'n2org', umbralOrg: 500, totalSolicitado: 500 }).l2).toBe('n2org')
  })

  // El monto de la organización acompaña a SU N2, no al de la ficha: si no, que
  // el admin ponga un monto general le sacaría la segunda firma a quien la
  // tiene configurada a mano (Francisco Díaz: siempre Katherine y después Hagar).
  it('un N2 propio sin monto ignora el monto de la organización', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', n2Propio: 'n2', umbralOrg: 1_000_000, totalSolicitado: 1 })
    expect(c.l2).toBe('n2')
  })

  // Lo que evita que configurar un umbral borre en silencio el N2 de la organización
  it('el monto de la ficha también vale para el N2 de la organización', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', umbralPropio: 100, n2Org: 'n2org', umbralOrg: 9_000, totalSolicitado: 500 })
    expect(c.l2).toBe('n2org')
    expect(c.umbral).toBe(100)
  })

  // Nadie decide dos veces el mismo documento
  it('si el N2 resuelto es el mismo que el N1, se descarta', () => {
    const c = resolverCadena({ ...base, jefePropio: 'x', n2Propio: 'x', totalSolicitado: 1 })
    expect(c.l2).toBeNull()
  })
})

describe('requiereN2', () => {
  it('sin monto, siempre', () => {
    expect(requiereN2(1, null)).toBe(true)
  })
  it('con monto, desde ese monto', () => {
    expect(requiereN2(999, 1000)).toBe(false)
    expect(requiereN2(1000, 1000)).toBe(true)
  })
})

describe('umbralAplicable', () => {
  it('el monto de la ficha le gana al de la organización', () => {
    expect(umbralAplicable({ n2Propio: null, umbralPropio: 1000, umbralOrg: 100 })).toBe(1000)
  })
  it('sin monto en la ficha y con el N2 de la organización, el de la organización', () => {
    expect(umbralAplicable({ n2Propio: null, umbralPropio: null, umbralOrg: 100 })).toBe(100)
  })
  it('sin monto en la ficha y con N2 propio, ninguno: firma siempre', () => {
    expect(umbralAplicable({ n2Propio: 'n2', umbralPropio: null, umbralOrg: 100 })).toBeNull()
  })
})

describe('normalizarNumeroProyecto', () => {
  it('saca espacios y ceros a la izquierda', () => {
    expect(normalizarNumeroProyecto('  02991 ')).toBe('2991')
  })
  it('respeta un número que no es solo dígitos', () => {
    expect(normalizarNumeroProyecto(' A-14 ')).toBe('A-14')
  })
  it('mayúsculas, para que 2991a y 2991A sean el mismo', () => {
    expect(normalizarNumeroProyecto('2991a')).toBe('2991A')
  })
  it('vacío es vacío', () => {
    expect(normalizarNumeroProyecto('   ')).toBe('')
  })
})

describe('entradaDesdeFilas', () => {
  it('sin proyecto, el jefe de proyecto queda en null', () => {
    const e = entradaDesdeFilas({
      proyecto: null,
      persona: { approver_l1_id: 'p', approver_l2_id: null, umbral_n2_clp: null },
      org: { aprobador_defecto_id: 'o', aprobador_n2_defecto_id: null, umbral_n2_clp: 500 },
      total: 900,
    })
    expect(e.jefeProyecto).toBeNull()
    expect(e.umbralOrg).toBe(500)
  })

  it('con proyecto, su jefe entra como jefeProyecto', () => {
    const e = entradaDesdeFilas({
      proyecto: { jefe_id: 'jp' },
      persona: { approver_l1_id: 'p', approver_l2_id: 'n2', umbral_n2_clp: 1000 },
      org: { aprobador_defecto_id: 'o', aprobador_n2_defecto_id: 'n2org', umbral_n2_clp: 500 },
      total: 900,
    })
    expect(e.jefeProyecto).toBe('jp')
    expect(resolverCadena(e).l1).toBe('jp')
  })
})
