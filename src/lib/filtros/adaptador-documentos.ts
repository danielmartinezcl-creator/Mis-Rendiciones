// El filtro del empleado ↔ la forma genérica de la barra.
//
// Existe para NO reescribir `filtro-documentos.ts`. Ese módulo tiene reglas que
// costaron caro y que no quiero volver a descubrir: la fecha es la del gasto y
// no la del documento; tipo de gasto y fecha los tiene que cumplir el MISMO
// gasto; un gasto rechazado no suma nunca; un documento sin gastos se juzga por
// su fecha de creación. Adaptar en el borde es más barato que mudarlas.
//
// Spec: docs/superpowers/specs/2026-10-08-filtros-del-admin-design.md

import { FILTRO_VACIO, type Filtro } from '@/lib/filtro-documentos'
import type { FamiliaEstado } from '@/lib/constants'
import type { ClaveChip } from '@/lib/filtro-etiquetas'
import type { Dimension, Opcion, Valores } from '@/lib/filtros/dimensiones'

export function aValores(f: Filtro): Valores {
  return {
    proyectos:  { tipo: 'multi', ids: f.proyectos },
    categorias: { tipo: 'multi', ids: f.categorias },
    fecha:      { tipo: 'fecha', preset: f.fecha, desde: f.desde, hasta: f.hasta },
    estados:    { tipo: 'multi', ids: f.estados },
    empleados:  { tipo: 'multi', ids: f.empleados },
  }
}

/**
 * Una clave ausente se lee como «sin poner», no como un error: los `Valores`
 * pueden venir de la dirección de la página o de una vista guardada, donde
 * puede faltar cualquiera.
 */
export function aFiltro(v: Valores): Filtro {
  const ids = (clave: string): string[] => {
    const x = v[clave]
    return x !== undefined && x.tipo === 'multi' ? x.ids : []
  }
  const f = v.fecha

  return {
    proyectos:  ids('proyectos'),
    categorias: ids('categorias'),
    fecha:      f !== undefined && f.tipo === 'fecha' ? f.preset : FILTRO_VACIO.fecha,
    desde:      f !== undefined && f.tipo === 'fecha' ? f.desde  : FILTRO_VACIO.desde,
    hasta:      f !== undefined && f.tipo === 'fecha' ? f.hasta  : FILTRO_VACIO.hasta,
    // Los `Valores` guardan ids sueltos; las familias de estado son una unión
    // cerrada. Lo que entra acá ya pasó por `depurarFiltro`, que descarta lo
    // que no está entre las opciones.
    estados:    ids('estados') as FamiliaEstado[],
    empleados:  ids('empleados'),
  }
}

/** Lo que cada chip del empleado dice hoy. Si esto cambia, su pantalla cambia. */
const CHIP: Record<ClaveChip, { nombre: string; plural?: string; buscador?: boolean }> = {
  proyectos:  { nombre: 'Proyecto',      plural: 'proyectos',      buscador: true },
  categorias: { nombre: 'Tipo de gasto', plural: 'tipos de gasto' },
  fecha:      { nombre: 'Fecha' },
  estados:    { nombre: 'Estado',        plural: 'estados' },
  empleados:  { nombre: 'Empleado',      plural: 'empleados',      buscador: true },
}

/**
 * La dimensión genérica de un chip del empleado. **Todas van destacadas**: con
 * cinco no hay «Más filtros» que mostrar, y por eso sus dos pantallas se siguen
 * viendo igual.
 */
export function dimensionDocumento(clave: ClaveChip, opciones: Opcion[]): Dimension {
  const { nombre, plural, buscador } = CHIP[clave]

  if (clave === 'fecha') {
    return { clave, nombre, destacada: true, tipo: 'fecha' }
  }
  return {
    clave, nombre, destacada: true, tipo: 'multi',
    plural: plural ?? nombre.toLowerCase(),
    opciones,
    buscador,
    marcadorBusqueda: buscador ? 'Buscar por número o nombre' : undefined,
  }
}
