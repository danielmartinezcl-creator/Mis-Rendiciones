import { describe, it, expect, vi } from 'vitest'
import { archivosQueCaen, retirarArchivos } from '@/lib/archivos'

// PostgREST de mentira: responde según la llamada REST que armaría la consulta
// (`tabla?select=…&columna=eq.valor`). Lo que el test no previó vuelve vacío.
function baseFalsa(respuestas: Record<string, unknown[] | { error: string }> = {}) {
  const admin = {
    from: (tabla: string) => {
      let columnas = ''
      const consulta = {
        select: (c: string) => { columnas = c; return consulta },
        eq: async (columna: string, valor: string) => {
          const r = respuestas[`${tabla}?select=${columnas}&${columna}=eq.${valor}`] ?? []
          return Array.isArray(r) ? { data: r, error: null } : { data: null, error: { message: r.error } }
        },
      }
      return consulta
    },
  }
  return admin as never
}

describe('archivosQueCaen', () => {
  it('rendición: los comprobantes de todos sus gastos y sus respaldos', async () => {
    const admin = baseFalsa({
      'expense_items?select=attachments(storage_path)&report_id=eq.rend-1': [
        { attachments: [{ storage_path: 'org/item-1/1.jpg' }, { storage_path: 'org/item-1/2.pdf' }] },
        { attachments: [] },
        { attachments: [{ storage_path: 'org/item-3/4.msg' }] },
      ],
      'approval_attachments?select=storage_path&report_id=eq.rend-1': [{ storage_path: 'org/rend-1/5_user.eml' }],
    })
    expect(await archivosQueCaen(admin, { tipo: 'rendicion', id: 'rend-1' })).toEqual({
      comprobantes: ['org/item-1/1.jpg', 'org/item-1/2.pdf', 'org/item-3/4.msg'],
      respaldos:    ['org/rend-1/5_user.eml'],
    })
  })

  it('fondo: los comprobantes de todos sus gastos y sus respaldos', async () => {
    const admin = baseFalsa({
      'petty_cash_items?select=attachments(storage_path)&fund_id=eq.fondo-1': [
        { attachments: [{ storage_path: 'org/gasto-1/1.jpg' }] },
      ],
      'approval_attachments?select=storage_path&fund_id=eq.fondo-1': [{ storage_path: 'org/fondo-1/2_user.xlsx' }],
    })
    expect(await archivosQueCaen(admin, { tipo: 'fondo', id: 'fondo-1' })).toEqual({
      comprobantes: ['org/gasto-1/1.jpg'],
      respaldos:    ['org/fondo-1/2_user.xlsx'],
    })
  })

  it('gasto de fondo: solo sus comprobantes; los respaldos son del fondo, que sigue vivo', async () => {
    const admin = baseFalsa({
      'petty_cash_items?select=attachments(storage_path)&id=eq.gasto-1': [
        { attachments: [{ storage_path: 'org/gasto-1/1.jpg' }, { storage_path: 'org/gasto-1/2.jpg' }] },
      ],
    })
    expect(await archivosQueCaen(admin, { tipo: 'gasto_fondo', id: 'gasto-1' })).toEqual({
      comprobantes: ['org/gasto-1/1.jpg', 'org/gasto-1/2.jpg'],
      respaldos:    [],
    })
  })

  it('traspaso: los comprobantes de sus gastos, en rendiciones y en fondos', async () => {
    const admin = baseFalsa({
      'expense_items?select=attachments(storage_path)&transfer_id=eq.tras-1': [
        { attachments: [{ storage_path: 'org/item-1/1.jpg' }] },
      ],
      'petty_cash_items?select=attachments(storage_path)&transfer_id=eq.tras-1': [
        { attachments: [{ storage_path: 'org/gasto-2/2.pdf' }] },
      ],
    })
    expect(await archivosQueCaen(admin, { tipo: 'traspaso', id: 'tras-1' })).toEqual({
      comprobantes: ['org/item-1/1.jpg', 'org/gasto-2/2.pdf'],
      respaldos:    [],
    })
  })

  // Sin la lista no se sabe qué archivos caen: mejor no borrar que dejarlos huérfanos
  it.each([
    ['los comprobantes', 'expense_items?select=attachments(storage_path)&report_id=eq.rend-1'],
    ['los respaldos',    'approval_attachments?select=storage_path&report_id=eq.rend-1'],
  ])('si falla la consulta de %s, lanza', async (_, consulta) => {
    const admin = baseFalsa({ [consulta]: { error: 'canceling statement due to statement timeout' } })
    await expect(archivosQueCaen(admin, { tipo: 'rendicion', id: 'rend-1' }))
      .rejects.toThrow('canceling statement due to statement timeout')
  })
})

// Storage de mentira: anota cada retiro y responde como la API
// (`data` son los objetos borrados; `error`, un StorageError o null).
// `fallas` reemplaza la respuesta de un bucket.
function storageFalso(fallas: Record<string, () => unknown> = {}) {
  const retiros: { bucket: string; rutas: string[] }[] = []
  const admin = {
    storage: {
      from: (bucket: string) => ({
        remove: async (rutas: string[]) => {
          retiros.push({ bucket, rutas })
          return fallas[bucket]?.() ?? { data: rutas.map(name => ({ name })), error: null }
        },
      }),
    },
  }
  return { admin: admin as never, retiros }
}

describe('retirarArchivos', () => {
  it('retira cada ruta de su bucket', async () => {
    const { admin, retiros } = storageFalso()
    await retirarArchivos(admin, {
      comprobantes: ['org/item-1/1.jpg', 'org/item-2/2.pdf'],
      respaldos:    ['org/rend-1/3_user.eml'],
    }, 'rendición rend-1')
    expect(retiros).toEqual([
      { bucket: 'expense-attachments',  rutas: ['org/item-1/1.jpg', 'org/item-2/2.pdf'] },
      { bucket: 'approval-attachments', rutas: ['org/rend-1/3_user.eml'] },
    ])
  })

  it('un bucket sin rutas no se toca', async () => {
    const { admin, retiros } = storageFalso()
    await retirarArchivos(admin, { comprobantes: ['org/item-1/1.jpg'], respaldos: [] }, 'fondo f-1')
    expect(retiros).toEqual([{ bucket: 'expense-attachments', rutas: ['org/item-1/1.jpg'] }])
  })

  it('de a 1000 rutas por llamada, el tope de Storage', async () => {
    const { admin, retiros } = storageFalso()
    const comprobantes = Array.from({ length: 2500 }, (_, i) => `org/item-${i}/${i}.jpg`)
    await retirarArchivos(admin, { comprobantes, respaldos: [] }, 'rendición histórica')
    expect(retiros.map(r => r.rutas.length)).toEqual([1000, 1000, 500])
    expect(retiros[1].rutas[0]).toBe('org/item-1000/1000.jpg')
    expect(retiros[2].rutas[499]).toBe('org/item-2499/2499.jpg')
  })

  // Corre después de borrar la fila: si lanzara, la persona vería un error
  // con el documento ya borrado. Un huérfano, en cambio, no lo ve nadie.
  it.each([
    ['devuelve un error', () => ({ data: null, error: { name: 'StorageApiError', message: 'Storage caído' } })],
    ['lanza',             () => { throw new Error('fetch failed') }],
  ])('si Storage %s, sigue con el otro bucket, no lanza y registra las rutas', async (_, falla) => {
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { admin, retiros } = storageFalso({ 'expense-attachments': falla })

    await expect(retirarArchivos(admin, {
      comprobantes: ['org/item-1/1.jpg'],
      respaldos:    ['org/rend-1/3_user.eml'],
    }, 'rendición rend-1')).resolves.toBeUndefined()

    expect(retiros.map(r => r.bucket)).toEqual(['expense-attachments', 'approval-attachments'])
    expect(registro).toHaveBeenCalledTimes(1)
    expect(String(registro.mock.calls[0][0])).toContain('rendición rend-1')
    expect(registro.mock.calls[0]).toContainEqual(['org/item-1/1.jpg'])
    registro.mockRestore()
  })
})
