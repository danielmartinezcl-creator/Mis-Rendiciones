import { describe, it, expect } from 'vitest'
import {
  resolverCadena, requiereN2, normalizarNumeroProyecto, entradaDesdeFilas,
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
  it('sin umbral configurado, nunca', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', n2Propio: 'n2', totalSolicitado: 9_000_000 })
    expect(c.l2).toBeNull()
  })

  it('umbral 0 significa siempre', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', n2Propio: 'n2', umbralPropio: 0, totalSolicitado: 1 })
    expect(c.l2).toBe('n2')
  })

  it('alcanzar el umbral ya escala', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', n2Propio: 'n2', umbralPropio: 500_000, totalSolicitado: 500_000 })
    expect(c.l2).toBe('n2')
  })

  it('por debajo del umbral, no escala', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', n2Propio: 'n2', umbralPropio: 500_000, totalSolicitado: 499_999 })
    expect(c.l2).toBeNull()
  })

  // Lo que evita que configurar un umbral borre en silencio el N2 de la organización
  it('el umbral y el N2 se heredan por separado', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', umbralPropio: 100, n2Org: 'n2org', totalSolicitado: 500 })
    expect(c.l2).toBe('n2org')
  })

  it('supera el umbral pero no hay ningún N2: queda sin N2, no falla', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', umbralPropio: 100, totalSolicitado: 500 })
    expect(c.l2).toBeNull()
  })

  // Nadie decide dos veces el mismo documento
  it('si el N2 resuelto es el mismo que el N1, se descarta', () => {
    const c = resolverCadena({ ...base, jefePropio: 'x', n2Propio: 'x', umbralPropio: 0, totalSolicitado: 1 })
    expect(c.l2).toBeNull()
  })
})

describe('requiereN2', () => {
  it('el umbral propio le gana al de la organización', () => {
    expect(requiereN2(300, 1000, 100)).toBe(false)
  })
  it('sin umbral propio, cae al de la organización', () => {
    expect(requiereN2(300, null, 100)).toBe(true)
  })
  it('sin ningún umbral, nunca', () => {
    expect(requiereN2(9_999_999, null, null)).toBe(false)
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
