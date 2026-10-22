import { describe, it, expect } from 'vitest'
import { marcasAlDevolver } from '@/lib/devolucion'

/**
 * Devolver una rendición para corregir: qué marcas viajan.
 *
 * Las dos reglas son chicas y ninguna es obvia, y las dos nacen del mismo
 * hecho: **las marcas se conservan** (decisión de Daniel, 2026-10-22), para que
 * el aprobador no vuelva a mirar veinte ítems uno por uno cuando la rendición
 * regrese.
 */
describe('marcasAlDevolver', () => {
  it('viajan solo los ítems marcados, no todos', () => {
    // Al enviar una decisión hay que juzgarlos todos; devolver es el caso
    // contrario — sirve justo para cuando no se pudo terminar de juzgar.
    const r = marcasAlDevolver({
      a: { action: 'approve', reason: '' },
      b: { action: null,      reason: '' },
      c: { action: 'reject',  reason: 'falta la boleta' },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payload.map(p => p.itemId).sort()).toEqual(['a', 'c'])
  })

  it('sin ninguna marca se puede devolver igual', () => {
    // «Falta el proyecto en la cabecera»: no hay nada que juzgar por ítem.
    const r = marcasAlDevolver({ a: { action: null, reason: '' } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.payload).toEqual([])
  })

  it('un rechazado sin motivo lo impide', () => {
    /* No es simetría con la decisión final: como la marca se conserva, al
       reenviar ese ítem ya no está `pending` y nadie lo vuelve a preguntar.
       Sobreviviría como un «no» sin explicación. */
    const r = marcasAlDevolver({
      a: { action: 'approve', reason: '' },
      b: { action: 'reject',  reason: '   ' },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/motivo/i)
  })

  it('el aviso dice cuántos faltan cuando son varios', () => {
    const r = marcasAlDevolver({
      a: { action: 'reject', reason: '' },
      b: { action: 'reject', reason: '' },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('2')
  })

  it('un aprobado no necesita motivo', () => {
    const r = marcasAlDevolver({ a: { action: 'approve', reason: '' } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.payload[0].reason).toBeUndefined()
  })

  it('el motivo viaja sin espacios de más, y vacío no viaja', () => {
    const r = marcasAlDevolver({
      a: { action: 'reject',  reason: '  boleta ilegible  ' },
      b: { action: 'approve', reason: '   ' },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payload.find(p => p.itemId === 'a')!.reason).toBe('boleta ilegible')
    expect(r.payload.find(p => p.itemId === 'b')!.reason).toBeUndefined()
  })
})
