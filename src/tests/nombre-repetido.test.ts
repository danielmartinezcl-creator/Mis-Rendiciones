import { describe, it, expect } from 'vitest'
import { enCurso, mismoNombre, textoDeAviso, type Coincidencia } from '@/lib/nombre-repetido'

const coincidencia = (p: Partial<Coincidencia> = {}): Coincidencia => ({
  id: 'f1', nombre: 'Caja chica obra Norte', desde: '2026-10-03T12:00:00Z', estado: 'funds_sent', ...p,
})

describe('enCurso — solo se avisa por lo que no terminó', () => {
  /* Avisar por un documento ya cerrado sería ruido garantizado: el caso típico
     —un fondo mensual que se llama igual todos los meses— dispararía el aviso
     siempre, y un aviso que salta siempre se aprende a ignorar. */

  it('un fondo liquidado o rechazado ya no avisa', () => {
    expect(enCurso('fondo', 'settled')).toBe(false)
    expect(enCurso('fondo', 'rejected')).toBe(false)
  })

  it('un fondo en cualquier paso del camino sí avisa', () => {
    for (const e of ['draft', 'pending_approval', 'pending_approval_l2', 'approved',
                     'pending_bank_load', 'pending_bank_auth', 'funds_sent',
                     'submitted', 'pending_liquidation_approval', 'pending_liquidation_l2']) {
      expect(enCurso('fondo', e)).toBe(true)
    }
  })

  it('una rendición reembolsada o rechazada ya no avisa', () => {
    expect(enCurso('rendicion', 'reimbursed')).toBe(false)
    expect(enCurso('rendicion', 'rejected')).toBe(false)
  })

  it('una rendición aprobada pero sin pagar TODAVÍA avisa', () => {
    // El proceso sigue: es justo la que se confunde con una nueva del mismo nombre.
    for (const e of ['draft', 'submitted', 'pending_l2', 'approved',
                     'partially_approved', 'pending_bank_load', 'pending_bank_auth']) {
      expect(enCurso('rendicion', e)).toBe(true)
    }
  })
})

describe('mismoNombre — lo escribe una persona', () => {
  it('ignora mayúsculas, tildes y espacios de más', () => {
    expect(mismoNombre('Caja Chica Obra Norte', 'caja chica obra  norte')).toBe(true)
    expect(mismoNombre('Viáticos Mayo', 'viaticos mayo')).toBe(true)
    expect(mismoNombre('  Fondo A  ', 'fondo a')).toBe(true)
  })

  it('nombres distintos no coinciden', () => {
    expect(mismoNombre('Caja chica octubre', 'Caja chica noviembre')).toBe(false)
  })

  it('un nombre vacío no coincide con nada, ni con otro vacío', () => {
    // Si no, apenas se abre el formulario el aviso saltaría contra cualquier
    // documento sin nombre.
    expect(mismoNombre('', '')).toBe(false)
    expect(mismoNombre('   ', 'algo')).toBe(false)
  })
})

describe('textoDeAviso', () => {
  it('sin coincidencias no dice nada', () => {
    expect(textoDeAviso('fondo', [])).toBeNull()
  })

  it('con una, nombra la fecha para que se reconozca cuál es', () => {
    const t = textoDeAviso('fondo', [coincidencia()])
    expect(t).toContain('un fondo sin cerrar')
    expect(t).toContain('3 de octubre')
  })

  it('con varias, las cuenta en vez de listarlas', () => {
    const t = textoDeAviso('rendicion', [coincidencia(), coincidencia({ id: 'f2' })])
    expect(t).toBe('Ya tenés 2 rendiciones sin cerrar con este nombre.')
  })

  it('concuerda el género según el documento', () => {
    expect(textoDeAviso('rendicion', [coincidencia()])).toContain('una rendición')
    expect(textoDeAviso('fondo', [coincidencia()])).toContain('un fondo')
  })
})
