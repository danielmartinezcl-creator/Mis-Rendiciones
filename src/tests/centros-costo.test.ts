import { describe, it, expect } from 'vitest'
import {
  LARGO_SEGMENTO, normalizarCodigo, profundidad, codigoDePadre, armarCodigo,
  erroresDeAlta, ordenarEnArbol, sePuedeBorrar, abiertasPorOmision, visiblesEnArbol,
  type CentroExistente,
} from '@/lib/centros-costo'

const PENTA: CentroExistente[] = [
  { id: 'EMP',          descripcion: 'EMPRESA' },
  { id: 'EMPGES',       descripcion: 'AREAS DE GESTION' },
  { id: 'EMPGESING',    descripcion: 'INGENIERIA' },
  { id: 'EMPGESINGELE', descripcion: 'ELECTRICIDAD' },
  { id: 'EMPNEG',       descripcion: 'AREAS DE NEGOCIOS' },
]

describe('normalizarCodigo', () => {
  it('a mayúsculas: Defontana los tiene así', () => {
    expect(normalizarCodigo('empgesing')).toBe('EMPGESING')
  })
  it('saca puntos, espacios y guiones — lo que el admin copia y pega', () => {
    expect(normalizarCodigo(' emp-ges.ing ')).toBe('EMPGESING')
  })
  it('deja los números: no todos los planes de cuentas son solo letras', () => {
    expect(normalizarCodigo('obr01')).toBe('OBR01')
  })
  it('saca los acentos en vez de dejarlos pasar a Defontana', () => {
    expect(normalizarCodigo('ingeniería')).toBe('INGENIERIA')
  })
})

describe('profundidad y codigoDePadre', () => {
  it('el código se lee de tres en tres: cada tramo es un nivel', () => {
    expect(LARGO_SEGMENTO).toBe(3)
    expect(profundidad('EMP')).toBe(1)
    expect(profundidad('EMPGES')).toBe(2)
    expect(profundidad('EMPGESING')).toBe(3)
    expect(profundidad('EMPGESINGELE')).toBe(4)
  })
  it('el padre es el código sin su último tramo', () => {
    expect(codigoDePadre('EMPGESINGELE')).toBe('EMPGESING')
    expect(codigoDePadre('EMPGES')).toBe('EMP')
  })
  it('la raíz no tiene padre', () => {
    expect(codigoDePadre('EMP')).toBeNull()
  })
  /* Un código que no es múltiplo de tres no lo creó esta pantalla. No se
     inventa un padre para él: se muestra arriba y se deja en paz. */
  it('un código fuera de la convención queda en el primer nivel, sin padre', () => {
    expect(profundidad('OBRA1')).toBe(1)
    expect(codigoDePadre('OBRA1')).toBeNull()
  })
})

describe('armarCodigo', () => {
  it('pega el tramo nuevo al padre', () => {
    expect(armarCodigo('EMPGESING', 'mec')).toBe('EMPGESINGMEC')
  })
  it('sin padre, el tramo es el código entero', () => {
    expect(armarCodigo('', 'obr')).toBe('OBR')
  })
})

describe('erroresDeAlta', () => {
  const alta = (x: Partial<Parameters<typeof erroresDeAlta>[0]>) =>
    erroresDeAlta({ padre: '', sufijo: '', descripcion: '', ...x }, PENTA)

  it('un alta correcta no tiene errores', () => {
    expect(alta({ padre: 'EMPGESING', sufijo: 'MEC', descripcion: 'MECANICA' })).toEqual([])
  })
  it('sin las tres letras no hay código', () => {
    expect(alta({ padre: 'EMPGESING', descripcion: 'MECANICA' }).join(' ')).toMatch(/tres/i)
  })
  it('dos letras no alcanzan, y el error dice cuántas hay', () => {
    const e = alta({ padre: 'EMPGESING', sufijo: 'ME', descripcion: 'MECANICA' }).join(' ')
    expect(e).toMatch(/tres/i)
    expect(e).toContain('2')
  })
  it('cuatro letras tampoco', () => {
    expect(alta({ padre: 'EMPGESING', sufijo: 'MECA', descripcion: 'MECANICA' }).join(' '))
      .toMatch(/tres/i)
  })
  it('sin nombre no entra: el nombre es lo que se ve en los informes', () => {
    expect(alta({ padre: 'EMPGESING', sufijo: 'MEC' }).join(' ')).toMatch(/nombre/i)
  })
  it('un código repetido dice de quién es, para no pisarlo', () => {
    const e = alta({ padre: 'EMPGES', sufijo: 'ING', descripcion: 'OTRA COSA' }).join(' ')
    expect(e).toContain('EMPGESING')
    expect(e).toContain('INGENIERIA')
  })
  it('un padre que no existe es error: el código quedaría colgando', () => {
    expect(alta({ padre: 'NOEXISTE', sufijo: 'MEC', descripcion: 'MECANICA' }).join(' '))
      .toMatch(/no existe/i)
  })
  it('el código no pasa de 50 caracteres: es el largo de la columna', () => {
    expect(alta({ padre: 'A'.repeat(49), sufijo: 'MEC', descripcion: 'X' }).join(' '))
      .toContain('50')
  })
})

describe('ordenarEnArbol', () => {
  const filas = [
    { id: 'EMPNEG',       descripcion: 'AREAS DE NEGOCIOS' },
    { id: 'EMPGESINGELE', descripcion: 'ELECTRICIDAD' },
    { id: 'EMP',          descripcion: 'EMPRESA' },
    { id: 'EMPGES',       descripcion: 'AREAS DE GESTION' },
    { id: 'EMPGESING',    descripcion: 'INGENIERIA' },
  ]

  it('ordena por código, que es lo que arma el árbol', () => {
    expect(ordenarEnArbol(filas).map(f => f.id))
      .toEqual(['EMP', 'EMPGES', 'EMPGESING', 'EMPGESINGELE', 'EMPNEG'])
  })
  it('cada fila trae su nivel, para la sangría', () => {
    expect(ordenarEnArbol(filas).map(f => f.nivel)).toEqual([1, 2, 3, 4, 2])
  })
  /* Un hijo cuyo padre no está en la lista —porque el padre se desactivó y la
     vista filtra, o porque falta— se muestra igual, nunca se esconde. */
  it('un hijo sin padre en la lista aparece y queda marcado', () => {
    const r = ordenarEnArbol([{ id: 'EMPGESINGELE', descripcion: 'ELECTRICIDAD' }])
    expect(r).toHaveLength(1)
    expect(r[0].sinPadre).toBe(true)
  })
  it('con el padre presente no está marcado', () => {
    const r = ordenarEnArbol(filas)
    expect(r.every(f => !f.sinPadre)).toBe(true)
  })
})

describe('sePuedeBorrar', () => {
  it('un centro recién creado y sin usar se borra: así se arregla un código mal escrito', () => {
    expect(sePuedeBorrar({ personas: 0, gastos: 0, hijos: 0 })).toBe(true)
  })
  it('con gente asignada no: desactivar es lo correcto', () => {
    expect(sePuedeBorrar({ personas: 1, gastos: 0, hijos: 0 })).toBe(false)
  })
  it('con gastos imputados no: la contabilidad lo referencia', () => {
    expect(sePuedeBorrar({ personas: 0, gastos: 3, hijos: 0 })).toBe(false)
  })
  it('con hijos no: dejaría al árbol sin su rama', () => {
    expect(sePuedeBorrar({ personas: 0, gastos: 0, hijos: 2 })).toBe(false)
  })
})

/* El árbol real de PENTA, reducido: 1 raíz · 3 ramas · 9 áreas · 36 hojas.
   Sin plegar son 49 filas de ~130 px en el teléfono: siete pantallas. */
const ARBOL_PENTA = ordenarEnArbol([
  { id: 'EMP',          descripcion: 'EMPRESA' },
  { id: 'EMPGES',       descripcion: 'AREAS DE GESTION' },
  { id: 'EMPGESING',    descripcion: 'INGENIERIA' },
  { id: 'EMPGESINGELE', descripcion: 'ELECTRICIDAD' },
  { id: 'EMPGESINGMEC', descripcion: 'MECANICA' },
  { id: 'EMPGESFIN',    descripcion: 'FINANZAS' },
  { id: 'EMPGESFINADM', descripcion: 'ADMINISTRACION' },
  { id: 'EMPNEG',       descripcion: 'NEGOCIOS' },
  { id: 'EMPPRU',       descripcion: 'CENTRO PRUEBA' },
])
const ids = (xs: { id: string }[]) => xs.map(x => x.id)

describe('abiertasPorOmision', () => {
  it('abre la estructura y deja las hojas plegadas', () => {
    const abiertas = abiertasPorOmision(ARBOL_PENTA)
    expect([...abiertas].sort()).toEqual(['EMP', 'EMPGES', 'EMPNEG', 'EMPPRU'])
  })
})

describe('visiblesEnArbol', () => {
  const abiertas = abiertasPorOmision(ARBOL_PENTA)

  it('por omisión se ven la raíz, las ramas y las áreas — no las hojas', () => {
    expect(ids(visiblesEnArbol(ARBOL_PENTA, abiertas)))
      .toEqual(['EMP', 'EMPGES', 'EMPGESFIN', 'EMPGESING', 'EMPNEG', 'EMPPRU'])
  })

  /* «20 dentro» tiene que decir cuántos HAY, no cuántos se están viendo: si
     contara lo visible, un nodo plegado diría 0 y plegar escondería que hay
     algo adentro. */
  it('el conteo es del subárbol completo, aunque esté plegado', () => {
    const v = visiblesEnArbol(ARBOL_PENTA, abiertas)
    expect(v.find(f => f.id === 'EMPGESING')).toMatchObject({ dentro: 2, plegado: true })
    expect(v.find(f => f.id === 'EMPGES')).toMatchObject({ dentro: 5, plegado: false })
    expect(v.find(f => f.id === 'EMPPRU')).toMatchObject({ dentro: 0, plegado: false })
  })

  it('abrir un área muestra sus hojas, y solo las suyas', () => {
    const v = visiblesEnArbol(ARBOL_PENTA, new Set([...abiertas, 'EMPGESING']))
    expect(ids(v)).toContain('EMPGESINGELE')
    expect(ids(v)).toContain('EMPGESINGMEC')
    expect(ids(v)).not.toContain('EMPGESFINADM')
  })

  it('cerrar una rama esconde todo lo que cuelga, a cualquier profundidad', () => {
    const v = visiblesEnArbol(ARBOL_PENTA, new Set(['EMP']))
    expect(ids(v)).toEqual(['EMP', 'EMPGES', 'EMPNEG', 'EMPPRU'])
  })

  it('sin nada abierto queda solo la raíz', () => {
    expect(ids(visiblesEnArbol(ARBOL_PENTA, new Set()))).toEqual(['EMP'])
  })

  /* Un huérfano colgaría de un nodo que no existe: esconderlo lo volvería
     inalcanzable justo cuando hay que arreglarlo. */
  it('un centro sin padre se ve siempre', () => {
    const arbol = ordenarEnArbol([
      { id: 'EMP',          descripcion: 'EMPRESA' },
      { id: 'XXXYYYZZZ',    descripcion: 'HUERFANO' },
    ])
    expect(ids(visiblesEnArbol(arbol, new Set()))).toEqual(['EMP', 'XXXYYYZZZ'])
  })
})
