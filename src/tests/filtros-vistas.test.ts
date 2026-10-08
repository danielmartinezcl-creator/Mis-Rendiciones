import { describe, it, expect } from 'vitest'
import { depurarVista, coincideConVista, erroresDeNombre, LARGO_NOMBRE } from '@/lib/filtros/vistas'
import { valoresVacios, type Dimension, type Valores } from '@/lib/filtros/dimensiones'

const DIMS: Dimension[] = [
  { clave: 'empleados', nombre: 'Empleado', plural: 'empleados', destacada: true, tipo: 'multi',
    opciones: [{ id: 'u1', etiqueta: 'Claudia' }, { id: 'u2', etiqueta: 'Edwin' }] },
  { clave: 'estados', nombre: 'Estado', plural: 'estados', destacada: true, tipo: 'multi',
    opciones: [{ id: 'approved', etiqueta: 'Aprobada' }] },
  { clave: 'fecha', nombre: 'Fecha de envío', destacada: true, tipo: 'fecha' },
  { clave: 'reembolso', nombre: 'Reembolso', destacada: false, tipo: 'unico',
    opciones: [{ id: 'pendiente', etiqueta: 'Pendiente' }] },
]

describe('depurarVista', () => {
  /* Una vista guardada puede nombrar a alguien que se fue de la empresa o una
     categoría borrada. Se descarta en silencio: romper la vista entera por un
     id viejo sería peor que mostrarla de menos. */
  it('saca los ids que ya no están entre las opciones', () => {
    const v: Valores = { ...valoresVacios(DIMS), empleados: { tipo: 'multi', ids: ['u1', 'se-fue'] } }
    expect(depurarVista(v, DIMS).empleados).toEqual({ tipo: 'multi', ids: ['u1'] })
  })

  it('si no queda ninguno, la dimensión queda sin poner y no filtra nada', () => {
    const v: Valores = { ...valoresVacios(DIMS), empleados: { tipo: 'multi', ids: ['se-fue'] } }
    expect(depurarVista(v, DIMS).empleados).toEqual({ tipo: 'multi', ids: [] })
  })

  it('lo mismo con una sola opción', () => {
    const v: Valores = { ...valoresVacios(DIMS), reembolso: { tipo: 'unico', id: 'ya-no-existe' } }
    expect(depurarVista(v, DIMS).reembolso).toEqual({ tipo: 'unico', id: null })
  })

  it('la fecha y el texto pasan tal cual: no dependen de ninguna lista', () => {
    const v: Valores = {
      ...valoresVacios(DIMS),
      fecha: { tipo: 'fecha', preset: 'elegir', desde: '2026-08-01', hasta: null },
    }
    expect(depurarVista(v, DIMS).fecha)
      .toEqual({ tipo: 'fecha', preset: 'elegir', desde: '2026-08-01', hasta: null })
  })

  /* El jsonb guardado puede traer una clave de una versión anterior de la
     pantalla. No es un error: deja de existir. */
  it('una clave que ya no es dimensión desaparece', () => {
    const v = { ...valoresVacios(DIMS), departamento: { tipo: 'multi' as const, ids: ['x'] } }
    expect(Object.keys(depurarVista(v, DIMS))).not.toContain('departamento')
  })

  it('una dimensión nueva que la vista no traía queda sin poner', () => {
    const r = depurarVista({}, DIMS)
    expect(r).toEqual(valoresVacios(DIMS))
  })

  /* Guardar un `unico` en una clave que ahora es `multi` pasó de verdad cuando
     una pantalla cambió de forma. Vale lo mismo que no traer nada. */
  it('un valor del tipo equivocado se descarta', () => {
    const v = { ...valoresVacios(DIMS), empleados: { tipo: 'unico' as const, id: 'u1' } }
    expect(depurarVista(v, DIMS).empleados).toEqual({ tipo: 'multi', ids: [] })
  })
})

describe('coincideConVista', () => {
  const vista: Valores = { ...valoresVacios(DIMS), empleados: { tipo: 'multi', ids: ['u1', 'u2'] } }

  it('lo mismo coincide', () => {
    expect(coincideConVista(vista, vista, DIMS)).toBe(true)
  })

  /* El orden en que se marcaron las casillas no es parte de la vista. */
  it('el orden de los ids no importa', () => {
    const otro: Valores = { ...valoresVacios(DIMS), empleados: { tipo: 'multi', ids: ['u2', 'u1'] } }
    expect(coincideConVista(otro, vista, DIMS)).toBe(true)
  })

  it('un id de más no coincide', () => {
    const otro: Valores = { ...valoresVacios(DIMS), empleados: { tipo: 'multi', ids: ['u1'] } }
    expect(coincideConVista(otro, vista, DIMS)).toBe(false)
  })

  it('tocar otra dimensión tampoco coincide', () => {
    const otro: Valores = { ...vista, reembolso: { tipo: 'unico', id: 'pendiente' } }
    expect(coincideConVista(otro, vista, DIMS)).toBe(false)
  })

  /* Que falte una clave y que esté puesta en vacío son lo mismo: las dos
     significan «sin poner». */
  it('una clave ausente vale lo mismo que una vacía', () => {
    expect(coincideConVista({}, valoresVacios(DIMS), DIMS)).toBe(true)
  })
})

describe('erroresDeNombre', () => {
  it('un nombre nuevo no tiene errores', () => {
    expect(erroresDeNombre('Por pagar', ['Sin contabilizar'])).toEqual([])
  })
  it('vacío no sirve', () => {
    expect(erroresDeNombre('   ', []).join(' ')).toMatch(/nombre/i)
  })
  it('demasiado largo tampoco, y el error dice el tope', () => {
    expect(erroresDeNombre('x'.repeat(LARGO_NOMBRE + 1), []).join(' ')).toContain(String(LARGO_NOMBRE))
  })
  it('repetido no entra', () => {
    expect(erroresDeNombre('Por pagar', ['Por pagar']).join(' ')).toMatch(/ya (existe|hay)/i)
  })
  /* La base lo rechaza por el índice único, pero ahí el error es ilegible y
     llega tarde. Acá se compara como lo lee una persona. */
  it('repetido sin distinguir mayúsculas, acentos ni espacios de más', () => {
    expect(erroresDeNombre('  por  PAGAR ', ['Por pagar'])).not.toEqual([])
    expect(erroresDeNombre('Mas de 5 dias', ['Más de 5 días'])).not.toEqual([])
  })
  it('el nombre que se está renombrando no choca consigo mismo', () => {
    expect(erroresDeNombre('Por pagar', ['Por pagar'], 'Por pagar')).toEqual([])
  })
})
