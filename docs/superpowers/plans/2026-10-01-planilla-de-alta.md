# Planilla de alta — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sola carga de empleados desde Excel —que crea a quien no está y completa a
quien sí— con vista previa fila por fila y alertas de segregación de funciones.

**Architecture:** Helpers puros en `src/lib/` (sin `'use server'`), que consumen tanto la
vista previa en el navegador como la acción del servidor, que **vuelve a resolver y
validar** antes de escribir. Las reglas de la cadena se extraen de
`setEmployeeApprovalChain` a `src/lib/cadena-aprobacion.ts` para que no existan en dos
sitios. La pantalla es un panel más de `/admin/employees`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase, SheetJS
(`xlsx`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-planilla-de-alta-design.md`

## Global Constraints

- `src/actions/*.ts`: toda función exportada es `async`. Los helpers puros van en
  `src/lib/`, y los tests importan desde ahí, nunca desde `src/actions/`.
- Un módulo común de servidor va en `src/lib/` **sin** `'use server'`: exportado desde una
  acción, cualquier sesión lo invoca con los argumentos que quiera.
- Todo `.update()` / `.delete()` encadena `.select('id')` y lanza si vuelve vacío — sin
  política RLS, Postgres no da error: afecta 0 filas y Supabase devuelve éxito.
- Errores esperados: el motivo que ve la persona sale de un **valor devuelto**, no de un
  `throw`. En producción Next puede ocultar el mensaje.
- Textos en español. Nunca `confirm()` / `alert()`: `confirmar()` / `avisar()`.
- Diseño: materiales `.hoja` / `.tor-glass`, `rounded-item` / `rounded-card`, íconos
  Lucide, **ningún hexadecimal en componentes**.
- Commits desde PowerShell con here-string (`git commit -m @'…'@`, cierre `'@` en columna 0).
- Línea de partida (2026-10-01): 417 pruebas en 32 archivos, `npx eslint .` con 0 errores
  y 22 avisos, build limpio.

## Datos medidos en la base el 2026-10-01

- 57 activos · 50 sin N1 · 56 sin banco completo · 5 con `can_approve`.
- **55 de 57 tienen RUT**, los 55 **con puntos**, **5 con la `k` en minúscula**, y **no
  hay restricción de unicidad** sobre `users.rut`.
- Ya existen **1 persona con los dos permisos bancarios** y **1 cadena circular**: las
  alertas de la Tarea 6 tienen un caso real cada una desde el primer día.
- `cargarPersonas()` de `contexto-permisos.ts` **no trae `rut` ni el correo**; el correo
  vive en `auth.users`.

## Fixture compartido de los tests

Las tareas 2 a 6 comparten este ayudante. Se escribe una sola vez, en la Tarea 2, al
principio de `src/tests/planilla-alta.test.ts`:

```ts
import type { Persona } from '@/lib/planilla-alta'

export const p = (x: Partial<Persona> & { id: string }): Persona => ({
  nombre: '', correo: '', rut: null, activo: true, can_approve: false,
  can_load_bank_transfer: false, can_authorize_bank_transfer: false,
  approver_l1_id: null, approver_l2_id: null,
  ...x,
})
```

---

## Tarea 1: Normalizar RUT y nombres

**Files:**
- Create: `src/lib/planilla-alta.ts`
- Test: `src/tests/planilla-alta.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `normalizarRut(rut: string): string` (comparar: sin puntos, DV mayúscula, con
  guión) · `formatearRut(rut: string): string` (guardar: con puntos) ·
  `normalizarNombre(nombre: string): string`.

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

- [ ] **Step 2: Correr y ver que falla por importación**

```bash
npx vitest run src/tests/planilla-alta.test.ts
```

Esperado: FAIL, «Failed to resolve import "@/lib/planilla-alta"». Es la única vez que un
fallo por importación es el esperado: el archivo todavía no existe.

- [ ] **Step 3: Escribir `src/lib/planilla-alta.ts`**

```ts
// Carga de empleados desde un Excel: crea a quien no está y completa a quien sí.
// Helpers puros: los usa la vista previa en el navegador Y la acción del
// servidor, que vuelve a resolver todo antes de escribir — el navegador no es
// fuente de verdad. Módulo común, SIN 'use server'.
//
// Spec: docs/superpowers/specs/2026-10-01-planilla-de-alta-design.md

// Para COMPARAR. En la base los 55 RUT están con puntos y 5 con la k en
// minúscula, así que sin normalizar los dos lados no se encuentra nada.
export function normalizarRut(rut: string): string {
  const limpio = rut.trim().toUpperCase().replace(/[^0-9K]/g, '')
  if (limpio.length < 2) return ''
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`
}

// Para GUARDAR: con puntos, el formato que ya tienen los 55 y el que espera el
// export a Defontana (toSheetRut).
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

- [ ] **Step 4: Correr y ver que pasan** — `npx vitest run src/tests/planilla-alta.test.ts`. Esperado: PASS (11).

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
- Consumes: Tarea 1.
- Produces: el tipo `Persona`, `resolverPersona(valor, personas, por)` y
  `resolverAprobador(valor, personas)`, los dos devolviendo
  `{ persona: Persona | null; ambiguas: Persona[] }`.

> **Hay dos tipos llamados `Persona` y conviene saberlo antes de pelearse con el
> compilador.** El de `@/lib/permisos` es el que pide `validarCadena`
> (`{ id, nombre, activo, can_approve, … }`); el de acá le agrega `correo`, `rut`, los dos
> permisos bancarios y los dos aprobadores. **No hay que convertir entre ellos**:
> TypeScript compara por forma, así que el de la planilla entra tal cual donde se espera
> el de `permisos`. No importar los dos en el mismo archivo con el mismo nombre.

- [ ] **Step 1: Escribir el fixture y las pruebas que fallan** — agregar al test:

```ts
import { resolverPersona, resolverAprobador, type Persona } from '@/lib/planilla-alta'

export const p = (x: Partial<Persona> & { id: string }): Persona => ({
  nombre: '', correo: '', rut: null, activo: true, can_approve: false,
  can_load_bank_transfer: false, can_authorize_bank_transfer: false,
  approver_l1_id: null, approver_l2_id: null,
  ...x,
})

const PERSONAS: Persona[] = [
  p({ id: 'u1', nombre: 'Salas Rodrigo',  correo: 'rodrigo.salas@penta.cl', rut: '11.111.111-1', can_approve: true }),
  p({ id: 'u2', nombre: 'Méndez Carla',   correo: 'carla.mendez@penta.cl',  rut: '12.345.678-k' }),
  p({ id: 'u3', nombre: 'Pérez Soto Ana', correo: 'ana.perez@penta.cl',     rut: '22.222.222-2' }),
  p({ id: 'u4', nombre: 'Pérez Soto Ana', correo: 'a.perez@penta.cl' }),
  p({ id: 'u5', nombre: 'Rojas Inactivo', correo: 'rojas@penta.cl', rut: '66.666.666-6', activo: false, can_approve: true }),
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
    expect(r.ambiguas.map(x => x.id)).toEqual(['u3', 'u4'])
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

- [ ] **Step 2: Correr y ver que fallan** — FAIL por aserción, con las 11 de la Tarea 1 en verde.

- [ ] **Step 3: Implementar** — agregar a `src/lib/planilla-alta.ts`:

```ts
export type Persona = {
  id: string; nombre: string; correo: string; rut: string | null
  activo: boolean; can_approve: boolean
  can_load_bank_transfer: boolean; can_authorize_bank_transfer: boolean
  approver_l1_id: string | null; approver_l2_id: string | null
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

  const coinciden = personas.filter(x => x.activo).filter(x =>
    por === 'rut'    ? x.rut !== null && normalizarRut(x.rut) === buscado
  : por === 'correo' ? x.correo.trim().toLowerCase() === buscado
  :                    normalizarNombre(x.nombre) === buscado)

  if (coinciden.length === 1) return { persona: coinciden[0], ambiguas: [] }
  return { persona: null, ambiguas: coinciden.length > 1 ? coinciden : [] }
}

// Quien arma la planilla escribe lo que tiene a mano: el correo es inequívoco,
// el nombre es cómodo. Se decide por el arroba.
export function resolverAprobador(
  valor: string, personas: Persona[],
): { persona: Persona | null; ambiguas: Persona[] } {
  const v = valor.trim()
  if (!v) return { persona: null, ambiguas: [] }
  return resolverPersona(v, personas, v.includes('@') ? 'correo' : 'nombre')
}
```

- [ ] **Step 4: Correr y ver que pasan** — PASS (22).

- [ ] **Step 5: Commit**

```bash
git add src/lib/planilla-alta.ts src/tests/planilla-alta.test.ts
git commit -m "feat(planilla): resolver a una persona por RUT, correo o nombre"
```

---

## Tarea 3: Resolver el centro de costo

**Files:**
- Modify: `src/lib/planilla-alta.ts`
- Test: `src/tests/planilla-alta.test.ts`

**Interfaces:**
- Consumes: `normalizarNombre` de la Tarea 1.
- Produces:

```ts
export type CentroCosto = { id: string; codigo: string; nombre: string }
export function resolverCentroCosto(
  valor: string, centros: CentroCosto[],
): { centro: CentroCosto | null; parecidos: CentroCosto[] }
```

- [ ] **Step 1: Escribir las pruebas que fallan** — agregar al test:

```ts
import { resolverCentroCosto, type CentroCosto } from '@/lib/planilla-alta'

const CENTROS: CentroCosto[] = [
  { id: 'c1', codigo: '45103010013', nombre: 'Administración' },
  { id: 'c2', codigo: '45103010020', nombre: 'Operaciones Norte' },
  { id: 'c3', codigo: '45103010021', nombre: 'Operaciones Sur' },
]

describe('resolverCentroCosto', () => {
  it('encuentra por código', () => {
    expect(resolverCentroCosto('45103010013', CENTROS).centro?.id).toBe('c1')
  })
  it('encuentra por nombre, sin tildes ni mayúsculas', () => {
    expect(resolverCentroCosto('ADMINISTRACION', CENTROS).centro?.id).toBe('c1')
  })
  it('una celda vacía no resuelve nada y no es un error', () => {
    const r = resolverCentroCosto('  ', CENTROS)
    expect(r.centro).toBeNull()
    expect(r.parecidos).toEqual([])
  })
  // Para que el error diga «¿quisiste decir…?» en vez de solo «no existe»
  it('sin coincidencia sugiere los parecidos', () => {
    const r = resolverCentroCosto('Operaciones', CENTROS)
    expect(r.centro).toBeNull()
    expect(r.parecidos.map(c => c.id)).toEqual(['c2', 'c3'])
  })
})
```

- [ ] **Step 2: Correr y ver que fallan** — FAIL por aserción.

- [ ] **Step 3: Implementar** — agregar a `src/lib/planilla-alta.ts`:

```ts
export type CentroCosto = { id: string; codigo: string; nombre: string }

// Acepta el código o el nombre. Sin coincidencia exacta, devuelve los que
// contienen lo escrito, para que el error pueda sugerir en vez de solo negar.
export function resolverCentroCosto(
  valor: string, centros: CentroCosto[],
): { centro: CentroCosto | null; parecidos: CentroCosto[] } {
  const v = valor.trim()
  if (!v) return { centro: null, parecidos: [] }

  const porCodigo = centros.find(c => c.codigo.replace(/\./g, '') === v.replace(/\./g, ''))
  if (porCodigo) return { centro: porCodigo, parecidos: [] }

  const buscado = normalizarNombre(v)
  const exacto = centros.find(c => normalizarNombre(c.nombre) === buscado)
  if (exacto) return { centro: exacto, parecidos: [] }

  return {
    centro: null,
    parecidos: centros.filter(c => normalizarNombre(c.nombre).includes(buscado)).slice(0, 5),
  }
}
```

- [ ] **Step 4: Correr y ver que pasan** — PASS (26).

- [ ] **Step 5: Commit**

```bash
git add src/lib/planilla-alta.ts src/tests/planilla-alta.test.ts
git commit -m "feat(planilla): resolver el centro de costo por código o por nombre"
```

---

## Tarea 4: El parche — una celda vacía nunca borra

**Files:**
- Modify: `src/lib/planilla-alta.ts`
- Test: `src/tests/planilla-alta.test.ts`

**Interfaces:**
- Consumes: `Persona`, `CentroCosto`, `formatearRut`.
- Produces: `FilaPlanilla`, `ParcheEmpleado`, y
  `parcheDeFila(fila, persona, n1, n2, centro): ParcheEmpleado`.

- [ ] **Step 1: Escribir las pruebas que fallan** — agregar al test:

```ts
import { parcheDeFila, type FilaPlanilla } from '@/lib/planilla-alta'

const VACIA: FilaPlanilla = {
  nombre: '', rut: '', correo: '', cargo: '', centroCosto: '', rol: '',
  n1: '', n2: '', banco: '', tipoCuenta: '', numeroCuenta: '',
}
const CON_RUT = p({ id: 'x1', nombre: 'Con Rut', correo: 'c@p.cl', rut: '11.111.111-1' })
const SIN_RUT = p({ id: 'x2', nombre: 'Sin Rut', correo: 's@p.cl' })

describe('parcheDeFila: vacío nunca borra', () => {
  it('una planilla toda vacía no cambia nada', () => {
    expect(parcheDeFila(VACIA, CON_RUT, null, null, null)).toEqual({})
  })
  it('solo entra lo que viene con valor', () => {
    const fila = { ...VACIA, banco: 'Banco de Chile', numeroCuenta: '00012345678', cargo: 'Jefe de Obra' }
    expect(parcheDeFila(fila, CON_RUT, null, null, null)).toEqual({
      bank_name: 'Banco de Chile', bank_account: '00012345678', department: 'Jefe de Obra',
    })
  })
  it('una celda con solo espacios cuenta como vacía', () => {
    expect(parcheDeFila({ ...VACIA, banco: '   ' }, CON_RUT, null, null, null)).toEqual({})
  })
  it('los aprobadores y el centro entran por id, no por lo que diga la celda', () => {
    const fila = { ...VACIA, n1: 'Salas Rodrigo', centroCosto: 'Administración' }
    const n1 = p({ id: 'u1', nombre: 'Salas Rodrigo', can_approve: true })
    const centro: CentroCosto = { id: 'c1', codigo: '45103010013', nombre: 'Administración' }
    expect(parcheDeFila(fila, CON_RUT, n1, null, centro)).toEqual({
      approver_l1_id: 'u1', cost_center_id: 'c1',
    })
  })
  it('el RUT se graba solo a quien no lo tenía, y con puntos', () => {
    expect(parcheDeFila({ ...VACIA, rut: '22222222-2' }, SIN_RUT, null, null, null))
      .toEqual({ rut: '22.222.222-2' })
  })
  it('a quien ya tiene RUT no se le reescribe', () => {
    expect(parcheDeFila({ ...VACIA, rut: '11.111.111-1' }, CON_RUT, null, null, null)).toEqual({})
  })
  // Una planilla de RR.HH. con el nombre escrito distinto no debe renombrar a nadie
  it('el nombre NUNCA entra al actualizar', () => {
    expect(parcheDeFila({ ...VACIA, nombre: 'Otro Nombre' }, CON_RUT, null, null, null)).toEqual({})
  })
  it('el rol se normaliza a minúsculas', () => {
    expect(parcheDeFila({ ...VACIA, rol: 'Approver' }, CON_RUT, null, null, null))
      .toEqual({ role: 'approver' })
  })
})
```

- [ ] **Step 2: Correr y ver que fallan** — FAIL por aserción (8 nuevas).

- [ ] **Step 3: Implementar** — agregar a `src/lib/planilla-alta.ts`:

```ts
export type FilaPlanilla = {
  nombre: string; rut: string; correo: string
  cargo: string; centroCosto: string; rol: string
  n1: string; n2: string
  banco: string; tipoCuenta: string; numeroCuenta: string
}

// Solo las claves que la fila trae con valor. Una clave ausente y una clave en
// null son cosas distintas, y acá la segunda no existe: así «vacío nunca borra»
// lo hace cumplir el tipo y no la disciplina de quien escribe.
export type ParcheEmpleado = Partial<{
  approver_l1_id: string; approver_l2_id: string
  rut: string; department: string; cost_center_id: string; role: string
  bank_name: string; bank_account_type: string; bank_account: string
}>

export const ROLES = ['admin', 'approver', 'employee'] as const

// `persona` es null cuando la fila CREA a alguien: ahí todo el parche entra,
// incluido el RUT, porque no hay nada previo que respetar. Sin este null, una
// cuenta nueva nacería sin cargo, sin banco y sin aprobadores.
export function parcheDeFila(
  fila: FilaPlanilla,
  persona: Persona | null,
  n1: Persona | null,
  n2: Persona | null,
  centro: CentroCosto | null,
): ParcheEmpleado {
  const parche: ParcheEmpleado = {}
  const texto = (v: string) => { const t = v.trim(); return t === '' ? null : t }

  if (n1) parche.approver_l1_id = n1.id
  if (n2) parche.approver_l2_id = n2.id
  if (centro) parche.cost_center_id = centro.id

  // El RUT identifica: se graba solo a quien no lo tenía, nunca se reescribe.
  if (!persona?.rut && texto(fila.rut)) parche.rut = formatearRut(fila.rut)

  // `nombre` NO entra: renombrar es otra operación (spec).
  const cargo  = texto(fila.cargo)
  const rol    = texto(fila.rol)
  const banco  = texto(fila.banco)
  const tipo   = texto(fila.tipoCuenta)
  const numero = texto(fila.numeroCuenta)
  if (cargo)  parche.department        = cargo
  if (rol)    parche.role              = rol.toLowerCase()
  if (banco)  parche.bank_name         = banco
  if (tipo)   parche.bank_account_type = tipo
  if (numero) parche.bank_account      = numero

  return parche
}
```

- [ ] **Step 4: Correr y ver que pasan** — PASS (34).

- [ ] **Step 5: Commit**

```bash
git add src/lib/planilla-alta.ts src/tests/planilla-alta.test.ts
git commit -m "feat(planilla): el parche de una fila, donde una celda vacía nunca borra"
```

---

## Tarea 5: Resolver la planilla entera

**Files:**
- Modify: `src/lib/planilla-alta.ts`
- Test: `src/tests/planilla-alta.test.ts`

**Interfaces:**
- Consumes: todo lo anterior, `validateRut` de `@/lib/validators`, `validarCadena` de
  `@/lib/permisos`.
- Produces: `FilaResuelta`, `resolverPlanilla(filas, personas, centros, permisosPorOtorgar?)`,
  `sinPermisoAprobar(resueltas)`.

- [ ] **Step 1: Escribir las pruebas que fallan** — agregar al test:

```ts
import { resolverPlanilla, sinPermisoAprobar } from '@/lib/planilla-alta'

const fila = (x: Partial<FilaPlanilla>): FilaPlanilla => ({ ...VACIA, ...x })
const resolver = (fs: FilaPlanilla[], permisos?: Set<string>) =>
  resolverPlanilla(fs, PERSONAS, CENTROS, permisos)

describe('resolverPlanilla: crear o actualizar', () => {
  it('un RUT que está en la base actualiza', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', banco: 'BCI' })])
    expect(r.accion).toBe('actualizar')
    expect(r.persona?.id).toBe('u1')
    expect(r.parche).toEqual({ bank_name: 'BCI' })
    expect(r.errores).toEqual([])
  })

  it('un RUT que no está, con nombre y correo, crea', () => {
    const [r] = resolver([fila({ rut: '99.999.990-5', nombre: 'Nueva Persona', correo: 'nueva@penta.cl' })])
    expect(r.accion).toBe('crear')
    expect(r.nuevo).toEqual({ nombre: 'Nueva Persona', correo: 'nueva@penta.cl', rut: '99.999.990-5' })
    expect(r.errores).toEqual([])
  })

  // Sin esto una cuenta nueva nacería vacía: sin cargo, sin banco y sin jefe
  it('al crear, el parche trae TODO lo de la fila', () => {
    const [r] = resolver([fila({
      rut: '99.999.990-5', nombre: 'Nueva Persona', correo: 'nueva@penta.cl',
      cargo: 'Prevencionista', centroCosto: '45103010013',
      n1: 'rodrigo.salas@penta.cl', banco: 'BCI', numeroCuenta: '123',
    })])
    expect(r.accion).toBe('crear')
    expect(r.parche).toEqual({
      department: 'Prevencionista', cost_center_id: 'c1',
      approver_l1_id: 'u1', bank_name: 'BCI', bank_account: '123',
      rut: '99.999.990-5',
    })
  })

  it('crear sin nombre o sin correo es error', () => {
    const [sinNombre] = resolver([fila({ rut: '99.999.990-5', correo: 'x@penta.cl' })])
    expect(sinNombre.errores.join(' ')).toContain('nombre y su correo')
    const [sinCorreo] = resolver([fila({ rut: '99.999.990-5', nombre: 'X' })])
    expect(sinCorreo.errores.join(' ')).toContain('nombre y su correo')
  })

  it('un RUT con el dígito verificador malo no busca a nadie', () => {
    const [r] = resolver([fila({ rut: '11.111.111-9' })])
    expect(r.errores.join(' ')).toContain('dígito verificador')
  })

  it('si el RUT no está, el correo lo encuentra igual y actualiza', () => {
    const [r] = resolver([fila({ rut: '99.999.990-5', correo: 'a.perez@penta.cl' })])
    expect(r.accion).toBe('actualizar')
    expect(r.persona?.id).toBe('u4')
    expect(r.parche.rut).toBe('99.999.990-5')   // u4 no tenía RUT: se le graba
  })

  it('una persona con OTRO rut es error, no una corrección', () => {
    const [r] = resolver([fila({ rut: '99.999.990-5', correo: 'carla.mendez@penta.cl' })])
    expect(r.errores.join(' ')).toContain('otro RUT')
  })

  it('un aprobador ambiguo nombra a las candidatas', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', n1: 'Pérez Soto Ana' })])
    expect(r.errores.join(' ')).toContain('coincide con 2 personas')
  })

  it('un centro de costo que no existe sugiere los parecidos', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', centroCosto: 'Operaciones' })])
    expect(r.errores.join(' ')).toContain('Operaciones Norte')
  })

  it('un rol desconocido es error', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', rol: 'jefazo' })])
    expect(r.errores.join(' ')).toContain('Rol')
  })

  it('un aprobador sin el permiso «aprueba» da error…', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', n1: 'carla.mendez@penta.cl' })])
    expect(r.errores.join(' ')).toContain('aprueba')
  })

  it('…y deja de darlo cuando su permiso está por otorgarse', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', n1: 'carla.mendez@penta.cl' })], new Set(['u2']))
    expect(r.errores).toEqual([])
    expect(r.parche.approver_l1_id).toBe('u2')
  })

  it('una fila mala no contamina a las buenas', () => {
    const rs = resolver([fila({ rut: '11.111.111-9' }), fila({ rut: '11.111.111-1', banco: 'BCI' })])
    expect(rs[0].errores.length).toBeGreaterThan(0)
    expect(rs[1].errores).toEqual([])
  })

  it('el mismo RUT en dos filas marca las dos', () => {
    const rs = resolver([fila({ rut: '11.111.111-1' }), fila({ rut: '11111111-1' })])
    expect(rs[0].errores.join(' ')).toContain('Dos filas')
    expect(rs[1].errores.join(' ')).toContain('Dos filas')
  })

  it('un correo distinto del actual se marca como cambio de acceso', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', correo: 'nuevo@penta.cl' })])
    expect(r.correoNuevo).toBe('nuevo@penta.cl')
    expect(r.errores).toEqual([])
  })

  it('un correo que ya usa otra persona es error', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1', correo: 'carla.mendez@penta.cl' })])
    expect(r.errores.join(' ')).toContain('ya lo usa')
  })

  it('una fila sin nada que cambiar no hace nada', () => {
    const [r] = resolver([fila({ rut: '11.111.111-1' })])
    expect(r.accion).toBe('ninguna')
  })
})

describe('sinPermisoAprobar', () => {
  it('junta a los aprobadores sin permiso, sin repetirlos', () => {
    const rs = resolver([
      fila({ rut: '11.111.111-1', n1: 'carla.mendez@penta.cl' }),
      fila({ rut: '22.222.222-2', n1: 'carla.mendez@penta.cl' }),
    ])
    expect(sinPermisoAprobar(rs).map(x => x.id)).toEqual(['u2'])
  })
})
```

- [ ] **Step 2: Correr y ver que fallan** — FAIL por aserción (17 nuevas).

- [ ] **Step 3: Implementar** — agregar a `src/lib/planilla-alta.ts`:

```ts
import { validateRut } from '@/lib/validators'
import { validarCadena } from '@/lib/permisos'

export type FilaResuelta = {
  fila: number
  accion: 'crear' | 'actualizar' | 'ninguna'
  persona: Persona | null
  n1: Persona | null; n2: Persona | null
  correoNuevo: string | null
  parche: ParcheEmpleado
  nuevo: { nombre: string; correo: string; rut: string } | null
  errores: string[]
}

// Los errores NO cortan en el primero: se juntan todos, para que quien corrige
// el Excel no tenga que hacerlo en varias pasadas.
export function resolverPlanilla(
  filas: FilaPlanilla[],
  personas: Persona[],
  centros: CentroCosto[],
  permisosPorOtorgar: Set<string> = new Set(),
): FilaResuelta[] {
  // Los duplicados DENTRO de la planilla se cuentan primero: una fila no puede
  // saber sola que otra trae su mismo RUT.
  const vecesRut    = new Map<string, number>()
  const vecesCorreo = new Map<string, number>()
  for (const f of filas) {
    const r = normalizarRut(f.rut); if (r) vecesRut.set(r, (vecesRut.get(r) ?? 0) + 1)
    const c = f.correo.trim().toLowerCase(); if (c) vecesCorreo.set(c, (vecesCorreo.get(c) ?? 0) + 1)
  }

  // Un permiso por otorgar ya cuenta como dado: así el botón «Darles el
  // permiso» saca las filas del error sin volver a subir el archivo.
  const conPermisos = personas.map(x =>
    permisosPorOtorgar.has(x.id) ? { ...x, can_approve: true } : x)

  return filas.map((f, i) => {
    const errores: string[] = []
    const rutNorm = normalizarRut(f.rut)
    const correo  = f.correo.trim().toLowerCase()

    if (rutNorm && vecesRut.get(rutNorm)! > 1)   errores.push('Dos filas traen el mismo RUT')
    if (correo  && vecesCorreo.get(correo)! > 1) errores.push('Dos filas traen el mismo correo')

    // ── A quién le escribimos ────────────────────────────────────────────────
    let persona: Persona | null = null
    let crear = false
    if (!f.rut.trim()) {
      errores.push('Falta el RUT, que es lo que identifica a la persona')
    } else if (!validateRut(f.rut)) {
      errores.push(`RUT inválido "${f.rut.trim()}" — revisa el dígito verificador`)
    } else {
      const porRut = resolverPersona(f.rut, conPermisos, 'rut')
      if (porRut.ambiguas.length > 1) {
        errores.push(`Ese RUT lo tienen ${porRut.ambiguas.length} personas: ${porRut.ambiguas.map(x => x.nombre).join(', ')}`)
      } else if (porRut.persona) {
        persona = porRut.persona
      } else if (correo) {
        const porCorreo = resolverPersona(correo, conPermisos, 'correo')
        if (porCorreo.persona?.rut && normalizarRut(porCorreo.persona.rut) !== rutNorm) {
          errores.push(`${porCorreo.persona.nombre} está registrada con otro RUT (${porCorreo.persona.rut})`)
        } else if (porCorreo.persona) {
          persona = porCorreo.persona
        } else {
          crear = true
        }
      } else {
        crear = true
      }
      if (crear && (!f.nombre.trim() || !correo)) {
        errores.push('Para crear a alguien hacen falta su nombre y su correo')
      }
    }

    // ── Aprobadores, centro y rol ────────────────────────────────────────────
    const r1 = resolverAprobador(f.n1, conPermisos)
    const r2 = resolverAprobador(f.n2, conPermisos)
    for (const [celda, r, rol] of [[f.n1, r1, 'N1'], [f.n2, r2, 'N2']] as const) {
      if (!celda.trim()) continue
      if (r.ambiguas.length > 1) {
        errores.push(`El aprobador ${rol} "${celda.trim()}" coincide con ${r.ambiguas.length} personas: ${r.ambiguas.map(x => x.nombre).join(', ')}`)
      } else if (!r.persona) {
        errores.push(`No se encontró al aprobador ${rol} "${celda.trim()}"`)
      }
    }

    const rc = resolverCentroCosto(f.centroCosto, centros)
    if (f.centroCosto.trim() && !rc.centro) {
      errores.push(rc.parecidos.length
        ? `No existe el centro de costo "${f.centroCosto.trim()}". ¿Quisiste decir ${rc.parecidos.map(c => c.nombre).join(', ')}?`
        : `No existe el centro de costo "${f.centroCosto.trim()}"`)
    }

    const rol = f.rol.trim().toLowerCase()
    if (rol && !(ROLES as readonly string[]).includes(rol)) {
      errores.push(`Rol "${f.rol.trim()}" desconocido: usa admin, approver o employee`)
    }

    // ── El correo nuevo ──────────────────────────────────────────────────────
    let correoNuevo: string | null = null
    if (persona && correo && correo !== persona.correo.trim().toLowerCase()) {
      const dueño = conPermisos.find(x => x.id !== persona!.id && x.correo.trim().toLowerCase() === correo)
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

    // Al crear se arma igual, con persona = null: la cuenta nueva necesita su
    // cargo, su banco y sus aprobadores desde el primer momento.
    const parche = (persona || crear)
      ? parcheDeFila(f, persona, r1.persona, r2.persona, rc.centro)
      : {}
    const accion: FilaResuelta['accion'] =
      crear ? 'crear'
    : persona && (Object.keys(parche).length > 0 || correoNuevo) ? 'actualizar'
    : 'ninguna'

    return {
      fila: i + 1, accion, persona,
      n1: r1.persona, n2: r2.persona,
      correoNuevo, parche,
      nuevo: crear ? { nombre: f.nombre.trim(), correo, rut: formatearRut(f.rut) } : null,
      errores,
    }
  })
}

// Los nombrados como N1 o N2 que todavía no pueden aprobar, sin repetir.
export function sinPermisoAprobar(resueltas: FilaResuelta[]): Persona[] {
  const vistos = new Map<string, Persona>()
  for (const r of resueltas) {
    for (const x of [r.n1, r.n2]) {
      if (x && !x.can_approve && !vistos.has(x.id)) vistos.set(x.id, x)
    }
  }
  return [...vistos.values()]
}
```

- [ ] **Step 4: Correr y ver que pasan** — PASS (52). Si alguna falla por el **texto** de
  un error, ajustar el mensaje, no la prueba: el mensaje es lo que lee quien corrige el Excel.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planilla-alta.ts src/tests/planilla-alta.test.ts
git commit -m "feat(planilla): resolver la planilla entera, creando o actualizando"
```

---

## Tarea 6: Las alertas de segregación

No bloquean: en una empresa chica pueden ser deliberadas. Se calculan sobre el estado
**resultante** — la base más lo que la planilla va a escribir.

**Files:**
- Create: `src/lib/segregacion.ts`
- Test: `src/tests/segregacion.test.ts`

**Interfaces:**
- Consumes: `Persona`, `FilaResuelta` de `@/lib/planilla-alta`.
- Produces:

```ts
export type Alerta = { tipo: 'banco' | 'circular' | 'concentracion'; texto: string; personas: string[] }
export function alertasDeSegregacion(
  personas: Persona[], resueltas: FilaResuelta[], topeACargo?: number,
): Alerta[]
```

- [ ] **Step 1: Escribir las pruebas que fallan** en `src/tests/segregacion.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { alertasDeSegregacion } from '@/lib/segregacion'
import type { Persona, FilaResuelta } from '@/lib/planilla-alta'

const p = (x: Partial<Persona> & { id: string }): Persona => ({
  nombre: x.id, correo: '', rut: null, activo: true, can_approve: false,
  can_load_bank_transfer: false, can_authorize_bank_transfer: false,
  approver_l1_id: null, approver_l2_id: null,
  ...x,
})
const r = (x: Partial<FilaResuelta>): FilaResuelta => ({
  fila: 1, accion: 'actualizar', persona: null, n1: null, n2: null,
  correoNuevo: null, parche: {}, nuevo: null, errores: [],
  ...x,
})

describe('alertasDeSegregacion', () => {
  it('sin nada que alertar, no alerta', () => {
    expect(alertasDeSegregacion([p({ id: 'a' }), p({ id: 'b' })], [])).toEqual([])
  })

  it('avisa de quien carga Y autoriza pagos', () => {
    const personas = [p({ id: 'a', nombre: 'Ana', can_load_bank_transfer: true, can_authorize_bank_transfer: true })]
    const as = alertasDeSegregacion(personas, [])
    expect(as).toHaveLength(1)
    expect(as[0].tipo).toBe('banco')
    expect(as[0].personas).toEqual(['Ana'])
  })

  it('no avisa de quien tiene solo uno de los dos permisos', () => {
    const personas = [p({ id: 'a', can_load_bank_transfer: true })]
    expect(alertasDeSegregacion(personas, [])).toEqual([])
  })

  it('detecta a dos que ya se aprueban mutuamente en la base', () => {
    const personas = [
      p({ id: 'a', nombre: 'Ana',  approver_l1_id: 'b' }),
      p({ id: 'b', nombre: 'Beto', approver_l1_id: 'a' }),
    ]
    const as = alertasDeSegregacion(personas, [])
    expect(as.map(x => x.tipo)).toEqual(['circular'])
    expect(as[0].personas.sort()).toEqual(['Ana', 'Beto'])
  })

  // Lo que la base sola no ve: el otro lado del círculo lo trae la planilla
  it('detecta la circular que crea la propia planilla', () => {
    const personas = [p({ id: 'a', nombre: 'Ana' }), p({ id: 'b', nombre: 'Beto', approver_l1_id: 'a' })]
    const resueltas = [r({ persona: personas[0], parche: { approver_l1_id: 'b' } })]
    expect(alertasDeSegregacion(personas, resueltas).map(x => x.tipo)).toEqual(['circular'])
  })

  it('no reporta el mismo par dos veces', () => {
    const personas = [
      p({ id: 'a', nombre: 'Ana',  approver_l1_id: 'b' }),
      p({ id: 'b', nombre: 'Beto', approver_l1_id: 'a' }),
    ]
    expect(alertasDeSegregacion(personas, [])).toHaveLength(1)
  })

  it('avisa cuando un N1 queda con demasiada gente', () => {
    const jefe = p({ id: 'j', nombre: 'Jefa' })
    const gente = Array.from({ length: 4 }, (_, i) => p({ id: `e${i}`, approver_l1_id: 'j' }))
    const as = alertasDeSegregacion([jefe, ...gente], [], 3)
    expect(as.map(x => x.tipo)).toEqual(['concentracion'])
    expect(as[0].texto).toContain('4')
  })

  it('no avisa justo en el tope', () => {
    const jefe = p({ id: 'j', nombre: 'Jefa' })
    const gente = Array.from({ length: 3 }, (_, i) => p({ id: `e${i}`, approver_l1_id: 'j' }))
    expect(alertasDeSegregacion([jefe, ...gente], [], 3)).toEqual([])
  })
})
```

- [ ] **Step 2: Correr y ver que falla por importación**

```bash
npx vitest run src/tests/segregacion.test.ts
```

- [ ] **Step 3: Crear `src/lib/segregacion.ts`**

```ts
// Las alertas de segregación de funciones. NO bloquean: en una empresa chica
// pueden ser deliberadas (Daniel, 2026-10-01). Se calculan sobre el estado
// RESULTANTE — la base más lo que la planilla va a escribir —, porque el
// problema puede nacer justo de la carga.
//
// Los permisos bancarios NO son columnas de la planilla: se leen de la base.
// Es la forma de dar visibilidad sobre la segregación sin repartir esos
// permisos desde un Excel.

import type { Persona, FilaResuelta } from '@/lib/planilla-alta'

export type Alerta = {
  tipo: 'banco' | 'circular' | 'concentracion'
  texto: string
  personas: string[]
}

const TOPE_A_CARGO = 15

export function alertasDeSegregacion(
  personas: Persona[],
  resueltas: FilaResuelta[],
  topeACargo: number = TOPE_A_CARGO,
): Alerta[] {
  const alertas: Alerta[] = []
  const nombre = (id: string) => personas.find(x => x.id === id)?.nombre ?? id

  // El estado resultante: la cadena de cada quien, ya con el parche encima.
  const l1 = new Map<string, string | null>()
  const l2 = new Map<string, string | null>()
  for (const x of personas) { l1.set(x.id, x.approver_l1_id); l2.set(x.id, x.approver_l2_id) }
  for (const r of resueltas) {
    if (!r.persona || r.errores.length) continue
    if (r.parche.approver_l1_id) l1.set(r.persona.id, r.parche.approver_l1_id)
    if (r.parche.approver_l2_id) l2.set(r.persona.id, r.parche.approver_l2_id)
  }

  // 1. Carga Y autoriza pagos. La app impide usar ambas en el MISMO pago
  //    («quien cargó no autoriza»), pero tener las dos es lo que marca un auditor.
  const banco = personas.filter(x =>
    x.activo && x.can_load_bank_transfer && x.can_authorize_bank_transfer)
  for (const x of banco) {
    alertas.push({
      tipo: 'banco',
      texto: `${x.nombre} puede cargar y autorizar pagos`,
      personas: [x.nombre],
    })
  }

  // 2. Se aprueban mutuamente: ninguno tiene supervisión real. validarCadena no
  //    lo ve, porque mira la cadena de una persona a la vez y nunca el conjunto.
  const pares = new Set<string>()
  for (const [id] of l1) {
    for (const quien of [l1.get(id), l2.get(id)]) {
      if (!quien) continue
      if (l1.get(quien) === id || l2.get(quien) === id) {
        const par = [id, quien].sort().join('|')
        if (pares.has(par)) continue
        pares.add(par)
        alertas.push({
          tipo: 'circular',
          texto: `${nombre(id)} y ${nombre(quien)} se aprueban mutuamente`,
          personas: [nombre(id), nombre(quien)].sort(),
        })
      }
    }
  }

  // 3. Cuello de botella y punto único de falla.
  const aCargo = new Map<string, number>()
  for (const [, jefe] of l1) {
    if (jefe) aCargo.set(jefe, (aCargo.get(jefe) ?? 0) + 1)
  }
  for (const [jefe, cuantos] of aCargo) {
    if (cuantos > topeACargo) {
      alertas.push({
        tipo: 'concentracion',
        texto: `${nombre(jefe)} queda como aprobador N1 de ${cuantos} personas`,
        personas: [nombre(jefe)],
      })
    }
  }

  return alertas
}
```

- [ ] **Step 4: Correr y ver que pasan** — `npx vitest run src/tests/segregacion.test.ts`. Esperado: PASS (8).

- [ ] **Step 5: Commit**

```bash
git add src/lib/segregacion.ts src/tests/segregacion.test.ts
git commit -m "feat(planilla): alertas de segregación de funciones sobre el resultado"
```

---

## Tarea 7: Extraer las reglas de la cadena

Refactor **sin cambio de comportamiento**: hoy las reglas viven dentro de
`setEmployeeApprovalChain`. Si la planilla las copia, pasan a existir en dos sitios.

**Files:**
- Create: `src/lib/cadena-aprobacion.ts`
- Modify: `src/actions/admin.ts` — `setEmployeeApprovalChain()`
- Test: `src/tests/cadena-aprobacion.test.ts`

**Interfaces:**
- Consumes: `validarCadena` de `@/lib/permisos`.
- Produces: `Cadena`, `erroresDeCadena(empleadoId, cadena, personas): string[]`,
  `camposDeCadena(cadena)`.

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

  Y agregar el import:

```ts
import { erroresDeCadena, camposDeCadena } from '@/lib/cadena-aprobacion'
```

  Si el lint avisa que `validarCadena` ya no se usa en `admin.ts`, quitarlo del import.

- [ ] **Step 5: Correr todo** — `npx vitest run` y `npx tsc --noEmit -p .`. Esperado: 63
  pruebas (52 + 8 + 4), typecheck limpio. **Ninguna prueba existente debe cambiar**: es un
  refactor, no un cambio de comportamiento.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cadena-aprobacion.ts src/tests/cadena-aprobacion.test.ts src/actions/admin.ts
git commit -m "refactor(cadena): las reglas de la cadena de aprobación, en un solo lugar"
```

---

## Tarea 8: Las acciones del servidor

**Files:**
- Modify: `src/actions/employees.ts`

**Interfaces:**
- Consumes: `resolverPlanilla`, `FilaPlanilla`, `Persona`, `CentroCosto` de
  `@/lib/planilla-alta`; `requireAdmin`, `createAdminClient`, `logAudit` como ya los usa
  el archivo.
- Produces (las tres `async`, como exige Next 16):

```ts
export async function datosParaPlanilla(): Promise<{ personas: Persona[]; centros: CentroCosto[] }>
export async function otorgarPermisoAprobar(ids: string[]): Promise<{ ok: number; errores: string[] }>
export async function cargarPlanillaAlta(filas: FilaPlanilla[]): Promise<{
  creadas: number; actualizadas: number
  fallidas: { fila: number; nombre: string; motivo: string }[]
}>
```

- [ ] **Step 1: `datosParaPlanilla()`**

```ts
// El correo vive en auth.users, no en public.users: hay que cruzarlos. Acá SÍ
// conviene un listUsers único —son 57 y los necesitamos todos para resolver
// aprobadores por correo—, al revés que en los avisos, donde se busca uno solo.
export async function datosParaPlanilla() {
  const { orgId } = await requireAdmin()
  const admin = createAdminClient()

  const [{ data: filas, error }, { data: ccs, error: errorCc }] = await Promise.all([
    admin.from('users')
      .select('id, full_name, rut, is_active, blocked_at, deleted_at, can_approve, can_load_bank_transfer, can_authorize_bank_transfer, approver_l1_id, approver_l2_id')
      .eq('org_id', orgId),
    admin.from('cost_centers').select('id, code, name').eq('org_id', orgId),
  ])
  if (error)   throw new Error(error.message)
  if (errorCc) throw new Error(errorCc.message)

  const { data: auth } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const correos = new Map((auth?.users ?? []).map(u => [u.id, u.email ?? '']))

  return {
    personas: (filas ?? []).map(u => ({
      id: u.id, nombre: u.full_name ?? '', correo: correos.get(u.id) ?? '', rut: u.rut,
      activo: u.is_active && !u.blocked_at && !u.deleted_at,
      can_approve: u.can_approve,
      can_load_bank_transfer: u.can_load_bank_transfer,
      can_authorize_bank_transfer: u.can_authorize_bank_transfer,
      approver_l1_id: u.approver_l1_id, approver_l2_id: u.approver_l2_id,
    })),
    centros: (ccs ?? []).map(c => ({ id: c.id, codigo: c.code, nombre: c.name })),
  }
}
```

  Si los nombres de columna de `cost_centers` no son `code` / `name`, mirarlos primero con
  `select *` y ajustar el mapeo — no adivinar.

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
  const admin = createAdminClient()
  const { personas, centros } = await datosParaPlanilla()
  const resueltas = resolverPlanilla(filas, personas, centros)

  const fallidas: { fila: number; nombre: string; motivo: string }[] = []
  let creadas = 0, actualizadas = 0

  for (const r of resueltas) {
    const quien = r.persona?.nombre ?? r.nuevo?.nombre ?? `fila ${r.fila}`
    if (r.errores.length) {
      fallidas.push({ fila: r.fila, nombre: quien, motivo: r.errores.join('. ') })
      continue
    }
    if (r.accion === 'ninguna') continue

    try {
      if (r.accion === 'crear' && r.nuevo) {
        const { data: creado, error: errAuth } = await admin.auth.admin.createUser({
          email: r.nuevo.correo, email_confirm: false,
        })
        if (errAuth || !creado?.user) throw new Error(errAuth?.message ?? 'no se pudo crear la cuenta')

        const { error: errFila } = await admin.from('users').insert({
          id: creado.user.id, org_id: orgId,
          full_name: r.nuevo.nombre, rut: r.nuevo.rut,
          role: r.parche.role ?? 'employee', can_submit: true,
          ...r.parche,
        })
        if (errFila) {
          // Sin esto queda una cuenta de Auth sin perfil, que nadie puede
          // arreglar desde la app.
          await admin.auth.admin.deleteUser(creado.user.id)
          throw new Error(errFila.message)
        }
        await logAudit({
          orgId, actorId, actorName,
          action: 'created', entityType: 'user', entityId: creado.user.id,
          entityLabel: r.nuevo.nombre, newValue: { ...r.nuevo, ...r.parche },
        })
        creadas++
        continue
      }

      if (Object.keys(r.parche).length > 0) {
        const { data, error } = await supabase
          .from('users').update(r.parche)
          .eq('id', r.persona!.id).eq('org_id', orgId).select('id')
        if (error || !data?.length) throw new Error(error?.message ?? 'no se pudo guardar')
      }
      if (r.correoNuevo) {
        const { error } = await admin.auth.admin.updateUserById(
          r.persona!.id, { email: r.correoNuevo, email_confirm: true })
        if (error) throw new Error(`correo: ${error.message}`)
      }
      await logAudit({
        orgId, actorId, actorName,
        action: 'config_changed', entityType: 'user', entityId: r.persona!.id,
        entityLabel: quien,
        oldValue: { correo: r.persona!.correo, rut: r.persona!.rut },
        newValue: { ...r.parche, ...(r.correoNuevo ? { correo: r.correoNuevo } : {}) },
      })
      actualizadas++
    } catch (e) {
      fallidas.push({ fila: r.fila, nombre: quien, motivo: String(e instanceof Error ? e.message : e) })
    }
  }

  revalidatePath('/admin/employees')
  return { creadas, actualizadas, fallidas }
}
```

- [ ] **Step 4: Comprobar que compila**

```bash
npx tsc --noEmit -p .
npx eslint src/actions/employees.ts src/lib/planilla-alta.ts src/lib/segregacion.ts src/lib/cadena-aprobacion.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/employees.ts
git commit -m "feat(planilla): las acciones que cargan la planilla y otorgan el permiso"
```

---

## Tarea 9: La pantalla

**Files:**
- Create: `src/components/admin/PlanillaAlta.tsx`
- Modify: `src/app/(app)/admin/employees/page.tsx` — el estado `panel` (línea ~50), el
  botón (~348) y el panel (~374).

**Interfaces:**
- Consumes: `datosParaPlanilla`, `cargarPlanillaAlta`, `otorgarPermisoAprobar`;
  `resolverPlanilla`, `sinPermisoAprobar`, `FilaPlanilla`; `alertasDeSegregacion`;
  `useDialogos`.
- Produces: `<PlanillaAlta onDone={() => void} />`.

- [ ] **Step 1: El mapeo de cabeceras y la plantilla**, al principio del componente:

```tsx
const CABECERAS = ['Apellido y nombre', 'RUT', 'Correo', 'Cargo', 'Centro de costo', 'Rol',
  'Aprobador 1er Nivel (N1)', 'Aprobador 2do Nivel (N2)',
  'Banco', 'Tipo de Cuenta', 'N° de Cuenta']

const EJEMPLO = ['Contreras Pía', '11.111.111-1', 'pia.contreras@penta.cl',
  'Jefa de Obra', 'Administración', 'employee',
  'rodrigo.salas@penta.cl', 'Méndez Carla',
  'Banco de Chile', 'Cuenta Corriente', '00012345678']

function mapHeader(h: string): keyof FilaPlanilla | null {
  const s = h.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (['apellido y nombre', 'nombre y apellido', 'nombre', 'nombre completo'].includes(s)) return 'nombre'
  if (['rut', 'r.u.t.', 'rut empleado'].includes(s)) return 'rut'
  if (['correo', 'email', 'e-mail', 'correo electronico'].includes(s)) return 'correo'
  if (['cargo', 'puesto', 'departamento', 'area'].includes(s)) return 'cargo'
  if (['centro de costo', 'centro costo', 'cc', 'centro'].includes(s)) return 'centroCosto'
  if (['rol', 'role', 'perfil'].includes(s)) return 'rol'
  if (['aprobador 1er nivel (n1)', 'aprobador 1er nivel', 'aprobador n1', 'n1'].includes(s)) return 'n1'
  if (['aprobador 2do nivel (n2)', 'aprobador 2do nivel', 'aprobador n2', 'n2'].includes(s)) return 'n2'
  if (['banco'].includes(s)) return 'banco'
  if (['tipo de cuenta', 'tipo cuenta'].includes(s)) return 'tipoCuenta'
  if (['n° de cuenta', 'no de cuenta', 'numero de cuenta', 'cuenta'].includes(s)) return 'numeroCuenta'
  return null
}
```

  La plantilla descargable sigue el patrón de `descargarPlantilla` en `EmployeeImport`
  (`XLSX.utils.aoa_to_sheet([CABECERAS, EJEMPLO])` + `XLSX.writeFile`).

- [ ] **Step 2: La lectura del archivo.** `XLSX.read` sobre el `ArrayBuffer`,
  `sheet_to_json` con `{ defval: '' }`, mapear cada fila con `mapHeader` a `FilaPlanilla`
  (toda clave ausente queda `''`). Si ninguna cabecera mapea a `rut`, no seguir: mostrar
  «No se encontró la columna RUT» con las columnas detectadas, igual que hace
  `EmployeeImport` con «Nombre».

- [ ] **Step 3: El esqueleto del componente**, que es donde están las decisiones:

```tsx
export function PlanillaAlta({ onDone }: { onDone: () => void }) {
  const { confirmar, avisar } = useDialogos()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [centros,  setCentros]  = useState<CentroCosto[]>([])
  const [filas,    setFilas]    = useState<FilaPlanilla[]>([])
  const [otorgar,  setOtorgar]  = useState<Set<string>>(new Set())
  const [error,    setError]    = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [fallidas, setFallidas] = useState<{ fila: number; nombre: string; motivo: string }[]>([])

  useEffect(() => {
    datosParaPlanilla()
      .then(d => { setPersonas(d.personas); setCentros(d.centros) })
      .catch(e => setError(String(e)))
  }, [])

  // Recalcular acá y no al leer el archivo: así «Darles el permiso» saca las
  // filas del error sin que haya que volver a subir el Excel.
  const resueltas = useMemo(
    () => resolverPlanilla(filas, personas, centros, otorgar),
    [filas, personas, centros, otorgar])

  const validas      = resueltas.filter(r => r.errores.length === 0 && r.accion !== 'ninguna')
  const conError     = resueltas.filter(r => r.errores.length > 0)
  const porCrear     = validas.filter(r => r.accion === 'crear')
  const cambianMail  = validas.filter(r => r.correoNuevo)
  const faltaPermiso = sinPermisoAprobar(resueltas)
  const alertas      = useMemo(
    () => alertasDeSegregacion(personas, resueltas), [personas, resueltas])

  async function darPermiso() {
    const r = await otorgarPermisoAprobar(faltaPermiso.map(x => x.id))
    if (r.errores.length) avisar(r.errores.join('. '), 'error')
    const d = await datosParaPlanilla()
    setPersonas(d.personas)
    setOtorgar(new Set())   // ya está en la base: el recálculo lo toma de ahí
  }

  async function cargar() {
    const partes = [`${validas.length} empleados`]
    if (porCrear.length)    partes.push(`${porCrear.length} son cuentas NUEVAS`)
    if (cambianMail.length) partes.push(`${cambianMail.length} cambia de correo de acceso`)
    if (!await confirmar(`Se van a cargar ${partes.join(', y ')}. ¿Seguimos?`)) return

    setCargando(true)
    try {
      const r = await cargarPlanillaAlta(validas.map(v => filas[v.fila - 1]))
      setFallidas(r.fallidas)
      avisar(`Se crearon ${r.creadas} y se actualizaron ${r.actualizadas}`)
      if (!r.fallidas.length) onDone()
    } catch (e) {
      avisar(String(e instanceof Error ? e.message : e), 'error')
    } finally { setCargando(false) }
  }
  // … el render
}
```

- [ ] **Step 4: El render.** Según la vista previa aprobada
  (https://claude.ai/artifact/J93gJ35kXJkvCZ1EvCE1sk), con los bloques en este orden:
  - **Resumen:** se crean N · se actualizan M · quedan fuera K · cambian de correo J.
    Las cuentas nuevas se destacan: es lo que la versión anterior del diseño no permitía.
  - **Permisos pendientes** (`faltaPermiso`), con el botón, solo si hay alguno.
  - **Alertas** (`alertas`), en un bloque ámbar aparte, que **no impide cargar**: dice
    «Revisa antes de confirmar», no «Corrige esto».
  - **Tabla:** las válidas con sus datos; una insignia «nueva» en las que se crean; las
    que fallan con el motivo en `text-warning-700` sobre `bg-danger-50`; el cambio de
    correo con el anterior al lado.
  - **Pie:** «Cancelar» y «Cargar las N válidas».
  - Materiales: `.hoja`, `rounded-item` / `rounded-card`, Lucide, **ningún hexadecimal**.

- [ ] **Step 5: El panel en `/admin/employees/page.tsx`**
  - Línea ~50: `useState<'none' | 'add' | 'import'>` → `… | 'planilla'`.
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

- [ ] **Step 6: Verificar**

```bash
npx vitest run
npx tsc --noEmit -p .
npx eslint src/components/admin/PlanillaAlta.tsx "src/app/(app)/admin/employees/page.tsx"
npx next build
```

Esperado: 64 pruebas, typecheck limpio, lint sin errores, build con código 0.

- [ ] **Step 7: Probarla con un archivo de verdad, antes de commitear.** Un Excel de 4
  filas: una que actualiza, una que crea, una con el RUT mal (DV) y una con un aprobador
  ambiguo. Comprobar que entran las dos primeras, que las otras explican por qué, y que
  la confirmación avisa de la cuenta nueva. **Mostrarle la pantalla a Daniel.**

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/PlanillaAlta.tsx "src/app/(app)/admin/employees/page.tsx"
git commit -m "feat(planilla): la pantalla de carga, con vista previa, alertas y errores por fila"
```

---

## Tarea 10: Cerrar

- [ ] **Step 1: Correr todo**

```bash
npx vitest run
npx eslint .
npx next build
npm run audit:materiales
```

Esperado: 64 pruebas · `0 errors` · build limpio · materiales **2 passed**. Si el audit
encuentra texto oscuro sobre el degradado, algo de la pantalla nueva quedó fuera de una
`.hoja`.

- [ ] **Step 2: Desplegar** con Daniel en «pedir aprobación»: `merge --ff-only`,
  `push origin main`, y confirmar con `get_deployment` que el commit queda `READY` con el
  alias `www.mi-rendicion.com`. **No sondear el dominio con `curl` en bucle**: dispara el
  escudo anti-bot de Vercel y parece que la app se cayó.

- [ ] **Step 3: La carga de verdad.** Daniel arma la planilla con los datos de RR.HH. y la
  sube. Comprobar después:

```sql
select count(*) filter (where can_submit and approver_l1_id is null)  as rinden_sin_n1,
       count(*) filter (where can_submit and (rut is null or bank_name is null or bank_account is null)) as rinden_sin_banco
from public.users where deleted_at is null and blocked_at is null and is_active;
```

Hecho cuando `rinden_sin_n1 = 0` (o solo quienes Daniel decida que no rinden, con
`can_submit = false`) y `rinden_sin_banco = 0`.

- [ ] **Step 4: Retirar «Importar nómina»** — **solo después** de que la carga real esté
  hecha y Daniel esté conforme (decisión del 2026-10-01: no antes, para no quedarse sin
  camino si la planilla falla el día de la carga). Borrar
  `src/components/admin/EmployeeImport.tsx`, su botón y su panel en `page.tsx`, y sacar
  `'import'` del tipo de `panel`. Correr `npx eslint .` y `npx next build`.
  Commit: `chore(empleados): queda una sola carga de nómina`.

- [ ] **Step 5: Regenerar la línea base visual**, porque `/admin/employees` cambia:
  `npm run baseline:verificar` primero y **mirar el reporte antes de recapturar** — un
  rojo inesperado puede ser un defecto real, como pasó el 2026-10-01 con el paginador de
  auditoría. Después `npm run baseline:crear` y commitear `e2e/baseline/`.

- [ ] **Step 6: Actualizar la documentación.** En el SKILL.md: la planilla en «Estructura
  de carpetas» y en el estado del proyecto; que `EmployeeImport` ya no existe. En la hoja
  de ruta: marcar la Tarea 3.2, agregar la fila al «Registro de avance» y sacar del
  backlog lo que corresponda. Commit `docs(contexto): …`.

---

## Notas para quien implemente

- **El texto de los errores es producto, no detalle.** Quien lee «No se encontró al
  aprobador "Perez"» tiene que saber qué corregir. Si un mensaje no dice qué hacer,
  cambiarlo.
- **Los aprobadores se resuelven contra el estado actual de la base**, no contra lo que la
  planilla va a escribir. Por eso **alguien que la planilla crea no puede ser aprobador en
  esa misma carga**: hay que subir la planilla otra vez. Es deliberado — evita que el
  resultado dependa del orden de las filas.
- **Las alertas no bloquean.** Si alguna termina impidiendo cargar, está mal implementada.
- **No agregar un `confirm()` nativo**: `confirmar()` de `@/components/ui/Dialogos`.
  Quedan 0 nativos en `src/` y no debe volver a entrar uno.
- Si aparece que hace falta una migración, **parar**: este plan no toca la base. Todas las
  columnas que escribe ya existen.
