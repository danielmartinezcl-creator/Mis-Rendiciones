# Planilla de alta — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cargar desde un Excel las cadenas N1/N2 y los datos bancarios de los 57
empleados, con una vista previa que diga fila por fila qué va a pasar antes de escribir.

**Architecture:** Helpers puros en `src/lib/planilla-alta.ts` (sin `'use server'`), que
consume tanto la vista previa en el navegador como la acción del servidor, que **vuelve a
resolver y validar** antes de escribir. Las reglas de la cadena de aprobación se extraen
de `setEmployeeApprovalChain` a `src/lib/cadena-aprobacion.ts` para que no existan en dos
sitios. La pantalla es un panel más de `/admin/employees`, junto a «Importar nómina».

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase, SheetJS
(`xlsx`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-planilla-de-alta-design.md`

## Global Constraints

- `src/actions/*.ts`: toda función exportada es `async`. Los helpers puros van en
  `src/lib/`, y los tests importan desde ahí, nunca desde `src/actions/`.
- Un módulo común de servidor (usa la llave de servicio) va en `src/lib/` **sin**
  `'use server'`: exportado desde una acción, cualquier sesión lo invoca con los
  argumentos que quiera.
- Estados y escrituras sensibles: se verifican con `requireAdmin()` y se escriben con el
  cliente que corresponda. Todo `.update()` encadena `.select('id')` y lanza si vuelve
  vacío — sin política RLS, Postgres no da error: afecta 0 filas y Supabase devuelve éxito.
- Errores esperados: el motivo que ve la persona sale de un **valor devuelto**, no de un
  `throw`. En producción Next puede ocultar el mensaje.
- Textos en español. Nunca `confirm()` / `alert()`: `confirmar()` / `avisar()` de
  `@/components/ui/Dialogos`.
- Diseño: materiales `.hoja` / `.tor-glass`, `rounded-item` / `rounded-card`, íconos
  Lucide, **ningún hexadecimal en componentes**. La vista previa ya está aprobada:
  https://claude.ai/artifact/J93gJ35kXJkvCZ1EvCE1sk
- Commits desde PowerShell con here-string (`git commit -m @'…'@`, cierre `'@` en la
  columna 0).
- Línea de partida (2026-10-01): 417 pruebas en 32 archivos, `npx eslint .` con 0 errores
  y 22 avisos, build limpio.

## Datos medidos en la base el 2026-10-01 (de la spec)

- 57 activos · **50 sin N1** · **56 sin datos bancarios completos** · **5 con `can_approve`**.
- **55 de 57 tienen RUT**, los 55 **con puntos**, **5 con la `k` en minúscula**.
- **No hay restricción de unicidad** sobre `users.rut`.
- `cargarPersonas()` de `src/lib/contexto-permisos.ts` **no trae `rut` ni el correo**: el
  correo vive en `auth.users`. Hace falta una carga propia (Tarea 6).

---

## Tarea 1: Normalizar RUT y nombres

**Files:**
- Create: `src/lib/planilla-alta.ts`
- Test: `src/tests/planilla-alta.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `normalizarRut(rut: string): string` (para comparar: sin puntos, DV en
  mayúscula, con guión) · `formatearRut(rut: string): string` (para guardar: con puntos) ·
  `normalizarNombre(nombre: string): string` (sin tildes, minúsculas, un solo espacio).

- [ ] **Step 1: Escribir las pruebas que fallan** en `src/tests/planilla-alta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizarRut, formatearRut, normalizarNombre } from '@/lib/planilla-alta'

describe('normalizarRut', () => {
  it('quita los puntos y deja el guión', () => {
    expect(normalizarRut('11.111.111-1')).toBe('11111111-1')
  })
  it('acepta el RUT sin puntos', () => {
    expect(normalizarRut('11111111-1')).toBe('11111111-1')
  })
  it('acepta el RUT sin guión', () => {
    expect(normalizarRut('111111111')).toBe('11111111-1')
  })
  // Los 5 RUT con k minúscula de la base no se encontrarían sin esto
  it('pasa la k a mayúscula', () => {
    expect(normalizarRut('12.345.678-k')).toBe('12345678-K')
  })
  it('tolera espacios alrededor', () => {
    expect(normalizarRut('  11.111.111-1  ')).toBe('11111111-1')
  })
  it('una cadena vacía no es un RUT', () => {
    expect(normalizarRut('')).toBe('')
    expect(normalizarRut('   ')).toBe('')
  })
})

describe('formatearRut', () => {
  it('guarda con puntos y el DV en mayúscula, como los 55 que ya están', () => {
    expect(formatearRut('11111111-1')).toBe('11.111.111-1')
    expect(formatearRut('12345678-k')).toBe('12.345.678-K')
  })
  it('da la vuelta completa sin perder nada', () => {
    expect(normalizarRut(formatearRut('11.111.111-1'))).toBe('11111111-1')
  })
  it('un RUT corto también se formatea', () => {
    expect(formatearRut('1234567-4')).toBe('1.234.567-4')
  })
})

describe('normalizarNombre', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalizarNombre('Pía MÉNDEZ')).toBe('pia mendez')
  })
  it('colapsa los espacios de más', () => {
    expect(normalizarNombre('  Rodrigo   Salas ')).toBe('rodrigo salas')
  })
})
```

- [ ] **Step 2: Correr y ver que fallan por importación**

```bash
npx vitest run src/tests/planilla-alta.test.ts
```

Esperado: FAIL, «Failed to resolve import "@/lib/planilla-alta"». Es la única vez que un
fallo por importación es el esperado: el archivo todavía no existe.

- [ ] **Step 3: Escribir `src/lib/planilla-alta.ts`**

```ts
// Carga masiva de cadenas de aprobación y datos bancarios desde un Excel.
// Helpers puros: los usa la vista previa en el navegador Y la acción del
// servidor, que vuelve a resolver todo antes de escribir — el navegador no es
// fuente de verdad. Módulo común, SIN 'use server'.
//
// Spec: docs/superpowers/specs/2026-10-01-planilla-de-alta-design.md

// Para COMPARAR. En la base los 55 RUT están con puntos y 5 con la k en
// minúscula, así que sin normalizar los dos lados la búsqueda no encuentra nada.
export function normalizarRut(rut: string): string {
  const limpio = rut.trim().toUpperCase().replace(/[^0-9K]/g, '')
  if (limpio.length < 2) return ''
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`
}

// Para GUARDAR: con puntos, que es el formato que ya tienen los 55 y el que
// espera el export a Defontana (toSheetRut).
export function formatearRut(rut: string): string {
  const n = normalizarRut(rut)
  if (!n) return ''
  const [cuerpo, dv] = n.split('-')
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ')
}
```

- [ ] **Step 4: Correr y ver que pasan**

```bash
npx vitest run src/tests/planilla-alta.test.ts
```

Esperado: PASS (11 pruebas).

- [ ] **Step 5: Commit**

```bash
git add src/lib/planilla-alta.ts src/tests/planilla-alta.test.ts
git commit -m "feat(planilla): normalizar RUT y nombres para poder comparar"
```

---

## Tarea 2: Resolver a una persona

**Files:**
- Modify: `src/lib/planilla-alta.ts`
- Test: `src/tests/planilla-alta.test.ts`

**Interfaces:**
- Consumes: `normalizarRut`, `normalizarNombre` de la Tarea 1.
- Produces:

```ts
export type Persona = {
  id: string; nombre: string; correo: string; rut: string | null
  activo: boolean; can_approve: boolean
}
export function resolverPersona(
  valor: string, personas: Persona[], por: 'rut' | 'correo' | 'nombre',
): { persona: Persona | null; ambiguas: Persona[] }
// Elige el modo solo (tiene '@' → correo, si no → nombre) para las celdas N1/N2
export function resolverAprobador(
  valor: string, personas: Persona[],
): { persona: Persona | null; ambiguas: Persona[] }
```

> **Hay dos tipos llamados `Persona` y conviene saberlo antes de pelearse con el
> compilador.** El de `@/lib/permisos` es el que pide `validarCadena` y tiene
> `{ id, nombre, activo, can_approve, … }`; el de acá le agrega `correo` y `rut`, que la
> planilla necesita para identificar. **No hay que convertir entre ellos**: TypeScript
> compara por forma, así que un `Persona[]` de la planilla entra tal cual donde se espera
> el de `permisos`. No importar los dos en el mismo archivo con el mismo nombre.

- [ ] **Step 1: Escribir las pruebas que fallan** — agregar al final de
  `src/tests/planilla-alta.test.ts`:

```ts
import { resolverPersona, resolverAprobador, type Persona } from '@/lib/planilla-alta'

const PERSONAS: Persona[] = [
  { id: 'u1', nombre: 'Salas Rodrigo',   correo: 'rodrigo.salas@penta.cl', rut: '11.111.111-1', activo: true,  can_approve: true },
  { id: 'u2', nombre: 'Méndez Carla',    correo: 'carla.mendez@penta.cl',  rut: '12.345.678-k', activo: true,  can_approve: false },
  { id: 'u3', nombre: 'Pérez Soto Ana',  correo: 'ana.perez@penta.cl',     rut: '22.222.222-2', activo: true,  can_approve: false },
  { id: 'u4', nombre: 'Pérez Soto Ana',  correo: 'a.perez@penta.cl',       rut: null,           activo: true,  can_approve: false },
  { id: 'u5', nombre: 'Rojas Inactivo',  correo: 'rojas@penta.cl',         rut: '66.666.666-6', activo: false, can_approve: true },
]

describe('resolverPersona por rut', () => {
  it('encuentra aunque el formato difiera entre el Excel y la base', () => {
    expect(resolverPersona('11111111-1', PERSONAS, 'rut').persona?.id).toBe('u1')
  })
  it('encuentra con la k en minúscula', () => {
    expect(resolverPersona('12.345.678-K', PERSONAS, 'rut').persona?.id).toBe('u2')
  })
  it('sin coincidencia devuelve null', () => {
    expect(resolverPersona('99.999.990-5', PERSONAS, 'rut').persona).toBeNull()
  })
})

describe('resolverPersona por nombre', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(resolverPersona('MENDEZ CARLA', PERSONAS, 'nombre').persona?.id).toBe('u2')
  })
  it('dos personas con el mismo nombre no se eligen: se devuelven ambas', () => {
    const r = resolverPersona('Pérez Soto Ana', PERSONAS, 'nombre')
    expect(r.persona).toBeNull()
    expect(r.ambiguas.map(p => p.id)).toEqual(['u3', 'u4'])
  })
  it('no considera a los inactivos', () => {
    expect(resolverPersona('Rojas Inactivo', PERSONAS, 'nombre').persona).toBeNull()
  })
})

describe('resolverAprobador', () => {
  it('con arroba busca por correo', () => {
    expect(resolverAprobador('rodrigo.salas@penta.cl', PERSONAS).persona?.id).toBe('u1')
  })
  it('el correo no distingue mayúsculas', () => {
    expect(resolverAprobador('Rodrigo.Salas@PENTA.cl', PERSONAS).persona?.id).toBe('u1')
  })
  it('sin arroba busca por nombre', () => {
    expect(resolverAprobador('Salas Rodrigo', PERSONAS).persona?.id).toBe('u1')
  })
  it('una celda vacía no resuelve a nadie y no es ambigua', () => {
    const r = resolverAprobador('   ', PERSONAS)
    expect(r.persona).toBeNull()
    expect(r.ambiguas).toEqual([])
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

```bash
npx vitest run src/tests/planilla-alta.test.ts
```

Esperado: FAIL por aserción en las nuevas, con las 11 de la Tarea 1 en verde.

- [ ] **Step 3: Implementar** — agregar a `src/lib/planilla-alta.ts`:

```ts
export type Persona = {
  id: string; nombre: string; correo: string; rut: string | null
  activo: boolean; can_approve: boolean
}

// Un valor que coincide con varias NO elige una: devuelve las candidatas para
// que la fila quede en error con sus nombres. Elegir sería apuntar la cadena de
// aprobación a quien quizá no corresponde, y eso recién se nota cuando alguien
// aprueba lo que no debía.
export function resolverPersona(
  valor: string,
  personas: Persona[],
  por: 'rut' | 'correo' | 'nombre',
): { persona: Persona | null; ambiguas: Persona[] } {
  const buscado = por === 'rut' ? normalizarRut(valor)
                : por === 'correo' ? valor.trim().toLowerCase()
                : normalizarNombre(valor)
  if (!buscado) return { persona: null, ambiguas: [] }

  const activas = personas.filter(p => p.activo)
  const coinciden = activas.filter(p =>
    por === 'rut'    ? p.rut !== null && normalizarRut(p.rut) === buscado
  : por === 'correo' ? p.correo.trim().toLowerCase() === buscado
  :                    normalizarNombre(p.nombre) === buscado)

  if (coinciden.length === 1) return { persona: coinciden[0], ambiguas: [] }
  return { persona: null, ambiguas: coinciden.length > 1 ? coinciden : [] }
}

// Quien arma la planilla escribe lo que tiene a mano (Daniel, D3): el correo es
// inequívoco, el nombre es cómodo. Se decide por el arroba.
export function resolverAprobador(
  valor: string, personas: Persona[],
): { persona: Persona | null; ambiguas: Persona[] } {
  const v = valor.trim()
  if (!v) return { persona: null, ambiguas: [] }
  return resolverPersona(v, personas, v.includes('@') ? 'correo' : 'nombre')
}
```

- [ ] **Step 4: Correr y ver que pasan**

```bash
npx vitest run src/tests/planilla-alta.test.ts
```

Esperado: PASS (22 pruebas).

- [ ] **Step 5: Commit**

```bash
git add src/lib/planilla-alta.ts src/tests/planilla-alta.test.ts
git commit -m "feat(planilla): resolver a una persona por RUT, correo o nombre"
```

---

## Tarea 3: El parche — una celda vacía nunca borra

**Files:**
- Modify: `src/lib/planilla-alta.ts`
- Test: `src/tests/planilla-alta.test.ts`

**Interfaces:**
- Consumes: `Persona`, `formatearRut` de las tareas 1 y 2.
- Produces:

```ts
export type FilaPlanilla = {
  nombre: string; rut: string; correo: string
  n1: string; n2: string
  banco: string; tipoCuenta: string; numeroCuenta: string
}
export type ParcheEmpleado = Partial<{
  approver_l1_id: string; approver_l2_id: string
  rut: string
  bank_name: string; bank_account_type: string; bank_account: string
}>
export function parcheDeFila(
  fila: FilaPlanilla, persona: Persona,
  n1: Persona | null, n2: Persona | null,
): ParcheEmpleado
```

- [ ] **Step 1: Escribir las pruebas que fallan** — agregar al final del test:

```ts
import { parcheDeFila, type FilaPlanilla, type ParcheEmpleado } from '@/lib/planilla-alta'

const VACIA: FilaPlanilla = {
  nombre: '', rut: '', correo: '', n1: '', n2: '',
  banco: '', tipoCuenta: '', numeroCuenta: '',
}
const CON_RUT:    Persona = { id: 'p1', nombre: 'Con Rut',  correo: 'c@p.cl', rut: '11.111.111-1', activo: true, can_approve: false }
const SIN_RUT:    Persona = { id: 'p2', nombre: 'Sin Rut',  correo: 's@p.cl', rut: null,           activo: true, can_approve: false }

describe('parcheDeFila: vacío nunca borra', () => {
  it('una planilla toda vacía no cambia nada', () => {
    expect(parcheDeFila(VACIA, CON_RUT, null, null)).toEqual({})
  })

  it('solo entra lo que viene con valor', () => {
    const fila = { ...VACIA, banco: 'Banco de Chile', numeroCuenta: '00012345678' }
    expect(parcheDeFila(fila, CON_RUT, null, null)).toEqual({
      bank_name: 'Banco de Chile', bank_account: '00012345678',
    })
  })

  it('una celda con solo espacios cuenta como vacía', () => {
    expect(parcheDeFila({ ...VACIA, banco: '   ' }, CON_RUT, null, null)).toEqual({})
  })

  it('los aprobadores entran por id, no por lo que diga la celda', () => {
    const fila = { ...VACIA, n1: 'Salas Rodrigo' }
    const n1: Persona = { id: 'u1', nombre: 'Salas Rodrigo', correo: 'r@p.cl', rut: null, activo: true, can_approve: true }
    expect(parcheDeFila(fila, CON_RUT, n1, null)).toEqual({ approver_l1_id: 'u1' })
  })

  it('el RUT se graba solo a quien no lo tenía, y con puntos', () => {
    const fila = { ...VACIA, rut: '22222222-2' }
    expect(parcheDeFila(fila, SIN_RUT, null, null)).toEqual({ rut: '22.222.222-2' })
  })

  it('a quien ya tiene RUT no se le reescribe', () => {
    const fila = { ...VACIA, rut: '11.111.111-1' }
    expect(parcheDeFila(fila, CON_RUT, null, null)).toEqual({})
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

```bash
npx vitest run src/tests/planilla-alta.test.ts
```

Esperado: FAIL por aserción en las 6 nuevas.

- [ ] **Step 3: Implementar** — agregar a `src/lib/planilla-alta.ts`:

```ts
export type FilaPlanilla = {
  nombre: string; rut: string; correo: string
  n1: string; n2: string
  banco: string; tipoCuenta: string; numeroCuenta: string
}

// Solo las claves que la fila trae con valor. Una clave ausente y una clave en
// null son cosas distintas, y acá la segunda no existe: así «vacío nunca borra»
// (Daniel, D3) lo hace cumplir el tipo y no la disciplina de quien escribe.
export type ParcheEmpleado = Partial<{
  approver_l1_id: string; approver_l2_id: string
  rut: string
  bank_name: string; bank_account_type: string; bank_account: string
}>

export function parcheDeFila(
  fila: FilaPlanilla,
  persona: Persona,
  n1: Persona | null,
  n2: Persona | null,
): ParcheEmpleado {
  const parche: ParcheEmpleado = {}
  const texto = (v: string) => { const t = v.trim(); return t === '' ? null : t }

  if (n1) parche.approver_l1_id = n1.id
  if (n2) parche.approver_l2_id = n2.id

  // El RUT identifica: se graba solo a quien no lo tenía, nunca se reescribe.
  // Cambiarle el RUT a alguien es cambiarle el identificador (ver la spec).
  if (!persona.rut && texto(fila.rut)) parche.rut = formatearRut(fila.rut)

  const banco  = texto(fila.banco)
  const tipo   = texto(fila.tipoCuenta)
  const numero = texto(fila.numeroCuenta)
  if (banco)  parche.bank_name         = banco
  if (tipo)   parche.bank_account_type = tipo
  if (numero) parche.bank_account      = numero

  return parche
}
```

- [ ] **Step 4: Correr y ver que pasan**

```bash
npx vitest run src/tests/planilla-alta.test.ts
```

Esperado: PASS (28 pruebas).

- [ ] **Step 5: Commit**

```bash
git add src/lib/planilla-alta.ts src/tests/planilla-alta.test.ts
git commit -m "feat(planilla): el parche de una fila, donde una celda vacía nunca borra"
```

---

## Tarea 4: Resolver la planilla entera

**Files:**
- Modify: `src/lib/planilla-alta.ts`
- Test: `src/tests/planilla-alta.test.ts`

**Interfaces:**
- Consumes: todo lo anterior, más `validateRut` de `@/lib/validators` y `validarCadena`
  de `@/lib/permisos`.
- Produces:

```ts
export type FilaResuelta = {
  fila: number
  persona: Persona | null
  n1: Persona | null; n2: Persona | null
  correoNuevo: string | null
  parche: ParcheEmpleado
  errores: string[]
}
export function resolverPlanilla(
  filas: FilaPlanilla[], personas: Persona[], permisosPorOtorgar?: Set<string>,
): FilaResuelta[]
export function sinPermisoAprobar(resueltas: FilaResuelta[]): Persona[]
```

`validarCadena(empleadoId, { l1, l2, suplenteL1 }, personas)` devuelve `string[]` y pide
personas con la forma `{ id, nombre, activo, can_approve }` — `Persona` la cumple.

- [ ] **Step 1: Escribir las pruebas que fallan** — agregar al final del test:

```ts
import { resolverPlanilla, sinPermisoAprobar } from '@/lib/planilla-alta'

const fila = (p: Partial<FilaPlanilla>): FilaPlanilla => ({ ...VACIA, ...p })

describe('resolverPlanilla', () => {
  it('una fila buena no trae errores y numera desde 1', () => {
    const [r] = resolverPlanilla([fila({ rut: '11.111.111-1', banco: 'BCI' })], PERSONAS)
    expect(r.fila).toBe(1)
    expect(r.errores).toEqual([])
    expect(r.persona?.id).toBe('u1')
    expect(r.parche).toEqual({ bank_name: 'BCI' })
  })

  it('un RUT con el dígito verificador malo no busca a nadie', () => {
    const [r] = resolverPlanilla([fila({ rut: '11.111.111-9' })], PERSONAS)
    expect(r.errores.join(' ')).toContain('dígito verificador')
  })

  it('un RUT que no está en la base deja la fila fuera', () => {
    const [r] = resolverPlanilla([fila({ rut: '99.999.990-5' })], PERSONAS)
    expect(r.persona).toBeNull()
    expect(r.errores.join(' ')).toContain('Ningún empleado')
  })

  it('si el RUT no está, el correo lo encuentra igual', () => {
    const [r] = resolverPlanilla(
      [fila({ rut: '99.999.990-5', correo: 'rodrigo.salas@penta.cl' })], PERSONAS)
    expect(r.persona?.id).toBe('u1')
  })

  it('una persona con OTRO rut es error, no una corrección', () => {
    const [r] = resolverPlanilla(
      [fila({ rut: '99.999.990-5', correo: 'carla.mendez@penta.cl' })], PERSONAS)
    expect(r.errores.join(' ')).toContain('otro RUT')
  })

  it('un aprobador ambiguo nombra a las candidatas', () => {
    const [r] = resolverPlanilla(
      [fila({ rut: '11.111.111-1', n1: 'Pérez Soto Ana' })], PERSONAS)
    expect(r.errores.join(' ')).toContain('coincide con 2 personas')
  })

  it('un aprobador sin el permiso «aprueba» da error…', () => {
    const [r] = resolverPlanilla(
      [fila({ rut: '11.111.111-1', n1: 'carla.mendez@penta.cl' })], PERSONAS)
    expect(r.errores.join(' ')).toContain('aprueba')
  })

  it('…y deja de darlo cuando su permiso está por otorgarse', () => {
    const [r] = resolverPlanilla(
      [fila({ rut: '11.111.111-1', n1: 'carla.mendez@penta.cl' })], PERSONAS, new Set(['u2']))
    expect(r.errores).toEqual([])
    expect(r.parche.approver_l1_id).toBe('u2')
  })

  it('una fila mala no contamina a las buenas', () => {
    const rs = resolverPlanilla([
      fila({ rut: '99.999.990-5' }),
      fila({ rut: '11.111.111-1', banco: 'BCI' }),
    ], PERSONAS)
    expect(rs[0].errores.length).toBeGreaterThan(0)
    expect(rs[1].errores).toEqual([])
  })

  it('el mismo RUT en dos filas marca las dos', () => {
    const rs = resolverPlanilla([
      fila({ rut: '11.111.111-1' }), fila({ rut: '11111111-1' }),
    ], PERSONAS)
    expect(rs[0].errores.join(' ')).toContain('Dos filas')
    expect(rs[1].errores.join(' ')).toContain('Dos filas')
  })

  it('un correo distinto del actual se marca como cambio de acceso', () => {
    const [r] = resolverPlanilla(
      [fila({ rut: '11.111.111-1', correo: 'nuevo@penta.cl' })], PERSONAS)
    expect(r.correoNuevo).toBe('nuevo@penta.cl')
    expect(r.errores).toEqual([])
  })

  it('un correo que ya usa otra persona es error', () => {
    const [r] = resolverPlanilla(
      [fila({ rut: '11.111.111-1', correo: 'carla.mendez@penta.cl' })], PERSONAS)
    expect(r.errores.join(' ')).toContain('ya lo usa')
  })

  it('el mismo correo nuevo en dos filas marca las dos', () => {
    const rs = resolverPlanilla([
      fila({ rut: '11.111.111-1', correo: 'nuevo@penta.cl' }),
      fila({ rut: '12.345.678-k', correo: 'nuevo@penta.cl' }),
    ], PERSONAS)
    expect(rs[0].errores.join(' ')).toContain('Dos filas')
    expect(rs[1].errores.join(' ')).toContain('Dos filas')
  })
})

describe('sinPermisoAprobar', () => {
  it('junta a los aprobadores sin permiso, sin repetirlos', () => {
    const rs = resolverPlanilla([
      fila({ rut: '11.111.111-1', n1: 'carla.mendez@penta.cl' }),
      fila({ rut: '22.222.222-2', n1: 'carla.mendez@penta.cl' }),
    ], PERSONAS)
    expect(sinPermisoAprobar(rs).map(p => p.id)).toEqual(['u2'])
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

```bash
npx vitest run src/tests/planilla-alta.test.ts
```

Esperado: FAIL por aserción en las 14 nuevas.

- [ ] **Step 3: Implementar** — agregar a `src/lib/planilla-alta.ts`:

```ts
import { validateRut } from '@/lib/validators'
import { validarCadena } from '@/lib/permisos'

export type FilaResuelta = {
  fila: number
  persona: Persona | null
  n1: Persona | null; n2: Persona | null
  correoNuevo: string | null
  parche: ParcheEmpleado
  errores: string[]
}

// Los errores NO cortan en el primero: se juntan todos, para que quien corrige
// el Excel no tenga que hacerlo en varias pasadas.
export function resolverPlanilla(
  filas: FilaPlanilla[],
  personas: Persona[],
  permisosPorOtorgar: Set<string> = new Set(),
): FilaResuelta[] {
  // Los duplicados DENTRO de la planilla se cuentan primero: una fila no puede
  // saber sola que otra trae su mismo RUT.
  const vecesRut    = new Map<string, number>()
  const vecesCorreo = new Map<string, number>()
  for (const f of filas) {
    const r = normalizarRut(f.rut)
    if (r) vecesRut.set(r, (vecesRut.get(r) ?? 0) + 1)
    const c = f.correo.trim().toLowerCase()
    if (c) vecesCorreo.set(c, (vecesCorreo.get(c) ?? 0) + 1)
  }

  // Para validarCadena: un permiso por otorgar ya cuenta como dado, así el
  // botón «Darles el permiso» saca las filas del error sin volver a subir nada.
  const conPermisos = personas.map(p =>
    permisosPorOtorgar.has(p.id) ? { ...p, can_approve: true } : p)

  return filas.map((f, i) => {
    const errores: string[] = []
    const rutNorm   = normalizarRut(f.rut)
    const correo    = f.correo.trim().toLowerCase()

    if (rutNorm && vecesRut.get(rutNorm)! > 1)   errores.push('Dos filas traen el mismo RUT')
    if (correo  && vecesCorreo.get(correo)! > 1) errores.push('Dos filas traen el mismo correo')

    // ── A quién le escribimos ────────────────────────────────────────────────
    let persona: Persona | null = null
    if (!f.rut.trim()) {
      errores.push('Falta el RUT, que es lo que identifica a la persona')
    } else if (!validateRut(f.rut)) {
      errores.push(`RUT inválido "${f.rut.trim()}" — revisa el dígito verificador`)
    } else {
      const porRut = resolverPersona(f.rut, conPermisos, 'rut')
      if (porRut.ambiguas.length > 1) {
        errores.push(`Ese RUT lo tienen ${porRut.ambiguas.length} personas: ${porRut.ambiguas.map(p => p.nombre).join(', ')}`)
      } else if (porRut.persona) {
        persona = porRut.persona
      } else if (correo) {
        // Respaldo para las 2 personas que todavía no tienen RUT cargado
        const porCorreo = resolverPersona(correo, conPermisos, 'correo')
        if (porCorreo.persona && porCorreo.persona.rut
            && normalizarRut(porCorreo.persona.rut) !== rutNorm) {
          errores.push(`${porCorreo.persona.nombre} está registrada con otro RUT (${porCorreo.persona.rut})`)
        } else if (porCorreo.persona) {
          persona = porCorreo.persona
        }
      }
      if (!persona && !errores.some(e => e.includes('otro RUT') || e.includes('Ese RUT'))) {
        errores.push('Ningún empleado tiene ese RUT, y el correo tampoco está en la base')
      }
    }

    // ── Los aprobadores ──────────────────────────────────────────────────────
    const r1 = resolverAprobador(f.n1, conPermisos)
    const r2 = resolverAprobador(f.n2, conPermisos)
    for (const [celda, r, rol] of [[f.n1, r1, 'N1'], [f.n2, r2, 'N2']] as const) {
      if (!celda.trim()) continue
      if (r.ambiguas.length > 1) {
        errores.push(`El aprobador ${rol} "${celda.trim()}" coincide con ${r.ambiguas.length} personas: ${r.ambiguas.map(p => p.nombre).join(', ')}`)
      } else if (!r.persona) {
        errores.push(`No se encontró al aprobador ${rol} "${celda.trim()}"`)
      }
    }

    // ── El correo nuevo ──────────────────────────────────────────────────────
    let correoNuevo: string | null = null
    if (persona && correo && correo !== persona.correo.trim().toLowerCase()) {
      const dueño = conPermisos.find(p =>
        p.id !== persona!.id && p.correo.trim().toLowerCase() === correo)
      if (dueño) errores.push(`Ese correo ya lo usa ${dueño.nombre}`)
      else       correoNuevo = correo
    }

    // ── Las reglas de la cadena, las mismas que /admin/employees ─────────────
    if (persona) {
      errores.push(...validarCadena(
        persona.id,
        { l1: r1.persona?.id ?? null, l2: r2.persona?.id ?? null, suplenteL1: null },
        conPermisos,
      ))
    }

    return {
      fila: i + 1,
      persona,
      n1: r1.persona, n2: r2.persona,
      correoNuevo,
      parche: persona ? parcheDeFila(f, persona, r1.persona, r2.persona) : {},
      errores,
    }
  })
}

// Los nombrados como N1 o N2 que todavía no pueden aprobar, sin repetir.
export function sinPermisoAprobar(resueltas: FilaResuelta[]): Persona[] {
  const vistos = new Map<string, Persona>()
  for (const r of resueltas) {
    for (const p of [r.n1, r.n2]) {
      if (p && !p.can_approve && !vistos.has(p.id)) vistos.set(p.id, p)
    }
  }
  return [...vistos.values()]
}
```

- [ ] **Step 4: Correr y ver que pasan**

```bash
npx vitest run src/tests/planilla-alta.test.ts
```

Esperado: PASS (42 pruebas). Si alguna falla por el **texto** de un error, ajustar el
texto del mensaje, no la prueba: el mensaje es lo que lee quien corrige el Excel.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planilla-alta.ts src/tests/planilla-alta.test.ts
git commit -m "feat(planilla): resolver la planilla entera, con los errores por fila"
```

---

## Tarea 5: Extraer las reglas de la cadena

Refactor **sin cambio de comportamiento**: hoy las reglas de la cadena viven dentro de
`setEmployeeApprovalChain`. Si la planilla las copia, pasan a existir en dos sitios y el
día que cambien se desincronizan.

**Files:**
- Create: `src/lib/cadena-aprobacion.ts`
- Modify: `src/actions/admin.ts` — `setEmployeeApprovalChain()`

**Interfaces:**
- Consumes: `validarCadena` de `@/lib/permisos`, `cargarPersonas` de
  `@/lib/contexto-permisos`.
- Produces:

```ts
export type Cadena = {
  l1: string | null; l2: string | null
  suplenteL1: string | null
  suplenteDesde: string | null; suplenteHasta: string | null
}
export function erroresDeCadena(empleadoId: string, cadena: Cadena, personas: Persona[]): string[]
export function camposDeCadena(cadena: Cadena): {
  approver_l1_id: string | null; approver_l2_id: string | null
  approver_l1_backup_id: string | null
  backup_active_from: string | null; backup_active_until: string | null
}
```

- [ ] **Step 1: Escribir las pruebas que fallan** en `src/tests/cadena-aprobacion.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { erroresDeCadena, camposDeCadena } from '@/lib/cadena-aprobacion'

const PERSONAS = [
  { id: 'a', nombre: 'Ana',  activo: true, can_approve: true },
  { id: 'b', nombre: 'Beto', activo: true, can_approve: true },
]
const SIN_SUPLENTE = { l1: 'a', l2: 'b', suplenteL1: null, suplenteDesde: null, suplenteHasta: null }

describe('erroresDeCadena', () => {
  it('una cadena correcta no da errores', () => {
    expect(erroresDeCadena('x', SIN_SUPLENTE, PERSONAS)).toEqual([])
  })
  it('un suplente sin fechas da error', () => {
    const e = erroresDeCadena('x', { ...SIN_SUPLENTE, l2: null, suplenteL1: 'b' }, PERSONAS)
    expect(e.join(' ')).toContain('fecha de inicio')
  })
  it('la fecha de término anterior a la de inicio da error', () => {
    const e = erroresDeCadena('x', {
      ...SIN_SUPLENTE, l2: null, suplenteL1: 'b',
      suplenteDesde: '2026-10-10', suplenteHasta: '2026-10-01',
    }, PERSONAS)
    expect(e.join(' ')).toContain('anterior')
  })
})

describe('camposDeCadena', () => {
  it('sin suplente, las fechas quedan en null aunque vengan', () => {
    expect(camposDeCadena({ ...SIN_SUPLENTE, suplenteDesde: '2026-10-01' })).toEqual({
      approver_l1_id: 'a', approver_l2_id: 'b', approver_l1_backup_id: null,
      backup_active_from: null, backup_active_until: null,
    })
  })
})
```

- [ ] **Step 2: Correr y ver que falla por importación**

```bash
npx vitest run src/tests/cadena-aprobacion.test.ts
```

- [ ] **Step 3: Crear `src/lib/cadena-aprobacion.ts`**

```ts
// Las reglas de la cadena de aprobación, en un solo lugar: las usan
// setEmployeeApprovalChain (de a una persona) y la planilla de alta (en lote).
// Módulo común, SIN 'use server'.

import { validarCadena, type Persona } from '@/lib/permisos'

export type Cadena = {
  l1: string | null; l2: string | null
  suplenteL1: string | null
  suplenteDesde: string | null; suplenteHasta: string | null
}

export function erroresDeCadena(
  empleadoId: string, cadena: Cadena, personas: Persona[],
): string[] {
  const errores = validarCadena(
    empleadoId,
    { l1: cadena.l1, l2: cadena.l2, suplenteL1: cadena.suplenteL1 },
    personas,
  )
  if (cadena.suplenteL1 && (!cadena.suplenteDesde || !cadena.suplenteHasta)) {
    errores.push('El suplente necesita fecha de inicio y de término')
  }
  if (cadena.suplenteDesde && cadena.suplenteHasta
      && cadena.suplenteDesde > cadena.suplenteHasta) {
    errores.push('La fecha de término del suplente es anterior a la de inicio')
  }
  return errores
}

// Sin suplente no hay período: las fechas se anulan aunque vengan, para que no
// quede un rango colgando de un suplente que ya no está.
export function camposDeCadena(cadena: Cadena) {
  return {
    approver_l1_id:        cadena.l1,
    approver_l2_id:        cadena.l2,
    approver_l1_backup_id: cadena.suplenteL1,
    backup_active_from:    cadena.suplenteL1 ? cadena.suplenteDesde : null,
    backup_active_until:   cadena.suplenteL1 ? cadena.suplenteHasta : null,
  }
}
```

- [ ] **Step 4: Usarlo desde `setEmployeeApprovalChain`** en `src/actions/admin.ts`.
  Reemplazar el bloque que hoy valida y arma `nuevo` (desde `const errores = validarCadena(…)`
  hasta el cierre del objeto `nuevo`) por:

```ts
  const errores = erroresDeCadena(userId, chain, personas)
  if (errores.length) throw new Error(errores.join('. '))

  const nuevo = camposDeCadena(chain)
```

  Y agregar el import al principio del archivo:

```ts
import { erroresDeCadena, camposDeCadena } from '@/lib/cadena-aprobacion'
```

  `validarCadena` puede quedar importado si `admin.ts` lo usa en otro lado; si el lint
  avisa que ya no se usa, quitarlo del import.

- [ ] **Step 5: Correr todo y comprobar que nada se rompió**

```bash
npx vitest run
npx tsc --noEmit -p .
```

Esperado: 46 pruebas (42 + 4), typecheck limpio. **Ninguna prueba existente debe cambiar**:
es un refactor, no un cambio de comportamiento.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cadena-aprobacion.ts src/tests/cadena-aprobacion.test.ts src/actions/admin.ts
git commit -m "refactor(cadena): las reglas de la cadena de aprobación, en un solo lugar"
```

---

## Tarea 6: Las acciones del servidor

**Files:**
- Modify: `src/actions/employees.ts`

**Interfaces:**
- Consumes: `resolverPlanilla`, `sinPermisoAprobar`, `FilaPlanilla`, `Persona` de
  `@/lib/planilla-alta`; `requireAdmin`, `createAdminClient`, `logAudit` como ya los usa
  el archivo.
- Produces (las tres `async`, como exige Next 16):

```ts
export async function personasParaPlanilla(): Promise<Persona[]>
export async function otorgarPermisoAprobar(ids: string[]): Promise<{ ok: number; errores: string[] }>
export async function cargarPlanillaAlta(filas: FilaPlanilla[]): Promise<{
  cargadas: number
  fallidas: { fila: number; nombre: string; motivo: string }[]
}>
```

- [ ] **Step 1: `personasParaPlanilla()`**

```ts
// El correo vive en auth.users, no en public.users: hay que cruzarlos. Acá SÍ
// conviene un listUsers único —son 57 y los necesitamos todos para resolver
// aprobadores por correo—, al revés que en los avisos, donde se busca uno solo.
export async function personasParaPlanilla(): Promise<Persona[]> {
  const { orgId } = await requireAdmin()
  const admin = createAdminClient()

  const { data: filas, error } = await admin
    .from('users')
    .select('id, full_name, rut, is_active, blocked_at, deleted_at, can_approve')
    .eq('org_id', orgId)
  if (error) throw new Error(error.message)

  const { data: auth } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const correos = new Map((auth?.users ?? []).map(u => [u.id, u.email ?? '']))

  return (filas ?? []).map(u => ({
    id:          u.id,
    nombre:      u.full_name ?? '',
    correo:      correos.get(u.id) ?? '',
    rut:         u.rut,
    activo:      u.is_active && !u.blocked_at && !u.deleted_at,
    can_approve: u.can_approve,
  }))
}
```

- [ ] **Step 2: `otorgarPermisoAprobar()`**

```ts
// Un permiso no se reparte desde un Excel: lo da el admin a propósito, con los
// nombres a la vista (Daniel, 2026-10-01).
export async function otorgarPermisoAprobar(ids: string[]) {
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()
  const errores: string[] = []
  let ok = 0

  for (const id of ids) {
    const { data: antes } = await supabase
      .from('users').select('full_name, can_approve').eq('id', id).eq('org_id', orgId).single()
    if (!antes) { errores.push(`No se encontró a ${id}`); continue }

    const { data, error } = await supabase
      .from('users').update({ can_approve: true })
      .eq('id', id).eq('org_id', orgId).select('id')
    if (error || !data?.length) {
      errores.push(`${antes.full_name}: ${error?.message ?? 'no se pudo guardar'}`)
      continue
    }
    await logAudit({
      orgId, actorId, actorName,
      action: 'config_changed', entityType: 'user', entityId: id,
      entityLabel: antes.full_name ?? id,
      oldValue: { can_approve: antes.can_approve }, newValue: { can_approve: true },
    })
    ok++
  }

  revalidatePath('/admin/employees')
  return { ok, errores }
}
```

- [ ] **Step 3: `cargarPlanillaAlta()`**

```ts
// El navegador NO es fuente de verdad: se vuelve a resolver y validar todo acá.
// Sin transacción que abarque las filas: cada una se escribe por su cuenta y es
// idempotente — volver a subir la misma planilla deja el mismo estado (spec).
export async function cargarPlanillaAlta(filas: FilaPlanilla[]) {
  const { supabase, orgId, userId: actorId, actorName } = await requireAdmin()
  const admin    = createAdminClient()
  const personas = await personasParaPlanilla()
  const resueltas = resolverPlanilla(filas, personas)

  const fallidas: { fila: number; nombre: string; motivo: string }[] = []
  let cargadas = 0

  for (const r of resueltas) {
    const quien = r.persona?.nombre ?? `fila ${r.fila}`
    if (r.errores.length || !r.persona) {
      fallidas.push({ fila: r.fila, nombre: quien, motivo: r.errores.join('. ') })
      continue
    }
    if (Object.keys(r.parche).length === 0 && !r.correoNuevo) continue

    try {
      if (Object.keys(r.parche).length > 0) {
        const { data, error } = await supabase
          .from('users').update(r.parche)
          .eq('id', r.persona.id).eq('org_id', orgId).select('id')
        if (error || !data?.length) throw new Error(error?.message ?? 'no se pudo guardar')
      }

      if (r.correoNuevo) {
        const { error } = await admin.auth.admin.updateUserById(
          r.persona.id, { email: r.correoNuevo, email_confirm: true })
        if (error) throw new Error(`correo: ${error.message}`)
      }

      await logAudit({
        orgId, actorId, actorName,
        action: 'config_changed', entityType: 'user', entityId: r.persona.id,
        entityLabel: quien,
        oldValue: { correo: r.persona.correo, rut: r.persona.rut },
        newValue: { ...r.parche, ...(r.correoNuevo ? { correo: r.correoNuevo } : {}) },
      })
      cargadas++
    } catch (e) {
      fallidas.push({ fila: r.fila, nombre: quien, motivo: String(e instanceof Error ? e.message : e) })
    }
  }

  revalidatePath('/admin/employees')
  return { cargadas, fallidas }
}
```

- [ ] **Step 4: Comprobar que compila**

```bash
npx tsc --noEmit -p .
npx eslint src/actions/employees.ts src/lib/planilla-alta.ts src/lib/cadena-aprobacion.ts
```

Esperado: ambos limpios. Si `tsc` se queja de `r.parche` contra el tipo de `users`,
castear el valor como ya hace el resto del archivo (`as never` solo donde haga falta).

- [ ] **Step 5: Commit**

```bash
git add src/actions/employees.ts
git commit -m "feat(planilla): las acciones que cargan la planilla y otorgan el permiso"
```

---

## Tarea 7: La pantalla

La vista previa está aprobada: https://claude.ai/artifact/J93gJ35kXJkvCZ1EvCE1sk — el
resumen arriba, los permisos pendientes en su bloque, la tabla con los errores explicados
y el cambio de correo destacado en ámbar.

**Files:**
- Create: `src/components/admin/PlanillaAlta.tsx`
- Modify: `src/app/(app)/admin/employees/page.tsx` — el estado `panel` (línea ~50), el
  botón (junto al de «Importar nómina», ~línea 348) y el panel (~línea 374).

**Interfaces:**
- Consumes: `personasParaPlanilla`, `cargarPlanillaAlta`, `otorgarPermisoAprobar` de
  `@/actions/employees`; `resolverPlanilla`, `sinPermisoAprobar`, `FilaPlanilla` de
  `@/lib/planilla-alta`; `useDialogos` de `@/components/ui/Dialogos`.
- Produces: `<PlanillaAlta onDone={() => void} />`.

- [ ] **Step 1: El mapeo de cabeceras**, al principio de `PlanillaAlta.tsx`. Tolerante
  como el de `EmployeeImport`, con las ocho columnas de la spec:

```tsx
function mapHeader(h: string): keyof FilaPlanilla | null {
  const s = h.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (['apellido y nombre', 'nombre y apellido', 'nombre', 'nombre completo'].includes(s)) return 'nombre'
  if (['rut', 'r.u.t.', 'rut empleado'].includes(s)) return 'rut'
  if (['correo', 'email', 'e-mail', 'correo electronico'].includes(s)) return 'correo'
  if (['aprobador 1er nivel (n1)', 'aprobador 1er nivel', 'aprobador n1', 'n1', 'aprobador 1'].includes(s)) return 'n1'
  if (['aprobador 2do nivel (n2)', 'aprobador 2do nivel', 'aprobador n2', 'n2', 'aprobador 2'].includes(s)) return 'n2'
  if (['banco'].includes(s)) return 'banco'
  if (['tipo de cuenta', 'tipo cuenta'].includes(s)) return 'tipoCuenta'
  if (['n° de cuenta', 'no de cuenta', 'numero de cuenta', 'n de cuenta', 'cuenta'].includes(s)) return 'numeroCuenta'
  return null
}
```

- [ ] **Step 2: La plantilla descargable**, con los ocho encabezados en el orden de la
  spec y una fila de ejemplo. Mismo patrón que `descargarPlantilla` de `EmployeeImport`
  (`XLSX.utils.aoa_to_sheet` + `XLSX.writeFile`):

```tsx
const CABECERAS = ['Apellido y nombre', 'RUT', 'Correo',
  'Aprobador 1er Nivel (N1)', 'Aprobador 2do Nivel (N2)',
  'Banco', 'Tipo de Cuenta', 'N° de Cuenta']
const EJEMPLO = ['Contreras Pía', '11.111.111-1', 'pia.contreras@penta.cl',
  'rodrigo.salas@penta.cl', 'Méndez Carla',
  'Banco de Chile', 'Cuenta Corriente', '00012345678']
```

- [ ] **Step 3: La lectura del archivo.** `XLSX.read` sobre el `ArrayBuffer`,
  `sheet_to_json` con `{ defval: '' }`, mapear cada fila con `mapHeader` a `FilaPlanilla`
  (toda clave ausente queda `''`). Si ninguna cabecera mapea a `rut`, no seguir: mostrar
  «No se encontró la columna RUT» con las columnas detectadas, igual que hace
  `EmployeeImport` con «Nombre».

- [ ] **Step 4: La vista previa.** El esqueleto, que es donde están las decisiones; el
  resto del JSX sale del Artifact aprobado:

```tsx
export function PlanillaAlta({ onDone }: { onDone: () => void }) {
  const { confirmar, avisar } = useDialogos()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [filas,    setFilas]    = useState<FilaPlanilla[]>([])
  const [otorgar,  setOtorgar]  = useState<Set<string>>(new Set())
  const [error,    setError]    = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [fallidas, setFallidas] = useState<{ fila: number; nombre: string; motivo: string }[]>([])

  useEffect(() => { personasParaPlanilla().then(setPersonas).catch(e => setError(String(e))) }, [])

  // Recalcular acá y no al leer el archivo: así «Darles el permiso» saca las
  // filas del error sin que haya que volver a subir el Excel.
  const resueltas = useMemo(
    () => resolverPlanilla(filas, personas, otorgar),
    [filas, personas, otorgar])

  const validas    = resueltas.filter(r => r.errores.length === 0 && r.persona)
  const conError   = resueltas.filter(r => r.errores.length > 0)
  const cambianMail = validas.filter(r => r.correoNuevo)
  const faltaPermiso = sinPermisoAprobar(resueltas)

  async function darPermiso() {
    const r = await otorgarPermisoAprobar(faltaPermiso.map(p => p.id))
    if (r.errores.length) avisar(r.errores.join('. '), 'error')
    setPersonas(await personasParaPlanilla())
    setOtorgar(new Set())   // ya está en la base: el recálculo lo toma de ahí
  }

  async function cargar() {
    const aviso = cambianMail.length
      ? `Se van a actualizar ${validas.length} empleados, y ${cambianMail.length} cambia de correo de acceso. ¿Seguimos?`
      : `Se van a actualizar ${validas.length} empleados. ¿Seguimos?`
    if (!await confirmar(aviso)) return
    setCargando(true)
    try {
      const r = await cargarPlanillaAlta(validas.map(v => filas[v.fila - 1]))
      setFallidas(r.fallidas)
      avisar(`Se cargaron ${r.cargadas} empleados`)
      if (!r.fallidas.length) onDone()
    } catch (e) {
      avisar(String(e instanceof Error ? e.message : e), 'error')
    } finally { setCargando(false) }
  }
  // … el render, según el Artifact
}
```

  Render según el Artifact:
  - Resumen: válidas, con error, y cuántas cambian de correo.
  - Bloque de `sinPermisoAprobar(resueltas)` con el botón, solo si hay alguna.
  - Tabla: las válidas con sus datos; las que fallan, con el motivo en `text-warning-700`
    y fondo `bg-danger-50`; el cambio de correo con el anterior al lado.
  - Pie: «Cancelar» y «Cargar las N válidas».
  - Materiales: `.hoja` para la tabla y las tarjetas, `rounded-item` / `rounded-card`,
    íconos Lucide, **ningún hexadecimal**.

- [ ] **Step 5: Enviar.** El botón manda **solo las filas sin errores** a
  `cargarPlanillaAlta`. Con el resultado: `avisar()` con «Se cargaron N empleados» y, si
  `fallidas.length`, mostrarlas en pantalla (no en el aviso, que se va solo). Después
  `onDone()`.

- [ ] **Step 6: El panel en `/admin/employees/page.tsx`**
  - Línea ~50: `useState<'none' | 'add' | 'import'>` → `useState<'none' | 'add' | 'import' | 'planilla'>`.
  - Junto al botón «Importar nómina» (~348), uno nuevo «Cargar planilla» con
    `setPanel(p => p === 'planilla' ? 'none' : 'planilla')`.
  - Junto al panel de `EmployeeImport` (~374):

```tsx
{panel === 'planilla' && (
  <div className="hoja p-5 mb-4">
    <h2 className="text-sm font-semibold text-ink-800 mb-4">Cargar planilla de alta</h2>
    <PlanillaAlta onDone={() => { setPanel('none'); load() }} />
  </div>
)}
```

- [ ] **Step 7: Verificar**

```bash
npx vitest run
npx tsc --noEmit -p .
npx eslint src/components/admin/PlanillaAlta.tsx "src/app/(app)/admin/employees/page.tsx"
npx next build
```

Esperado: 46 pruebas, typecheck limpio, lint sin errores, build con código 0.

- [ ] **Step 8: Probarla con un archivo de verdad, antes de commitear.** Armar un Excel
  de 3 filas: una buena, una con el RUT que no existe y una con un aprobador ambiguo.
  Comprobar que entra solo la buena y que las otras dos explican por qué. **Mostrarle la
  pantalla a Daniel con datos reales.**

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/PlanillaAlta.tsx "src/app/(app)/admin/employees/page.tsx"
git commit -m "feat(planilla): la pantalla de carga, con vista previa y errores por fila"
```

---

## Tarea 8: Cerrar

- [ ] **Step 1: Correr todo**

```bash
npx vitest run
npx eslint .
npx next build
npm run audit:materiales
```

Esperado: 46 pruebas · `0 errors` · build limpio · materiales **2 passed**. Si el audit
encuentra texto oscuro sobre el degradado, es que algo de la pantalla nueva quedó fuera
de una `.hoja`: arreglarlo antes de seguir.

- [ ] **Step 2: Desplegar** con Daniel en «pedir aprobación»: `merge --ff-only`,
  `push origin main`, y confirmar con `get_deployment` que el commit queda `READY` con el
  alias `www.mi-rendicion.com`. **No sondear el dominio con `curl` en bucle**: dispara el
  escudo anti-bot de Vercel y parece que la app se cayó.

- [ ] **Step 3: La carga de verdad.** Daniel arma la planilla con los datos de RR.HH. y la
  sube. Comprobar después, en la base:

```sql
select count(*) filter (where can_submit and approver_l1_id is null)  as rinden_sin_n1,
       count(*) filter (where can_submit and (rut is null or bank_name is null or bank_account is null)) as rinden_sin_banco
from public.users where deleted_at is null and blocked_at is null and is_active;
```

Hecho cuando `rinden_sin_n1 = 0` (o solo quienes Daniel decida que no rinden, con
`can_submit = false`) y `rinden_sin_banco = 0`.

- [ ] **Step 4: Regenerar la línea base visual**, porque `/admin/employees` cambia:
  `npm run baseline:verificar` primero y **mirar el reporte antes de recapturar** — un
  rojo inesperado puede ser un defecto real, como pasó el 2026-10-01 con el paginador de
  auditoría. Después `npm run baseline:crear` y commitear `e2e/baseline/`.

- [ ] **Step 5: Actualizar la documentación.** En el SKILL.md: la planilla en «Estructura
  de carpetas» y en el estado del proyecto. En la hoja de ruta: marcar la Tarea 3.2,
  agregar la fila al «Registro de avance» y sacar del backlog lo que corresponda.
  Commit `docs(contexto): …`.

---

## Notas para quien implemente

- **El texto de los errores es producto, no detalle.** Quien lee «No se encontró al
  aprobador "Perez"» tiene que saber qué corregir. Si un mensaje no dice qué hacer,
  cambiarlo.
- **Los aprobadores se resuelven contra el estado actual de la base**, no contra lo que la
  planilla va a escribir. Por eso el orden de las filas no cambia el resultado.
- **No agregar un `confirm()` nativo** antes de cargar: `confirmar()` de
  `@/components/ui/Dialogos`. Quedan 0 nativos en `src/` y no debe volver a entrar uno.
- Si en el camino aparece que hace falta una migración, **parar**: este plan no toca la
  base. La columna `rut` ya existe, y `can_approve` también.
