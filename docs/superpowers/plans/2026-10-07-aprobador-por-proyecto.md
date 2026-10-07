# Aprobador por proyecto — plan de implementación

> **Para quien ejecute:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development`
> (recomendada) o `superpowers:executing-plans` para implementarlo tarea por tarea. Los pasos
> usan casillas (`- [ ]`) para marcar avance.

**Goal:** que el aprobador de una rendición o de una caja chica salga del proyecto al que
pertenece el gasto, y no de un aprobador fijo por empleado.

**Architecture:** la cadena deja de calcularse en vivo desde `users` y pasa a **congelarse en
el documento al enviarlo**. El único punto que decide quién aprueba es `cargarCadena()` en
`src/lib/contexto-permisos.ts`; el resto del motor (`puedeActuar`, `destinatarios`,
`elegibles`, avisos, recordatorios, cola bancaria) consume la interfaz
`Cadena { l1, l2, suplenteL1Vigente }` sin enterarse del cambio. Las reglas nuevas viven en
funciones puras de `src/lib/`, testeadas con Vitest; la base las respalda con una migración
aditiva.

**Tech Stack:** Next.js 16 (App Router, `src/proxy.ts`), React 19, Tailwind v4 (`globals.css`,
sin `tailwind.config`), Supabase (proyecto `jqtbtgduqzxkgubmzukg`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-aprobador-por-proyecto-design.md`

## Global Constraints

- **Toda función exportada de `src/actions/*.ts` debe ser `async`** (Server Actions de
  Next.js 16). Los helpers puros van en `src/lib/`, y los tests importan desde ahí.
- **Nunca `export type { X }` desde un archivo `'use server'`** — Turbopack falla en runtime.
- `src/lib/supabase/types.ts`: cada tabla necesita `Relationships: []`, `Insert`/`Update`
  explícitos (nunca `Omit<Row,…>`), y `Update: Record<string, never>` en tablas append-only.
- **Nunca `confirm()` ni `alert()`**: se usan `await confirmar()` y `avisar()` de
  `@/components/ui/Dialogos`. Hoy quedan 0 nativos en `src/` y tiene que seguir así.
- **Materiales Tornasol:** `.hoja` para lo que se lee o se llena, `.tor-glass` para lo que se
  mira. Ningún dato apoyado directo sobre el degradado. Sin hexadecimales en componentes:
  los colores salen de `globals.css` o de `src/lib/design-tokens.ts`.
- `rounded-item` (14px) y `rounded-card` (18px); íconos de Lucide, nunca emoji.
- **El estado y los montos solo los escribe el servidor** con `createAdminClient()` tras
  `exigirPaso()` — la migración 033 lo impone en la base.
- **Umbral: `>=`.** Alcanzar el umbral ya escala. Así `0` significa «siempre pasa por N2» sin
  casos raros, y `null` significa «nunca».
- La migración nueva es la **039**.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/cadena-proyecto.ts` | **Nuevo.** Funciones puras: qué cadena aplica, si hace falta N2, cómo se normaliza un número de proyecto. Sin IO |
| `src/tests/cadena-proyecto.test.ts` | **Nuevo.** Sus pruebas |
| `supabase/migrations/039_aprobador_por_proyecto.sql` | **Nuevo.** Tabla `proyectos`, columnas nuevas, relleno de documentos abiertos |
| `supabase/tests/039_proyectos.sql` | **Nuevo.** Pruebas de la migración |
| `src/lib/supabase/types.ts` | Modificar: tabla `proyectos` y columnas nuevas |
| `src/lib/contexto-permisos.ts` | Modificar: `cargarCadena` lee la cadena congelada del documento |
| `src/actions/proyectos.ts` | **Nuevo.** Resolver/crear un proyecto por número, listar jefes habilitados |
| `src/actions/expenses.ts` | Modificar: `createReport` guarda proyecto; `submitReport` congela |
| `src/actions/petty-cash.ts` | Modificar: `createFund` abierto a todos; `submitFund` y `submitLiquidation` congelan |
| `src/components/expenses/SelectorProyecto.tsx` | **Nuevo.** El selector + número + jefe. Lo usan las dos pantallas de creación |
| `src/components/ui/PreviaCadena.tsx` | **Nuevo.** «Esto va a Juan Pérez…» |
| `src/lib/avisos.ts` | Modificar: aviso al jefe del beneficiario |
| `src/lib/segregacion.ts` | Modificar: las alertas miran también los jefes de proyecto |

---

## Task 1: Las reglas de la cadena, como funciones puras

**Files:**
- Create: `src/lib/cadena-proyecto.ts`
- Test: `src/tests/cadena-proyecto.test.ts`

**Interfaces:**
- Consumes: nada (es la base de todo lo demás).
- Produces: `EntradaCadena`, `CadenaResuelta`, `resolverCadena()`, `requiereN2()`,
  `normalizarNumeroProyecto()`.

- [ ] **Step 1: Escribir las pruebas que fallan** en `src/tests/cadena-proyecto.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolverCadena, requiereN2, normalizarNumeroProyecto, type EntradaCadena } from '@/lib/cadena-proyecto'

const base: EntradaCadena = {
  jefeProyecto: null, jefePropio: null, defectoOrg: null,
  n2Propio: null, n2Org: null,
  umbralPropio: null, umbralOrg: null,
  totalSolicitado: 100_000,
}

describe('resolverCadena — de dónde sale el N1', () => {
  it('el jefe de proyecto le gana a todo', () => {
    const c = resolverCadena({ ...base, jefeProyecto: 'jp', jefePropio: 'propio', defectoOrg: 'org' })
    expect(c.l1).toBe('jp')
    expect(c.origen).toBe('proyecto')
  })

  it('sin proyecto, manda el jefe propio', () => {
    const c = resolverCadena({ ...base, jefePropio: 'propio', defectoOrg: 'org' })
    expect(c.l1).toBe('propio')
    expect(c.origen).toBe('jefe-propio')
  })

  it('sin proyecto ni jefe propio, el de la organización', () => {
    const c = resolverCadena({ ...base, defectoOrg: 'org' })
    expect(c.l1).toBe('org')
    expect(c.origen).toBe('organizacion')
  })

  // Es el único caso que sigue bloqueando el envío, como hoy
  it('sin nada, no hay N1', () => {
    expect(resolverCadena(base).l1).toBeNull()
  })
})

describe('resolverCadena — cuándo aparece el N2', () => {
  it('sin umbral configurado, nunca', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', n2Propio: 'n2', totalSolicitado: 9_000_000 })
    expect(c.l2).toBeNull()
  })

  it('umbral 0 significa siempre', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', n2Propio: 'n2', umbralPropio: 0, totalSolicitado: 1 })
    expect(c.l2).toBe('n2')
  })

  it('alcanzar el umbral ya escala', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', n2Propio: 'n2', umbralPropio: 500_000, totalSolicitado: 500_000 })
    expect(c.l2).toBe('n2')
  })

  it('por debajo del umbral, no escala', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', n2Propio: 'n2', umbralPropio: 500_000, totalSolicitado: 499_999 })
    expect(c.l2).toBeNull()
  })

  // Lo que evita que configurar un umbral borre en silencio el N2 de la organización
  it('el umbral y el N2 se heredan por separado', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', umbralPropio: 100, n2Org: 'n2org', totalSolicitado: 500 })
    expect(c.l2).toBe('n2org')
  })

  it('supera el umbral pero no hay ningún N2: queda sin N2, no falla', () => {
    const c = resolverCadena({ ...base, jefePropio: 'p', umbralPropio: 100, totalSolicitado: 500 })
    expect(c.l2).toBeNull()
  })

  // Nadie puede ser su propio N2
  it('si el N2 resuelto es el mismo que el N1, se descarta', () => {
    const c = resolverCadena({ ...base, jefePropio: 'x', n2Propio: 'x', umbralPropio: 0, totalSolicitado: 1 })
    expect(c.l2).toBeNull()
  })
})

describe('requiereN2', () => {
  it('el umbral propio le gana al de la organización', () => {
    expect(requiereN2(300, 1000, 100)).toBe(false)
  })
  it('sin umbral propio, cae al de la organización', () => {
    expect(requiereN2(300, null, 100)).toBe(true)
  })
  it('sin ningún umbral, nunca', () => {
    expect(requiereN2(9_999_999, null, null)).toBe(false)
  })
})

describe('normalizarNumeroProyecto', () => {
  it('saca espacios y ceros a la izquierda', () => {
    expect(normalizarNumeroProyecto('  02991 ')).toBe('2991')
  })
  it('respeta un número que no es solo dígitos', () => {
    expect(normalizarNumeroProyecto(' A-14 ')).toBe('A-14')
  })
  it('mayúsculas, para que 2991a y 2991A sean el mismo', () => {
    expect(normalizarNumeroProyecto('2991a')).toBe('2991A')
  })
  it('vacío es vacío', () => {
    expect(normalizarNumeroProyecto('   ')).toBe('')
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan por importación**

Run: `npx vitest run src/tests/cadena-proyecto.test.ts`
Expected: FAIL — «Failed to resolve import "@/lib/cadena-proyecto"».

- [ ] **Step 3: Implementar** `src/lib/cadena-proyecto.ts`:

```ts
// Las reglas de quién aprueba, sin tocar la base. Las usa `cargarCadena()` al
// congelar la cadena de un documento, y la pantalla para previsualizarla: es la
// misma función, así que lo que el empleado ve antes de enviar es exactamente lo
// que va a pasar.
//
// Spec: docs/superpowers/specs/2026-10-07-aprobador-por-proyecto-design.md

export type OrigenCadena = 'proyecto' | 'jefe-propio' | 'organizacion' | 'ninguno'

export interface EntradaCadena {
  /** El jefe elegido, si el documento es de un proyecto */
  jefeProyecto:    string | null
  /** `users.approver_l1_id` — ahora una excepción, ya no obligatorio */
  jefePropio:      string | null
  /** `organizations.aprobador_defecto_id` */
  defectoOrg:      string | null
  n2Propio:        string | null
  n2Org:           string | null
  umbralPropio:    number | null
  umbralOrg:       number | null
  totalSolicitado: number
}

export interface CadenaResuelta {
  l1:     string | null
  l2:     string | null
  origen: OrigenCadena
}

/**
 * Si el monto alcanza el umbral que corresponde.
 *
 * `>=` y no `>`: así un umbral de 0 significa «siempre pasa por N2» sin casos
 * raros, y `null` significa «nunca». El umbral propio le gana al de la
 * organización; si no hay ninguno, no hay N2.
 */
export function requiereN2(total: number, umbralPropio: number | null, umbralOrg: number | null): boolean {
  const umbral = umbralPropio ?? umbralOrg
  if (umbral === null || umbral === undefined) return false
  return total >= umbral
}

export function resolverCadena(e: EntradaCadena): CadenaResuelta {
  const l1 =
    e.jefeProyecto ??
    e.jefePropio ??
    e.defectoOrg ??
    null

  const origen: OrigenCadena =
    e.jefeProyecto ? 'proyecto'
    : e.jefePropio ? 'jefe-propio'
    : e.defectoOrg ? 'organizacion'
    : 'ninguno'

  // El umbral y el N2 se heredan por separado a propósito: atarlos haría que
  // ponerle un umbral a una persona le borre en silencio el N2 de la organización.
  let l2: string | null = null
  if (requiereN2(e.totalSolicitado, e.umbralPropio, e.umbralOrg)) {
    l2 = e.n2Propio ?? e.n2Org ?? null
  }
  // Nadie decide dos veces el mismo documento
  if (l2 !== null && l2 === l1) l2 = null

  return { l1, l2, origen }
}

/**
 * La forma canónica de un número de proyecto, para que `2991`, ` 02991 ` y
 * `2991a` no creen tres obras distintas. El número es lo que identifica al
 * proyecto, así que esto decide qué es «el mismo».
 */
export function normalizarNumeroProyecto(valor: string): string {
  const limpio = valor.trim().toUpperCase()
  if (limpio === '') return ''
  // Solo dígitos: se quitan los ceros a la izquierda ('02991' y '2991' son el mismo)
  if (/^\d+$/.test(limpio)) return String(BigInt(limpio))
  return limpio
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run src/tests/cadena-proyecto.test.ts`
Expected: PASS, 18 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cadena-proyecto.ts src/tests/cadena-proyecto.test.ts
git commit -m "feat(cadena): las reglas de quién aprueba, como funciones puras"
```

---

## Task 2: La migración 039

**Files:**
- Create: `supabase/migrations/039_aprobador_por_proyecto.sql`
- Create: `supabase/tests/039_proyectos.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tabla `proyectos`; `users.es_jefe_proyecto`, `users.umbral_n2_clp`;
  `organizations.aprobador_defecto_id`, `.aprobador_n2_defecto_id`, `.umbral_n2_clp`;
  en `expense_reports` y `petty_cash_funds`: `proyecto_id`, `cadena_l1_id`, `cadena_l2_id`,
  `cadena_fijada_at`; en `petty_cash_funds` además `liq_cadena_l1_id`, `liq_cadena_l2_id`,
  `liq_cadena_fijada_at`.

- [ ] **Step 1: Escribir la migración.** Es **aditiva** y toda columna nueva es nullable,
      así que se aplica **ANTES del despliegue** (al revés que la 033/035/037, que protegían
      y tenían que ir después). Secciones, en este orden: tabla → RLS → políticas → relleno.

```sql
-- 039 — El aprobador sale del proyecto, y la cadena se congela en el documento.
--
-- Aditiva: todas las columnas nuevas son nullable y ningún código viejo las lee,
-- así que se aplica antes del despliegue sin romper nada.
--
-- Spec: docs/superpowers/specs/2026-10-07-aprobador-por-proyecto-design.md

-- 1. El catálogo de proyectos. Se puebla SOLO con el uso: no hay alta manual.
create table if not exists public.proyectos (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  numero     text not null,
  nombre     text,
  jefe_id    uuid references public.users(id) on delete set null,
  activo     boolean not null default true,
  creado_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proyectos_numero_por_org unique (org_id, numero)
);

create index if not exists proyectos_org_activo_idx on public.proyectos (org_id, activo);

alter table public.proyectos enable row level security;

-- Ver: cualquiera de la organización (el empleado necesita el autocompletado)
create policy proyectos_leer on public.proyectos
  for select using (org_id = public.get_my_org_id());

-- Escribir: solo el servidor con la llave de servicio, y el admin para corregir
create policy proyectos_admin on public.proyectos
  for all using (org_id = public.get_my_org_id() and public.is_admin())
  with check (org_id = public.get_my_org_id() and public.is_admin());

create trigger proyectos_updated_at before update on public.proyectos
  for each row execute function public.set_updated_at();

-- 2. Personas
alter table public.users
  add column if not exists es_jefe_proyecto boolean not null default false,
  add column if not exists umbral_n2_clp    numeric;

-- 3. Organización
alter table public.organizations
  add column if not exists aprobador_defecto_id    uuid references public.users(id) on delete set null,
  add column if not exists aprobador_n2_defecto_id uuid references public.users(id) on delete set null,
  add column if not exists umbral_n2_clp           numeric;

-- 4. La cadena congelada, en cada documento
alter table public.expense_reports
  add column if not exists proyecto_id      uuid references public.proyectos(id) on delete set null,
  add column if not exists cadena_l1_id     uuid references public.users(id) on delete set null,
  add column if not exists cadena_l2_id     uuid references public.users(id) on delete set null,
  add column if not exists cadena_fijada_at timestamptz;

alter table public.petty_cash_funds
  add column if not exists proyecto_id          uuid references public.proyectos(id) on delete set null,
  add column if not exists cadena_l1_id         uuid references public.users(id) on delete set null,
  add column if not exists cadena_l2_id         uuid references public.users(id) on delete set null,
  add column if not exists cadena_fijada_at     timestamptz,
  add column if not exists liq_cadena_l1_id     uuid references public.users(id) on delete set null,
  add column if not exists liq_cadena_l2_id     uuid references public.users(id) on delete set null,
  add column if not exists liq_cadena_fijada_at timestamptz;

-- 5. Relleno: los documentos que TODAVÍA ESPERAN DECISIÓN se congelan con la
--    cadena actual de su beneficiario. Los cerrados quedan en null: ya no se
--    evalúan, y rellenarlos solo agregaría ruido.
update public.expense_reports r
set cadena_l1_id     = u.approver_l1_id,
    cadena_l2_id     = u.approver_l2_id,
    cadena_fijada_at = coalesce(r.submitted_at, now())
from public.users u
where u.id = r.submitter_id
  and r.deleted_at is null
  and r.status in ('submitted', 'pending_l2')
  and r.cadena_fijada_at is null;

update public.petty_cash_funds f
set cadena_l1_id     = u.approver_l1_id,
    cadena_l2_id     = u.approver_l2_id,
    cadena_fijada_at = now()
from public.users u
where u.id = f.employee_id
  and f.deleted_at is null
  and f.status in ('pending_approval', 'pending_approval_l2')
  and f.cadena_fijada_at is null;

update public.petty_cash_funds f
set liq_cadena_l1_id     = u.approver_l1_id,
    liq_cadena_l2_id     = u.approver_l2_id,
    liq_cadena_fijada_at = now()
from public.users u
where u.id = f.employee_id
  and f.deleted_at is null
  and f.status in ('pending_liquidation_approval', 'pending_liquidation_l2')
  and f.liq_cadena_fijada_at is null;
```

- [ ] **Step 2: Escribir las pruebas** en `supabase/tests/039_proyectos.sql`, siguiendo el
      patrón de la 038 (tabla temporal, el resultado sale del `select` final porque
      `execute_sql` no muestra los NOTICE):

```sql
-- Pruebas de la 039. Correrlas dentro del ensayo (sin este begin/rollback) o
-- después de aplicarla. ok = false es una regla rota.
begin;

create temp table resultado (prueba text, ok boolean, detalle text) on commit drop;

-- 1. La tabla existe y el número es único por organización
insert into resultado
select '1 proyectos existe', to_regclass('public.proyectos') is not null, null;

insert into resultado
select '1b numero unico por org',
       exists (select 1 from pg_constraint where conname = 'proyectos_numero_por_org'), null;

-- 2. Las columnas nuevas están donde deben
insert into resultado
select '2 ' || t || '.' || c,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = t and column_name = c), null
from (values
  ('users','es_jefe_proyecto'), ('users','umbral_n2_clp'),
  ('organizations','aprobador_defecto_id'), ('organizations','aprobador_n2_defecto_id'),
  ('organizations','umbral_n2_clp'),
  ('expense_reports','proyecto_id'), ('expense_reports','cadena_l1_id'),
  ('expense_reports','cadena_l2_id'), ('expense_reports','cadena_fijada_at'),
  ('petty_cash_funds','liq_cadena_l1_id'), ('petty_cash_funds','liq_cadena_fijada_at')
) as x(t, c);

-- 3. Ningún documento abierto quedó sin cadena congelada
insert into resultado
select '3 rendiciones abiertas con cadena',
       not exists (select 1 from public.expense_reports
                    where deleted_at is null
                      and status in ('submitted','pending_l2')
                      and cadena_fijada_at is null),
       null;

insert into resultado
select '3b fondos abiertos con cadena',
       not exists (select 1 from public.petty_cash_funds
                    where deleted_at is null
                      and status in ('pending_approval','pending_approval_l2')
                      and cadena_fijada_at is null),
       null;

-- 4. Las cerradas NO se tocaron (rellenarlas sería ruido)
insert into resultado
select '4 cerradas sin cadena',
       not exists (select 1 from public.expense_reports
                    where status = 'reimbursed' and cadena_fijada_at is not null),
       null;

-- 5. RLS encendida en proyectos
insert into resultado
select '5 proyectos con RLS',
       (select relrowsecurity from pg_class where oid = 'public.proyectos'::regclass), null;

select * from resultado order by prueba;
rollback;
```

- [ ] **Step 3: Ensayar contra la base real sin dejar rastro.** Una sola llamada a
      `execute_sql` con: `begin;` + el contenido de la migración + el de las pruebas **sin su
      propio begin/rollback** + `rollback;`.
      Expected: todas las filas con `ok = true`. Si alguna da `false`, la migración está mal
      — no aplicarla.

- [ ] **Step 4: Commit sin aplicar.** Se aplica en la Task 15.

```bash
git add supabase/migrations/039_aprobador_por_proyecto.sql supabase/tests/039_proyectos.sql
git commit -m "feat(db): la 039 agrega proyectos y la cadena congelada por documento"
```

---

## Task 3: Los tipos de Supabase

**Files:**
- Modify: `src/lib/supabase/types.ts`

**Interfaces:**
- Consumes: los nombres de columna de la Task 2.
- Produces: tipo `Proyecto` y las columnas nuevas visibles para TypeScript.

- [ ] **Step 1: Agregar la tabla** `proyectos` en `Tables`, siguiendo el patrón exacto de
      `cost_centers` (que está en el mismo archivo). **`Relationships` es obligatorio**: sin
      él, `Schema` colapsa a `never` y `.insert()` deja de tipar.

```ts
      proyectos: {
        Row: {
          id:         string
          org_id:     string
          numero:     string
          nombre:     string | null
          jefe_id:    string | null
          activo:     boolean
          creado_por: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?:         string
          org_id:      string
          numero:      string
          nombre?:     string | null
          jefe_id?:    string | null
          activo?:     boolean
          creado_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          numero?:  string
          nombre?:  string | null
          jefe_id?: string | null
          activo?:  boolean
        }
        Relationships: [
          { foreignKeyName: 'proyectos_org_id_fkey'; columns: ['org_id']; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'proyectos_jefe_id_fkey'; columns: ['jefe_id']; referencedRelation: 'users'; referencedColumns: ['id'] }
        ]
      }
```

- [ ] **Step 2: Agregar las columnas nuevas** a `users` (`es_jefe_proyecto: boolean`,
      `umbral_n2_clp: number | null`), a `organizations` (`aprobador_defecto_id`,
      `aprobador_n2_defecto_id`: `string | null`; `umbral_n2_clp: number | null`), y a
      `expense_reports` / `petty_cash_funds` las de la cadena congelada. En `Row` sin `?`,
      en `Insert` y `Update` con `?`.

- [ ] **Step 3: Exportar el tipo** junto a los demás del archivo:

```ts
export type Proyecto = Database['public']['Tables']['proyectos']['Row']
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit -p .`
Expected: limpio.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat(tipos): proyectos y la cadena congelada en los tipos de Supabase"
```

---

## Task 4: `cargarCadena` lee la cadena del documento

**Files:**
- Modify: `src/lib/contexto-permisos.ts`

**Interfaces:**
- Consumes: las columnas de la Task 2/3.
- Produces: `cargarCadena(admin, userId, congelada?)` — misma `Cadena` de siempre, así que
  nada del motor cambia.

- [ ] **Step 1: Cambiar la firma** de `cargarCadena` para aceptar la cadena ya congelada:

```ts
/**
 * La cadena de un documento.
 *
 * Desde la 039 la cadena se congela al enviar y vive en el documento: si no lo
 * hiciéramos, reasignar un jefe de proyecto movería las aprobaciones que están
 * pendientes, y un documento aprobado quedaría con un historial que no coincide
 * con su cadena actual.
 *
 * El respaldo —leer `users` cuando el documento no tiene cadena— cubre a los
 * documentos anteriores a la migración y a cualquiera que se cree entre el
 * despliegue y la aplicación. Sin él, esos documentos quedan sin aprobador y
 * nadie puede moverlos, en silencio.
 */
export async function cargarCadena(
  admin: AdminClient,
  userId: string,
  congelada?: { l1: string | null; l2: string | null; fijadaAt: string | null },
): Promise<Cadena> {
  const { data, error } = await admin
    .from('users')
    .select('approver_l1_id, approver_l2_id, approver_l1_backup_id, backup_active_from, backup_active_until')
    .eq('id', userId)
    .single()
  if (error || !data) throw new Error('No se encontró la cadena de aprobación')

  const suplente = suplenteVigente(
    data.approver_l1_backup_id, data.backup_active_from, data.backup_active_until, hoy(),
  )

  if (congelada?.fijadaAt) {
    return { l1: congelada.l1, l2: congelada.l2, suplenteL1Vigente: suplente }
  }
  return { l1: data.approver_l1_id, l2: data.approver_l2_id, suplenteL1Vigente: suplente }
}
```

Nota para quien implemente: **el suplente se sigue leyendo en vivo a propósito.** Es una
ausencia temporal de una persona, no parte de la ruta del documento: si alguien se va de
vacaciones después de que se envió una rendición, su suplente tiene que poder actuar.

- [ ] **Step 2: Pasar la cadena congelada** en `contextoRendicion`: agregar
      `cadena_l1_id, cadena_l2_id, cadena_fijada_at` al `select` de `expense_reports`, y
      llamar `cargarCadena(admin, reporte.submitter_id, { l1: reporte.cadena_l1_id, l2: reporte.cadena_l2_id, fijadaAt: reporte.cadena_fijada_at })`.

- [ ] **Step 3: Lo mismo en `contextoFondo`,** pero eligiendo el juego de columnas según la
      etapa — el fondo y su liquidación son dos documentos y cada uno tiene su cadena:

```ts
  const esLiquidacion = tipoDeFondo(fondo.status) === 'liquidacion'
  const congelada = esLiquidacion
    ? { l1: fondo.liq_cadena_l1_id, l2: fondo.liq_cadena_l2_id, fijadaAt: fondo.liq_cadena_fijada_at }
    : { l1: fondo.cadena_l1_id,     l2: fondo.cadena_l2_id,     fijadaAt: fondo.cadena_fijada_at }
```

- [ ] **Step 4: Verificar que nada se rompió**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: las 482 pruebas en verde (más las 16 de la Task 1) y typecheck limpio.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contexto-permisos.ts
git commit -m "feat(cadena): el documento manda sobre la ficha, con respaldo a la ficha"
```

---

## Task 5: Congelar la cadena al enviar

**Files:**
- Modify: `src/actions/expenses.ts:267` (`submitReport`)
- Modify: `src/actions/petty-cash.ts:155` (`submitFund`) y `:392` (`submitLiquidation`)

**Interfaces:**
- Consumes: `resolverCadena()` (Task 1), las columnas (Task 2).
- Produces: documentos con `cadena_fijada_at` desde el envío.

- [ ] **Step 1: Escribir un helper** en `src/lib/cadena-proyecto.ts` que arme la `EntradaCadena`
      desde las filas, para no repetir la lectura en los tres sitios:

```ts
/** Las filas que hacen falta para resolver una cadena, tal como vienen de la base. */
export interface FilasParaCadena {
  proyecto: { jefe_id: string | null } | null
  persona:  { approver_l1_id: string | null; approver_l2_id: string | null; umbral_n2_clp: number | null }
  org:      { aprobador_defecto_id: string | null; aprobador_n2_defecto_id: string | null; umbral_n2_clp: number | null }
  total:    number
}

export function entradaDesdeFilas(f: FilasParaCadena): EntradaCadena {
  return {
    jefeProyecto:    f.proyecto?.jefe_id ?? null,
    jefePropio:      f.persona.approver_l1_id,
    defectoOrg:      f.org.aprobador_defecto_id,
    n2Propio:        f.persona.approver_l2_id,
    n2Org:           f.org.aprobador_n2_defecto_id,
    umbralPropio:    f.persona.umbral_n2_clp,
    umbralOrg:       f.org.umbral_n2_clp,
    totalSolicitado: f.total,
  }
}
```

- [ ] **Step 2: Agregar su prueba** en `src/tests/cadena-proyecto.test.ts`:

```ts
describe('entradaDesdeFilas', () => {
  it('sin proyecto, el jefe de proyecto queda en null', () => {
    const e = entradaDesdeFilas({
      proyecto: null,
      persona: { approver_l1_id: 'p', approver_l2_id: null, umbral_n2_clp: null },
      org: { aprobador_defecto_id: 'o', aprobador_n2_defecto_id: null, umbral_n2_clp: 500 },
      total: 900,
    })
    expect(e.jefeProyecto).toBeNull()
    expect(e.umbralOrg).toBe(500)
  })
})
```

- [ ] **Step 3: En `submitReport`,** antes del `update` que pone `status: 'submitted'`:
      leer el proyecto del reporte (si tiene), la ficha de quien rinde y la organización;
      llamar `resolverCadena(entradaDesdeFilas(...))` con el total ya calculado; y escribir
      `cadena_l1_id`, `cadena_l2_id` y `cadena_fijada_at` **en el mismo `update`** que cambia
      el estado. Un solo UPDATE: si se parte en dos, un fallo entre medio deja una rendición
      enviada sin cadena.

- [ ] **Step 4: En `submitFund`,** lo mismo con `amount_requested` como total, escribiendo
      `cadena_*`. En `submitLiquidation`, con **lo gastado** (la suma de los ítems no
      rechazados, que es lo que ya usa `calculateFundBalance`), escribiendo `liq_cadena_*`.

- [ ] **Step 5: Verificar**

Run: `npx vitest run && npx tsc --noEmit -p . && npx next build`
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cadena-proyecto.ts src/tests/cadena-proyecto.test.ts src/actions/expenses.ts src/actions/petty-cash.ts
git commit -m "feat(cadena): se congela al enviar, y la liquidación congela la suya"
```

---

## Task 6: El catálogo de proyectos que se arma solo

**Files:**
- Create: `src/actions/proyectos.ts`

**Interfaces:**
- Consumes: `normalizarNumeroProyecto()` (Task 1), tabla `proyectos` (Task 2).
- Produces: `buscarProyecto(numero)`, `jefesDeProyecto()`, `resolverOCrearProyecto(numero, nombre, jefeId)`.

- [ ] **Step 1: Crear el archivo.** Toda función exportada es `async` (regla de Next.js 16).

```ts
'use server'
// El catálogo no se carga: se arma con el uso. La primera vez que alguien usa el
// 2991 le pone nombre y jefe, y desde ahí los demás lo encuentran escrito igual.
// Por eso no hay alta manual en ninguna pantalla.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizarNumeroProyecto } from '@/lib/cadena-proyecto'
import { getAuthProfile } from '@/lib/auth'

/** Lo que el autocompletado necesita para un número ya tecleado. */
export async function buscarProyecto(numero: string) {
  const perfil = await getAuthProfile()
  if (!perfil) return null
  const n = normalizarNumeroProyecto(numero)
  if (!n) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('proyectos')
    .select('id, numero, nombre, jefe_id, activo')
    .eq('org_id', perfil.org_id)
    .eq('numero', n)
    .maybeSingle()
  return data
}

/** Los que el empleado puede elegir. Nunca los 57. */
export async function jefesDeProyecto() {
  const perfil = await getAuthProfile()
  if (!perfil) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id, full_name')
    .eq('org_id', perfil.org_id)
    .eq('es_jefe_proyecto', true)
    .eq('is_active', true)
    .is('blocked_at', null)
    .is('deleted_at', null)
    .order('full_name')
  return data ?? []
}
```

- [ ] **Step 2: Agregar `resolverOCrearProyecto`.** Escribe con la llave de servicio porque
      crea filas que el empleado no puede insertar por RLS, y **la organización sale del
      perfil, nunca del navegador**:

```ts
/**
 * Devuelve el id del proyecto, creándolo si el número es nuevo. Si ya existe y
 * viene un jefe distinto, actualiza la sugerencia: apartarse del jefe sugerido
 * es la señal de que la obra cambió de manos.
 */
export async function resolverOCrearProyecto(
  numero: string, nombre: string | null, jefeId: string | null,
): Promise<string> {
  const perfil = await getAuthProfile()
  if (!perfil) throw new Error('Sesión no encontrada')
  const n = normalizarNumeroProyecto(numero)
  if (!n) throw new Error('El número de proyecto no puede estar vacío')

  const admin = createAdminClient()
  const { data: existente } = await admin
    .from('proyectos').select('id, jefe_id')
    .eq('org_id', perfil.org_id).eq('numero', n).maybeSingle()

  if (existente) {
    if (jefeId && jefeId !== existente.jefe_id) {
      await admin.from('proyectos').update({ jefe_id: jefeId }).eq('id', existente.id)
    }
    return existente.id
  }

  const { data, error } = await admin
    .from('proyectos')
    .insert({ org_id: perfil.org_id, numero: n, nombre, jefe_id: jefeId, creado_por: perfil.id })
    .select('id').single()
  if (error || !data) throw new Error('No se pudo registrar el proyecto')
  return data.id
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit -p . && npx eslint src/actions/proyectos.ts`
Expected: limpio.

- [ ] **Step 4: Commit**

```bash
git add src/actions/proyectos.ts
git commit -m "feat(proyectos): el catálogo se arma con el uso, sin alta manual"
```

---

## Task 7: El selector de proyecto, compartido por las dos pantallas

**Files:**
- Create: `src/components/expenses/SelectorProyecto.tsx`
- Modify: `src/app/(app)/expenses/new/page.tsx:129` (después del campo Título)

**Interfaces:**
- Consumes: `buscarProyecto()`, `jefesDeProyecto()` (Task 6).
- Produces: componente `<SelectorProyecto value onChange />` con
  `value: { esProyecto: boolean | null; numero: string; nombre: string; jefeId: string | null }`.

- [ ] **Step 1: Crear el componente.** Dos opciones con `<input type="radio">` **reales** y
      su `<label>` (nunca `onClick` en un `div`: el tabulador no lo alcanza):

> **¿Para qué es?**  ( ) Un proyecto   ( ) Gastos generales / oficina

**Sin valor por defecto la primera vez.** Después recuerda la última elección de esa persona
en `localStorage`, con la lectura dentro de un `useEffect` — acceder fuera rompe el SSR, que
es el error ya documentado del Sidebar.

- [ ] **Step 2: Al elegir «Un proyecto»,** mostrar el campo **N° de proyecto** (obligatorio).
      Con 600 ms de espera tras dejar de teclear —el mismo patrón que `ExpenseItemForm` usa
      para las políticas— llamar a `buscarProyecto()`:
      - si existe: mostrar el nombre y preseleccionar su jefe, en modo lectura;
      - si no existe: pedir **Nombre de la obra** y **Jefe** (`<select>` con `jefesDeProyecto()`).

- [ ] **Step 3: Al elegir «Gastos generales»,** no mostrar ningún campo.

- [ ] **Step 4: Montarlo en `/expenses/new`** debajo del Título, y pasar lo elegido a
      `createReport`, que guarda `proyecto_id` llamando a `resolverOCrearProyecto()`.
      El botón «Crear rendición →» se deshabilita si eligió proyecto y el número está vacío.

- [ ] **Step 5: Verificar en el navegador.** `preview_start` con `mi-rendicion-dev`, entrar a
      `/expenses/new`, y comprobar los tres caminos: sin elegir (botón deshabilitado), número
      existente (aparece el nombre solo), número nuevo (pide nombre y jefe).

- [ ] **Step 6: Commit**

```bash
git add src/components/expenses/SelectorProyecto.tsx "src/app/(app)/expenses/new/page.tsx"
git commit -m "feat(rendición): elegir proyecto al crearla, con el catálogo que se arma solo"
```

---

## Task 8: La previsualización de la cadena

**Files:**
- Create: `src/components/ui/PreviaCadena.tsx`
- Modify: `src/app/(app)/expenses/[id]/page.tsx` (bloque de acciones, encima de «Enviar a revisión»)

**Interfaces:**
- Consumes: `resolverCadena()` (Task 1).
- Produces: `<PreviaCadena reportId />`.

- [ ] **Step 1: Crear una acción** `previaDeCadena(reportId)` en `src/actions/expenses.ts` que
      resuelva la cadena con **la misma `resolverCadena()`** que usa el envío y devuelva los
      nombres. Que sea la misma función es el punto: lo que el empleado ve es exactamente lo
      que va a pasar, no una segunda implementación que se desincroniza.

- [ ] **Step 2: Crear el componente**, en `.hoja` (es información que se lee, no se mira):

```
→ Esto va a Juan Pérez.
  Y como supera $500.000, después a María González.
```

Si no hay N1, el mensaje es el de `cadenaActiva()` y el botón de enviar queda deshabilitado.

- [ ] **Step 3: Montarlo** justo encima del botón «Enviar a revisión», dentro del bloque
      `{isMyDraft && …}` y bajo la misma condición `items.length > 0 && !showForm` que usa el
      bloque de respaldos.

- [ ] **Step 4: Verificar en el navegador** con un borrador con gastos: el texto tiene que
      nombrar a la persona correcta, y cambiar si se cambia el proyecto.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/PreviaCadena.tsx "src/app/(app)/expenses/[id]/page.tsx" src/actions/expenses.ts
git commit -m "feat(rendición): antes de enviar se ve a quién le va a llegar"
```

---

## Task 9: Cambiar el proyecto mientras es borrador

**Files:**
- Modify: `src/app/(app)/expenses/[id]/page.tsx` (línea bajo el título)
- Modify: `src/actions/expenses.ts` (acción `cambiarProyectoDeReporte`)

- [ ] **Step 1: Agregar la acción**, que **solo acepta rendiciones en borrador de quien
      rinde** — la misma regla de `puedeCambiarGastos()`, y la 033 la respalda en la base.

- [ ] **Step 2: Mostrar bajo el título** una línea con el proyecto y el jefe («2991 · Planta
      Rancagua — aprueba Juan Pérez»), con un botón de editar que abre el `SelectorProyecto`.
      Solo cuando `isMyDraft`; enviada, es texto.

- [ ] **Step 3: Verificar en el navegador** que al cambiar el proyecto cambia la previa de la
      Task 8.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/expenses/[id]/page.tsx" src/actions/expenses.ts
git commit -m "feat(rendición): el proyecto se corrige mientras sea borrador"
```

---

## Task 10: Caja chica — que el empleado pida el suyo

**Files:**
- Modify: `src/actions/petty-cash.ts:101` (guard de `createFund`)
- Modify: `src/app/(app)/petty-cash/new/page.tsx:78` (después del Nombre del fondo)

- [ ] **Step 1: Abrir el guard.** Hoy exige `can_manage_petty_cash` o admin — 6 de 57. Pasa a:
      cualquiera con `can_submit` puede crear un fondo **para sí mismo**; para crear uno **a
      nombre de otra persona** sigue haciendo falta `can_manage_petty_cash`.

```ts
  const paraOtro = employeeId !== user.id
  if (paraOtro && !profile.can_manage_petty_cash && profile.role !== 'admin') {
    throw new Error('No puedes pedir un fondo a nombre de otra persona')
  }
  if (!profile.can_submit) throw new Error('Tu usuario no puede solicitar fondos')
```

**Ojo:** el `select` del perfil en `petty-cash.ts:26` **no trae `can_submit`** hoy (trae
`id, org_id, role, can_approve, can_manage_petty_cash, can_load_bank_transfer,
can_authorize_bank_transfer, full_name`). Hay que agregarlo ahí, o el guard lee `undefined`
y rechaza a todo el mundo.

- [ ] **Step 2: En el formulario,** cuando quien entra no tiene `can_manage_petty_cash`, el
      campo «Empleado asignado» no se muestra y queda fijo en uno mismo.

- [ ] **Step 3: Montar el `SelectorProyecto`** después del Nombre del fondo, y guardar
      `proyecto_id` igual que en la rendición.

- [ ] **Step 4: Montar `<PreviaCadena>` en `/petty-cash/[id]`,** en los dos momentos en que
      el fondo se envía: al pedirlo (sobre `amount_requested`) y al presentar la liquidación
      (sobre **lo gastado**). Son dos documentos distintos con dos cadenas distintas, así que
      la previa de la liquidación tiene que calcularse con el monto gastado — si mostrara el
      solicitado, diría que no escala justo en el caso que la spec quiere cubrir: pedir
      $450.000 y gastar $900.000.

- [ ] **Step 5: Verificar en el navegador** con un usuario sin `can_manage_petty_cash`: ve el
      formulario, no ve el selector de empleado, puede crear su fondo, y la previa nombra al
      jefe del proyecto elegido.

- [ ] **Step 6: Commit**

```bash
git add src/actions/petty-cash.ts "src/app/(app)/petty-cash/new/page.tsx" "src/app/(app)/petty-cash/[id]/client.tsx"
git commit -m "feat(caja chica): cualquier empleado pide el suyo; a nombre de otro sigue restringido"
```

---

## Task 11: El aviso al jefe del beneficiario

**Files:**
- Modify: `src/lib/avisos.ts`
- Modify: `src/lib/permisos.ts` (`destinatariosInformativos`)

**Interfaces:**
- Consumes: `destinatariosInformativos(enviadoPor, beneficiarioId, excluir)`.
- Produces: la misma firma con un cuarto parámetro opcional `jefeDelBeneficiario`.

- [ ] **Step 1: Escribir la prueba** en `src/tests/permisos.test.ts`:

```ts
it('avisa al jefe del beneficiario cuando no es el aprobador del documento', () => {
  const r = destinatariosInformativos('admin', 'empleado', [], 'jefe')
  expect(r).toContain('jefe')
})

it('no lo repite si ya está en la lista', () => {
  const r = destinatariosInformativos('jefe', 'empleado', [], 'jefe')
  expect(r.filter(x => x === 'jefe')).toHaveLength(1)
})

// Daniel, 2026-10-07: si no tiene jefe definido, no se avisa a nadie
it('sin jefe definido no agrega a nadie', () => {
  expect(destinatariosInformativos('admin', 'empleado', [], null)).toEqual(['admin', 'empleado'])
})
```

- [ ] **Step 2: Correr y ver que falla.** Run: `npx vitest run src/tests/permisos.test.ts`

- [ ] **Step 3: Implementar** el cuarto parámetro (el `Set` ya existente se encarga de no
      repetir).

- [ ] **Step 4: Usarlo en el aviso de fondo nuevo** de `avisos.ts`, pasando el
      `approver_l1_id` del beneficiario **solo cuando difiere del jefe de proyecto** que
      quedó en la cadena.

- [ ] **Step 5: Correr las pruebas.** Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/permisos.ts src/lib/avisos.ts src/tests/permisos.test.ts
git commit -m "feat(avisos): el jefe del beneficiario se entera, no autoriza"
```

---

## Task 12: Administración

**Files:**
- Modify: `src/app/(app)/admin/employees/client.tsx` (permiso «jefe de proyecto»)
- Modify: `src/app/(app)/admin/settings/page.tsx` (pestañas `chains` y `limits`)
- Modify: `src/components/admin/ApproverConfig.tsx` (N2 y umbral por persona)

- [ ] **Step 1: El permiso «jefe de proyecto»** en la ficha, junto a los otros. **Marcarlo
      otorga `can_approve`**, porque `validarCadena` lo exige para estar en una cadena.

- [ ] **Step 2: En la pestaña Cadenas,** el aprobador por defecto y el N2 por defecto de la
      organización, con una línea que explique que cubren a todos los que no tengan jefe propio.

- [ ] **Step 3: En la pestaña Límites,** el umbral global, con el texto que fija los extremos:
      «0 = todo pasa por N2; vacío = nunca».

- [ ] **Step 4: En `ApproverConfig`,** el N2 y el umbral de esa persona, señalando cuándo
      están heredados de la organización.

- [ ] **Step 5: Verificar en el navegador** las tres pantallas.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/admin" src/components/admin/ApproverConfig.tsx
git commit -m "feat(admin): el permiso de jefe de proyecto, los aprobadores por defecto y el umbral"
```

---

## Task 13: La pantalla del catálogo de proyectos

**Files:**
- Create: `src/app/(app)/admin/proyectos/page.tsx`
- Modify: `src/components/layout/Sidebar.tsx` (entrada nueva, `roles: ['admin']`)

- [ ] **Step 1: Listar los proyectos** en `.hoja` (es una tabla que se lee), con número,
      nombre, jefe, cuántos documentos tiene y si está activo. Paginado de a 25, como
      `/admin/reports` — con 150 proyectos una lista entera es inusable.

- [ ] **Step 2: Permitir corregir** nombre, jefe y activo. **Sin alta manual**: el catálogo
      se arma con el uso y una alta a mano crearía números que nadie usa.

- [ ] **Step 3: Verificar en el navegador.**

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/admin/proyectos" src/components/layout/Sidebar.tsx
git commit -m "feat(admin): pantalla para corregir el catálogo de proyectos"
```

---

## Task 14: Las tres que quedan desalineadas

**Files:**
- Modify: `src/lib/segregacion.ts`
- Modify: `src/lib/permisos.ts` (`validarCadena`)
- Modify: `docs/superpowers/specs/2026-10-01-planilla-de-alta-design.md`

- [ ] **Step 1: Escribir la prueba** en `src/tests/segregacion.test.ts`: dos personas que se
      aprueban mutuamente **a través de proyectos** (A es jefe del proyecto donde rinde B, y
      B del proyecto donde rinde A) tienen que salir como alerta `circular`.

- [ ] **Step 2: Correr y ver que falla.**

- [ ] **Step 3: Hacer que `alertasDeSegregacion` reciba también los jefes de proyecto** y los
      sume al mapa de cadenas que ya arma. Sin esto, la alerta queda ciega justo a los casos
      nuevos — que son los que el cambio introduce.

- [ ] **Step 4: Correr las pruebas.** Expected: PASS.

- [ ] **Step 5: Anotar en la spec de la planilla** que las columnas N1/N2 siguen sirviendo
      para configurar el jefe propio, pero **ya no son lo que destraba el envío**.

- [ ] **Step 6: Commit**

```bash
git add src/lib/segregacion.ts src/tests/segregacion.test.ts src/lib/permisos.ts docs/superpowers/specs/2026-10-01-planilla-de-alta-design.md
git commit -m "fix(segregación): las alertas ven también las cadenas que vienen del proyecto"
```

---

## Task 15: Despliegue y verificación

> Daniel pasa la sesión a «pedir aprobación» y aprueba paso a paso.

- [ ] **Step 1: Verificación completa antes de tocar nada.**

Run: `npx vitest run && npx tsc --noEmit -p . && npx eslint . && rm -rf .next && npx next build`
Expected: pruebas en verde, typecheck limpio, **0 errores de lint**, build con código 0.

- [ ] **Step 2: Aplicar la 039 ANTES del despliegue** (es aditiva), con `apply_migration`, y
      correr `supabase/tests/039_proyectos.sql` en vivo.
      Expected: todas las filas en `ok = true`.

- [ ] **Step 3: Desplegar.** `git push origin main`, y confirmar con `get_deployment` que el
      despliegue del commit está `READY` y tiene el alias `www.mi-rendicion.com`.
      **Nunca sondear el dominio con `curl` en bucle**: dispara el escudo anti-bot de Vercel,
      que responde 403 a todo y parece que la app se cayó.

- [ ] **Step 4: Configurar lo mínimo** para que nadie quede sin aprobador: el aprobador por
      defecto de la organización, y el permiso «jefe de proyecto» a los cinco jefes.

- [ ] **Step 5: Prueba de humo con un usuario que NO sea admin:** crear una rendición de
      proyecto, ver la previa, enviarla, aprobarla como el jefe. **Probar con un no-admin es
      obligatorio**: el agujero de la migración 030 existió meses porque todas las pruebas se
      hacían como admin.

- [ ] **Step 6: Recapturar la línea base visual** (`npm run baseline:verificar`, revisar el
      reporte, `npm run baseline:crear`) y correr `npm run audit:materiales`.

- [ ] **Step 7: Actualizar el SKILL.md:** la 039 en el listado de migraciones con su fecha y
      el resultado del ensayo, el modelo nuevo de aprobación, y que `cargarCadena` lee del
      documento. Agregar la fila al «Registro de avance» de la hoja de ruta.

---

## Registro de avance

| Fecha | Tarea | Resultado | Commit |
|---|---|---|---|
| 2026-10-07 | 1 | Reglas puras de la cadena, con TDD | `137a676` |
| 2026-10-07 | 2 | 039 ensayada (23/23, más un segundo ensayo del relleno sobre borradores: 9 filas) y **aplicada antes del despliegue**; en vivo 23/23 | `51ebc39` |
| 2026-10-07 | 3–5 | Tipos, `cargarCadena` desde el documento, congelar al enviar (la liquidación, la suya) | `a52be46`, `68471c6`, `c37db6c` |
| 2026-10-07 | 6–9 | Catálogo que se arma solo, selector, previa de la cadena, cambiar el proyecto en borrador | `e06b329`…`975c504` |
| 2026-10-07 | 10–11 | Caja chica para cualquier empleado; el jefe del beneficiario se entera | `7e4c5a4`, `356d518` |
| 2026-10-07 | 12–13 | Administración (jefe de proyecto, aprobadores por defecto, umbral) y `/admin/proyectos` | `f4c4a68`, `162cb96` |
| 2026-10-07 | — | **Incidente**: una prueba automatizada mandó 52 invitaciones reales. Candado de correo, pausa global, links anulados, INVITAR obligatorio | `764e43f`, `c3ecd2a` |
| 2026-10-07 | 14 | Segregación y permisos alineados con los jefes de proyecto | `7fd8500` |
| 2026-10-07 | 15 (parcial) | **Corrección de diseño antes de desplegar:** «N2 sin monto = nunca» le quitaba la segunda firma a Francisco Díaz → **N2 sin monto firma siempre** (`umbralAplicable`). Auditoría de los aprobadores por defecto. Configurado por SQL con su rastro: Claudia Lobos aprobadora por defecto, Francisco Hagar para lo de ella. 537 pruebas, línea base en 52 capturas, materiales en verde. **Falta: push, `READY`, prueba de humo con un no-admin** | `dbf9e1d`, `6973756`, `85dc4ca` |
