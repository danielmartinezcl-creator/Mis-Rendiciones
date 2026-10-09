import { describe, it, expect } from 'vitest'
import { consultaDeAuditoria, dimensionesDeAuditoria, ACCIONES, ENTIDADES } from '@/lib/filtro-auditoria'
import { valoresVacios, type Valores } from '@/lib/filtros/dimensiones'
import type { AuditAction, AuditEntityType } from '@/lib/audit'

const HOY = '2026-09-15'
const DIMS = dimensionesDeAuditoria()
const vacios = valoresVacios(DIMS)
const con = (v: Valores): Valores => ({ ...vacios, ...v })

describe('consultaDeAuditoria', () => {
  /* Lo que está sin poner NO viaja: una condición que no filtra nada en la
     consulta es una condición que alguien va a tener que entender después. */
  it('sin filtro, la consulta va vacía', () => {
    expect(consultaDeAuditoria(vacios, HOY)).toEqual({})
  })

  it('un texto de solo espacios no viaja', () => {
    expect(consultaDeAuditoria(con({ busca: { tipo: 'texto', texto: '   ' } }), HOY)).toEqual({})
  })

  it('una lista vacía no viaja', () => {
    expect(consultaDeAuditoria(con({ accion: { tipo: 'multi', ids: [] } }), HOY)).toEqual({})
  })

  it('el texto se manda sin espacios de los costados', () => {
    expect(consultaDeAuditoria(con({ busca: { tipo: 'texto', texto: '  claudia ' } }), HOY))
      .toEqual({ search: 'claudia' })
  })

  /* «Borrados» pide DOS acciones a la vez, y por eso la consulta las recibe
     como lista: con un valor suelto esa vista no se podría guardar. */
  it('varias acciones viajan como lista', () => {
    expect(consultaDeAuditoria(con({ accion: { tipo: 'multi', ids: ['deleted', 'permanently_deleted'] } }), HOY))
      .toEqual({ action: ['deleted', 'permanently_deleted'] })
  })

  it('el rango sale del preset de fecha', () => {
    expect(consultaDeAuditoria(con({ fecha: { tipo: 'fecha', preset: 'mes-pasado', desde: null, hasta: null } }), HOY))
      .toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })

  it('«elegir» con un solo extremo manda solo ese', () => {
    expect(consultaDeAuditoria(con({ fecha: { tipo: 'fecha', preset: 'elegir', desde: '2026-08-01', hasta: null } }), HOY))
      .toEqual({ from: '2026-08-01' })
  })

  it('todo junto', () => {
    const v = con({
      busca:   { tipo: 'texto', texto: 'claudia' },
      entidad: { tipo: 'multi', ids: ['user'] },
      accion:  { tipo: 'multi', ids: ['deleted'] },
      fecha:   { tipo: 'fecha', preset: 'este-mes', desde: null, hasta: null },
    })
    expect(consultaDeAuditoria(v, HOY)).toEqual({
      search: 'claudia', entityType: ['user'], action: ['deleted'],
      from: '2026-09-01', to: '2026-09-30',
    })
  })
})

describe('dimensionesDeAuditoria', () => {
  it('las cuatro van a la vista: con cuatro no hay «Más filtros» que justificar', () => {
    expect(DIMS.every(d => d.destacada)).toBe(true)
    expect(DIMS.map(d => d.clave)).toEqual(['busca', 'fecha', 'entidad', 'accion'])
  })

  it('el buscador es un campo de texto, no un chip', () => {
    expect(DIMS[0].tipo).toBe('texto')
  })

  /* El desplegable mostraba `expense_report` y `config_changed` crudos. */
  it('las etiquetas están en castellano, no son los nombres de la base', () => {
    expect(ENTIDADES.find(e => e.id === 'expense_report')?.etiqueta).toBe('Rendición')
    expect(ACCIONES.find(a => a.id === 'config_changed')?.etiqueta).toBe('Configuración cambiada')
    expect(ENTIDADES.every(e => !e.etiqueta.includes('_'))).toBe(true)
    expect(ACCIONES.every(a => !a.etiqueta.includes('_'))).toBe(true)
  })

  /* Si se suma una acción o una entidad nueva al dominio y nadie la nombra acá,
     el filtro deja de poder pedirla y nadie se entera. */
  it('no falta ninguna acción del dominio', () => {
    const delDominio: AuditAction[] = [
      'deleted', 'restored', 'permanently_deleted', 'created', 'updated', 'bulk_updated',
      'config_changed', 'exported', 'reverted', 'submitted', 'approved', 'rejected',
    ]
    expect(delDominio.filter(a => !ACCIONES.some(o => o.id === a))).toEqual([])
  })

  it('no falta ninguna entidad del dominio', () => {
    const delDominio: AuditEntityType[] = [
      'expense_report', 'expense_item', 'petty_cash_fund', 'petty_cash_item',
      'user', 'category', 'policy', 'travel_policy',
      'defontana_settings', 'defontana_supplier',
      'defontana_export', 'defontana_export_petty_cash',
      'cost_center_assignment', 'approver_assignment', 'cost_center', 'vista_filtro',
      'webhook',
    ]
    expect(delDominio.filter(e => !ENTIDADES.some(o => o.id === e))).toEqual([])
  })
})
