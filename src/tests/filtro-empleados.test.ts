import { describe, it, expect } from 'vitest'
import {
  aplicarFiltroEmpleados, dimensionesDeEmpleados, faltanDatosBancarios,
  type EmpleadoFiltrable,
} from '@/lib/filtro-empleados'
import { valoresVacios, type Valores } from '@/lib/filtros/dimensiones'

const base: EmpleadoFiltrable = {
  id: 'u1', nombre: 'Lobos Moraga Claudia', correo: 'clobos@pentaingenieros.cl',
  rut: '12.345.678-9', departamento: 'Gestión de Personas', estado: 'activa',
  banco: 'BCI', numeroCuenta: '00012345',
}
const p = (x: Partial<EmpleadoFiltrable>): EmpleadoFiltrable => ({ ...base, ...x })

const DIMS = dimensionesDeEmpleados(['Gestión de Personas', 'Ingeniería'])
const vacios = valoresVacios(DIMS)
const con = (v: Valores): Valores => ({ ...vacios, ...v })
const ids = (xs: EmpleadoFiltrable[]) => xs.map(x => x.id)

describe('faltanDatosBancarios', () => {
  it('con banco y número, están completos', () => {
    expect(faltanDatosBancarios(base)).toBe(false)
  })
  /* Con uno de los dos no se puede pagar, así que falta igual. */
  it('sin banco faltan', () => {
    expect(faltanDatosBancarios(p({ banco: null }))).toBe(true)
  })
  it('sin número de cuenta faltan', () => {
    expect(faltanDatosBancarios(p({ numeroCuenta: null }))).toBe(true)
  })
  it('un campo con solo espacios es un campo vacío', () => {
    expect(faltanDatosBancarios(p({ numeroCuenta: '   ' }))).toBe(true)
  })
})

describe('aplicarFiltroEmpleados', () => {
  it('sin filtro pasan todos', () => {
    const xs = [p({ id: 'a' }), p({ id: 'b' })]
    expect(ids(aplicarFiltroEmpleados(xs, vacios))).toEqual(['a', 'b'])
  })

  it('estado', () => {
    const xs = [p({ id: 'a' }), p({ id: 'b', estado: 'inactiva' }), p({ id: 'c', estado: 'bloqueada' })]
    expect(ids(aplicarFiltroEmpleados(xs, con({ estado: { tipo: 'unico', id: 'activa' } })))).toEqual(['a'])
    expect(ids(aplicarFiltroEmpleados(xs, con({ estado: { tipo: 'unico', id: 'bloqueada' } })))).toEqual(['c'])
  })

  it('departamento', () => {
    const xs = [p({ id: 'a' }), p({ id: 'b', departamento: 'Ingeniería' })]
    expect(ids(aplicarFiltroEmpleados(xs, con({ departamento: { tipo: 'unico', id: 'Ingeniería' } }))))
      .toEqual(['b'])
  })

  it('datos bancarios', () => {
    const xs = [p({ id: 'con' }), p({ id: 'sin', banco: null })]
    expect(ids(aplicarFiltroEmpleados(xs, con({ banco: { tipo: 'unico', id: 'faltan' } })))).toEqual(['sin'])
    expect(ids(aplicarFiltroEmpleados(xs, con({ banco: { tipo: 'unico', id: 'completos' } })))).toEqual(['con'])
  })

  describe('el buscador, que es el de siempre', () => {
    const xs = [
      p({ id: 'claudia' }),
      p({ id: 'edwin', nombre: 'Seaton Ocoro Edwin', correo: 'eseaton@pentaingenieros.cl',
          rut: '19.284.863-6', departamento: 'Ingeniería' }),
    ]
    it('busca por nombre', () => {
      expect(ids(aplicarFiltroEmpleados(xs, con({ busca: { tipo: 'texto', texto: 'seaton' } }))))
        .toEqual(['edwin'])
    })
    it('por correo', () => {
      expect(ids(aplicarFiltroEmpleados(xs, con({ busca: { tipo: 'texto', texto: 'clobos' } }))))
        .toEqual(['claudia'])
    })
    it('por RUT', () => {
      expect(ids(aplicarFiltroEmpleados(xs, con({ busca: { tipo: 'texto', texto: '19.284' } }))))
        .toEqual(['edwin'])
    })
    it('por departamento', () => {
      expect(ids(aplicarFiltroEmpleados(xs, con({ busca: { tipo: 'texto', texto: 'ingenieria' } }))))
        .toEqual(['edwin'])
    })
    /* «ingenieria» tiene que encontrar «Ingeniería»: nadie escribe los acentos
       en un buscador. */
    it('sin importar acentos ni mayúsculas', () => {
      expect(ids(aplicarFiltroEmpleados(xs, con({ busca: { tipo: 'texto', texto: 'INGENIERÍA' } }))))
        .toEqual(['edwin'])
    })
  })

  it('el buscador y un chip se cumplen los dos', () => {
    const xs = [
      p({ id: 'a', nombre: 'Díaz Eduardo' }),
      p({ id: 'b', nombre: 'Díaz Francisco', estado: 'inactiva' }),
    ]
    const v = con({
      busca:  { tipo: 'texto', texto: 'diaz' },
      estado: { tipo: 'unico', id: 'activa' },
    })
    expect(ids(aplicarFiltroEmpleados(xs, v))).toEqual(['a'])
  })

  /* Daniel, 2026-10-09: «lo eliminé de la papelera y sigue apareciendo en
     empleados». Un usuario no se borra de verdad (migración 027), así que
     «eliminar definitivamente» lo bloquea y le baja deleted_at, y volvía a
     la lista con un chip rojo. */
  describe('quien quedó bloqueado salió de la nómina', () => {
    const xs = [
      p({ id: 'activa' }),
      p({ id: 'jul', nombre: 'Jul Prueba', correo: 'jul@pentaingenieros.cl',
          rut: '11.111.111-1', estado: 'bloqueada' }),
    ]

    it('sin pedir nada no aparece', () => {
      expect(ids(aplicarFiltroEmpleados(xs, vacios))).toEqual(['activa'])
    })

    /* Las dos puertas: el chip y el buscador. Sin ninguna de las dos,
       «Habilitar» quedaría fuera de alcance y un bloqueo por error no se
       desharía desde ninguna pantalla. */
    it('el chip «Bloqueados» lo trae', () => {
      expect(ids(aplicarFiltroEmpleados(xs, con({ estado: { tipo: 'unico', id: 'bloqueada' } }))))
        .toEqual(['jul'])
    })

    it('buscarlo por su nombre lo trae', () => {
      expect(ids(aplicarFiltroEmpleados(xs, con({ busca: { tipo: 'texto', texto: 'jul prueba' } }))))
        .toEqual(['jul'])
    })

    it('y por su RUT, que es como lo encuentra la planilla', () => {
      expect(ids(aplicarFiltroEmpleados(xs, con({ busca: { tipo: 'texto', texto: '11.111' } }))))
        .toEqual(['jul'])
    })

    /* Un departamento es recorrer un grupo, no pedir a una persona: ahí el
       bloqueado sigue afuera. */
    it('filtrar por departamento no lo devuelve', () => {
      const v = con({ departamento: { tipo: 'unico', id: 'Gestión de Personas' } })
      expect(ids(aplicarFiltroEmpleados(xs, v))).toEqual(['activa'])
    })

    it('un espacio escrito en el buscador no es pedir a nadie', () => {
      expect(ids(aplicarFiltroEmpleados(xs, con({ busca: { tipo: 'texto', texto: '   ' } }))))
        .toEqual(['activa'])
    })

    /* Que no se vaya de mano: desactivar NO es salir de la nómina. */
    it('un desactivado sí sale sin pedir nada', () => {
      const ys = [p({ id: 'a' }), p({ id: 'b', estado: 'inactiva' })]
      expect(ids(aplicarFiltroEmpleados(ys, vacios))).toEqual(['a', 'b'])
    })
  })
})

describe('dimensionesDeEmpleados', () => {
  it('las cuatro a la vista', () => {
    expect(DIMS.map(d => d.clave)).toEqual(['busca', 'estado', 'departamento', 'banco'])
    expect(DIMS.every(d => d.destacada)).toBe(true)
  })

  /* La lista no trae a los de la papelera (`getOrgEmployees` filtra
     `deleted_at`), y un filtro cuya respuesta siempre es cero enseña a
     desconfiar del filtro. */
  it('el estado no ofrece «en la papelera»', () => {
    const estado = DIMS.find(d => d.clave === 'estado')
    const opciones = estado?.tipo === 'unico' ? estado.opciones.map(o => o.id) : []
    expect(opciones).toEqual(['activa', 'inactiva', 'bloqueada'])
  })
})
