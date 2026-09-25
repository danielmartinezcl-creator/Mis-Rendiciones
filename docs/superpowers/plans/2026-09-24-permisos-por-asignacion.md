# Permisos por asignación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada paso de una rendición o un fondo (aprobar N1/N2, cargar y autorizar el pago) lo pueda dar solo quien está asignado y no choca con la segregación de funciones, y que el aviso le llegue solo a esa persona.

**Architecture:** Las reglas viven una sola vez, como funciones puras, en `src/lib/permisos.ts` (quién puede, a quién avisar, cadenas válidas) y `src/lib/flujo.ts` (qué estado sigue). Un cargador de servidor, `src/lib/contexto-permisos.ts`, arma desde la base lo que esas funciones necesitan. Cada acción pregunta antes de escribir y escribe con la llave de servicio. La base deja de aceptar cambios de estado desde una sesión de usuario (migración 033), así que no quedan atajos.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase (Postgres + RLS), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-permisos-y-flujo-de-aprobacion-design.md`

## Global Constraints

- Next.js 16: en `src/actions/*.ts` toda función **exportada** es `async`; los helpers puros van en `src/lib/`; los tests importan desde `src/lib/`. Nunca `export type` desde un archivo `'use server'`.
- No existe `middleware.ts` ni `tailwind.config.*`: no crearlos.
- Supabase: proyecto `jqtbtgduqzxkgubmzukg`. Las migraciones se aplican con la herramienta `apply_migration` del MCP de Supabase y el archivo se commitea en `supabase/migrations/`.
- Toda escritura que cambia un estado encadena `.select('id')` y lanza si vuelve vacía (trampa de las 0 filas afectadas).
- Toda transición de estado se escribe con `createAdminClient()` **después** de `exigirPaso` / `puedeEnviar`. El `actor_id` / `approver_id` del historial es siempre el `user.id` de la sesión.
- El admin no tiene comodín operativo (D1): ningún `role === 'admin'` habilita aprobar, cargar ni autorizar.
- El motivo que ve una persona sale del **cargador de la página** (`permiso`), no del error lanzado: en producción Next.js puede ocultar el mensaje de un error lanzado por una acción del servidor. Los errores lanzados son la defensa, no la interfaz.
- Textos en español. Nunca `confirm()` / `alert()` / `window.confirm`: usar `confirmar()` / `avisar()`.
- Estilos: materiales `.hoja` / `.tor-glass`, `rounded-item` / `rounded-card`, íconos Lucide; nunca un hexadecimal en un componente.
- Commits desde PowerShell con here-string (`git commit -m @'...'@`, cierre `'@` en la columna 0), terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- La migración **033 se aplica solo después** de que el código de las tareas 4–8 esté en producción (Tarea 10): antes rompería el código viejo, que todavía cambia estados con la sesión del usuario.

## Mapa de archivos

| Archivo | Qué hace | Tarea |
|---|---|---|
| `src/lib/permisos.ts` (nuevo) | Reglas puras: `puedeActuar`, `destinatarios`, `validarCadena`… | 1 |
| `src/tests/permisos.test.ts` (nuevo) | Los casos de PENTA de la spec | 1 |
| `src/lib/flujo.ts` (nuevo) | Qué estado sigue a cada decisión | 2 |
| `src/tests/flujo.test.ts` (nuevo) | Tests del recorrido | 2 |
| `src/lib/constants.ts` | Estados N2 de fondos, grupos de estados | 2 |
| `src/lib/petty-cash-helpers.ts` + test | Tramos y recorrido con los estados N2 | 2 |
| `supabase/migrations/032_flujo_por_asignacion.sql` (nuevo) | Cambios aditivos de base | 3 |
| `src/lib/supabase/types.ts` | Tipos de las columnas y estados nuevos | 3 |
| `src/lib/contexto-permisos.ts` (nuevo) | Carga personas, cadena e historial; `exigirPaso` | 4 |
| `src/actions/notifications.ts` | Avisos calculados con `destinatarios` | 4 |
| `src/actions/expenses.ts`, `src/actions/approvals.ts`, `src/app/(app)/approvals/[id]/client.tsx` | Envío y decisiones de rendiciones | 5 |
| `src/actions/approvals.ts`, `src/actions/admin.ts` (`getBankQueue`), `src/app/(app)/banco/*`, `src/app/(app)/admin/reports/client.tsx`, `src/components/layout/Sidebar.tsx` | Banco de rendiciones | 6 |
| `src/actions/petty-cash.ts`, `src/app/(app)/petty-cash/[id]/client.tsx`, `src/app/(app)/petty-cash/FundList.tsx` | Fondos | 7 |
| `src/actions/admin.ts`, `src/components/admin/ApproverConfig.tsx`, `src/app/(app)/admin/employees/page.tsx`, `src/lib/auth.ts` | Configuración de cadenas y suplencias | 8 |
| `src/lib/bank-helpers.ts` + test (se borran), skill de contexto, guion de aceptación | Limpieza y documentación | 9 |
| `supabase/migrations/033_estado_solo_desde_servidor.sql` (nuevo), `supabase/tests/033_proteccion.sql` (nuevo) | Cerrar las puertas laterales | 10 |

**Una nota sobre los suplentes bancarios.** La spec decía «titulares y suplentes»,
pero el `bank_is_backup` actual es **uno solo por persona**, y en PENTA FH es
**titular para autorizar y suplente para cargar**. Con un solo interruptor, o
Katherine deja de ser la única que recibe «cargar», o FH deja de ser el único que
recibe «autorizar». Por eso la Tarea 3 lo parte en `bank_load_backup` y
`bank_auth_backup` (copiados desde `bank_is_backup`), y la 033 borra el viejo.

---

### Task 1: Reglas puras — `src/lib/permisos.ts`

**Files:**
- Create: `src/lib/permisos.ts`
- Test: `src/tests/permisos.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (usado por las tareas 4–8):
  - `type TipoDocumento = 'rendicion' | 'fondo' | 'liquidacion'`
  - `type Paso = 'decidir_l1' | 'decidir_l2' | 'cargar_pago' | 'autorizar_pago'`
  - `interface Persona { id; nombre; activo; can_submit; can_approve; can_manage_petty_cash; can_load_bank_transfer; can_authorize_bank_transfer; bank_load_backup; bank_auth_backup }`
  - `interface Cadena { l1: string | null; l2: string | null; suplenteL1Vigente: string | null }`
  - `interface EntradaHistorial { actorId: string; accion: string; nivel: number | null }`
  - `interface Documento { tipo: TipoDocumento; beneficiarioId: string; cadena: Cadena; historial: EntradaHistorial[] }`
  - `type Resultado = { ok: true } | { ok: false; motivo: string }`
  - `interface ConfigCadena { l1: string | null; l2: string | null; suplenteL1: string | null }`
  - `suplenteVigente(suplenteId, desde, hasta, hoy): string | null`
  - `pasoSegunEstado(tipo: TipoDocumento, estado: string): Paso | null`
  - `tipoDeFondo(estado: string): 'fondo' | 'liquidacion'`
  - `elegibles(paso, doc, personas): Persona[]`
  - `puedeActuar(persona, paso, doc, personas): Resultado`
  - `destinatarios(paso, doc, personas, excluir?: string[]): string[]`
  - `destinatariosInformativos(enviadoPor, beneficiarioId, excluir?: string[]): string[]`
  - `puedeEnviar(tipo: TipoDocumento, actor: Persona, cadena: Cadena): Resultado`
  - `validarCadena(empleadoId, config: ConfigCadena, personas): string[]`
  - `dependientesDe(aprobadorId, empleados: { id; nombre; l1; l2; suplenteL1 }[]): string[]`

- [ ] **Step 1: Write the failing test**

Crear `src/tests/permisos.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  puedeActuar, destinatarios, destinatariosInformativos, puedeEnviar,
  validarCadena, dependientesDe, suplenteVigente, pasoSegunEstado, tipoDeFondo,
  type Persona, type Documento, type Cadena, type EntradaHistorial,
} from '@/lib/permisos'

// La configuración de PENTA que describió Daniel el 2026-09-24.
function persona(id: string, nombre: string, extra: Partial<Persona> = {}): Persona {
  return {
    id, nombre, activo: true,
    can_submit: true, can_approve: false, can_manage_petty_cash: false,
    can_load_bank_transfer: false, can_authorize_bank_transfer: false,
    bank_load_backup: false, bank_auth_backup: false,
    ...extra,
  }
}

const KC = persona('kc', 'Katherine Corvalán', { can_approve: true, can_manage_petty_cash: true, can_load_bank_transfer: true })
const FH = persona('fh', 'Francisco Hagar', {
  can_approve: true, can_manage_petty_cash: true,
  can_load_bank_transfer: true, bank_load_backup: true,
  can_authorize_bank_transfer: true,
})
const RH = persona('rh', 'Roberto Hagar', {
  can_approve: true, can_manage_petty_cash: true,
  can_load_bank_transfer: true, bank_load_backup: true,
  can_authorize_bank_transfer: true, bank_auth_backup: true,
})
const DM = persona('dm', 'Daniel Martínez', {
  can_approve: true, can_manage_petty_cash: true,
  can_load_bank_transfer: true, bank_load_backup: true,
})
const FD = persona('fd', 'Francisco Díaz')
const PENTA = [KC, FH, RH, DM, FD]

const CADENAS: Record<string, Cadena> = {
  fd: { l1: 'kc', l2: 'fh', suplenteL1Vigente: null },
  kc: { l1: 'fh', l2: null, suplenteL1Vigente: null },
  fh: { l1: 'rh', l2: null, suplenteL1Vigente: null },
  rh: { l1: 'fh', l2: null, suplenteL1Vigente: null },
}

function rendicionDe(beneficiarioId: string, historial: EntradaHistorial[] = [], cadena?: Cadena): Documento {
  return { tipo: 'rendicion', beneficiarioId, cadena: cadena ?? CADENAS[beneficiarioId], historial }
}
const cargo = (actorId: string): EntradaHistorial => ({ actorId, accion: 'bank_load_confirmed', nivel: 1 })

describe('rendición de Francisco Díaz — el caso normal', () => {
  it('el nivel 1 lo decide Katherine y solo a ella le llega el aviso', () => {
    const doc = rendicionDe('fd')
    expect(puedeActuar(KC, 'decidir_l1', doc, PENTA)).toEqual({ ok: true })
    expect(destinatarios('decidir_l1', doc, PENTA, ['fd'])).toEqual(['kc'])
  })

  it('FH, que es su N2, no decide el nivel 1 aunque entre por link directo', () => {
    const r = puedeActuar(FH, 'decidir_l1', rendicionDe('fd'), PENTA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('Katherine Corvalán')
  })

  it('el nivel 2 lo decide FH', () => {
    const doc = rendicionDe('fd')
    expect(puedeActuar(FH, 'decidir_l2', doc, PENTA)).toEqual({ ok: true })
    expect(puedeActuar(KC, 'decidir_l2', doc, PENTA).ok).toBe(false)
    expect(destinatarios('decidir_l2', doc, PENTA, ['kc'])).toEqual(['fh'])
  })

  it('tras la aprobación final, el aviso de carga va solo a Katherine (titular)', () => {
    expect(destinatarios('cargar_pago', rendicionDe('fd'), PENTA, ['fh'])).toEqual(['kc'])
  })

  it('Katherine cargó: autoriza FH, y el aviso va solo a él', () => {
    const doc = rendicionDe('fd', [cargo('kc')])
    expect(puedeActuar(FH, 'autorizar_pago', doc, PENTA)).toEqual({ ok: true })
    expect(destinatarios('autorizar_pago', doc, PENTA, ['kc'])).toEqual(['fh'])
  })

  it('aprobar en N2 y autorizar el mismo pago está permitido (regla 4)', () => {
    const doc = rendicionDe('fd', [{ actorId: 'fh', accion: 'approved', nivel: 2 }, cargo('kc')])
    expect(puedeActuar(FH, 'autorizar_pago', doc, PENTA)).toEqual({ ok: true })
  })
})

describe('Katherine no está: FH carga', () => {
  const doc = rendicionDe('fd', [cargo('fh')])

  it('FH no autoriza lo que cargó (regla 3) y el mensaje nombra a Roberto', () => {
    const r = puedeActuar(FH, 'autorizar_pago', doc, PENTA)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.motivo).toContain('Tú cargaste este pago')
      expect(r.motivo).toContain('Roberto Hagar')
    }
  })

  it('el aviso de autorizar va directo a Roberto, aunque sea suplente', () => {
    expect(destinatarios('autorizar_pago', doc, PENTA, ['fh'])).toEqual(['rh'])
  })

  it('cuenta la última carga: tras una reversa, vale quien cargó de nuevo', () => {
    expect(puedeActuar(FH, 'autorizar_pago', rendicionDe('fd', [cargo('fh'), cargo('kc')]), PENTA))
      .toEqual({ ok: true })
  })
})

describe('rendición del mismo FH', () => {
  it('la aprueba Roberto, su N1; FH no', () => {
    expect(puedeActuar(RH, 'decidir_l1', rendicionDe('fh'), PENTA)).toEqual({ ok: true })
    expect(puedeActuar(FH, 'decidir_l1', rendicionDe('fh'), PENTA).ok).toBe(false)
  })

  it('FH no autoriza su propio pago (regla 2); el aviso va a Roberto', () => {
    const doc = rendicionDe('fh', [cargo('kc')])
    const r = puedeActuar(FH, 'autorizar_pago', doc, PENTA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('No puedes autorizar el pago de lo tuyo')
    expect(destinatarios('autorizar_pago', doc, PENTA, ['kc'])).toEqual(['rh'])
  })

  it('Roberto no puede cargarla: después nadie podría autorizar', () => {
    const r = puedeActuar(RH, 'cargar_pago', rendicionDe('fh'), PENTA)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.motivo).toContain('nadie podrá autorizar')
      expect(r.motivo).toContain('Katherine Corvalán')
    }
  })

  it('FH sí puede cargar la suya (regla 5): la autoriza Roberto', () => {
    expect(puedeActuar(FH, 'cargar_pago', rendicionDe('fh'), PENTA)).toEqual({ ok: true })
  })
})

describe('rendición de Katherine', () => {
  it('no la aprueba ella aunque esté mal configurada como su propia N1', () => {
    const malConfigurada = rendicionDe('kc', [], { l1: 'kc', l2: null, suplenteL1Vigente: null })
    const r = puedeActuar(KC, 'decidir_l1', malConfigurada, PENTA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('No puedes aprobar lo tuyo')
    expect(puedeActuar(FH, 'decidir_l1', rendicionDe('kc'), PENTA)).toEqual({ ok: true })
  })

  it('puede cargar su propio reembolso (regla 5) y lo autoriza FH', () => {
    expect(puedeActuar(KC, 'cargar_pago', rendicionDe('kc'), PENTA)).toEqual({ ok: true })
    expect(destinatarios('autorizar_pago', rendicionDe('kc', [cargo('kc')]), PENTA, ['kc'])).toEqual(['fh'])
  })
})

describe('fondos: «lo propio» es lo que recibe uno (D3)', () => {
  it('el fondo n°193: Katherine no aprueba un fondo a su nombre', () => {
    const fondo: Documento = { tipo: 'fondo', beneficiarioId: 'kc', cadena: CADENAS.kc, historial: [] }
    expect(puedeActuar(KC, 'decidir_l1', fondo, PENTA).ok).toBe(false)
    expect(puedeActuar(FH, 'decidir_l1', fondo, PENTA)).toEqual({ ok: true })
  })

  it('Katherine sí aprueba el fondo de Francisco Díaz aunque ella lo haya creado', () => {
    const fondo: Documento = { tipo: 'fondo', beneficiarioId: 'fd', cadena: CADENAS.fd, historial: [] }
    expect(puedeActuar(KC, 'decidir_l1', fondo, PENTA)).toEqual({ ok: true })
  })
})

describe('suplente de nivel 1', () => {
  const conSuplente = rendicionDe('fd', [], { l1: 'kc', l2: 'fh', suplenteL1Vigente: 'rh' })

  it('mientras está vigente, el suplente puede decidir', () => {
    expect(puedeActuar(RH, 'decidir_l1', conSuplente, PENTA)).toEqual({ ok: true })
  })

  it('el titular también puede, si entra a la app', () => {
    expect(puedeActuar(KC, 'decidir_l1', conSuplente, PENTA)).toEqual({ ok: true })
  })

  it('el aviso le llega solo al suplente (D8)', () => {
    expect(destinatarios('decidir_l1', conSuplente, PENTA, ['fd'])).toEqual(['rh'])
  })

  it('suplenteVigente respeta el período, con los dos extremos incluidos', () => {
    expect(suplenteVigente('rh', '2026-09-01', '2026-09-30', '2026-09-01')).toBe('rh')
    expect(suplenteVigente('rh', '2026-09-01', '2026-09-30', '2026-09-30')).toBe('rh')
    expect(suplenteVigente('rh', '2026-09-01', '2026-09-30', '2026-10-01')).toBeNull()
    expect(suplenteVigente('rh', null, '2026-09-30', '2026-09-15')).toBeNull()
    expect(suplenteVigente(null, '2026-09-01', '2026-09-30', '2026-09-15')).toBeNull()
  })
})

describe('permisos que faltan y personas inactivas', () => {
  it('sin «carga banco» no se carga', () => {
    const r = puedeActuar(FD, 'cargar_pago', rendicionDe('kc'), PENTA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('carga banco')
  })

  it('sin «autoriza banco» no se autoriza', () => {
    expect(puedeActuar(KC, 'autorizar_pago', rendicionDe('fd', [cargo('fh')]), PENTA).ok).toBe(false)
  })

  it('una persona inactiva no puede nada, ni recibe avisos', () => {
    const kcInactiva = { ...KC, activo: false }
    const personas = [kcInactiva, FH, RH, DM, FD]
    expect(puedeActuar(kcInactiva, 'decidir_l1', rendicionDe('fd'), personas).ok).toBe(false)
    // Sin la titular, el aviso va a todos los suplentes que pueden
    expect(destinatarios('cargar_pago', rendicionDe('fd'), personas)).toEqual(['fh', 'rh', 'dm'])
  })
})

describe('pasoSegunEstado y tipoDeFondo', () => {
  it('rendiciones', () => {
    expect(pasoSegunEstado('rendicion', 'submitted')).toBe('decidir_l1')
    expect(pasoSegunEstado('rendicion', 'pending_l2')).toBe('decidir_l2')
    expect(pasoSegunEstado('rendicion', 'pending_bank_load')).toBe('cargar_pago')
    expect(pasoSegunEstado('rendicion', 'pending_bank_auth')).toBe('autorizar_pago')
    expect(pasoSegunEstado('rendicion', 'approved')).toBeNull()
    expect(pasoSegunEstado('rendicion', 'draft')).toBeNull()
  })

  it('fondos y liquidaciones', () => {
    expect(pasoSegunEstado('fondo', 'pending_approval')).toBe('decidir_l1')
    expect(pasoSegunEstado('fondo', 'pending_approval_l2')).toBe('decidir_l2')
    expect(pasoSegunEstado('fondo', 'pending_bank_load')).toBe('cargar_pago')
    expect(pasoSegunEstado('liquidacion', 'pending_liquidation_approval')).toBe('decidir_l1')
    expect(pasoSegunEstado('liquidacion', 'submitted')).toBe('decidir_l1')
    expect(pasoSegunEstado('liquidacion', 'pending_liquidation_l2')).toBe('decidir_l2')
    expect(tipoDeFondo('pending_approval')).toBe('fondo')
    expect(tipoDeFondo('funds_sent')).toBe('fondo')
    expect(tipoDeFondo('submitted')).toBe('liquidacion')
    expect(tipoDeFondo('pending_liquidation_l2')).toBe('liquidacion')
  })
})

describe('puedeEnviar', () => {
  it('rendir exige «rinde»', () => {
    expect(puedeEnviar('rendicion', { ...FD, can_submit: false }, CADENAS.fd).ok).toBe(false)
    expect(puedeEnviar('rendicion', FD, CADENAS.fd)).toEqual({ ok: true })
  })

  it('sin N1 no se envía, y el motivo dice que el administrador ya sabe', () => {
    const r = puedeEnviar('rendicion', FD, { l1: null, l2: null, suplenteL1Vigente: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('administrador')
  })

  it('un fondo exige «EFF»', () => {
    expect(puedeEnviar('fondo', FD, CADENAS.fd).ok).toBe(false)
    expect(puedeEnviar('fondo', KC, CADENAS.fd)).toEqual({ ok: true })
  })

  it('la liquidación no exige permiso: la envía el beneficiario', () => {
    expect(puedeEnviar('liquidacion', FD, CADENAS.fd)).toEqual({ ok: true })
  })
})

describe('destinatariosInformativos', () => {
  it('quien envió y el beneficiario, sin repetir y sin quien actuó', () => {
    expect(destinatariosInformativos('kc', 'fd')).toEqual(['kc', 'fd'])
    expect(destinatariosInformativos('fd', 'fd')).toEqual(['fd'])
    expect(destinatariosInformativos('kc', 'fd', ['kc'])).toEqual(['fd'])
  })
})

describe('validarCadena', () => {
  it('la cadena de Francisco Díaz es válida', () => {
    expect(validarCadena('fd', { l1: 'kc', l2: 'fh', suplenteL1: null }, PENTA)).toEqual([])
  })

  it('nadie es su propio aprobador', () => {
    expect(validarCadena('kc', { l1: 'kc', l2: null, suplenteL1: null }, PENTA))
      .toContain('Nadie puede ser su propio aprobador')
  })

  it('N2 sin N1, y N1 igual a N2', () => {
    expect(validarCadena('fd', { l1: null, l2: 'fh', suplenteL1: null }, PENTA))
      .toContain('Para tener aprobador N2 hay que tener N1')
    expect(validarCadena('fd', { l1: 'kc', l2: 'kc', suplenteL1: null }, PENTA))
      .toContain('N1 y N2 no pueden ser la misma persona')
  })

  it('el suplente no puede ser el N1 ni el N2', () => {
    expect(validarCadena('fd', { l1: 'kc', l2: 'fh', suplenteL1: 'kc' }, PENTA))
      .toContain('El suplente no puede ser el mismo aprobador N1')
    expect(validarCadena('fd', { l1: 'kc', l2: 'fh', suplenteL1: 'fh' }, PENTA))
      .toContain('El suplente de N1 no puede ser el aprobador N2: decidiría los dos niveles')
  })

  it('todos deben tener «aprueba», estar activos y ser de la organización', () => {
    expect(validarCadena('kc', { l1: 'fd', l2: null, suplenteL1: null }, PENTA))
      .toContain('Francisco Díaz (N1) no tiene el permiso «aprueba»')
    expect(validarCadena('fd', { l1: 'kc', l2: null, suplenteL1: null }, [{ ...KC, activo: false }, FD]))
      .toContain('Katherine Corvalán (N1) no está activo')
    expect(validarCadena('fd', { l1: 'otra-org', l2: null, suplenteL1: null }, PENTA))
      .toContain('El aprobador N1 no pertenece a esta organización')
  })
})

describe('dependientesDe', () => {
  it('lista a quiénes aprueba una persona, en cualquier rol de la cadena', () => {
    const empleados = [
      { id: 'fd', nombre: 'Francisco Díaz',     l1: 'kc', l2: 'fh', suplenteL1: null },
      { id: 'kc', nombre: 'Katherine Corvalán', l1: 'fh', l2: null, suplenteL1: null },
      { id: 'fh', nombre: 'Francisco Hagar',    l1: 'rh', l2: null, suplenteL1: 'kc' },
    ]
    expect(dependientesDe('kc', empleados)).toEqual(['Francisco Díaz', 'Francisco Hagar'])
    expect(dependientesDe('fd', empleados)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/tests/permisos.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/permisos"`.

- [ ] **Step 3: Write the implementation**

Crear `src/lib/permisos.ts`:

```typescript
// Quién puede dar cada paso sobre una rendición, un fondo o una liquidación, y
// a quién se le avisa. Spec: docs/superpowers/specs/2026-09-24-permisos-y-flujo-de-aprobacion-design.md
//
// Funciones puras: no leen la base. El servidor arma el contexto
// (src/lib/contexto-permisos.ts) y pregunta acá. El botón que ve cada persona
// y el correo que recibe salen de estas mismas funciones: por eso no pueden
// contradecirse, que era el problema de antes (el correo iba a «todos los que
// tienen el permiso» y el permiso lo decidía otra consulta).
//
// Las cinco reglas:
//   1. Nadie aprueba lo propio.
//   2. Nadie autoriza el pago de lo propio.
//   3. Quien cargó un pago no lo autoriza.
//   4. Aprobar en N2 y autorizar el mismo pago está permitido.
//   5. Cargar el pago propio está permitido (lo autoriza otra persona).
// «Lo propio» es lo que recibe uno mismo: en un fondo, el beneficiario.

export type TipoDocumento = 'rendicion' | 'fondo' | 'liquidacion'
export type Paso = 'decidir_l1' | 'decidir_l2' | 'cargar_pago' | 'autorizar_pago'

export interface Persona {
  id:                          string
  nombre:                      string
  activo:                      boolean
  can_submit:                  boolean
  can_approve:                 boolean
  can_manage_petty_cash:       boolean
  can_load_bank_transfer:      boolean
  can_authorize_bank_transfer: boolean
  bank_load_backup:            boolean
  bank_auth_backup:            boolean
}

export interface Cadena {
  l1:                string | null
  l2:                string | null
  suplenteL1Vigente: string | null
}

export interface EntradaHistorial {
  actorId: string
  accion:  string
  nivel:   number | null
}

export interface Documento {
  tipo:           TipoDocumento
  beneficiarioId: string
  cadena:         Cadena
  historial:      EntradaHistorial[]
}

export type Resultado = { ok: true } | { ok: false; motivo: string }

export interface ConfigCadena {
  l1:         string | null
  l2:         string | null
  suplenteL1: string | null
}

const OK: Resultado = { ok: true }
const no = (motivo: string): Resultado => ({ ok: false, motivo })

// El suplente vale entre las dos fechas, ambas incluidas (YYYY-MM-DD).
export function suplenteVigente(
  suplenteId: string | null, desde: string | null, hasta: string | null, hoy: string,
): string | null {
  if (!suplenteId || !desde || !hasta) return null
  return desde <= hoy && hoy <= hasta ? suplenteId : null
}

const PASO_POR_ESTADO: Record<TipoDocumento, Record<string, Paso>> = {
  rendicion: {
    submitted:         'decidir_l1',
    pending_l2:        'decidir_l2',
    pending_bank_load: 'cargar_pago',
    pending_bank_auth: 'autorizar_pago',
  },
  fondo: {
    pending_approval:    'decidir_l1',
    pending_approval_l2: 'decidir_l2',
    pending_bank_load:   'cargar_pago',
    pending_bank_auth:   'autorizar_pago',
  },
  liquidacion: {
    // `submitted` era el estado que esperaba «elevar»; ese paso se eliminó (D6)
    // y lo que haya quedado ahí lo decide el N1.
    submitted:                    'decidir_l1',
    pending_liquidation_approval: 'decidir_l1',
    pending_liquidation_l2:       'decidir_l2',
  },
}

export function pasoSegunEstado(tipo: TipoDocumento, estado: string): Paso | null {
  return PASO_POR_ESTADO[tipo][estado] ?? null
}

const ESTADOS_DE_LIQUIDACION = new Set(['submitted', 'pending_liquidation_approval', 'pending_liquidation_l2', 'settled'])

export function tipoDeFondo(estado: string): 'fondo' | 'liquidacion' {
  return ESTADOS_DE_LIQUIDACION.has(estado) ? 'liquidacion' : 'fondo'
}

// La carga más reciente: una reversa de reembolso vuelve a pasar por carga.
function ultimoCargador(historial: EntradaHistorial[]): string | null {
  for (let i = historial.length - 1; i >= 0; i--) {
    if (historial[i].accion === 'bank_load_confirmed') return historial[i].actorId
  }
  return null
}

function esSuplente(p: Persona, paso: Paso): boolean {
  if (paso === 'cargar_pago')    return p.bank_load_backup
  if (paso === 'autorizar_pago') return p.bank_auth_backup
  return false
}

// Por qué esta persona no puede dar el paso, o null si puede.
function bloqueo(persona: Persona, paso: Paso, doc: Documento, personas: Persona[]): string | null {
  if (!persona.activo) return 'Tu usuario no está activo'
  const esBeneficiario = persona.id === doc.beneficiarioId

  switch (paso) {
    case 'decidir_l1': {
      if (esBeneficiario) return 'No puedes aprobar lo tuyo'
      const { l1, suplenteL1Vigente } = doc.cadena
      return persona.id === l1 || persona.id === suplenteL1Vigente
        ? null
        : 'No eres el aprobador de nivel 1 de esta persona'
    }
    case 'decidir_l2': {
      if (esBeneficiario) return 'No puedes aprobar lo tuyo'
      return persona.id === doc.cadena.l2 ? null : 'No eres el aprobador de nivel 2 de esta persona'
    }
    case 'cargar_pago': {
      if (!persona.can_load_bank_transfer) return 'No tienes el permiso «carga banco»'
      // Nunca trabado: si carga esta persona, alguien más tiene que poder autorizar
      const quedaQuienAutorice = personas.some(p =>
        p.activo && p.can_authorize_bank_transfer &&
        p.id !== doc.beneficiarioId && p.id !== persona.id)
      return quedaQuienAutorice ? null : 'Si cargas tú, nadie podrá autorizar este pago'
    }
    case 'autorizar_pago': {
      if (!persona.can_authorize_bank_transfer) return 'No tienes el permiso «autoriza banco»'
      if (esBeneficiario) return 'No puedes autorizar el pago de lo tuyo'
      if (ultimoCargador(doc.historial) === persona.id) return 'Tú cargaste este pago'
      return null
    }
  }
}

// Todas las personas que pueden dar el paso; los titulares del banco primero.
export function elegibles(paso: Paso, doc: Documento, personas: Persona[]): Persona[] {
  return personas
    .filter(p => bloqueo(p, paso, doc, personas) === null)
    .sort((a, b) => Number(esSuplente(a, paso)) - Number(esSuplente(b, paso)))
}

function listar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} o ${nombres[nombres.length - 1]}`
}

export function puedeActuar(persona: Persona, paso: Paso, doc: Documento, personas: Persona[]): Resultado {
  const motivo = bloqueo(persona, paso, doc, personas)
  if (motivo === null) return OK
  const otros = elegibles(paso, doc, personas).filter(p => p.id !== persona.id).map(p => p.nombre)
  return no(otros.length ? `${motivo}. Lo puede hacer ${listar(otros)}` : motivo)
}

// A quién le toca el paso. Mientras un suplente N1 está vigente, solo a él (D8).
// En el banco, a los titulares que pueden; si no queda ninguno, a los suplentes
// que pueden. `excluir` es quien acaba de actuar: nunca se le avisa.
export function destinatarios(paso: Paso, doc: Documento, personas: Persona[], excluir: string[] = []): string[] {
  const candidatos = elegibles(paso, doc, personas).filter(p => !excluir.includes(p.id))

  if (paso === 'decidir_l1') {
    const suplente = doc.cadena.suplenteL1Vigente
    if (suplente && candidatos.some(p => p.id === suplente)) return [suplente]
  }
  if (paso === 'cargar_pago' || paso === 'autorizar_pago') {
    const titulares = candidatos.filter(p => !esSuplente(p, paso))
    if (titulares.length) return titulares.map(p => p.id)
  }
  return candidatos.map(p => p.id)
}

// Avisos que solo informan (rechazo, pago hecho, liquidación cerrada).
export function destinatariosInformativos(enviadoPor: string, beneficiarioId: string, excluir: string[] = []): string[] {
  return [...new Set([enviadoPor, beneficiarioId])].filter(id => !excluir.includes(id))
}

export function puedeEnviar(tipo: TipoDocumento, actor: Persona, cadena: Cadena): Resultado {
  if (!actor.activo) return no('Tu usuario no está activo')
  if (tipo === 'rendicion' && !actor.can_submit) return no('No tienes el permiso «rinde»')
  if (tipo === 'fondo' && !actor.can_manage_petty_cash) return no('No tienes el permiso «EFF»')
  if (!cadena.l1) {
    return no(tipo === 'fondo'
      ? 'Esta persona no tiene aprobador asignado. Ya le avisamos al administrador'
      : 'No tienes aprobador asignado. Ya le avisamos al administrador')
  }
  return OK
}

export function validarCadena(empleadoId: string, config: ConfigCadena, personas: Persona[]): string[] {
  const errores: string[] = []
  const { l1, l2, suplenteL1 } = config

  if (l1 === empleadoId || l2 === empleadoId || suplenteL1 === empleadoId) {
    errores.push('Nadie puede ser su propio aprobador')
  }
  if (l2 && !l1) errores.push('Para tener aprobador N2 hay que tener N1')
  if (l1 && l1 === l2) errores.push('N1 y N2 no pueden ser la misma persona')
  if (suplenteL1 && suplenteL1 === l1) errores.push('El suplente no puede ser el mismo aprobador N1')
  if (suplenteL1 && suplenteL1 === l2) errores.push('El suplente de N1 no puede ser el aprobador N2: decidiría los dos niveles')

  const roles: [string | null, string][] = [[l1, 'N1'], [l2, 'N2'], [suplenteL1, 'suplente']]
  for (const [id, rol] of roles) {
    if (!id || id === empleadoId) continue
    const p = personas.find(x => x.id === id)
    if (!p) { errores.push(`El aprobador ${rol} no pertenece a esta organización`); continue }
    if (!p.activo)      errores.push(`${p.nombre} (${rol}) no está activo`)
    if (!p.can_approve) errores.push(`${p.nombre} (${rol}) no tiene el permiso «aprueba»`)
  }
  return errores
}

// Nombres de quienes tienen a esta persona en su cadena (N1, N2 o suplente).
export function dependientesDe(
  aprobadorId: string,
  empleados: { id: string; nombre: string; l1: string | null; l2: string | null; suplenteL1: string | null }[],
): string[] {
  return empleados
    .filter(e => e.id !== aprobadorId && (e.l1 === aprobadorId || e.l2 === aprobadorId || e.suplenteL1 === aprobadorId))
    .map(e => e.nombre)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/tests/permisos.test.ts`
Expected: PASS (todos los `it`).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/permisos.ts src/tests/permisos.test.ts
git commit -m @'
feat(permisos): reglas puras de quién actúa y a quién se avisa

Cinco reglas de segregación y los casos reales de PENTA como tests.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 2: Recorrido de estados y catálogos

**Files:**
- Create: `src/lib/flujo.ts`, `src/tests/flujo.test.ts`
- Modify: `src/lib/constants.ts`, `src/lib/petty-cash-helpers.ts`, `src/tests/petty-cash-helpers.test.ts`, `src/app/(app)/petty-cash/FundList.tsx:135`
- Modify (consumidores de «aprobada»): `src/app/(app)/page.tsx:21`, `src/actions/admin.ts` (líneas ~202, ~431, ~1204, ~1855, ~1955, ~2288), `src/actions/policies.ts:216`, `src/app/(app)/admin/reports/client.tsx:777`

**Interfaces:**
- Consumes: `ReportStatus`, `FundStatusConst` de `constants.ts`.
- Produces:
  - `estadoTrasDecisionReporte(p: { nivel: 1 | 2; tieneL2: boolean; resultado: ResultadoDecision; montoAPagar: number }): ReportStatus`
  - `type ResultadoDecision = 'approved' | 'partially_approved' | 'rejected'`
  - `estadoTrasAprobacionFondo(p: { nivel: 1 | 2; tieneL2: boolean }): 'pending_approval_l2' | 'pending_bank_load'`
  - `estadoTrasLiquidacion(p: { nivel: 1 | 2; tieneL2: boolean }): 'pending_liquidation_l2' | 'settled'`
  - `ESTADOS_APROBADOS: ReportStatus[]`, `ESTADOS_POR_PAGAR: ReportStatus[]` en `constants.ts`
  - `FUND_STATUSES` con `'pending_approval_l2'` y `'pending_liquidation_l2'`
  - `pasoVisibleDelFondo(status: FundStatusConst): FundStatusConst` en `petty-cash-helpers.ts`

> **Cambio de comportamiento incluido (Daniel lo confirmó al revisar el plan):** hoy, si el N1
> aprueba **parcialmente** y hay N2, la rendición salta el N2 y queda decidida. Con
> esto, cualquier decisión del N1 que no sea rechazo total pasa al N2: la última
> palabra es del N2 (FH). Lo que el N1 rechazó queda rechazado; lo que aprobó
> vuelve a «pendiente» para que el N2 lo revise.

- [ ] **Step 1: Write the failing tests**

Crear `src/tests/flujo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { estadoTrasDecisionReporte, estadoTrasAprobacionFondo, estadoTrasLiquidacion } from '@/lib/flujo'
import { ESTADOS_APROBADOS, ESTADOS_POR_PAGAR } from '@/lib/constants'

describe('estadoTrasDecisionReporte', () => {
  it('N1 aprueba y hay N2: pasa al N2', () => {
    expect(estadoTrasDecisionReporte({ nivel: 1, tieneL2: true, resultado: 'approved', montoAPagar: 5000 }))
      .toBe('pending_l2')
  })

  it('N1 aprueba parcialmente y hay N2: también pasa al N2 — la última palabra es del N2', () => {
    expect(estadoTrasDecisionReporte({ nivel: 1, tieneL2: true, resultado: 'partially_approved', montoAPagar: 3000 }))
      .toBe('pending_l2')
  })

  it('aprobación final con monto: directo a la carga bancaria (D4)', () => {
    expect(estadoTrasDecisionReporte({ nivel: 2, tieneL2: true, resultado: 'approved', montoAPagar: 5000 }))
      .toBe('pending_bank_load')
    expect(estadoTrasDecisionReporte({ nivel: 1, tieneL2: false, resultado: 'approved', montoAPagar: 5000 }))
      .toBe('pending_bank_load')
    expect(estadoTrasDecisionReporte({ nivel: 2, tieneL2: true, resultado: 'partially_approved', montoAPagar: 3000 }))
      .toBe('pending_bank_load')
  })

  it('aprobación final sin nada que pagar: queda aprobada y no entra al banco', () => {
    expect(estadoTrasDecisionReporte({ nivel: 2, tieneL2: true, resultado: 'approved', montoAPagar: 0 }))
      .toBe('approved')
    expect(estadoTrasDecisionReporte({ nivel: 1, tieneL2: false, resultado: 'partially_approved', montoAPagar: -200 }))
      .toBe('partially_approved')
  })

  it('rechazo total, en cualquier nivel, termina en rechazada', () => {
    expect(estadoTrasDecisionReporte({ nivel: 1, tieneL2: true, resultado: 'rejected', montoAPagar: 0 })).toBe('rejected')
    expect(estadoTrasDecisionReporte({ nivel: 2, tieneL2: true, resultado: 'rejected', montoAPagar: 0 })).toBe('rejected')
  })
})

describe('fondos', () => {
  it('aprobación: N1 con N2 espera al N2; la final va directo al banco', () => {
    expect(estadoTrasAprobacionFondo({ nivel: 1, tieneL2: true })).toBe('pending_approval_l2')
    expect(estadoTrasAprobacionFondo({ nivel: 1, tieneL2: false })).toBe('pending_bank_load')
    expect(estadoTrasAprobacionFondo({ nivel: 2, tieneL2: true })).toBe('pending_bank_load')
  })

  it('liquidación: N1 con N2 espera al N2; la final liquida el fondo', () => {
    expect(estadoTrasLiquidacion({ nivel: 1, tieneL2: true })).toBe('pending_liquidation_l2')
    expect(estadoTrasLiquidacion({ nivel: 1, tieneL2: false })).toBe('settled')
    expect(estadoTrasLiquidacion({ nivel: 2, tieneL2: true })).toBe('settled')
  })
})

describe('grupos de estados', () => {
  it('toda rendición por pagar es una rendición aprobada', () => {
    for (const e of ESTADOS_POR_PAGAR) expect(ESTADOS_APROBADOS).toContain(e)
  })

  it('las etapas del banco cuentan como aprobadas y por pagar; reembolsada solo como aprobada', () => {
    expect(ESTADOS_POR_PAGAR).toEqual(expect.arrayContaining(['pending_bank_load', 'pending_bank_auth']))
    expect(ESTADOS_APROBADOS).toContain('reimbursed')
    expect(ESTADOS_POR_PAGAR).not.toContain('reimbursed')
  })
})
```

Agregar al final del `describe('tramoDelFondo', …)` de `src/tests/petty-cash-helpers.test.ts`, antes del test «usa exactamente cuatro tramos»:

```typescript
  it('los estados de N2 caen en el mismo tramo que su N1', () => {
    expect(tramoDelFondo('pending_approval_l2')).toBe('antes')
    expect(tramoDelFondo('pending_liquidation_l2')).toBe('con-dinero')
  })
```

Y dentro de `describe('construirRecorrido', …)`:

```typescript
  /**
   * En N2 el fondo sigue en el paso de autorización: «Autorizado» todavía no
   * está hecho aunque el historial ya tenga la aprobación del N1.
   */
  it('en N2, el paso actual es la autorización y «Autorizado» sigue pendiente', () => {
    const pasos = construirRecorrido('pending_approval_l2', [
      { action: 'created',                created_at: '2026-09-24T09:00:00Z' },
      { action: 'submitted_for_approval', created_at: '2026-09-24T09:05:00Z' },
      { action: 'approved',               created_at: '2026-09-24T10:00:00Z' },
    ])
    expect(pasos.find(p => p.estado === 'actual')?.key).toBe('pending_approval')
    const autorizado = pasos.find(p => p.key === 'approved')
    expect(autorizado?.estado).toBe('pendiente')
    expect(autorizado?.fecha).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/tests/flujo.test.ts src/tests/petty-cash-helpers.test.ts`
Expected: FAIL — `@/lib/flujo` no existe; `ESTADOS_APROBADOS` no exportado; errores de tipo en `tramoDelFondo('pending_approval_l2')`.

- [ ] **Step 3: Write `src/lib/flujo.ts`**

```typescript
// Qué estado sigue a cada decisión. Spec §2.
// La aprobación final lleva directo a la carga bancaria (D4): el paso
// «Iniciar proceso bancario» no tenía a nadie a quien avisarle y sobraba.
import type { ReportStatus } from '@/lib/constants'

export type ResultadoDecision = 'approved' | 'partially_approved' | 'rejected'

export function estadoTrasDecisionReporte(p: {
  nivel:       1 | 2
  tieneL2:     boolean
  resultado:   ResultadoDecision
  montoAPagar: number
}): ReportStatus {
  if (p.resultado === 'rejected') return 'rejected'
  // Con N2, la última palabra es del N2, también si el N1 aprobó solo una parte
  if (p.nivel === 1 && p.tieneL2) return 'pending_l2'
  return p.montoAPagar > 0 ? 'pending_bank_load' : p.resultado
}

export function estadoTrasAprobacionFondo(p: { nivel: 1 | 2; tieneL2: boolean }): 'pending_approval_l2' | 'pending_bank_load' {
  return p.nivel === 1 && p.tieneL2 ? 'pending_approval_l2' : 'pending_bank_load'
}

export function estadoTrasLiquidacion(p: { nivel: 1 | 2; tieneL2: boolean }): 'pending_liquidation_l2' | 'settled' {
  return p.nivel === 1 && p.tieneL2 ? 'pending_liquidation_l2' : 'settled'
}
```

- [ ] **Step 4: Update `src/lib/constants.ts`**

Después de `STATUS_LABELS`, agregar:

```typescript
/**
 * Rendiciones que ya pasaron la aprobación final, pagadas o no. Desde el
 * 2026-09-24 la aprobación final lleva directo a la carga bancaria, así que
 * «approved» ya no alcanza para encontrarlas: casi ninguna se queda ahí.
 */
export const ESTADOS_APROBADOS: ReportStatus[] = [
  'approved', 'partially_approved', 'pending_bank_load', 'pending_bank_auth', 'reimbursed',
]

/** Aprobadas cuyo pago todavía no salió de la empresa. */
export const ESTADOS_POR_PAGAR: ReportStatus[] = [
  'approved', 'partially_approved', 'pending_bank_load', 'pending_bank_auth',
]
```

En `FUND_STATUSES`, agregar `'pending_approval_l2'` después de `'pending_approval'` y `'pending_liquidation_l2'` después de `'pending_liquidation_approval'`.

En `FUND_STATUS_LABELS`:

```typescript
  pending_approval_l2:          'Esperando autorización N2',
  pending_liquidation_l2:       'Revisando liquidación N2',
```

En `FAMILIA_FONDO`:

```typescript
  pending_approval_l2:          'en-curso',
  pending_liquidation_l2:       'en-curso',
```

En `FUND_AUDIT_LABELS`:

```typescript
  returned_to_draft:       'Devuelto a borrador',
```

- [ ] **Step 5: Update `src/lib/petty-cash-helpers.ts`**

En `TRAMO_POR_ESTADO` agregar:

```typescript
  pending_approval_l2:          'antes',
  pending_liquidation_l2:       'con-dinero',
```

Antes de `construirRecorrido`, agregar:

```typescript
/**
 * Los dos niveles de aprobación se ven como UN paso del recorrido: la
 * etiqueta del estado ya dice «N2». Así FUND_STEPS no crece con un paso que
 * los fondos sin N2 nunca pisan.
 */
const PASO_VISIBLE: Partial<Record<FundStatusConst, FundStatusConst>> = {
  pending_approval_l2:    'pending_approval',
  pending_liquidation_l2: 'pending_liquidation_approval',
}

export function pasoVisibleDelFondo(status: FundStatusConst): FundStatusConst {
  return PASO_VISIBLE[status] ?? status
}
```

Reemplazar el cuerpo de `construirRecorrido` por:

```typescript
  const idx = FUND_STEPS.findIndex(s => s.key === pasoVisibleDelFondo(status))

  return FUND_STEPS.map((step, i) => {
    const accion = AUDIT_QUE_ALCANZA[step.key]
    // Un paso posterior al vigente es futuro aunque el historial ya tenga su
    // acción: en N2, la aprobación del N1 no vuelve «hecho» a «Autorizado».
    const futuro = idx >= 0 && i > idx
    const fecha  = futuro ? null : audits.find(a => a.action === accion)?.created_at ?? null

    const estado: EstadoPaso =
      i === idx        ? 'actual'    :
      futuro           ? 'pendiente' :
      fecha !== null   ? 'hecho'     :
      idx >= 0         ? 'hecho'     :
                         'pendiente'

    return { key: step.key, label: step.label, estado, fecha }
  })
```

Actualizar el comentario de las tres reglas de arriba de la función, agregando: `0. Un paso posterior al vigente está pendiente y sin fecha.`

En `src/app/(app)/petty-cash/FundList.tsx` (línea ~135) importar `pasoVisibleDelFondo` de `@/lib/petty-cash-helpers` y cambiar:

```tsx
<CompactStepper steps={FUND_STEPS} currentStatus={f.status} />
```
por:
```tsx
<CompactStepper steps={FUND_STEPS} currentStatus={pasoVisibleDelFondo(f.status)} />
```

- [ ] **Step 6: Replace the «aprobada» consumers**

Cada lugar que buscaba rendiciones aprobadas con `['approved', 'partially_approved', …]` se quedaría sin las que están en el banco. Reemplazar (importando desde `@/lib/constants`):

| Archivo | Antes | Después |
|---|---|---|
| `src/app/(app)/page.tsx:21` | `['approved', 'partially_approved'].includes(r.status)` | `ESTADOS_POR_PAGAR.includes(r.status as ReportStatus)` |
| `src/actions/admin.ts` ~202 (KPI «aprobadas sin reembolsar») | `.in('status', ['approved', 'partially_approved'])` | `.in('status', ESTADOS_POR_PAGAR)` |
| `src/actions/admin.ts` ~431 | `.in('status', ['approved', 'partially_approved'])` | `.in('status', ESTADOS_POR_PAGAR)` |
| `src/actions/admin.ts` ~1204 | `.in('status', ['approved', 'partially_approved', 'reimbursed'])` | `.in('status', ESTADOS_APROBADOS)` |
| `src/actions/admin.ts` ~1855 y ~1955 | `.in('expense_reports.status', ['approved', 'partially_approved', 'reimbursed'])` | `.in('expense_reports.status', ESTADOS_APROBADOS)` |
| `src/actions/admin.ts` ~2288 | `.in('status', ['approved', 'partially_approved', 'reimbursed'])` | `.in('status', ESTADOS_APROBADOS)` |
| `src/actions/policies.ts:216` | `['submitted', 'pending_l2', 'approved', 'partially_approved', 'reimbursed']` | `['submitted', 'pending_l2', ...ESTADOS_APROBADOS]` |
| `src/app/(app)/admin/reports/client.tsx:777` | `['approved', 'partially_approved', 'reimbursed'].includes(r.status)` | `ESTADOS_APROBADOS.includes(r.status as ReportStatus)` |

No tocar `admin.ts:2584` (`getBankQueue`), `approvals.ts` ni `bank-helpers.ts`: los reescriben las tareas 6 y 9.

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test`
Expected: PASS, suite completa.

Run: `npx tsc --noEmit`
Expected: sin errores. Si `.in('status', ESTADOS_POR_PAGAR)` reclama por el tipo, usar `[...ESTADOS_POR_PAGAR]`. Si algún otro `Record<FundStatusConst, …>` (por ejemplo en un componente de insignias) reclama por las dos claves nuevas, agregarlas con el mismo valor que su estado N1 (`pending_approval` / `pending_liquidation_approval`).

- [ ] **Step 8: Commit**

```powershell
git add src/lib/flujo.ts src/tests/flujo.test.ts src/lib/constants.ts src/lib/petty-cash-helpers.ts src/tests/petty-cash-helpers.test.ts "src/app/(app)/petty-cash/FundList.tsx" "src/app/(app)/page.tsx" src/actions/admin.ts src/actions/policies.ts "src/app/(app)/admin/reports/client.tsx"
git commit -m @'
feat(flujo): la aprobación final va directo al banco y los fondos tienen N2

Recorrido de estados puro, estados N2 de fondos y grupos de estados
aprobados/por pagar para que KPIs, análisis y Defontana no pierdan las
rendiciones que están en el banco.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 3: Migración 032 — cambios aditivos de base

**Files:**
- Create: `supabase/migrations/032_flujo_por_asignacion.sql`
- Modify: `src/lib/supabase/types.ts` (users ~92/120/148, notifications ~554, petty_cash_funds ~581, petty_cash_approvals ~707)

**Interfaces:**
- Consumes: `es_aprobador_de(uuid)` (migración 030), `get_my_org_id()`.
- Produces: columnas `users.bank_load_backup`, `users.bank_auth_backup`, `petty_cash_approvals.level`, `notifications.fund_id`; estados de fondo `pending_approval_l2`, `pending_liquidation_l2`; acción `returned_to_draft`; tipos de aviso `bank_load`, `bank_auth`, `funds_sent`, `config_missing`; función `es_operador_bancario()`.

Es **aditiva**: el código viejo sigue funcionando con ella aplicada, así que se aplica ahora.

- [ ] **Step 1: Write the migration**

Crear `supabase/migrations/032_flujo_por_asignacion.sql`:

```sql
-- Permisos por asignación — parte aditiva.
-- Spec: docs/superpowers/specs/2026-09-24-permisos-y-flujo-de-aprobacion-design.md
--
-- Se puede aplicar ANTES de desplegar el código nuevo: no rompe nada del
-- código viejo. La protección de estados va en la 033, DESPUÉS del despliegue.

-- 1 ─ Suplente bancario por función ────────────────────────────────────────────
-- `bank_is_backup` era uno solo por persona, y en PENTA Francisco Hagar es
-- titular para autorizar y suplente para cargar. Con un solo interruptor no se
-- puede decir. La 033 borra `bank_is_backup` cuando ningún código lo lea.
alter table public.users
  add column bank_load_backup boolean not null default false,
  add column bank_auth_backup boolean not null default false;

update public.users
set bank_load_backup = bank_is_backup,
    bank_auth_backup = bank_is_backup
where bank_is_backup;

comment on column public.users.bank_load_backup is
  'Suplente para cargar pagos: puede hacerlo, pero el aviso le llega solo si no hay titular que pueda';
comment on column public.users.bank_auth_backup is
  'Suplente para autorizar pagos: puede hacerlo, pero el aviso le llega solo si no hay titular que pueda';

-- 2 ─ Fondos con dos niveles ───────────────────────────────────────────────────
alter table public.petty_cash_funds drop constraint petty_cash_funds_status_check;
alter table public.petty_cash_funds add constraint petty_cash_funds_status_check
  check (status in (
    'draft', 'pending_approval', 'pending_approval_l2', 'approved',
    'pending_bank_load', 'pending_bank_auth', 'funds_sent', 'submitted',
    'pending_liquidation_approval', 'pending_liquidation_l2', 'settled', 'rejected'
  ));

alter table public.petty_cash_approvals
  add column level smallint check (level in (1, 2));

alter table public.petty_cash_approvals drop constraint petty_cash_approvals_action_check;
alter table public.petty_cash_approvals add constraint petty_cash_approvals_action_check
  check (action in (
    'created', 'submitted_for_approval', 'approved', 'rejected',
    'bank_load_requested', 'bank_load_confirmed', 'bank_authorized', 'funds_sent',
    'liquidation_submitted', 'liquidation_elevated', 'liquidation_approved', 'settled',
    'returned_to_draft'
  ));

-- 3 ─ Historial de fondos: firmado e inmutable ─────────────────────────────────
-- Antes cualquier usuario podía insertar una entrada con cualquier actor_id, y
-- la regla «no operar lo propio» se decide leyendo este historial: una entrada
-- falsa de «aprobó FH» la destrababa.
drop policy "authenticated users can insert audit entries" on public.petty_cash_approvals;
create policy "each user signs own audit entries" on public.petty_cash_approvals
  for insert with check (actor_id = auth.uid());

-- Mismo patrón que la 026 para las aprobaciones de rendiciones.
create or replace function public.proteger_historial_fondos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'El historial de un fondo no se puede modificar';
  end if;
  -- DELETE: solo como cascada del borrado del fondo
  if exists (select 1 from petty_cash_funds where id = old.fund_id) then
    raise exception 'El historial de un fondo no se puede borrar';
  end if;
  return old;
end;
$$;

create trigger proteger_historial_fondos
  before update or delete on public.petty_cash_approvals
  for each row execute function public.proteger_historial_fondos();

-- 4 ─ Ver por cadena, no por permiso ───────────────────────────────────────────
-- «Aprueba» ya no deja ver todos los fondos pendientes de la empresa: cada uno
-- ve los de las personas de su cadena, y los operadores del banco los que están
-- en el banco.
create or replace function public.es_operador_bancario()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select can_load_bank_transfer or can_authorize_bank_transfer from users where id = auth.uid()),
    false)
$$;

drop policy "approver sees funds pending approval" on public.petty_cash_funds;

create policy "chain sees funds of their people" on public.petty_cash_funds
  for select using (org_id = public.get_my_org_id() and public.es_aprobador_de(employee_id));

create policy "bank operators see funds in bank" on public.petty_cash_funds
  for select using (
    org_id = public.get_my_org_id()
    and status in ('pending_bank_load', 'pending_bank_auth')
    and public.es_operador_bancario()
  );

drop policy "approver reads items during liquidation" on public.petty_cash_items;
drop policy "approver updates items during liquidation" on public.petty_cash_items;

create policy "chain reads items of their people" on public.petty_cash_items
  for select using (
    exists (
      select 1 from public.petty_cash_funds f
      where f.id = fund_id and public.es_aprobador_de(f.employee_id)
    )
  );

drop policy "participants read audit trail" on public.petty_cash_approvals;
create policy "participants read audit trail" on public.petty_cash_approvals
  for select using (
    exists (
      select 1 from public.petty_cash_funds f
      where f.id = fund_id
        and (
          f.manager_id = auth.uid()
          or f.employee_id = auth.uid()
          or public.es_aprobador_de(f.employee_id)
          or (f.org_id = public.get_my_org_id() and public.es_operador_bancario())
        )
    )
  );

-- 5 ─ Avisos de fondos ─────────────────────────────────────────────────────────
alter table public.notifications
  add column fund_id uuid references public.petty_cash_funds(id) on delete cascade;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'submission', 'approval', 'rejection', 'reimbursement',
    'bank_load', 'bank_auth', 'funds_sent', 'config_missing'
  ));
```

- [ ] **Step 2: Apply the migration**

Aplicar con la herramienta `apply_migration` del MCP de Supabase (`project_id: jqtbtgduqzxkgubmzukg`, `name: 032_flujo_por_asignacion`, `query`: el contenido del archivo).
Expected: sin error.

- [ ] **Step 3: Verify it in the database**

Ejecutar con `execute_sql`:

```sql
select full_name, bank_is_backup, bank_load_backup, bank_auth_backup
from public.users where bank_is_backup or bank_load_backup or bank_auth_backup;
```
Expected: Roberto Hagar con las tres en `true`.

```sql
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('petty_cash_funds', 'petty_cash_items', 'petty_cash_approvals')
order by tablename, policyname;
```
Expected: aparecen `chain sees funds of their people`, `bank operators see funds in bank`, `chain reads items of their people`, `each user signs own audit entries`; ya no aparecen `approver sees funds pending approval`, `approver reads items during liquidation`, `approver updates items during liquidation`, `authenticated users can insert audit entries`.

```sql
begin;
update public.petty_cash_approvals set notes = 'x' where id = (select id from public.petty_cash_approvals limit 1);
rollback;
```
Expected: ERROR `El historial de un fondo no se puede modificar`.

- [ ] **Step 4: Update `src/lib/supabase/types.ts`**

`users` — en `Row` agregar `bank_load_backup: boolean` y `bank_auth_backup: boolean`; en `Insert` y `Update` agregar `bank_load_backup?: boolean` y `bank_auth_backup?: boolean`. (`bank_is_backup` se queda hasta la Tarea 8.)

`notifications` — `Row` e `Insert`:

```typescript
          type: 'submission' | 'approval' | 'rejection' | 'reimbursement' | 'bank_load' | 'bank_auth' | 'funds_sent' | 'config_missing'
```
y agregar `fund_id: string | null` en `Row`, `fund_id?: string | null` en `Insert`.

`petty_cash_funds` — en `Row`, `Insert` y `Update` reemplazar la unión de `status` por:

```typescript
'draft' | 'pending_approval' | 'pending_approval_l2' | 'approved' | 'pending_bank_load' | 'pending_bank_auth' | 'funds_sent' | 'submitted' | 'pending_liquidation_approval' | 'pending_liquidation_l2' | 'settled' | 'rejected'
```

`petty_cash_approvals` — en `Row` agregar `level: number | null`; en `Insert` agregar `level?: number | null`; en la unión de `action` de ambos agregar `| 'returned_to_draft'`.

- [ ] **Step 5: Typecheck and tests**

Run: `npx tsc --noEmit` → sin errores.
Run: `npm test` → PASS.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/032_flujo_por_asignacion.sql src/lib/supabase/types.ts
git commit -m @'
feat(db): fondos con N2, suplencia bancaria por función e historial firmado

Migración aditiva 032: aplica antes del despliegue sin romper el código viejo.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 4: Contexto del servidor y avisos

**Files:**
- Create: `src/lib/contexto-permisos.ts`
- Modify: `src/actions/notifications.ts` (reescritura de los avisos), `src/actions/expenses.ts:259`, `src/actions/approvals.ts` (llamadas a avisos: ~273, ~280, ~528, ~531, ~711)

**Interfaces:**
- Consumes: todo lo de la Tarea 1; `createAdminClient()` de `@/lib/supabase/admin`.
- Produces:
  - `type AdminClient = ReturnType<typeof createAdminClient>`
  - `cargarPersonas(admin: AdminClient, orgId: string): Promise<Persona[]>`
  - `cargarCadena(admin: AdminClient, userId: string): Promise<Cadena>`
  - `interface ContextoRendicion { admin; reporte: { id; org_id; submitter_id; status; title; approved_amount; is_historical_import }; personas: Persona[]; doc: Documento }`
  - `contextoRendicion(reportId: string): Promise<ContextoRendicion>`
  - `interface ContextoFondo { admin; fondo: { id; org_id; employee_id; manager_id; status; name; amount_requested; amount_approved }; personas: Persona[]; doc: Documento }`
  - `contextoFondo(fundId: string): Promise<ContextoFondo>` (el `doc.tipo` sale de `tipoDeFondo(status)`)
  - `exigirPaso(ctx, estado, userId, pasosValidos, yaNoEspera): { yo: Persona; paso: Paso }` (lanza con el motivo)
  - `permisoEn(ctx, estado, userId): { paso: Paso | null; ok: boolean; motivo: string | null; esperandoA: string[] }`
  - En `notifications.ts` (acciones exportadas, todas `async`):
    - `notifyReportApprovers(reportId: string, paso: 'decidir_l1' | 'decidir_l2', actorId: string)`
    - `notifyReportBankStep(reportId: string, paso: 'cargar_pago' | 'autorizar_pago', actorId: string)`
    - `notifySubmitterOfDecision(reportId: string, action: 'approved' | 'rejected' | 'partially_approved')` (se conserva)
    - `notifySubmitterOfReimbursement(reportId: string)` (se conserva)
    - `notifyAdminsMissingApprover(orgId: string, empleadoNombre: string, que: 'una rendición' | 'un fondo' | 'una liquidación')`
    - `notifyFundStep(fundId: string, paso: Paso, actorId: string)`
    - `notifyFundOutcome(fundId: string, resultado: 'rejected' | 'funds_sent' | 'settled', actorId: string)`
  - Se eliminan: `notifyApproversOfSubmission`, `notifyL2ApproverOfPromotion`, `notifyBankLoadersOfApproval`, `notifyBankAuthorizersOfLoad`.

- [ ] **Step 1: Create `src/lib/contexto-permisos.ts`**

```typescript
// Arma, desde la base, lo que src/lib/permisos.ts necesita para decidir.
//
// Lee con la llave de servicio: las reglas tienen que ver a TODAS las personas
// de la organización y TODO el historial, no solo lo que la RLS le deja ver a
// quien pregunta. Solo lo importan acciones del servidor (src/actions/).

import { createAdminClient } from '@/lib/supabase/admin'
import {
  suplenteVigente, pasoSegunEstado, puedeActuar, destinatarios, tipoDeFondo,
  type Cadena, type Documento, type Paso, type Persona,
} from '@/lib/permisos'

export type AdminClient = ReturnType<typeof createAdminClient>

const hoy = () => new Date().toISOString().slice(0, 10)

export async function cargarPersonas(admin: AdminClient, orgId: string): Promise<Persona[]> {
  const { data, error } = await admin
    .from('users')
    .select('id, full_name, is_active, blocked_at, deleted_at, can_submit, can_approve, can_manage_petty_cash, can_load_bank_transfer, can_authorize_bank_transfer, bank_load_backup, bank_auth_backup')
    .eq('org_id', orgId)
  if (error) throw new Error(error.message)

  return (data ?? []).map(u => ({
    id:                          u.id,
    nombre:                      u.full_name,
    activo:                      u.is_active && !u.blocked_at && !u.deleted_at,
    can_submit:                  u.can_submit,
    can_approve:                 u.can_approve,
    can_manage_petty_cash:       u.can_manage_petty_cash,
    can_load_bank_transfer:      u.can_load_bank_transfer,
    can_authorize_bank_transfer: u.can_authorize_bank_transfer,
    bank_load_backup:            u.bank_load_backup,
    bank_auth_backup:            u.bank_auth_backup,
  }))
}

export async function cargarCadena(admin: AdminClient, userId: string): Promise<Cadena> {
  const { data, error } = await admin
    .from('users')
    .select('approver_l1_id, approver_l2_id, approver_l1_backup_id, backup_active_from, backup_active_until')
    .eq('id', userId)
    .single()
  if (error || !data) throw new Error('No se encontró la cadena de aprobación')

  return {
    l1:                data.approver_l1_id,
    l2:                data.approver_l2_id,
    suplenteL1Vigente: suplenteVigente(data.approver_l1_backup_id, data.backup_active_from, data.backup_active_until, hoy()),
  }
}

export interface ContextoRendicion {
  admin:    AdminClient
  reporte:  {
    id: string; org_id: string; submitter_id: string; status: string; title: string
    approved_amount: number | null; is_historical_import: boolean
  }
  personas: Persona[]
  doc:      Documento
}

export async function contextoRendicion(reportId: string): Promise<ContextoRendicion> {
  const admin = createAdminClient()
  const { data: reporte } = await admin
    .from('expense_reports')
    .select('id, org_id, submitter_id, status, title, approved_amount, is_historical_import')
    .eq('id', reportId)
    .is('deleted_at', null)
    .single()
  if (!reporte) throw new Error('Rendición no encontrada')

  const [personas, cadena, { data: log }] = await Promise.all([
    cargarPersonas(admin, reporte.org_id),
    cargarCadena(admin, reporte.submitter_id),
    admin.from('expense_report_approvals')
      .select('approver_id, action, level')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true }),
  ])

  return {
    admin,
    reporte,
    personas,
    doc: {
      tipo:           'rendicion',
      beneficiarioId: reporte.submitter_id,
      cadena,
      historial:      (log ?? []).map(a => ({ actorId: a.approver_id, accion: a.action, nivel: a.level })),
    },
  }
}

export interface ContextoFondo {
  admin:    AdminClient
  fondo:    {
    id: string; org_id: string; employee_id: string; manager_id: string; status: string
    name: string; amount_requested: number; amount_approved: number | null
  }
  personas: Persona[]
  doc:      Documento
}

export async function contextoFondo(fundId: string): Promise<ContextoFondo> {
  const admin = createAdminClient()
  const { data: fondo } = await admin
    .from('petty_cash_funds')
    .select('id, org_id, employee_id, manager_id, status, name, amount_requested, amount_approved')
    .eq('id', fundId)
    .is('deleted_at', null)
    .single()
  if (!fondo) throw new Error('Fondo no encontrado')

  const [personas, cadena, { data: log }] = await Promise.all([
    cargarPersonas(admin, fondo.org_id),
    cargarCadena(admin, fondo.employee_id),
    admin.from('petty_cash_approvals')
      .select('actor_id, action, level')
      .eq('fund_id', fundId)
      .order('created_at', { ascending: true }),
  ])

  return {
    admin,
    fondo,
    personas,
    doc: {
      tipo:           tipoDeFondo(fondo.status),
      beneficiarioId: fondo.employee_id,
      cadena,
      historial:      (log ?? []).map(a => ({ actorId: a.actor_id, accion: a.action, nivel: a.level })),
    },
  }
}

// Verifica que quien llama pueda dar el paso que el documento espera. Lanza con
// el motivo tal cual; la pantalla muestra el suyo desde `permisoEn`.
export function exigirPaso(
  ctx: { personas: Persona[]; doc: Documento },
  estado: string,
  userId: string,
  pasosValidos: Paso[],
  yaNoEspera: string,
): { yo: Persona; paso: Paso } {
  const yo = ctx.personas.find(p => p.id === userId)
  if (!yo) throw new Error('Documento no encontrado')
  const paso = pasoSegunEstado(ctx.doc.tipo, estado)
  if (!paso || !pasosValidos.includes(paso)) throw new Error(yaNoEspera)
  const permiso = puedeActuar(yo, paso, ctx.doc, ctx.personas)
  if (!permiso.ok) throw new Error(permiso.motivo)
  return { yo, paso }
}

// Lo mismo, sin lanzar: para decidir qué botones mostrar y a quién se espera.
export function permisoEn(
  ctx: { personas: Persona[]; doc: Documento },
  estado: string,
  userId: string,
): { paso: Paso | null; ok: boolean; motivo: string | null; esperandoA: string[] } {
  const paso = pasoSegunEstado(ctx.doc.tipo, estado)
  if (!paso) return { paso: null, ok: false, motivo: null, esperandoA: [] }

  const nombres = destinatarios(paso, ctx.doc, ctx.personas)
    .map(id => ctx.personas.find(p => p.id === id)?.nombre ?? '')
    .filter(Boolean)
  const yo = ctx.personas.find(p => p.id === userId)
  if (!yo) return { paso, ok: false, motivo: 'Documento no encontrado', esperandoA: nombres }

  const r = puedeActuar(yo, paso, ctx.doc, ctx.personas)
  return { paso, ok: r.ok, motivo: r.ok ? null : r.motivo, esperandoA: nombres }
}
```

- [ ] **Step 2: Rewrite the notices in `src/actions/notifications.ts`**

Reemplazar la línea `import { destinatariosBancarios } from '@/lib/bank-helpers'` por:

```typescript
import { destinatarios, destinatariosInformativos, type Paso, type Persona } from '@/lib/permisos'
import { contextoRendicion, contextoFondo } from '@/lib/contexto-permisos'
```

Conservar `trySendEmail` y `lookupEmails`. Justo debajo de `lookupEmails`, agregar:

```typescript
type TipoAviso =
  | 'submission' | 'approval' | 'rejection' | 'reimbursement'
  | 'bank_load' | 'bank_auth' | 'funds_sent' | 'config_missing'

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? ''
const nombreDe = (personas: Persona[], id: string) => personas.find(p => p.id === id)?.nombre ?? 'un empleado'

// Un aviso = una notificación en la app + un correo, a las mismas personas.
async function avisar(opts: {
  orgId:     string
  userIds:   string[]
  tipo:      TipoAviso
  reportId?: string
  fundId?:   string
  asunto:    string
  html:      string
}) {
  const ids = [...new Set(opts.userIds)]
  if (!ids.length) return
  const admin = createAdminClient()
  await admin.from('notifications').insert(ids.map(id => ({
    org_id:    opts.orgId,
    user_id:   id,
    type:      opts.tipo,
    report_id: opts.reportId ?? null,
    fund_id:   opts.fundId ?? null,
    read:      false,
  })))
  await trySendEmail(await lookupEmails(ids), opts.asunto, opts.html)
}
```

Borrar `notifyApproversOfSubmission`, `notifyL2ApproverOfPromotion`, `notifyBankLoadersOfApproval` y `notifyBankAuthorizersOfLoad`, y agregar:

```typescript
// ── Rendiciones ───────────────────────────────────────────────────────────────

// Le toca a la cadena: N1 (o solo su suplente, si está vigente) o N2.
export async function notifyReportApprovers(reportId: string, paso: 'decidir_l1' | 'decidir_l2', actorId: string) {
  const { reporte, personas, doc } = await contextoRendicion(reportId)
  const quien = nombreDe(personas, reporte.submitter_id)
  const n2    = paso === 'decidir_l2'
  await avisar({
    orgId:    reporte.org_id,
    userIds:  destinatarios(paso, doc, personas, [actorId]),
    tipo:     'submission',
    reportId,
    asunto:   n2 ? `Revisión N2 — rendición de ${quien}: ${reporte.title}` : `Aprobar rendición de ${quien}: ${reporte.title}`,
    html:     `<p>${n2
      ? `La rendición de <strong>${quien}</strong> fue aprobada en nivel 1 y requiere tu revisión final.`
      : `<strong>${quien}</strong> envió una rendición que requiere tu aprobación.`}</p>
     <p><a href="${appUrl()}/approvals/${reportId}">Revisar rendición →</a></p>`,
  })
}

export async function notifyReportBankStep(reportId: string, paso: 'cargar_pago' | 'autorizar_pago', actorId: string) {
  const { reporte, personas, doc } = await contextoRendicion(reportId)
  const quien  = nombreDe(personas, reporte.submitter_id)
  const cargar = paso === 'cargar_pago'
  await avisar({
    orgId:    reporte.org_id,
    userIds:  destinatarios(paso, doc, personas, [actorId]),
    tipo:     cargar ? 'bank_load' : 'bank_auth',
    reportId,
    asunto:   cargar
      ? `Cargar reembolso — rendición de ${quien}: ${reporte.title}`
      : `Autorizar transferencia — rendición de ${quien}: ${reporte.title}`,
    html:     `<p>${cargar
      ? `La rendición de <strong>${quien}</strong> fue aprobada: falta cargar el reembolso en el banco.`
      : `El reembolso de la rendición de <strong>${quien}</strong> está cargado en el banco y espera tu autorización.`}</p>
     <p><a href="${appUrl()}/banco">Ir a la cola bancaria →</a></p>`,
  })
}
```

Reescribir `notifySubmitterOfDecision` y `notifySubmitterOfReimbursement` para que usen `avisar` (mismos textos que hoy):

```typescript
export async function notifySubmitterOfDecision(reportId: string, action: 'approved' | 'rejected' | 'partially_approved') {
  const { reporte } = await contextoRendicion(reportId)
  const asuntos = {
    approved:           `Rendición aprobada — ${reporte.title}`,
    rejected:           `Rendición rechazada — ${reporte.title}`,
    partially_approved: `Rendición aprobada parcialmente — ${reporte.title}`,
  }
  const cuerpos = {
    approved:           'Tu rendición fue aprobada. En breve se procesará el reembolso.',
    rejected:           'Tu rendición fue rechazada. Revisá los motivos y corrígela si corresponde.',
    partially_approved: 'Tu rendición fue aprobada parcialmente. Algunos ítems fueron rechazados.',
  }
  await avisar({
    orgId:    reporte.org_id,
    userIds:  [reporte.submitter_id],
    tipo:     action === 'rejected' ? 'rejection' : 'approval',
    reportId,
    asunto:   asuntos[action],
    html:     `<p>${cuerpos[action]}</p>
     <p><a href="${appUrl()}/expenses/${reportId}">Ver detalle →</a></p>`,
  })
}

export async function notifySubmitterOfReimbursement(reportId: string) {
  const { reporte } = await contextoRendicion(reportId)
  await avisar({
    orgId:    reporte.org_id,
    userIds:  [reporte.submitter_id],
    tipo:     'reimbursement',
    reportId,
    asunto:   `Reembolso procesado — ${reporte.title}`,
    html:     `<p>Tu reembolso fue autorizado y procesado. El dinero debería aparecer en tu cuenta bancaria en breve.</p>
     <p><a href="${appUrl()}/expenses/${reportId}">Ver rendición →</a></p>`,
  })
}

// El admin configura, no aprueba (D1): cuando alguien no puede enviar porque no
// tiene aprobador, al admin le llega el aviso para asignarlo.
export async function notifyAdminsMissingApprover(
  orgId: string, empleadoNombre: string, que: 'una rendición' | 'un fondo' | 'una liquidación',
) {
  const admin = createAdminClient()
  const { data: admins } = await admin
    .from('users').select('id').eq('org_id', orgId).eq('role', 'admin').eq('is_active', true)
  await avisar({
    orgId,
    userIds: (admins ?? []).map(a => a.id),
    tipo:    'config_missing',
    asunto:  `${empleadoNombre} no tiene aprobador asignado`,
    html:    `<p>Se intentó enviar ${que} de <strong>${empleadoNombre}</strong>, pero no tiene aprobador de nivel 1. Asígnale uno en Empleados.</p>
     <p><a href="${appUrl()}/admin/employees">Ir a Empleados →</a></p>`,
  })
}

// ── Fondos ────────────────────────────────────────────────────────────────────

export async function notifyFundStep(fundId: string, paso: Paso, actorId: string) {
  const { fondo, personas, doc } = await contextoFondo(fundId)
  const quien = nombreDe(personas, fondo.employee_id)
  const liq   = doc.tipo === 'liquidacion'
  const textos: Record<Paso, { tipo: TipoAviso; asunto: string; cuerpo: string }> = {
    decidir_l1: {
      tipo:   'submission',
      asunto: liq ? `Revisar liquidación de ${quien}: ${fondo.name}` : `Aprobar fondo de ${quien}: ${fondo.name}`,
      cuerpo: liq
        ? `<strong>${quien}</strong> envió la liquidación del fondo y requiere tu revisión.`
        : `El fondo de <strong>${quien}</strong> requiere tu aprobación.`,
    },
    decidir_l2: {
      tipo:   'submission',
      asunto: liq ? `Revisión N2 — liquidación de ${quien}: ${fondo.name}` : `Revisión N2 — fondo de ${quien}: ${fondo.name}`,
      cuerpo: `Fue aprobado en nivel 1 y requiere tu revisión final.`,
    },
    cargar_pago: {
      tipo:   'bank_load',
      asunto: `Cargar fondo — ${quien}: ${fondo.name}`,
      cuerpo: `El fondo de <strong>${quien}</strong> fue aprobado: falta cargar la transferencia en el banco.`,
    },
    autorizar_pago: {
      tipo:   'bank_auth',
      asunto: `Autorizar transferencia — fondo de ${quien}: ${fondo.name}`,
      cuerpo: `La transferencia del fondo de <strong>${quien}</strong> está cargada y espera tu autorización.`,
    },
  }
  const t = textos[paso]
  await avisar({
    orgId:   fondo.org_id,
    userIds: destinatarios(paso, doc, personas, [actorId]),
    tipo:    t.tipo,
    fundId,
    asunto:  t.asunto,
    html:    `<p>${t.cuerpo}</p>
     <p><a href="${appUrl()}/petty-cash/${fundId}">Ver fondo →</a></p>`,
  })
}

// Resultados que solo informan: al EFF que creó el fondo y al beneficiario.
export async function notifyFundOutcome(fundId: string, resultado: 'rejected' | 'funds_sent' | 'settled', actorId: string) {
  const { fondo } = await contextoFondo(fundId)
  const textos = {
    rejected:   { tipo: 'rejection' as const,  asunto: `Fondo rechazado — ${fondo.name}`,   cuerpo: 'El fondo fue rechazado. Revisa el motivo en la app.' },
    funds_sent: { tipo: 'funds_sent' as const, asunto: `Fondos enviados — ${fondo.name}`,   cuerpo: 'La transferencia fue autorizada: los fondos ya están disponibles.' },
    settled:    { tipo: 'approval' as const,   asunto: `Liquidación aprobada — ${fondo.name}`, cuerpo: 'La liquidación del fondo fue aprobada.' },
  }
  const t = textos[resultado]
  await avisar({
    orgId:   fondo.org_id,
    userIds: destinatariosInformativos(fondo.manager_id, fondo.employee_id, [actorId]),
    tipo:    t.tipo,
    fundId,
    asunto:  t.asunto,
    html:    `<p>${t.cuerpo}</p>
     <p><a href="${appUrl()}/petty-cash/${fundId}">Ver fondo →</a></p>`,
  })
}
```

- [ ] **Step 3: Update the callers so the build compiles**

Buscar todos los usos de los nombres borrados:

Run: `git grep -n -E "notifyApproversOfSubmission|notifyL2ApproverOfPromotion|notifyBankLoadersOfApproval|notifyBankAuthorizersOfLoad" -- src`

Reemplazar cada uno (las tareas 5 y 6 reescriben estas funciones enteras; acá solo se mantiene el build):

| Antes | Después |
|---|---|
| `notifyApproversOfSubmission(reportId)` (expenses.ts ~259) | `notifyReportApprovers(reportId, 'decidir_l1', user.id)` |
| `notifyL2ApproverOfPromotion(reportId)` (approvals.ts ~273, ~528) | `notifyReportApprovers(reportId, 'decidir_l2', user.id)` |
| `notifyBankLoadersOfApproval(reportId)` (approvals.ts ~280, ~531) | `notifyReportBankStep(reportId, 'cargar_pago', user.id)` |
| `notifyBankAuthorizersOfLoad(reportId)` (approvals.ts ~711) | `notifyReportBankStep(reportId, 'autorizar_pago', userId)` |

Y actualizar los `import` de `@/actions/notifications` en ambos archivos.

- [ ] **Step 4: Typecheck, lint, tests**

Run: `npx tsc --noEmit` → sin errores.
Run: `npm run lint` → sin errores nuevos.
Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/contexto-permisos.ts src/actions/notifications.ts src/actions/expenses.ts src/actions/approvals.ts
git commit -m @'
feat(avisos): el correo le llega a quien le toca actuar, y a nadie más

Contexto del servidor para las reglas y avisos calculados con
destinatarios(): la misma función que decide quién puede actuar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 5: Rendiciones — envío y decisiones

**Files:**
- Modify: `src/actions/expenses.ts` (`submitExpenseReport`, ~231–263)
- Modify: `src/actions/approvals.ts` (`getPendingApprovals` ~29–100, `getReportForApproval` ~102–148, `submitApprovalDecision` ~150–298, `bulkApproveItems` ~438–538)
- Modify: `src/app/(app)/approvals/[id]/client.tsx` (~51–58, ~156–173, ~206, ~551–555)

**Interfaces:**
- Consumes: `contextoRendicion`, `exigirPaso`, `permisoEn`, `cargarPersonas` (Tarea 4); `puedeEnviar`, `puedeActuar`, `pasoSegunEstado`, `suplenteVigente`, `type Paso`, `type Documento` (Tarea 1); `estadoTrasDecisionReporte`, `type ResultadoDecision` (Tarea 2); `notifyReportApprovers`, `notifyReportBankStep`, `notifySubmitterOfDecision`, `notifyAdminsMissingApprover` (Tarea 4).
- Produces: `getReportForApproval` devuelve además `permiso: { paso: Paso | null; ok: boolean; motivo: string | null; esperandoA: string[] }`.

- [ ] **Step 1: Rewrite `submitExpenseReport` in `src/actions/expenses.ts`**

Imports nuevos: `import { contextoRendicion } from '@/lib/contexto-permisos'`, `import { puedeEnviar } from '@/lib/permisos'`, y `notifyReportApprovers`, `notifyAdminsMissingApprover` desde `@/actions/notifications`.

```typescript
export async function submitExpenseReport(reportId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { count } = await supabase
    .from('expense_items')
    .select('*', { count: 'exact', head: true })
    .eq('report_id', reportId)
    .is('deleted_at', null)

  if (!count || count === 0) {
    throw new Error('La rendición debe tener al menos un ítem')
  }

  const ctx = await contextoRendicion(reportId)
  if (ctx.reporte.submitter_id !== user.id) throw new Error('Solo quien rinde puede enviar su rendición')
  if (ctx.reporte.status !== 'draft') throw new Error('Esta rendición ya fue enviada')

  const yo = ctx.personas.find(p => p.id === user.id)
  if (!yo) throw new Error('Rendición no encontrada')

  const envio = puedeEnviar('rendicion', yo, ctx.doc.cadena)
  if (!envio.ok) {
    if (!ctx.doc.cadena.l1) {
      notifyAdminsMissingApprover(ctx.reporte.org_id, yo.nombre, 'una rendición').catch(() => {})
    }
    throw new Error(envio.motivo)
  }

  const { data: enviada, error } = await ctx.admin
    .from('expense_reports')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', reportId)
    .eq('status', 'draft')
    .select('id')
  if (error || !enviada?.length) throw new Error('No se pudo enviar la rendición. Intenta de nuevo')

  notifyReportApprovers(reportId, 'decidir_l1', user.id).catch(() => {})

  revalidatePath(`/expenses/${reportId}`)
  revalidatePath('/')
}
```

- [ ] **Step 2: Rewrite `getPendingApprovals` in `src/actions/approvals.ts`**

Imports nuevos en `approvals.ts`: `import { contextoRendicion, exigirPaso, permisoEn, cargarPersonas, type ContextoRendicion } from '@/lib/contexto-permisos'`, `import { puedeActuar, pasoSegunEstado, suplenteVigente, type Paso, type Documento } from '@/lib/permisos'`, `import { estadoTrasDecisionReporte, type ResultadoDecision } from '@/lib/flujo'`, y `notifyReportApprovers`, `notifyReportBankStep` desde `@/actions/notifications`.

```typescript
export async function getPendingApprovals() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data: yoRow } = await admin.from('users').select('org_id').eq('id', user.id).single()
  if (!yoRow) return []

  const [personas, { data }] = await Promise.all([
    cargarPersonas(admin, yoRow.org_id),
    admin
      .from('expense_reports')
      .select(`
        id, title, status, total_amount, submitted_at, currency, submitter_id,
        submitter:users!submitter_id (
          approver_l1_id, approver_l2_id, full_name,
          approver_l1_backup_id, backup_active_from, backup_active_until
        )
      `)
      .eq('org_id', yoRow.org_id)
      .in('status', ['submitted', 'pending_l2'])
      .is('deleted_at', null)
      .order('submitted_at', { ascending: true }),
  ])

  const yo = personas.find(p => p.id === user.id)
  if (!yo) return []
  const hoy = new Date().toISOString().slice(0, 10)

  type SubType = {
    approver_l1_id:        string | null
    approver_l2_id:        string | null
    approver_l1_backup_id: string | null
    backup_active_from:    string | null
    backup_active_until:   string | null
    full_name:             string
  }

  // Solo lo que esta persona puede decidir, con la misma regla que la acción.
  // Ya no hay «sin aprobador → visible a todos»: sin N1 no se puede enviar.
  return (data ?? []).flatMap(r => {
    const sub  = r.submitter as SubType | null
    const paso = pasoSegunEstado('rendicion', r.status)
    if (!sub || !paso) return []
    const doc: Documento = {
      tipo:           'rendicion',
      beneficiarioId: r.submitter_id,
      cadena: {
        l1:                sub.approver_l1_id,
        l2:                sub.approver_l2_id,
        suplenteL1Vigente: suplenteVigente(sub.approver_l1_backup_id, sub.backup_active_from, sub.backup_active_until, hoy),
      },
      historial: [],
    }
    if (!puedeActuar(yo, paso, doc, personas).ok) return []
    return [{
      id:             r.id,
      title:          r.title,
      status:         r.status,
      total_amount:   r.total_amount,
      submitted_at:   r.submitted_at,
      currency:       r.currency,
      submitter_name: sub.full_name,
      approval_level: r.status === 'pending_l2' ? 2 : 1,
    }]
  })
}
```

- [ ] **Step 3: Add `permiso` to `getReportForApproval`**

Justo antes del `return { ...report, … }` final (~141), agregar:

```typescript
  const ctx     = await contextoRendicion(reportId)
  const permiso = permisoEn(ctx, report.status, user.id)
```

y agregar `permiso,` al objeto devuelto.

- [ ] **Step 4: Rewrite `submitApprovalDecision` and add `cerrarDecision`**

Reemplazar `submitApprovalDecision` entero por:

```typescript
export async function submitApprovalDecision(
  reportId: string,
  decisions: ApprovalDecision[],
  notes?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ctx = await contextoRendicion(reportId)
  const { paso } = exigirPaso(ctx, ctx.reporte.status, user.id, ['decidir_l1', 'decidir_l2'], 'Esta rendición ya fue decidida')

  // Solo ítems de esta rendición: un id ajeno no se toca
  const ids = decisions.map(d => d.itemId)
  const { data: propios } = await ctx.admin.from('expense_items').select('id').eq('report_id', reportId).in('id', ids)
  if ((propios ?? []).length !== new Set(ids).size) throw new Error('Hay ítems que no pertenecen a esta rendición')

  for (const d of decisions) {
    const { error } = await ctx.admin
      .from('expense_items')
      .update({
        status:           d.action === 'approve' ? 'approved' : 'rejected',
        rejection_reason: d.action === 'reject' ? (d.reason ?? null) : null,
      })
      .eq('id', d.itemId)
    if (error) throw new Error(error.message)
  }

  await cerrarDecision(ctx, user.id, paso, {
    itemsAprobados:  decisions.filter(d => d.action === 'approve').map(d => d.itemId),
    itemsRechazados: decisions.filter(d => d.action === 'reject').map(d => d.itemId),
    notas:           notes?.trim() || null,
  })
}

// Calcula el estado que sigue, lo escribe, deja la entrada en el historial y
// avisa. La usan la decisión ítem por ítem y la aprobación masiva.
async function cerrarDecision(
  ctx: ContextoRendicion,
  actorId: string,
  paso: Paso,
  d: { itemsAprobados: string[]; itemsRechazados: string[]; notas: string | null },
) {
  const { admin, reporte } = ctx
  const nivel = paso === 'decidir_l2' ? 2 : 1

  const { data: items } = await admin
    .from('expense_items')
    .select('status, amount_clp, item_type')
    .eq('report_id', reporte.id)
    .is('deleted_at', null)
  const lista     = items ?? []
  const resultado = computeReportStatus(lista) as ResultadoDecision
  const monto     = computeApprovedAmount(lista)
  const nuevo     = estadoTrasDecisionReporte({ nivel, tieneL2: !!ctx.doc.cadena.l2, resultado, montoAPagar: monto })

  if (nuevo === 'pending_l2') {
    // El N2 revisa desde cero lo que el N1 aprobó; lo que el N1 rechazó sigue rechazado
    const { error } = await admin
      .from('expense_items')
      .update({ status: 'pending', rejection_reason: null })
      .eq('report_id', reporte.id)
      .eq('status', 'approved')
    if (error) throw new Error(error.message)
  }

  const decidida = nuevo !== 'pending_l2'
  const { data: actualizada, error: updateError } = await admin
    .from('expense_reports')
    .update({
      status:          nuevo,
      approved_amount: monto,
      approved_at:     decidida ? new Date().toISOString() : null,
    })
    .eq('id', reporte.id)
    .eq('status', reporte.status)
    .select('id')
  if (updateError || !actualizada?.length) {
    console.error('[approvals] no se pudo cambiar el estado de', reporte.id, updateError)
    throw new Error('No se pudo registrar la decisión. Avisa al administrador.')
  }

  const { error: logError } = await admin.from('expense_report_approvals').insert({
    report_id:      reporte.id,
    approver_id:    actorId,
    level:          nivel,
    action:         resultado,
    items_approved: d.itemsAprobados.length ? d.itemsAprobados : null,
    items_rejected: d.itemsRechazados.length ? d.itemsRechazados : null,
    notes:          d.notas,
  })
  if (logError) throw new Error(logError.message)

  if (nuevo === 'pending_l2') {
    notifyReportApprovers(reporte.id, 'decidir_l2', actorId).catch(() => {})
  } else {
    notifySubmitterOfDecision(reporte.id, resultado).catch(() => {})
    if (nuevo === 'pending_bank_load') notifyReportBankStep(reporte.id, 'cargar_pago', actorId).catch(() => {})
  }

  revalidatePath(`/approvals/${reporte.id}`)
  revalidatePath('/approvals')
  revalidatePath('/banco')
  revalidatePath('/')

  if (decidida) {
    dispatchWebhooks(reporte.org_id, `report.${resultado}` as WebhookEvent, {
      report_id:   reporte.id,
      status:      nuevo,
      approved_by: ctx.personas.find(p => p.id === actorId)?.nombre ?? null,
      approved_at: new Date().toISOString(),
    }).catch(console.error)
  }
}
```

- [ ] **Step 5: Rewrite `bulkApproveItems`**

```typescript
export async function bulkApproveItems(reportId: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ctx = await contextoRendicion(reportId)
  const { paso } = exigirPaso(ctx, ctx.reporte.status, user.id, ['decidir_l1', 'decidir_l2'], 'Esta rendición ya fue decidida')
  const nota = `Aprobación masiva de ${itemIds.length} ítem(s) rutinario(s) vía análisis IA`

  const { error } = await ctx.admin
    .from('expense_items')
    .update({ status: 'approved' })
    .eq('report_id', reportId)
    .in('id', itemIds)
  if (error) throw new Error(error.message)

  const { data: items } = await ctx.admin
    .from('expense_items')
    .select('status, amount_clp, item_type')
    .eq('report_id', reportId)
    .is('deleted_at', null)
  const lista = items ?? []

  if (lista.some(i => i.status === 'pending')) {
    // Quedan ítems por decidir: solo se actualiza el monto parcial
    const { error: e1 } = await ctx.admin
      .from('expense_reports').update({ approved_amount: computeApprovedAmount(lista) }).eq('id', reportId)
    if (e1) throw new Error(e1.message)
    const { error: e2 } = await ctx.admin.from('expense_report_approvals').insert({
      report_id: reportId, approver_id: user.id, level: paso === 'decidir_l2' ? 2 : 1,
      action: 'approved', items_approved: itemIds, notes: nota,
    })
    if (e2) throw new Error(e2.message)
    revalidatePath(`/approvals/${reportId}`)
    return
  }

  await cerrarDecision(ctx, user.id, paso, { itemsAprobados: itemIds, itemsRechazados: [], notas: nota })
}
```

- [ ] **Step 6: Update the approval screen `src/app/(app)/approvals/[id]/client.tsx`**

a) Las decisiones iniciales respetan lo que el N1 ya rechazó (~51–58):

```typescript
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() => {
    if (!initialReport?.expense_items) return {}
    const initial: Record<string, Decision> = {}
    for (const item of (initialReport.expense_items ?? []) as ItemWithRelations[]) {
      // En N2, lo que el N1 rechazó llega rechazado y con su motivo
      initial[item.id] = item.status === 'rejected'
        ? { action: 'reject', reason: item.rejection_reason ?? '' }
        : { action: null, reason: '' }
    }
    return initial
  })
```

b) «Aprobar todos» no pisa los rechazos del N1 (~165):

```typescript
      const payload = items.map(item => item.status === 'rejected'
        ? { itemId: item.id, action: 'reject' as const, reason: item.rejection_reason ?? undefined }
        : { itemId: item.id, action: 'approve' as const, reason: undefined })
```

c) La acción depende del permiso, no solo del estado (~206):

```typescript
  const enEspera     = report.status === 'submitted' || report.status === 'pending_l2'
  const isActionable = enEspera && report.permiso.ok
```

d) Reemplazar el bloque final `{!isActionable && (…)}` (~551–555) por:

```tsx
      {enEspera && !report.permiso.ok && (
        <div className="bg-ink-50 rounded-card p-4 text-center card-label text-ink-500">
          {report.permiso.motivo ?? 'Esta rendición espera la decisión de otra persona.'}
        </div>
      )}

      {!enEspera && (
        <div className="bg-ink-50 rounded-card p-4 text-center card-label text-ink-500">
          Esta rendición ya fue procesada (estado: <strong>{report.status}</strong>).
        </div>
      )}
```

- [ ] **Step 7: Typecheck, lint, tests**

Run: `npx tsc --noEmit` → sin errores.
Run: `npm run lint` → sin errores nuevos.
Run: `npm test` → PASS.

- [ ] **Step 8: Verify in the preview**

Con `preview_start` (servidor de `.claude/launch.json`), iniciar sesión como un aprobador asignado y abrir `/approvals`: solo aparecen las rendiciones de su cadena y nivel. Abrir por link directo una rendición de otra cadena: aparece el motivo, sin botones. `read_console_messages` sin errores.

- [ ] **Step 9: Commit**

```powershell
git add src/actions/expenses.ts src/actions/approvals.ts "src/app/(app)/approvals/[id]/client.tsx"
git commit -m @'
feat(rendiciones): decide solo el aprobador asignado a cada nivel

Sin N1 no se envía (y el admin recibe el aviso). La decisión final con monto
pasa directo a la carga bancaria. El N2 tiene la última palabra también en las
aprobaciones parciales del N1.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 6: Rendiciones — banco

**Files:**
- Modify: `src/actions/approvals.ts` (borrar `requireAdminOrBankPerm`, `requestReportBankLoad`, `exigirPagoOperable` y el import de `puedeOperarPago`; reescribir `confirmReportBankLoad`, `authorizeReportBank`, `markReimbursed`, `revertReimbursement`)
- Modify: `src/actions/admin.ts` (`BankQueueResult`, `getBankQueue` ~2540–2640)
- Modify: `src/app/(app)/banco/page.tsx`, `src/app/(app)/banco/client.tsx`
- Modify: `src/app/(app)/admin/reports/client.tsx` (~6, ~270–290, ~774 y el botón «Iniciar proceso bancario»)
- Modify: `src/components/layout/Sidebar.tsx:50` (y `MobileNav.tsx` si tiene `/banco` con rol admin)

**Interfaces:**
- Consumes: `contextoRendicion`, `exigirPaso`, `cargarPersonas` (Tarea 4); `puedeActuar`, `pasoSegunEstado`, `type Documento` (Tarea 1); `notifyReportBankStep`, `notifySubmitterOfReimbursement` (Tarea 4).
- Produces: `BankQueueResult = { canLoad: boolean; canAuth: boolean; reports: BankQueueReport[] }` (sin `isAdmin`).

- [ ] **Step 1: Rewrite the bank actions in `src/actions/approvals.ts`**

Borrar `requireAdminOrBankPerm`, `requestReportBankLoad` y `exigirPagoOperable`, y quitar `import { puedeOperarPago } from '@/lib/bank-helpers'`. Reemplazar `confirmReportBankLoad` y `authorizeReportBank`:

```typescript
/** Carga: quien tiene «carga banco» confirma que cargó la transferencia */
export async function confirmReportBankLoad(reportId: string, data: {
  paymentReference: string
  transferredAt:    string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ctx = await contextoRendicion(reportId)
  exigirPaso(ctx, ctx.reporte.status, user.id, ['cargar_pago'], 'Este pago ya no está esperando la carga')

  const { data: movida, error } = await ctx.admin
    .from('expense_reports')
    .update({ status: 'pending_bank_auth' })
    .eq('id', reportId)
    .eq('status', 'pending_bank_load')
    .select('id')
  if (error || !movida?.length) throw new Error('No se pudo registrar la carga. Intenta de nuevo')

  const { error: logError } = await ctx.admin.from('expense_report_approvals').insert({
    report_id:   reportId,
    approver_id: user.id,
    level:       1,
    action:      'bank_load_confirmed',
    notes:       `Ref: ${data.paymentReference || 'Sin referencia'} · ${data.transferredAt}`,
  })
  if (logError) throw new Error(logError.message)

  notifyReportBankStep(reportId, 'autorizar_pago', user.id).catch(() => {})

  revalidatePath('/admin/reports')
  revalidatePath('/banco')
  revalidatePath('/')
}

/** Autorización: la plata sale de la empresa. Nunca el beneficiario ni quien cargó */
export async function authorizeReportBank(reportId: string, paymentReference: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ctx = await contextoRendicion(reportId)
  exigirPaso(ctx, ctx.reporte.status, user.id, ['autorizar_pago'], 'Este pago ya no está esperando la autorización')

  const { data: pagada, error } = await ctx.admin
    .from('expense_reports')
    .update({
      status:            'reimbursed',
      reimbursed_at:     new Date().toISOString(),
      reimbursed_by:     user.id,
      payment_reference: paymentReference.trim() || null,
    })
    .eq('id', reportId)
    .eq('status', 'pending_bank_auth')
    .select('id')
  if (error || !pagada?.length) throw new Error('No se pudo registrar la autorización. Intenta de nuevo')

  const { error: logError } = await ctx.admin.from('expense_report_approvals').insert({
    report_id:   reportId,
    approver_id: user.id,
    level:       1,
    action:      'bank_authorized',
    notes:       paymentReference.trim() || null,
  })
  if (logError) throw new Error(logError.message)

  notifySubmitterOfReimbursement(reportId).catch(() => {})

  revalidatePath('/admin/reports')
  revalidatePath('/banco')
  revalidatePath('/')
}
```

- [ ] **Step 2: Restrict `markReimbursed` to historical loads and fix `revertReimbursement`**

En `markReimbursed`, después del chequeo de admin, reemplazar el `update` por:

```typescript
  // «Autorizado» significa que la plata salió de la empresa: solo lo marca quien
  // la liberó en el banco. A mano, solo cargas históricas (pagos del pasado). D7.
  const admin = createAdminClient()
  const { data: rep } = await admin.from('expense_reports').select('is_historical_import').eq('id', reportId).single()
  if (!rep?.is_historical_import) {
    throw new Error('Solo las cargas históricas se marcan como reembolsadas a mano: las demás las cierra quien autoriza el pago en el banco')
  }

  const { data: marcada, error } = await admin
    .from('expense_reports')
    .update({
      status:             'reimbursed',
      reimbursed_at:      new Date().toISOString(),
      reimbursed_by:      user.id,
      payment_reference:  paymentReference.trim() || null,
      reimbursed_amount:  reimbursedAmount ?? null,
    })
    .eq('id', reportId)
    .in('status', ['approved', 'partially_approved'])
    .select('id')
  if (error || !marcada?.length) throw new Error('No se pudo marcar el reembolso')
```

En `revertReimbursement`, reemplazar el `update` por:

```typescript
  // Una histórica vuelve a «aprobada»; una normal vuelve a esperar la carga,
  // porque «aprobada» ya no lleva a ningún lado.
  const admin = createAdminClient()
  const { data: rep } = await admin.from('expense_reports').select('is_historical_import').eq('id', reportId).single()
  const volverA = rep?.is_historical_import ? 'approved' : 'pending_bank_load'

  const { data: revertida, error } = await admin
    .from('expense_reports')
    .update({
      status:            volverA,
      reimbursed_at:     null,
      reimbursed_by:     null,
      payment_reference: null,
      reimbursed_amount: null,
      approved_amount:   netApproved,
    })
    .eq('id', reportId)
    .eq('status', 'reimbursed')
    .select('id')
  if (error || !revertida?.length) throw new Error('No se pudo revertir el reembolso')

  if (volverA === 'pending_bank_load') notifyReportBankStep(reportId, 'cargar_pago', user.id).catch(() => {})
```

- [ ] **Step 3: Rewrite `getBankQueue` in `src/actions/admin.ts`**

Imports nuevos en `admin.ts`: `import { cargarPersonas } from '@/lib/contexto-permisos'` y `import { puedeActuar, pasoSegunEstado, type Documento } from '@/lib/permisos'`; quitar `puedeOperarPago` si estaba importado.

```typescript
export interface BankQueueResult {
  canLoad: boolean
  canAuth: boolean
  reports: BankQueueReport[]
}

export async function getBankQueue(): Promise<BankQueueResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: perfil } = await admin
    .from('users')
    .select('org_id, can_load_bank_transfer, can_authorize_bank_transfer')
    .eq('id', user.id)
    .single()
  if (!perfil) redirect('/login')

  // Ser admin no da acceso al banco (D1): solo los permisos bancarios
  const canLoad = !!perfil.can_load_bank_transfer
  const canAuth = !!perfil.can_authorize_bank_transfer
  const vacia: BankQueueResult = { canLoad, canAuth, reports: [] }
  if (!canLoad && !canAuth) return vacia

  const estados: string[] = []
  if (canLoad) estados.push('pending_bank_load')
  if (canAuth) estados.push('pending_bank_auth')

  const { data } = await admin
    .from('expense_reports')
    .select(`
      id, title, status, total_amount, approved_amount, currency,
      submitted_at, approved_at, submitter_id,
      submitter:users!submitter_id (full_name, department)
    `)
    .eq('org_id', perfil.org_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .in('status', estados as any)
    .is('deleted_at', null)
    .order('approved_at', { ascending: true, nullsFirst: false })

  const reportes = data ?? []
  if (!reportes.length) return vacia

  const [personas, { data: log }] = await Promise.all([
    cargarPersonas(admin, perfil.org_id),
    admin.from('expense_report_approvals')
      .select('report_id, approver_id, action, level')
      .in('report_id', reportes.map(r => r.id))
      .order('created_at', { ascending: true }),
  ])
  const yo = personas.find(p => p.id === user.id)
  if (!yo) return vacia

  type Sub = { full_name: string; department: string | null }

  // Cada fila, con el mismo cálculo que la acción: si no puedes dar el paso
  // (es tuya, o la cargaste tú), no aparece. Los pasos del banco no usan la cadena.
  const visibles = reportes.flatMap(r => {
    const paso = pasoSegunEstado('rendicion', r.status)
    if (!paso) return []
    const doc: Documento = {
      tipo:           'rendicion',
      beneficiarioId: r.submitter_id,
      cadena:         { l1: null, l2: null, suplenteL1Vigente: null },
      historial:      (log ?? [])
        .filter(a => a.report_id === r.id)
        .map(a => ({ actorId: a.approver_id, accion: a.action, nivel: a.level })),
    }
    if (!puedeActuar(yo, paso, doc, personas).ok) return []
    const sub = r.submitter as Sub | null
    return [{
      id:              r.id as string,
      title:           r.title as string,
      status:          r.status as string,
      total_amount:    r.total_amount as number,
      approved_amount: r.approved_amount as number,
      currency:        r.currency as string,
      submitted_at:    r.submitted_at as string | null,
      approved_at:     r.approved_at as string | null,
      submitter_name:  sub?.full_name ?? 'Desconocido',
      department:      sub?.department ?? null,
    }]
  })

  return { canLoad, canAuth, reports: visibles }
}
```

Borrar el `type BankStatus` si queda sin uso.

- [ ] **Step 4: Update `/banco`**

`src/app/(app)/banco/page.tsx`:

```typescript
  if (!queue.canLoad && !queue.canAuth) {
    redirect('/')
  }
```

`src/app/(app)/banco/client.tsx`:
- Quitar `requestReportBankLoad` del import y la función `handleSendToBank`.
- Quitar `isAdmin` del tipo de props (~24).
- Borrar `const ready = …` (~68).
- `type Etapa = 'carga' | 'autorizar'`.
- Reemplazar `primeraConTrabajo` por:

```typescript
  const primeraConTrabajo: Etapa =
    queue.canLoad && loading.length  ? 'carga'     :
    queue.canAuth && authoriz.length ? 'autorizar' :
    queue.canLoad ? 'carga' : 'autorizar'
```

- Borrar el KPI `{queue.isAdmin && (…)}` (~179) y la sección `{etapa === 'enviar' && queue.isAdmin && ready.length > 0 && (…)}` (~226).
- Si `visibles` / `setVisibles` quedan sin uso tras borrar la sección «enviar», borrarlos junto con su comentario.
- Actualizar el comentario de «Una etapa abierta por vez»: ya no hay vista del admin.

- [ ] **Step 5: Update `/admin/reports` and the menu**

`src/app/(app)/admin/reports/client.tsx`:
- Quitar `requestReportBankLoad` del import (~6), la función `handleBankInit` (~270–290), su estado (`bankInitId` y relacionados) y el botón «Iniciar proceso bancario» que la llama (buscar `handleBankInit(`).
- ~774: `const canReimb = (r.status === 'approved' || r.status === 'partially_approved') && r.is_historical_import`

`src/components/layout/Sidebar.tsx:50`: `roles: [] as const` en la entrada `/banco`. La línea 84 ya la muestra a quien tiene permiso bancario.

Run: `git grep -n "/banco" -- src/components/layout/MobileNav.tsx`. Si la entrada tiene `roles` con `'admin'`, cambiarla igual.

- [ ] **Step 6: Typecheck, lint, tests**

Run: `npx tsc --noEmit` → sin errores.
Run: `npm run lint` → sin errores nuevos.
Run: `npm test` → PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/actions/approvals.ts src/actions/admin.ts "src/app/(app)/banco/page.tsx" "src/app/(app)/banco/client.tsx" "src/app/(app)/admin/reports/client.tsx" src/components/layout/Sidebar.tsx src/components/layout/MobileNav.tsx
git commit -m @'
feat(banco): cargar y autorizar respetan la segregación; sin paso «iniciar»

Nadie autoriza lo suyo ni lo que cargó; nadie carga si después no queda quién
autorice. El admin deja de tener acceso por rol. «Marcar reembolsado» queda
solo para cargas históricas.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 7: Fondos — aprobación, liquidación y banco

**Files:**
- Modify: `src/actions/petty-cash.ts` (`submitFundForApproval`, `approveFund`, `rejectFund`, `submitLiquidation`, `approveLiquidation`, `confirmBankLoad`, `authorizeBank`, `listPettyCashFunds`, `getFundDetail`; borrar `recordFundDisbursement`, `elevateLiquidation`, `requestBankLoad`, `exigirFondoOperable` y el import de `puedeOperarPago`)
- Modify: `src/app/(app)/petty-cash/[id]/client.tsx`

**Interfaces:**
- Consumes: `contextoFondo`, `exigirPaso`, `permisoEn`, `type ContextoFondo` (Tarea 4); `puedeEnviar`, `tipoDeFondo` (Tarea 1); `estadoTrasAprobacionFondo`, `estadoTrasLiquidacion` (Tarea 2); `notifyFundStep`, `notifyFundOutcome`, `notifyAdminsMissingApprover` (Tarea 4).
- Produces: `getFundDetail` devuelve además `permiso: { paso: Paso | null; ok: boolean; motivo: string | null; esperandoA: string[] }`.

- [ ] **Step 1: Add the transition helpers to `src/actions/petty-cash.ts`**

Imports nuevos:

```typescript
import { contextoFondo, exigirPaso, permisoEn, type ContextoFondo } from '@/lib/contexto-permisos'
import { puedeEnviar } from '@/lib/permisos'
import { estadoTrasAprobacionFondo, estadoTrasLiquidacion } from '@/lib/flujo'
import { notifyFundStep, notifyFundOutcome, notifyAdminsMissingApprover } from '@/actions/notifications'
import type { Database } from '@/lib/supabase/types'
```

Quitar `import { puedeOperarPago } from '@/lib/bank-helpers'`. Debajo de `audit(...)`, agregar (sin `export`):

```typescript
type FundUpdate      = Database['public']['Tables']['petty_cash_funds']['Update']
type FundAuditAction = Database['public']['Tables']['petty_cash_approvals']['Insert']['action']

// Toda transición de estado de un fondo pasa por acá: escribe con la llave de
// servicio (desde la 033 la base rechaza cambios de estado desde una sesión) y
// confirma que la fila cambió de verdad.
async function moverFondo(ctx: ContextoFondo, desde: FundStatus, hacia: FundStatus, extra: FundUpdate = {}) {
  const { data, error } = await ctx.admin
    .from('petty_cash_funds')
    .update({ ...extra, status: hacia })
    .eq('id', ctx.fondo.id)
    .eq('status', desde)
    .select('id')
  if (error || !data?.length) throw new Error('El fondo cambió mientras lo mirabas. Recarga la página')
}

async function registrar(
  ctx: ContextoFondo, actorId: string, action: FundAuditAction,
  opts: { notes?: string | null; amount?: number | null; level?: 1 | 2 | null } = {},
) {
  const { error } = await ctx.admin.from('petty_cash_approvals').insert({
    fund_id: ctx.fondo.id, actor_id: actorId, action,
    notes: opts.notes ?? null, amount: opts.amount ?? null, level: opts.level ?? null,
  })
  if (error) throw new Error(error.message)
}

function revalidarFondo(fundId: string) {
  revalidatePath(`/petty-cash/${fundId}`)
  revalidatePath('/petty-cash')
}
```

- [ ] **Step 2: Rewrite submission and approval**

```typescript
export async function submitFundForApproval(fundId: string) {
  const { userId } = await getProfile()
  const ctx = await contextoFondo(fundId)
  if (ctx.fondo.manager_id !== userId) throw new Error('Solo quien creó el fondo puede enviarlo')
  if (ctx.fondo.status !== 'draft') throw new Error('Este fondo ya fue enviado')

  const yo = ctx.personas.find(p => p.id === userId)
  if (!yo) throw new Error('Fondo no encontrado')
  const envio = puedeEnviar('fondo', yo, ctx.doc.cadena)
  if (!envio.ok) {
    if (!ctx.doc.cadena.l1) {
      const beneficiario = ctx.personas.find(p => p.id === ctx.fondo.employee_id)?.nombre ?? 'Un empleado'
      notifyAdminsMissingApprover(ctx.fondo.org_id, beneficiario, 'un fondo').catch(() => {})
    }
    throw new Error(envio.motivo)
  }

  await moverFondo(ctx, 'draft', 'pending_approval')
  await registrar(ctx, userId, 'submitted_for_approval')
  notifyFundStep(fundId, 'decidir_l1', userId).catch(() => {})
  revalidarFondo(fundId)
}

export async function approveFund(fundId: string, approvedAmount: number, notes?: string) {
  const { userId } = await getProfile()
  if (!(approvedAmount > 0)) throw new Error('El monto aprobado debe ser mayor que cero')

  const ctx = await contextoFondo(fundId)
  const { paso } = exigirPaso(ctx, ctx.fondo.status, userId, ['decidir_l1', 'decidir_l2'], 'Este fondo ya fue decidido')
  const nivel = paso === 'decidir_l2' ? 2 : 1
  const hacia = estadoTrasAprobacionFondo({ nivel, tieneL2: !!ctx.doc.cadena.l2 })

  await moverFondo(ctx, ctx.fondo.status as FundStatus, hacia, { amount_approved: approvedAmount })
  await registrar(ctx, userId, 'approved', { notes: notes ?? null, amount: approvedAmount, level: nivel })
  notifyFundStep(fundId, hacia === 'pending_approval_l2' ? 'decidir_l2' : 'cargar_pago', userId).catch(() => {})
  revalidarFondo(fundId)
}

export async function rejectFund(fundId: string, notes: string) {
  const { userId } = await getProfile()
  if (!notes.trim()) throw new Error('Indica el motivo del rechazo')

  const ctx = await contextoFondo(fundId)
  const { paso } = exigirPaso(ctx, ctx.fondo.status, userId, ['decidir_l1', 'decidir_l2'], 'Este fondo ya fue decidido')

  await moverFondo(ctx, ctx.fondo.status as FundStatus, 'rejected')
  await registrar(ctx, userId, 'rejected', { notes, level: paso === 'decidir_l2' ? 2 : 1 })
  notifyFundOutcome(fundId, 'rejected', userId).catch(() => {})
  revalidarFondo(fundId)
}
```

- [ ] **Step 3: Rewrite the liquidation (and delete «elevar»)**

Borrar `elevateLiquidation`. Reemplazar `submitLiquidation` y `approveLiquidation`:

```typescript
export async function submitLiquidation(fundId: string) {
  const { userId } = await getProfile()
  const ctx = await contextoFondo(fundId)
  if (ctx.fondo.employee_id !== userId) throw new Error('Solo el empleado asignado puede enviar la liquidación')
  if (ctx.fondo.status !== 'funds_sent') throw new Error('Estado inválido')

  const yo = ctx.personas.find(p => p.id === userId)
  if (!yo) throw new Error('Fondo no encontrado')
  const envio = puedeEnviar('liquidacion', yo, ctx.doc.cadena)
  if (!envio.ok) {
    if (!ctx.doc.cadena.l1) notifyAdminsMissingApprover(ctx.fondo.org_id, yo.nombre, 'una liquidación').catch(() => {})
    throw new Error(envio.motivo)
  }

  // Directo al N1: el paso «elevar» del EFF se eliminó (D6)
  await moverFondo(ctx, 'funds_sent', 'pending_liquidation_approval')
  await registrar(ctx, userId, 'liquidation_submitted')
  notifyFundStep(fundId, 'decidir_l1', userId).catch(() => {})
  revalidarFondo(fundId)
}

export async function approveLiquidation(
  fundId: string,
  decisions: { itemId: string; action: 'approved' | 'rejected'; reason?: string }[],
  notes?: string,
) {
  const { userId } = await getProfile()
  const ctx = await contextoFondo(fundId)
  const { paso } = exigirPaso(ctx, ctx.fondo.status, userId, ['decidir_l1', 'decidir_l2'], 'Esta liquidación ya fue decidida')
  const nivel = paso === 'decidir_l2' ? 2 : 1

  const ids = decisions.map(d => d.itemId)
  const { data: propios } = await ctx.admin.from('petty_cash_items').select('id').eq('fund_id', fundId).in('id', ids)
  if ((propios ?? []).length !== new Set(ids).size) throw new Error('Hay gastos que no pertenecen a este fondo')

  for (const d of decisions) {
    const { error } = await ctx.admin
      .from('petty_cash_items')
      .update({ status: d.action, rejection_reason: d.action === 'rejected' ? (d.reason ?? null) : null })
      .eq('id', d.itemId)
    if (error) throw new Error(error.message)
  }

  const hacia = estadoTrasLiquidacion({ nivel, tieneL2: !!ctx.doc.cadena.l2 })
  if (hacia === 'pending_liquidation_l2') {
    // El N2 revisa lo que el N1 aprobó; lo rechazado sigue rechazado
    const { error } = await ctx.admin
      .from('petty_cash_items')
      .update({ status: 'pending' })
      .eq('fund_id', fundId)
      .eq('status', 'approved')
    if (error) throw new Error(error.message)
  }

  await moverFondo(ctx, ctx.fondo.status as FundStatus, hacia,
    hacia === 'settled' ? { settled_at: new Date().toISOString() } : {})
  await registrar(ctx, userId, 'liquidation_approved', { notes: notes ?? null, level: nivel })

  if (hacia === 'pending_liquidation_l2') notifyFundStep(fundId, 'decidir_l2', userId).catch(() => {})
  else notifyFundOutcome(fundId, 'settled', userId).catch(() => {})
  revalidarFondo(fundId)
}
```

Nota: `petty_cash_items.Update` no tiene `settled_at` ni lo necesita; `settled_at` va en el fondo (ya está en `petty_cash_funds.Update`).

- [ ] **Step 4: Rewrite the fund bank steps**

Borrar `requestBankLoad`, `exigirFondoOperable` y `recordFundDisbursement`. Reemplazar `confirmBankLoad` y `authorizeBank`:

```typescript
/** Carga: quien tiene «carga banco» confirma la transferencia del fondo */
export async function confirmBankLoad(fundId: string, data: {
  amount:         number
  reference?:     string
  transferred_at: string
  notes?:         string
}) {
  const { userId } = await getProfile()
  const ctx = await contextoFondo(fundId)
  exigirPaso(ctx, ctx.fondo.status, userId, ['cargar_pago'], 'Este fondo ya no está esperando la carga')

  await moverFondo(ctx, 'pending_bank_load', 'pending_bank_auth')

  const { error } = await ctx.admin.from('petty_cash_transfers').insert({
    fund_id:        fundId,
    type:           'disbursement',
    amount:         data.amount,
    reference:      data.reference ?? null,
    transferred_at: data.transferred_at,
    registered_by:  userId,
    notes:          data.notes ?? null,
  })
  if (error) throw new Error(error.message)

  await registrar(ctx, userId, 'bank_load_confirmed', { notes: data.reference ?? null, amount: data.amount })
  notifyFundStep(fundId, 'autorizar_pago', userId).catch(() => {})
  revalidarFondo(fundId)
}

/** Autorización: la plata sale. Nunca el beneficiario ni quien cargó */
export async function authorizeBank(fundId: string) {
  const { userId } = await getProfile()
  const ctx = await contextoFondo(fundId)
  exigirPaso(ctx, ctx.fondo.status, userId, ['autorizar_pago'], 'Este fondo ya no está esperando la autorización')

  await moverFondo(ctx, 'pending_bank_auth', 'funds_sent')
  await registrar(ctx, userId, 'bank_authorized')
  await registrar(ctx, userId, 'funds_sent')
  notifyFundOutcome(fundId, 'funds_sent', userId).catch(() => {})
  revalidarFondo(fundId)
}
```

- [ ] **Step 5: Visibility and the detail's permission**

En `listPettyCashFunds`, reemplazar el bloque `if (profile.role !== 'admin') { … } else { … }` por:

```typescript
  // Qué fondos ve cada uno lo decide la RLS (migración 032): los suyos, los que
  // creó, los de su cadena y los que esperan su paso en el banco. «Aprueba» ya
  // no deja ver todos los pendientes de la empresa.
  if (profile.role === 'admin') {
    query = query.eq('org_id', profile.org_id)
  }
```

En `getFundDetail`, antes del `return`, agregar:

```typescript
  const permiso = permisoEn(await contextoFondo(fundId), fund.status, userId)
```

y agregar `permiso,` al objeto devuelto.

- [ ] **Step 6: Update the fund screen `src/app/(app)/petty-cash/[id]/client.tsx`**

a) Imports: quitar `requestBankLoad` y `elevateLiquidation`; agregar `import { tipoDeFondo } from '@/lib/permisos'` y `confirmar` desde el mismo módulo que usa el resto de la app (buscar con `git grep -n "export async function confirmar\|export function confirmar" -- src`).

b) Después de `const { fund, … } = detail` (~115), agregar:

```typescript
  const { permiso } = detail
  const decidiendo            = permiso.ok && (permiso.paso === 'decidir_l1' || permiso.paso === 'decidir_l2')
  const decidiendoFondo       = decidiendo && tipoDeFondo(fund.status) === 'fondo'
  const decidiendoLiquidacion = decidiendo && tipoDeFondo(fund.status) === 'liquidacion'
```

y borrar `const isApprover = …` (~120).

c) Condiciones de los bloques:

| Bloque | Antes | Después |
|---|---|---|
| Enviar a autorización (~192) | `fund.status === 'draft' && isManager` | `fund.status === 'draft' && fund.manager_id === currentUser.id` |
| Autorización de fondo (~206) | `fund.status === 'pending_approval' && isApprover` | `decidiendoFondo` |
| «Paso 2 — Enviar al banco» (~254–271) | todo el bloque | **borrar** |
| Confirmar carga (~274) | `fund.status === 'pending_bank_load' && (currentUser.role === 'admin' \|\| currentUser.can_load_bank_transfer)` | `permiso.ok && permiso.paso === 'cargar_pago'` |
| Autorizar transferencia (~329) | `fund.status === 'pending_bank_auth' && (currentUser.role === 'admin' \|\| currentUser.can_authorize_bank_transfer)` | `permiso.ok && permiso.paso === 'autorizar_pago'` |
| Lista de gastos (~349) | `['funds_sent','submitted','pending_liquidation_approval','settled']` | `['funds_sent','submitted','pending_liquidation_approval','pending_liquidation_l2','settled']` |
| `deciding` (~382) | `fund.status === 'pending_liquidation_approval' && isApprover` | `decidiendoLiquidacion` |
| `canUpload` (~443) | `canEdit \|\| isApprover` | `canEdit \|\| decidiendoLiquidacion` |
| «Elevar liquidación» (~516–528) | todo el bloque | **borrar** |
| Aprobar liquidación (~531) | `fund.status === 'pending_liquidation_approval' && isApprover` | `decidiendoLiquidacion` |

d) En la aprobación de la liquidación (~541–545), que el N2 no pise los rechazos del N1 en silencio:

```typescript
              items.map(i => ({
                itemId: i.id,
                action: decidingItems[i.id] ?? (i.status === 'rejected' ? 'rejected' : 'approved'),
                reason: rejectionReasons[i.id] ?? i.rejection_reason ?? undefined,
              })),
```

e) Mostrar a quién se espera, para todos, justo antes de `{/* ── ACCIONES POR ESTADO …` (~189):

```tsx
      {permiso.paso && !permiso.ok && permiso.esperandoA.length > 0 && (
        <p className="text-xs text-ink-500 hoja px-4 py-3">
          Esperando a {permiso.esperandoA.join(', ')}.
        </p>
      )}
```

f) Reemplazar el `window.confirm` de eliminar ítem (~467):

```tsx
                              onClick={async () => {
                                if (await confirmar({
                                  titulo:  `¿Eliminar «${item.description}»?`,
                                  detalle: 'Esta acción no se puede deshacer.',
                                  aceptar: 'Eliminar',
                                }))
                                  act(() => removeFundItem(item.id))
                              }}
```

Si `confirmar()` pide otros nombres de opciones (por ejemplo `peligro: true` para el diálogo rojo), usar los del componente, igual que el resto de los borrados de la app.

- [ ] **Step 7: Typecheck, lint, tests**

Run: `npx tsc --noEmit` → sin errores.
Run: `npm run lint` → sin errores nuevos.
Run: `npm test` → PASS.
Run: `git grep -n -E "requestBankLoad|elevateLiquidation|recordFundDisbursement|window\.confirm" -- src` → sin resultados.

- [ ] **Step 8: Verify in the preview**

Con `preview_start`, abrir un fondo en `pending_approval` como alguien que no es su N1: aparece «Esperando a …» y no hay botones. `read_console_messages` sin errores.

- [ ] **Step 9: Commit**

```powershell
git add src/actions/petty-cash.ts "src/app/(app)/petty-cash/[id]/client.tsx"
git commit -m @'
feat(fondos): cadena N1/N2 del beneficiario, sin «elevar» ni «enviar al banco»

Aprobación y liquidación por cadena, banco con segregación, avisos a quien
actúa. Se elimina recordFundDisbursement, que saltaba el banco.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 8: Configuración de cadenas y suplencias bancarias

**Files:**
- Modify: `src/actions/admin.ts` (`updateEmployee` ~704–756; reemplazar `setEmployeeApprovers` ~970 y `setEmployeeBackupApprover` ~1017 por `setEmployeeApprovalChain`)
- Modify: `src/components/admin/ApproverConfig.tsx`
- Modify: `src/app/(app)/admin/employees/page.tsx` (~18–24, ~770–789)
- Modify: `src/lib/auth.ts:20`, `src/lib/supabase/types.ts` (quitar `bank_is_backup`)

**Interfaces:**
- Consumes: `validarCadena`, `dependientesDe` (Tarea 1); `cargarPersonas` (Tarea 4).
- Produces: `setEmployeeApprovalChain(userId: string, chain: { l1: string | null; l2: string | null; suplenteL1: string | null; suplenteDesde: string | null; suplenteHasta: string | null }): Promise<void>`.

- [ ] **Step 1: One action for the whole chain**

Las dos acciones de hoy validarían cada mitad contra la otra mitad **vieja** (cambiar N1 al que era suplente daría un error falso). En `src/actions/admin.ts`, confirmar que nadie más las usa:

Run: `git grep -n -E "setEmployeeApprovers|setEmployeeBackupApprover" -- src`
Expected: solo `admin.ts` y `ApproverConfig.tsx`.

Reemplazar ambas por:

```typescript
export async function setEmployeeApprovalChain(
  userId: string,
  chain: {
    l1:            string | null
    l2:            string | null
    suplenteL1:    string | null
    suplenteDesde: string | null
    suplenteHasta: string | null
  },
) {
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()

  const { data: before } = await supabase
    .from('users')
    .select('full_name, approver_l1_id, approver_l2_id, approver_l1_backup_id, backup_active_from, backup_active_until')
    .eq('id', userId)
    .eq('org_id', orgId)
    .single()
  if (!before) throw new Error('Empleado no encontrado')

  const personas = await cargarPersonas(createAdminClient(), orgId)
  const errores  = validarCadena(userId, { l1: chain.l1, l2: chain.l2, suplenteL1: chain.suplenteL1 }, personas)
  if (chain.suplenteL1 && (!chain.suplenteDesde || !chain.suplenteHasta)) {
    errores.push('El suplente necesita fecha de inicio y de término')
  }
  if (chain.suplenteDesde && chain.suplenteHasta && chain.suplenteDesde > chain.suplenteHasta) {
    errores.push('La fecha de término del suplente es anterior a la de inicio')
  }
  if (errores.length) throw new Error(errores.join('. '))

  const nuevo = {
    approver_l1_id:        chain.l1,
    approver_l2_id:        chain.l2,
    approver_l1_backup_id: chain.suplenteL1,
    backup_active_from:    chain.suplenteL1 ? chain.suplenteDesde : null,
    backup_active_until:   chain.suplenteL1 ? chain.suplenteHasta : null,
  }

  const { data: guardado, error } = await supabase
    .from('users')
    .update(nuevo)
    .eq('id', userId)
    .eq('org_id', orgId)
    .select('id')
  if (error || !guardado?.length) throw new Error(error?.message ?? 'No se pudo guardar la cadena')

  await logAudit({
    orgId,
    actorId,
    actorName,
    action:      'config_changed',
    entityType:  'approver_assignment',
    entityId:    userId,
    entityLabel: before.full_name ?? userId,
    oldValue:    before as unknown as Record<string, unknown>,
    newValue:    nuevo as unknown as Record<string, unknown>,
  })

  revalidatePath('/admin/employees')
}
```

Imports nuevos en `admin.ts` (si no están ya): `validarCadena`, `dependientesDe` desde `@/lib/permisos`.

- [ ] **Step 2: Guard `updateEmployee`**

En la firma de `updateEmployee`, reemplazar `bank_is_backup?: boolean` por `bank_load_backup?: boolean` y `bank_auth_backup?: boolean`. En el `select` del estado previo, reemplazar `bank_is_backup` por `bank_load_backup, bank_auth_backup`. Después del chequeo de «está bloqueado», agregar:

```typescript
  // Quitarle «aprueba» o desactivar a alguien que está en cadenas ajenas las
  // dejaría sin quién decida: primero hay que reasignarlas.
  if (updates.can_approve === false || updates.is_active === false) {
    const { data: empleados } = await supabase
      .from('users')
      .select('id, full_name, approver_l1_id, approver_l2_id, approver_l1_backup_id')
      .eq('org_id', orgId)
    const deps = dependientesDe(userId, (empleados ?? []).map(e => ({
      id: e.id, nombre: e.full_name, l1: e.approver_l1_id, l2: e.approver_l2_id, suplenteL1: e.approver_l1_backup_id,
    })))
    if (deps.length) throw new Error(`Primero reasigna a quienes aprueba: ${deps.join(', ')}`)
  }
```

- [ ] **Step 3: Update `ApproverConfig.tsx`**

- Import: `import { setEmployeeApprovalChain } from '@/actions/admin'`.
- Solo se ofrece a quien puede aprobar, más quien ya esté asignado (para no esconder una configuración vieja):

```typescript
  const asignados = [employee.approver_l1_id, employee.approver_l2_id, employee.approver_l1_backup_id]
  const options = allUsers.filter(u =>
    u.id !== employee.id && u.is_active && (u.can_approve || asignados.includes(u.id)))
```

- En `handleSave`, reemplazar las dos llamadas por:

```typescript
      await setEmployeeApprovalChain(employee.id, {
        l1:            l1Id        || null,
        l2:            l2Id        || null,
        suplenteL1:    backupId    || null,
        suplenteDesde: backupFrom  || null,
        suplenteHasta: backupUntil || null,
      })
```

- Reemplazar `<p className="text-xs text-success-600 font-medium py-1">✓ Aprobadores actualizados</p>` por `<p className="text-xs text-success-600 font-medium py-1">Aprobadores actualizados</p>`, si el resto de la app usa el ícono `Check` de Lucide en vez del carácter; si lo usa, anteponer `<Check size={12} className="inline" />`.

- [ ] **Step 4: Suplencia bancaria por función en `/admin/employees`**

En la lista de chips (~18–24), reemplazar `{ campo: 'bank_is_backup', chip: 'suplente banco' }` por:

```typescript
  { campo: 'bank_load_backup',            chip: 'suplente carga' },
  { campo: 'bank_auth_backup',            chip: 'suplente autoriza' },
```

En el panel de permisos (~770–789), reemplazar el bloque `{(emp.can_load_bank_transfer || emp.can_authorize_bank_transfer) && (…Suplente banco (sin avisos)…)}` por dos, cada uno justo después de su permiso:

```tsx
                  {emp.can_load_bank_transfer && (
                    <label className="flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer" title="Puede cargar cuando haga falta, pero el aviso le llega solo si no hay titular que pueda">
                      <input type="checkbox" checked={emp.bank_load_backup} disabled={saving === emp.id}
                        onChange={e => handleUpdate(emp.id, { bank_load_backup: e.target.checked })}
                        className="rounded text-brand-600" />
                      Suplente de carga
                    </label>
                  )}
```

(el de carga, después de «Carga banco»), y:

```tsx
                  {emp.can_authorize_bank_transfer && (
                    <label className="flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer" title="Puede autorizar cuando haga falta, pero el aviso le llega solo si no hay titular que pueda">
                      <input type="checkbox" checked={emp.bank_auth_backup} disabled={saving === emp.id}
                        onChange={e => handleUpdate(emp.id, { bank_auth_backup: e.target.checked })}
                        className="rounded text-brand-600" />
                      Suplente de autorización
                    </label>
                  )}
```

(el de autorización, después de «Autorizador banco»). El `handleUpdate` de la página ya muestra el error de `updateEmployee` con `avisar()`; confirmar que el mensaje «Primero reasigna a quienes aprueba…» se ve al desmarcar «Puede aprobar» de alguien con dependientes.

- [ ] **Step 5: Stop reading `bank_is_backup`**

- `src/lib/auth.ts:20`: en el `select`, reemplazar `bank_is_backup` por `bank_load_backup, bank_auth_backup`.
- `src/lib/supabase/types.ts`: borrar `bank_is_backup` de `users` (`Row`, `Insert`, `Update`).

Run: `git grep -n "bank_is_backup" -- src`
Expected: solo `src/lib/bank-helpers.ts` y `src/tests/bank-helpers.test.ts` (se borran en la Tarea 9).

- [ ] **Step 6: Typecheck, lint, tests**

Run: `npx tsc --noEmit` → sin errores.
Run: `npm run lint` → sin errores nuevos.
Run: `npm test` → PASS.

- [ ] **Step 7: Verify in the preview**

Con `preview_start` como admin, en `/admin/employees`:
- Poner a una persona como su propio N1 → aviso «Nadie puede ser su propio aprobador», y nada se guarda.
- Desmarcar «Puede aprobar» a quien es N1 de alguien → aviso «Primero reasigna a quienes aprueba: …».
- Marcar «Suplente de carga» → aparece el chip «suplente carga».

`read_console_messages` sin errores.

- [ ] **Step 8: Commit**

```powershell
git add src/actions/admin.ts src/components/admin/ApproverConfig.tsx "src/app/(app)/admin/employees/page.tsx" src/lib/auth.ts src/lib/supabase/types.ts
git commit -m @'
feat(empleados): cadenas válidas por construcción y suplencia bancaria por función

Una sola acción guarda la cadena completa y la valida con validarCadena.
No se puede quitar «aprueba» a quien tiene personas a cargo.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 9: Limpieza y documentación

**Files:**
- Delete: `src/lib/bank-helpers.ts`, `src/tests/bank-helpers.test.ts`
- Modify: `.claude/skills/mi-rendicion-context/SKILL.md`
- Create: `docs/pruebas/2026-09-24-guion-permisos.md`

- [ ] **Step 1: Delete `bank-helpers`**

Run: `git grep -n -E "bank-helpers|puedeOperarPago|destinatariosBancarios" -- src`
Expected: solo los dos archivos a borrar.

```powershell
git rm src/lib/bank-helpers.ts src/tests/bank-helpers.test.ts
```

Run: `npm test` → PASS. Run: `npx tsc --noEmit` → sin errores.

- [ ] **Step 2: Update the context skill**

En `.claude/skills/mi-rendicion-context/SKILL.md`:

1. Lista de migraciones: agregar
   - `032_flujo_por_asignacion.sql ← fondos con N2, suplencia bancaria por función (bank_load_backup / bank_auth_backup), historial de fondos firmado e inmutable, ver por cadena`
   - `033_estado_solo_desde_servidor.sql ← el estado y los montos aprobados solo los cambia el servidor; borra bank_is_backup`
2. Sección «Cola Bancaria»: reemplazar el bloque «Suplente bancario y pago propio» por:

```markdown
- **Permisos por asignación** (spec `2026-09-24-permisos-y-flujo-de-aprobacion-design.md`):
  las reglas viven en `src/lib/permisos.ts` y el contexto en `src/lib/contexto-permisos.ts`.
  Cinco reglas: nadie aprueba lo propio; nadie autoriza el pago de lo propio; quien
  cargó no autoriza; aprobar en N2 y autorizar está permitido; cargar lo propio está
  permitido. «Lo propio» = lo que recibe uno (en un fondo, el beneficiario).
- **El admin configura, no opera**: ningún `role === 'admin'` habilita aprobar,
  cargar ni autorizar. Durante las pruebas también (sin interruptor, D2).
- **Suplencia por función**: `bank_load_backup` y `bank_auth_backup`. FH es titular
  para autorizar y suplente para cargar.
- **La aprobación final va directo a `pending_bank_load`**: no existe «Iniciar proceso
  bancario» ni «Enviar al banco». `approved` solo queda cuando no hay nada que pagar
  (o en cargas históricas). Para buscar aprobadas usar `ESTADOS_APROBADOS` /
  `ESTADOS_POR_PAGAR` de `constants.ts`, nunca `['approved', 'partially_approved']`.
```

3. Tabla «Errores conocidos», agregar:

```markdown
| Dar permisos operativos por `role === 'admin'` | El admin se salteaba la segregación: aprobó, cargó y autorizó fondos solo | El admin configura, no opera. Cada paso pasa por `puedeActuar()` |
| Mandar un aviso a «todos los que tienen el permiso» | Correos a quien no puede actuar; el permiso y el aviso salían de consultas distintas | `destinatarios()` de `permisos.ts`: la misma función decide quién puede y a quién avisar |
| Cambiar un estado con el cliente de la sesión | Desde la 033 la base lo rechaza | Verificar con `exigirPaso` y escribir con `createAdminClient()` |
```

- [ ] **Step 3: Write the acceptance guide**

Crear `docs/pruebas/2026-09-24-guion-permisos.md` con este contenido:

```markdown
# Guion de prueba — permisos por asignación

Lo corren Katherine, Francisco Hagar (FH), Roberto Hagar (RH) y Daniel, cada uno con
su usuario. «Daniel Martinez Prueba» hace de Francisco Díaz (el rendidor). Antes de
empezar, acordar con Daniel si prefiere otra persona para ese papel.

## Configuración previa (la hace Daniel en /admin/employees)

| Persona | Permisos | Cadena |
|---|---|---|
| Daniel Martinez Prueba | Puede rendir | N1 Katherine · N2 FH |
| Katherine | Puede aprobar · EFF · Carga banco | N1 FH |
| FH | Puede aprobar · EFF · Carga banco + **Suplente de carga** · Autorizador banco | N1 RH |
| RH | Puede aprobar · EFF · Carga banco + Suplente de carga · Autorizador banco + **Suplente de autorización** | N1 FH |
| Daniel | Puede aprobar · EFF · Carga banco + Suplente de carga | N1 FH |

## Escenarios

Después de cada paso, anotar **quién recibió correo** (debe ser solo quien se indica).

1. **Flujo normal.** «Prueba» envía una rendición → correo solo a Katherine. Katherine
   aprueba → solo FH. FH aprueba → solo Katherine (cargar). Katherine carga → solo FH.
   FH autoriza → «Prueba» recibe «Reembolso procesado».
2. **FH no decide el nivel 1.** Con una rendición recién enviada, FH abre el link
   `/approvals/<id>` → ve el motivo y ningún botón.
3. **Katherine no está.** Otra rendición hasta «Carga bancaria pendiente». Carga FH
   (desde /banco) → el correo de autorizar le llega **solo a RH**. FH no la ve en su
   etapa de autorizar.
4. **Rendición de FH.** FH rinde → correo solo a RH. RH aprueba → Katherine carga →
   el correo de autorizar va **solo a RH**. FH no la ve para autorizar.
5. **Nunca trabado.** Otra rendición de FH en carga: RH intenta cargarla → el sistema
   dice que después nadie podría autorizarla y nombra a quién sí puede.
6. **Fondo propio.** Katherine crea un fondo a su nombre y lo envía → correo solo a FH.
   Katherine no ve botones para aprobarlo.
7. **Fondo con dos niveles.** Katherine crea un fondo para «Prueba» → Katherine aprueba
   (N1) → FH aprueba (N2) → Katherine carga → FH autoriza → «Prueba» y Katherine
   reciben «Fondos enviados». «Prueba» liquida → Katherine → FH → «Liquidado».
8. **El admin no opera.** Daniel, en /banco, no ve la etapa de autorizar. En
   /admin/reports no hay «Iniciar proceso bancario», y «Marcar reembolsado» solo
   aparece en cargas históricas.
9. **Sin aprobador.** Quitarle el N1 a «Prueba» e intentar enviar → mensaje «No tienes
   aprobador asignado…», y Daniel recibe el aviso de configuración.
```

- [ ] **Step 4: Commit**

```powershell
git add .claude/skills/mi-rendicion-context/SKILL.md docs/pruebas/2026-09-24-guion-permisos.md
git commit -m @'
docs(permisos): contexto actualizado y guion de prueba con los cuatro

Se borra bank-helpers: sus reglas viven ahora en permisos.ts.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 10: Puesta en producción — datos, migración 033 y verificación

**Files:**
- Create: `supabase/migrations/033_estado_solo_desde_servidor.sql`
- Create: `supabase/tests/033_proteccion.sql`

> **Pedir confirmación a Daniel antes de cada paso de este task**: mezcla con `main`
> (despliega), cambios de datos y una migración que cambia cómo se escribe la base.

- [ ] **Step 1: Last check that nothing changes a state with the session**

Run: `git grep -n -E "\.update\(\{[^}]*status" -- src/actions`
Revisar cada resultado: en `expense_reports`, `petty_cash_funds`, `expense_items` y `petty_cash_items`, todo cambio de `status` debe usar `ctx.admin`, `admin` o `adminClient`, nunca `supabase` (el cliente de la sesión). Las inserciones de las cargas históricas (`historical-import.ts`) son la excepción permitida por la 033.

- [ ] **Step 2: Merge and deploy**

Con la aprobación de Daniel: mezclar `feat/permisos-por-asignacion` en `main` y empujar. Esperar el despliegue de Vercel en producción (herramienta `list_deployments` del MCP de Vercel, o el panel) hasta `READY`.

- [ ] **Step 3: Fix the existing data**

Con la aprobación de Daniel, ejecutar con `execute_sql`:

```sql
-- Rendiciones normales que quedaron esperando «Iniciar proceso bancario»
update public.expense_reports
set status = 'pending_bank_load'
where status in ('approved', 'partially_approved')
  and is_historical_import = false
  and approved_amount > 0
  and deleted_at is null
returning id, title;
```
Expected: 2 filas (las de prueba). Las 78 históricas no se tocan.

```sql
-- El fondo n°193: Katherine se lo aprobó a sí misma; vuelve a pasar por la cadena
with f as (
  update public.petty_cash_funds
  set status = 'draft', amount_approved = null
  where name = 'fondo n°193 of ing' and status = 'pending_bank_load' and deleted_at is null
  returning id
)
insert into public.petty_cash_approvals (fund_id, actor_id, action, notes)
select f.id, u.id, 'returned_to_draft',
       'Autoaprobado antes de la regla «nadie aprueba lo propio» (2026-09-24); vuelve a pasar por la cadena'
from f, auth.users u
where u.email = 'danielmartinez.cl@gmail.com'
returning fund_id;
```
Expected: 1 fila.

- [ ] **Step 4: Write migration 033**

Crear `supabase/migrations/033_estado_solo_desde_servidor.sql`:

```sql
-- El estado y los montos aprobados solo los cambia el servidor.
-- Spec: docs/superpowers/specs/2026-09-24-permisos-y-flujo-de-aprobacion-design.md §5
--
-- Las reglas de quién puede dar cada paso viven UNA vez, en src/lib/permisos.ts,
-- y el servidor escribe con la llave de servicio después de preguntarles. Esta
-- migración no repite las reglas: impide saltarse el servidor. Una sesión de
-- usuario (auth.uid() no nulo) — incluida la del admin — ya no puede mover un
-- estado ni tocar un monto aprobado. La llave de servicio y el SQL manual, sí.
--
-- Por qué un disparador y no RLS: RLS no puede comparar el valor anterior de una
-- columna con el nuevo. El disparador ve los dos.
--
-- APLICAR SOLO DESPUÉS de desplegar el código que escribe con la llave de
-- servicio: el código viejo cambia estados con la sesión y fallaría.

-- 1 ─ Rendiciones ──────────────────────────────────────────────────────────────
create or replace function public.proteger_estado_rendicion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    -- Las cargas históricas entran aprobadas, y solo las crea un admin
    if new.status <> 'draft' and not (coalesce(new.is_historical_import, false) and coalesce(is_admin(), false)) then
      raise exception 'Una rendición nueva solo puede crearse en borrador';
    end if;
    return new;
  end if;

  if new.status            is distinct from old.status
  or new.approved_amount   is distinct from old.approved_amount
  or new.approved_at       is distinct from old.approved_at
  or new.reimbursed_at     is distinct from old.reimbursed_at
  or new.reimbursed_by     is distinct from old.reimbursed_by
  or new.reimbursed_amount is distinct from old.reimbursed_amount
  or new.payment_reference is distinct from old.payment_reference then
    raise exception 'El estado y los montos aprobados solo los cambia la aplicación, paso a paso';
  end if;
  return new;
end;
$$;

create trigger proteger_estado_rendicion
  before insert or update on public.expense_reports
  for each row execute function public.proteger_estado_rendicion();

-- 2 ─ Fondos ───────────────────────────────────────────────────────────────────
create or replace function public.proteger_estado_fondo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' and not (coalesce(new.is_historical_import, false) and coalesce(is_admin(), false)) then
      raise exception 'Un fondo nuevo solo puede crearse en borrador';
    end if;
    return new;
  end if;

  if new.status          is distinct from old.status
  or new.amount_approved is distinct from old.amount_approved
  or new.settled_at      is distinct from old.settled_at then
    raise exception 'El estado y el monto aprobado de un fondo solo los cambia la aplicación, paso a paso';
  end if;
  return new;
end;
$$;

create trigger proteger_estado_fondo
  before insert or update on public.petty_cash_funds
  for each row execute function public.proteger_estado_fondo();

-- 3 ─ Ítems: la decisión sobre cada gasto ──────────────────────────────────────
create or replace function public.proteger_estado_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  if new.status is distinct from old.status then
    raise exception 'La decisión sobre un gasto solo la registra la aplicación';
  end if;
  return new;
end;
$$;

create trigger proteger_estado_item
  before update on public.expense_items
  for each row execute function public.proteger_estado_item();

create trigger proteger_estado_item
  before update on public.petty_cash_items
  for each row execute function public.proteger_estado_item();

-- 4 ─ Suplencia bancaria vieja ─────────────────────────────────────────────────
-- Reemplazada por bank_load_backup / bank_auth_backup en la 032.
alter table public.users drop column bank_is_backup;
```

- [ ] **Step 5: Apply 033**

Con la aprobación de Daniel, aplicar con `apply_migration` (`name: 033_estado_solo_desde_servidor`).
Expected: sin error.

- [ ] **Step 6: Write and run the protection tests**

Crear `supabase/tests/033_proteccion.sql`:

```sql
-- Pruebas de la 033 con sesiones reales SIN rol admin (lección de la 030: las
-- fallas de permisos solo aparecen sin superpoderes). Todo corre en una
-- transacción que se deshace. Si alguna prueba falla, termina con
-- «PROTECCIÓN ROTA»; si pasa, deja avisos «OK».
begin;

-- Katherine: encargada del fondo n°193 (lo puede ver y editar por RLS)
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.users where full_name ilike 'Corval%' limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare n int;
begin
  -- 1. Mover el estado de un fondo propio
  begin
    update public.petty_cash_funds set status = 'pending_bank_load' where manager_id = auth.uid();
    get diagnostics n = row_count;
    if n > 0 then raise exception 'PROTECCIÓN ROTA: una sesión movió el estado de % fondo(s)', n; end if;
    raise notice 'Prueba 1 no concluyente: la sesión no ve fondos propios';
  exception when others then
    if sqlerrm like 'PROTECCIÓN ROTA%' then raise; end if;
    raise notice 'OK 1: %', sqlerrm;
  end;

  -- 2. Firmar el historial con el nombre de otra persona
  begin
    insert into public.petty_cash_approvals (fund_id, actor_id, action)
    select f.id, (select id from public.users where full_name ilike 'Hagar Mill%' limit 1), 'approved'
    from public.petty_cash_funds f where f.manager_id = auth.uid() limit 1;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'PROTECCIÓN ROTA: una sesión firmó el historial como otra persona'; end if;
    raise notice 'Prueba 2 no concluyente: la sesión no ve fondos propios';
  exception when others then
    if sqlerrm like 'PROTECCIÓN ROTA%' then raise; end if;
    raise notice 'OK 2: %', sqlerrm;
  end;

  -- 3. Mover el estado de una rendición propia
  begin
    update public.expense_reports set status = 'approved' where submitter_id = auth.uid();
    get diagnostics n = row_count;
    if n > 0 then raise exception 'PROTECCIÓN ROTA: una sesión movió el estado de % rendición(es)', n; end if;
    raise notice 'Prueba 3 no concluyente: la sesión no tiene rendiciones';
  exception when others then
    if sqlerrm like 'PROTECCIÓN ROTA%' then raise; end if;
    raise notice 'OK 3: %', sqlerrm;
  end;

  -- 4. Crear una rendición ya aprobada
  begin
    insert into public.expense_reports (org_id, submitter_id, title, status, total_amount, approved_amount, currency)
    values (public.get_my_org_id(), auth.uid(), 'prueba 033', 'approved', 1000, 1000, 'CLP');
    raise exception 'PROTECCIÓN ROTA: una sesión creó una rendición aprobada';
  exception when others then
    if sqlerrm like 'PROTECCIÓN ROTA%' then raise; end if;
    raise notice 'OK 4: %', sqlerrm;
  end;
end $$;

reset role;

-- El admin con su sesión tampoco mueve estados
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.users where role = 'admin' and full_name ilike 'Martinez Daniel%' limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare n int;
begin
  update public.expense_reports set status = 'reimbursed' where status = 'pending_bank_load';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'PROTECCIÓN ROTA: el admin movió estados con su sesión'; end if;
  raise notice 'Prueba 5 no concluyente: no hay rendiciones en carga';
exception when others then
  if sqlerrm like 'PROTECCIÓN ROTA%' then raise; end if;
  raise notice 'OK 5: %', sqlerrm;
end $$;

rollback;
```

Ejecutar el contenido con `execute_sql`.
Expected: sin «PROTECCIÓN ROTA»; avisos «OK 1»…«OK 5». Si las columnas del `insert` de la prueba 4 no coinciden con `expense_reports`, ajustarlas a las `not null` reales (mirar `information_schema.columns`) sin cambiar lo que prueba.

- [ ] **Step 7: Acceptance with the four**

Correr `docs/pruebas/2026-09-24-guion-permisos.md` con Katherine, FH, RH y Daniel. Anotar en el mismo archivo, por escenario, «OK» o qué pasó.

- [ ] **Step 8: Commit**

```powershell
git add supabase/migrations/033_estado_solo_desde_servidor.sql supabase/tests/033_proteccion.sql docs/pruebas/2026-09-24-guion-permisos.md
git commit -m @'
feat(db): el estado y los montos aprobados solo los cambia el servidor

Migración 033 aplicada tras el despliegue, con pruebas sin rol admin.
Borra bank_is_backup, reemplazado por la suplencia por función.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
git push
```
