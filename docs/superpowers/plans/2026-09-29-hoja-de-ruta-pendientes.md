# Hoja de ruta de los pendientes — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los diez pendientes del backlog en el orden que primero protege la base y deja lanzar a los 57 usuarios, y después suma producto, sin que una tarea deshaga o choque con otra.

**Architecture:** Hoja de ruta maestra en ocho fases (0–7). Las fases 0 a 3 son acotadas y traen los pasos completos (SQL, código, pruebas y verificación). Las fases 4 a 7 necesitan diseño o decisiones de producto, así que traen lo ya decidido, lo que falta decidir, los archivos que tocan y con qué chocan. Cuando les toque, su primera sesión corre `superpowers:brainstorming` → spec → plan propio con `superpowers:writing-plans`, como el resto del proyecto.

**Tech Stack:** Next.js 16.2.7 (App Router, Server Actions), TypeScript, Supabase (`jqtbtgduqzxkgubmzukg`), Vitest, Playwright, Vercel.

**Spec:** `.claude/skills/mi-rendicion-context/SKILL.md` → «⏳ Pendiente / Backlog», revisado contra el disco y la base el 2026-09-28. En este plan, **B1…B10** son los puntos de ese backlog.

---

## Cómo retomar este plan en una sesión nueva

Pegar en la sesión nueva:

```text
Retoma la hoja de ruta de Mi Rendición: lee
docs/superpowers/plans/2026-09-29-hoja-de-ruta-pendientes.md, mira el
«Registro de avance» del final y sigue con la primera tarea sin marcar.
```

La sesión que retoma:

1. Lee este archivo entero; el SKILL.md ya se carga solo. Si el archivo no está en su worktree, la rama está atrasada: `git merge --ff-only main` (o la herramienta `sync_with_base_branch` del host).
2. Revisa las otras worktrees y sesiones (`git worktree list`, `git status --short` de cada una, `list_sessions`): la tarea puede estar a medias en otra.
3. Si la fase tiene decisiones abiertas (las de la Fase 1 o las de la propia fase), las pide **todas juntas**, en una sola ronda de preguntas, antes de tocar código.
4. Trabaja en una rama propia. Al terminar: marca las casillas, agrega una fila al «Registro de avance», saca del backlog del SKILL.md lo que quedó hecho y commitea (`docs(contexto): …`).

## Global Constraints

- Next.js 16: en `src/actions/*.ts` toda función exportada es `async`; los helpers puros van en `src/lib/`, con tests en `src/tests/` que importan desde `src/lib/`. Un módulo común de servidor (usa la llave de servicio) va en `src/lib/` **sin** `'use server'`, como `avisos.ts` y `archivos.ts`: exportado desde una acción, cualquier sesión lo invoca con los argumentos que quiera.
- No existen `middleware.ts` ni `tailwind.config.*`: no crearlos. La protección de rutas está en `src/proxy.ts`; las rutas sin sesión, en `src/lib/rutas-publicas.ts`.
- Supabase `jqtbtgduqzxkgubmzukg`. **Siguiente migración libre: 038.** Toda migración se ensaya con `BEGIN`/`ROLLBACK` en `execute_sql` junto con sus pruebas de `supabase/tests/` (SKILL, «Supabase — puntos no obvios», punto 17), se aplica con `apply_migration` y se commitea el archivo. Nunca dos sesiones escribiendo migraciones a la vez.
- Estados y escrituras sensibles: se verifican con `exigirPaso` / `puedeActuar` y se escriben con `createAdminClient()`. Todo `.delete()` / `.update()` encadena `.select('id')` y lanza si vuelve vacío.
- Errores esperados: el motivo que ve la persona sale del **cargador de la página** o de un valor devuelto, nunca solo de un `throw`. En producción Next puede ocultar el mensaje, y la doc de Next 16 (`node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`) pide modelarlos como valores de retorno. El `throw` queda como defensa.
- Borrado de verdad de algo que tiene archivos: `archivosQueCaen()` antes, borrado con `.select('id')` y `retirarArchivos()` después (`src/lib/archivos.ts`).
- Textos en español. Nunca `confirm()` / `alert()`: `confirmar()` / `avisar()`.
- Diseño: materiales `.hoja` / `.tor-glass`, `rounded-item` / `rounded-card`, íconos Lucide, ningún hexadecimal en componentes. Antes de tocar estilos se lee `docs/Rediseño/tornasol-spec.md`, empezando por su fe de erratas. **Toda propuesta visual se le muestra a Daniel como Artifact antes de construirla** (regla suya, sin excepción).
- Producción: mezclar a `main` y hacer push es desplegar. Daniel pasa la sesión a «pedir aprobación» y aprueba cada comando, uno por tarjeta. Después: `READY` en Vercel (team `team_TtI6XqtrhSK1yYzCHOx19b2r`, proyecto `prj_VNh86yZNTJMTRP58fXQxH8bdliA3`) y esperar a que el `\"b\":\"…\"` del HTML de `/login` (el buildId) cambie.
- Nunca borrar datos ni archivos de producción por cuenta propia: se prepara el comando y lo corre Daniel. Las credenciales las pone él y nunca van a un archivo del repo.
- Worktrees: si `(Get-Item node_modules).LinkType` da `Junction`, compilar con `next build --webpack` y nunca correr `npm ci`; si da vacío (carpeta real), Turbopack compila.
- Commits desde PowerShell con here-string (`git commit -m @'…'@`, cierre `'@` en la columna 0), terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Línea de partida: 410 pruebas de Vitest en 31 archivos, todas en verde; lint con 3 errores (todos en `generate-icons.js`) y 22 avisos (2026-09-28).

## Orden y por qué

| Fase | Qué | Por qué en este lugar | Espera a | Tamaño |
|---|---|---|---|---|
| 0 | Higiene | Arrancar limpio: nada sin subir, sin worktrees viejas, lint en cero y línea base al día | — | 1 sesión corta |
| 1 | Decisiones | Seis decisiones desbloquean las fases 2 y 3: se toman juntas, en una ronda | 0 | 15 min con Daniel |
| 2 | 038 + 034 + B6 | Sin pantallas nuevas y en un solo despliegue: cierra la base antes de sumar 50 usuarios | D2, D6 | 1 sesión |
| 3 | Lanzamiento (B8, B4, B10) | Es el objetivo del negocio. Hoy **50 de los 57 que rinden no pueden enviar** (sin aprobador N1) y la base **no tiene respaldos** (plan gratuito) | D1, D3, D4, D5 · Fase 2 desplegada | 1–2 sesiones + datos de Daniel + 2 tandas |
| 4 | B5 Gasto rápido | Lo que más van a usar los empleados recién lanzados | Fase 3 | 1–2 sesiones |
| 5 | B2 Rediseño (18 pantallas) | Mejora continua, pantallas del empleado primero. Va después de B5 para no rediseñar `/quick` dos veces | Fase 4 | 4 sesiones visuales |
| 6 | B1 + B3 (+ service worker) | Salir a vender: sirve cuando hay un segundo cliente a la vista | Fase 4 (manifest) | 2–3 sesiones |
| 7 | B9 rendimiento | Cuando el volumen lo pida; medir primero | Fase 3 | 1–2 sesiones |

**Paralelo permitido:** la Tarea 3.1 (Daniel en el panel de Supabase) y la carga de datos de la 3.2 cuando D3 = (a) no tocan el repo, así que pueden hacerse mientras corre la Fase 2. Todo lo demás, en orden.

## Mapa de choques

| Superficie | La tocan | Regla |
|---|---|---|
| `supabase/migrations/` | 2 (038, 034) · 7 | Numeración correlativa; una sola sesión con migraciones a la vez |
| `src/actions/admin.ts` (papelera) | 2 (B6) | — |
| `src/components/layout/Sidebar.tsx`, `MobileNav.tsx` | 3 (enlace «Ayuda», si D4 = b) · 4 (abrir `/quick`) | 3 antes que 4 |
| `public/manifest.json` → `src/app/manifest.ts`, `public/icons/`, `src/app/favicon.ico` | 3 (ícono) · 4 (atajo a `/quick`) · 6 (manifest por organización, service worker) | 3 → 4 → 6 |
| `src/proxy.ts`, `src/lib/rutas-publicas.ts` | 6 (landing) | — |
| `e2e/rutas.ts`, `e2e/baseline/` | 0 · 4 · 5 · 6 | Regenerar la base al cerrar cada fase que cambia pantallas |
| `docs/manual/` (capturas) | 3 · 4 · 5 · 6 | Regenerar el manual al cerrar cada fase que cambia pantallas; es automático (`e2e/manual/capturar.mjs`) |
| `/quick` | 4 · 5 | Su rediseño se hace dentro de la Fase 4 |
| `SKILL.md` | todas | Cada sesión actualiza solo su punto del backlog |

---

## Fase 0 — Higiene

### Tarea 0.1: Subir `main` a GitHub

- [x] **Step 1:** `git -C "C:\Users\danie\AUTOMATIZACIONES DANIEL\PENTA\App PENTA\Mi Rendicion" log --oneline origin/main..main`. Al escribir este plan: `e4122b1 docs(contexto): backlog…` y el commit del plan.
- [x] **Step 2:** Con Daniel en «pedir aprobación»: `git -C "<raíz>" push origin main`. Es solo documentación: Vercel redespliega el mismo código. Verificar `READY`.

### Tarea 0.2: Retirar las worktrees viejas

Al 2026-09-28 están integradas a `main` y limpias `gracious-pare-9625c8`, `jolly-saha-87649d`, `reverent-chebyshev-250b1b` (HEAD suelto) y `funny-cerf-43c7dd`. En cambio, `intelligent-tharp-9f4298` tiene 10 cambios sin commit, pero es trabajo que ya está en `main`: `src/lib/recordatorios.ts`, `src/tests/recordatorios.test.ts` y la migración, que se renumeró como `036_tipo_recordatorio.sql`.

- [ ] **Step 1:** `git worktree list` y `git -C <worktree> status --short` de cada una, para confirmar que nada cambió.
- [ ] **Step 2:** Confirmar con Daniel, porque descartar cambios sin commit es irreversible. Después retirarlas con la herramienta `clean_up_worktrees` del host o con `git worktree remove <ruta>` (`--force` solo para `intelligent-tharp`). Borrar sus ramas ya integradas con `git branch -d`.

### Tarea 0.3: Lint en cero errores

`generate-icons.js` es el único generador de los íconos de la PWA y usa `require`, que da los 3 errores. Sigue dibujando el degradado índigo de «Penta Rend»; su rediseño es la Tarea 3.6.

- [ ] **Step 1:** Moverlo a `scripts/generate-icons.mjs` y cambiar las tres líneas `require`:

```js
import zlib from 'node:zlib'
import fs   from 'node:fs'
import path from 'node:path'
```

Si usa `__dirname`, agregar `const __dirname = path.dirname(new URL(import.meta.url).pathname)`; en Windows, mejor `fileURLToPath(import.meta.url)` de `node:url`.

- [ ] **Step 2:** `node scripts/generate-icons.mjs` y comprobar con `git status` que `public/icons/*.png` **no cambiaron**: mismo comportamiento.
- [ ] **Step 3:** `npx eslint .` → `0 errors`. Commit: `chore(íconos): el generador de íconos pasa a ESM y el lint queda en cero errores`.

### Tarea 0.4: Línea base visual al día (la corre Daniel, con `e2e/.env.e2e`)

- [ ] **Step 1:** `npm run baseline:verificar`. Esperado: rojo solo en `admin-papelera` (el 2026-09-28 cambió el texto y salió la insignia de días) y en rutas marcadas `datosVivos`.
- [ ] **Step 2:** `npm run baseline:reporte` para mirarlo. Si es solo eso: `npm run baseline:crear` y commitear `e2e/baseline/`. Si hay otro rojo, investigarlo antes de recapturar: recapturar lo convertiría en la nueva referencia.

### Tarea 0.5: Traer la conclusión de la sesión del manual

- [ ] **Step 1:** Leer la sesión «Verificar problema de imágenes en invitación» (`local_5a62d54b-d19d-4648-ac28-dcd04f79a3ca`, 2026-09-28) y anotar su conclusión en la fila D4 de la Fase 1. Lo que se sabe: al manual compartido le faltaban las capturas, porque `manual.html` las referencia como `img/*.png` relativas.

---

## Fase 1 — Decisiones de Daniel (una sola ronda)

| # | Decisión | Opciones | Recomendación | Desbloquea |
|---|---|---|---|---|
| D1 | Plan de Supabase (B4) | (a) Pro, ~US$25/mes · (b) seguir gratis + `db dump` semanal que corre Daniel | **(a) antes de invitar.** El plan gratuito **no tiene respaldos automáticos**: Supabase respalda a diario solo Pro, Team y Enterprise (7 días en Pro). Además se pausa a los ~7 días sin uso. Pro habilita también la protección de contraseñas filtradas, que es un aviso de seguridad abierto. Ni en Pro el respaldo incluye los archivos de Storage | 3.1 |
| D2 | Eliminar definitivamente un documento que aparece en un traspaso (B6) | (a) no dejar, y decir por qué: «elimina primero el traspaso» · (b) borrar también el traspaso y sus gastos | **(a).** Un traspaso toca a dos personas y dos documentos; borrarlo desde la papelera de uno sorprende al otro | 2.3 |
| D3 | Cadenas N1/N2 de los 50 sin aprobador, y datos bancarios de los 56 | (a) a mano en `/admin/employees` (~1 h), y cada empleado completa su banco en `/profile` · (b) una «planilla de alta» (email, N1, N2, RUT, banco, tipo y número de cuenta) que se importa con vista previa | **(b) si RR.HH. ya tiene esos datos:** una planilla, una carga, y sirve para el próximo cliente. **(a)** si se quiere lanzar ya | 3.2 |
| D4 | Manual (B10) | (a) versionar `docs/manual/` en git (PDF de 8 MB + 20 capturas) · (b) servirlo dentro de la app en `/manual/`, detrás de la sesión, con un enlace «Ayuda» en el menú · (c) solo el PDF por correo | **(b).** Un enlace no pierde las imágenes (el problema del 28-09) y se actualiza sin reenviar. Va detrás de la sesión porque las capturas salen de datos reales. Los guiones `e2e/manual/` van a git en cualquier caso | 3.3 |
| D5 | Lanzamiento (B8) | (a) los 50 de una vez · (b) por tandas: 5–10 personas durante una semana y después el resto | **(b).** El primer uso real va a mostrar cosas que las pruebas no ven, y así el volumen de dudas y avisos es manejable | 3.5 |
| D6 | Aplicar la 034 (B7) | (a) ahora · (b) esperar | **(a).** El código de los permisos por asignación está en producción desde el 2026-09-25, y la 033, la 035 y la 037 ya dejaron sin servir un rollback a código anterior: la 034 no quita nada que siga existiendo | 2.2 |

Las decisiones de las fases 4 a 7 (landing, service worker, organización por subdominio) se toman al llegar a su fase, no acá.

---

## Fase 2 — Lote técnico: base protegida y traspasos (una rama, un despliegue)

### Tarea 2.1: Migración 038 — funciones `SECURITY DEFINER` sin acceso público

**Files:**
- Create: `supabase/migrations/038_funciones_sin_acceso_publico.sql`
- Create: `supabase/tests/038_funciones.sql`

**Interfaces:**
- Consumes: nada.
- Produces: `anon` no ejecuta ninguna función `SECURITY DEFINER` de `public`; `authenticated` solo ejecuta las cuatro que usan las políticas; `set_updated_at` con `search_path` fijo.

Contexto verificado en `pg_proc` el 2026-09-28:
- **Hay 12 funciones `SECURITY DEFINER`, ejecutables por `anon` y `authenticated` vía `/rest/v1/rpc/*`.**
  - 8 son de disparador: `borrar_rendicion_con_aprobaciones`, `invalidar_analisis_ia`, `proteger_aprobaciones`, `proteger_documento_item`, `proteger_estado_fondo`, `proteger_estado_item`, `proteger_estado_rendicion` y `proteger_historial_fondos`.
  - 4 las usan las políticas RLS: `is_admin()`, `get_my_org_id()`, `es_aprobador_de(uuid)` y `es_operador_bancario()`.
- **`set_updated_at()`** es de disparador, sin `SECURITY DEFINER` y sin `search_path`.
- **Por qué es seguro revocar:**
  - Postgres verifica `EXECUTE` de una función de disparador al **crear** el disparador, no cada vez que dispara.
  - Ninguna ruta sin sesión consulta tablas: `/login`, `/set-password` y `/api/auth` usan solo Auth, y `/api/cron` usa la llave de servicio.

- [ ] **Step 1: Escribir las pruebas** en `supabase/tests/038_funciones.sql`:

```sql
-- Pruebas de la 038. Correrlas dentro del ensayo (sin este begin/rollback) o
-- después de aplicarla. ok = false es una protección rota.
begin;
create temp table resultado (prueba text, ok boolean, detalle text) on commit drop;

-- 1. anon no ejecuta ninguna función SECURITY DEFINER de public
insert into resultado
select '1 anon sin ' || p.proname, not has_function_privilege('anon', p.oid, 'EXECUTE'), null
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prosecdef;

-- 2. Nadie con sesión llama directo a un disparador
insert into resultado
select '2 authenticated sin ' || p.proname, not has_function_privilege('authenticated', p.oid, 'EXECUTE'), null
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype;

-- 3. Control positivo: las cuatro que evalúan las políticas siguen disponibles
insert into resultado
select '3 authenticated con ' || f, has_function_privilege('authenticated', f, 'EXECUTE'), null
from unnest(array['public.is_admin()', 'public.get_my_org_id()',
                  'public.es_aprobador_de(uuid)', 'public.es_operador_bancario()']) f;

-- 4. set_updated_at con search_path fijo
insert into resultado
select '4 search_path de set_updated_at',
       exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'),
       p.proconfig::text
from pg_proc p
where p.oid = 'public.set_updated_at()'::regprocedure;

select * from resultado order by prueba;
rollback;
```

- [ ] **Step 2: Correr las pruebas sin la 038** (`execute_sql` con el archivo tal cual). Esperado: las pruebas 1, 2 y 4 en `false` (son los agujeros) y la 3 en `true`.
- [ ] **Step 3: Escribir la migración** `supabase/migrations/038_funciones_sin_acceso_publico.sql`:

```sql
-- 038 · Funciones SECURITY DEFINER sin acceso público (avisos 0028, 0029 y 0011
-- de get_advisors, 2026-09-28). Todas eran ejecutables por anon y authenticated
-- vía /rest/v1/rpc.
--   · Disparadores: nadie necesita EXECUTE para que disparen. Postgres lo
--     verifica al CREAR el disparador, no cada vez que corre.
--   · Las cuatro que usan las políticas RLS: las necesita authenticated (una
--     política se evalúa con el rol de quien consulta). anon no: ninguna ruta sin
--     sesión consulta tablas (/login, /set-password y /api/auth usan solo Auth;
--     /api/cron usa la llave de servicio).
-- Efecto para anon: una consulta a una tabla con esas políticas pasa de «0 filas»
-- a «permission denied for function». Es lo buscado.

revoke execute on function public.borrar_rendicion_con_aprobaciones() from public, anon, authenticated;
revoke execute on function public.invalidar_analisis_ia()             from public, anon, authenticated;
revoke execute on function public.proteger_aprobaciones()             from public, anon, authenticated;
revoke execute on function public.proteger_documento_item()           from public, anon, authenticated;
revoke execute on function public.proteger_estado_fondo()             from public, anon, authenticated;
revoke execute on function public.proteger_estado_item()              from public, anon, authenticated;
revoke execute on function public.proteger_estado_rendicion()         from public, anon, authenticated;
revoke execute on function public.proteger_historial_fondos()         from public, anon, authenticated;
revoke execute on function public.set_updated_at()                    from public, anon, authenticated;

revoke execute on function public.is_admin()             from public, anon;
revoke execute on function public.get_my_org_id()        from public, anon;
revoke execute on function public.es_aprobador_de(uuid)  from public, anon;
revoke execute on function public.es_operador_bancario() from public, anon;
grant  execute on function public.is_admin()             to authenticated, service_role;
grant  execute on function public.get_my_org_id()        to authenticated, service_role;
grant  execute on function public.es_aprobador_de(uuid)  to authenticated, service_role;
grant  execute on function public.es_operador_bancario() to authenticated, service_role;

alter function public.set_updated_at() set search_path = '';
```

- [ ] **Step 4: Ensayar con la 038, en cuatro llamadas de `execute_sql`** (cada archivo de pruebas crea su propia tabla `resultado`, así que no se pueden juntar). Cada llamada es `begin;` + la migración + un archivo de pruebas sin su propio `begin`/`rollback` + `rollback;`. Esperado:
  - `038_funciones.sql`: todas en `true`.
  - `033_proteccion.sql`: 41 ok y 1 no concluyente, como cuando se aplicó.
  - `035_adjuntos.sql`: 12/12.
  - `037_respaldos.sql`: 17/17.

  Las tres últimas hacen disparar las `proteger_*` como `authenticated`: si revocar `EXECUTE` las apagara, fallarían con «permission denied for function», que no es el error que esperan.
- [ ] **Step 5: Commit** de la migración y sus pruebas, **sin aplicarla**: se aplica en la Tarea 2.4. Mensaje: `feat(db): la 038 quita el acceso público a las funciones SECURITY DEFINER`.

### Tarea 2.2: Aplicar la 034 (B7, si D6 = a)

**Files:** `supabase/migrations/034_borrar_bank_is_backup.sql` (ya existe y no se modifica).

- [ ] **Step 1:** `git grep -n bank_is_backup -- src` → sin resultados. La cabecera de la 034 lo exige; verificado el 2026-09-28.
- [ ] **Step 2:** Ensayo: `begin; alter table public.users drop column bank_is_backup; select count(*) from public.users; rollback;`. Esperado: sin error. Si algo depende de la columna (una vista, una función), el `drop` falla acá y no en producción.
- [ ] **Step 3:** Se aplica en la Tarea 2.4.

### Tarea 2.3: B6 — el traspaso se explica antes de eliminar (si D2 = a)

**Files:**
- Create: `src/lib/papelera.ts`
- Create: `src/tests/papelera.test.ts`
- Modify: `src/actions/admin.ts` — `getTrashItems()` (hoy en la línea ~1543) devuelve `bloqueo` por documento; `permanentlyDeleteFromTrash()` (~1645) lo exige antes de `archivosQueCaen`.
- Modify: `src/app/(app)/admin/trash/client.tsx` — la fila bloqueada muestra el motivo y no ofrece «Eliminar definitivamente».

**Interfaces:**
- Consumes: el tipo del cliente de servicio, como en `src/lib/archivos.ts` (`ReturnType<typeof createAdminClient>`).
- Produces:

```ts
export type FilaTraspaso = {
  payer_report_id: string | null; receiver_report_id: string | null
  payer_fund_id: string | null;   receiver_fund_id: string | null
}
export function traspasosPorDocumento(traspasos: FilaTraspaso[]): Map<string, number>
export function motivoBloqueoPorTraspasos(tipo: 'rendicion' | 'fondo', traspasos: number): string | null
export async function traspasosDe(admin: ClienteServicio, doc: { tipo: 'rendicion' | 'fondo'; id: string }): Promise<number>
```

Contexto: las FK `fund_transfers_{payer,receiver}_{report,fund}_id_fkey` no tienen `ON DELETE`, así que hoy el borrado falla con el error de Postgres. `fund_transfers` tiene `org_id`. En la UI, un traspaso se elimina desde Caja chica: «Traspasos sin vincular» o «Eliminar traspaso» en la fila del gasto.

- [ ] **Step 1: Pruebas que fallan** en `src/tests/papelera.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { motivoBloqueoPorTraspasos, traspasosPorDocumento, traspasosDe } from '@/lib/papelera'

describe('motivoBloqueoPorTraspasos', () => {
  it('sin traspasos no bloquea', () => {
    expect(motivoBloqueoPorTraspasos('rendicion', 0)).toBeNull()
  })
  it('con traspasos dice cuántos y de qué documento', () => {
    const motivo = motivoBloqueoPorTraspasos('fondo', 3)
    expect(motivo).toContain('fondo')
    expect(motivo).toContain('3 traspasos')
  })
  it('uno solo, en singular', () => {
    expect(motivoBloqueoPorTraspasos('rendicion', 1)).toContain('un traspaso')
  })
})

describe('traspasosPorDocumento', () => {
  it('cada traspaso cuenta para cada documento que toca', () => {
    const mapa = traspasosPorDocumento([
      { payer_report_id: 'r1', receiver_report_id: null, payer_fund_id: null, receiver_fund_id: 'f1' },
      { payer_report_id: 'r1', receiver_report_id: 'r2', payer_fund_id: null, receiver_fund_id: null },
    ])
    expect(mapa.get('r1')).toBe(2)
    expect(mapa.get('r2')).toBe(1)
    expect(mapa.get('f1')).toBe(1)
    expect(mapa.get('otro')).toBeUndefined()
  })
})

// PostgREST de mentira para conteos: responde según `tabla?columna=eq.valor`
function conteoFalso(conteos: Record<string, number | { error: string }>) {
  return {
    from: (tabla: string) => ({
      select: () => ({
        eq: async (columna: string, valor: string) => {
          const r = conteos[`${tabla}?${columna}=eq.${valor}`] ?? 0
          return typeof r === 'number' ? { count: r, error: null } : { count: null, error: { message: r.error } }
        },
      }),
    }),
  } as never
}

describe('traspasosDe', () => {
  it('rendición: suma donde paga y donde recibe', async () => {
    const admin = conteoFalso({
      'fund_transfers?payer_report_id=eq.rend-1':    1,
      'fund_transfers?receiver_report_id=eq.rend-1': 2,
    })
    expect(await traspasosDe(admin, { tipo: 'rendicion', id: 'rend-1' })).toBe(3)
  })
  it('fondo: mira las columnas del fondo', async () => {
    const admin = conteoFalso({ 'fund_transfers?receiver_fund_id=eq.fondo-1': 1 })
    expect(await traspasosDe(admin, { tipo: 'fondo', id: 'fondo-1' })).toBe(1)
  })
  it('si la consulta falla, lanza', async () => {
    const admin = conteoFalso({ 'fund_transfers?payer_fund_id=eq.fondo-1': { error: 'statement timeout' } })
    await expect(traspasosDe(admin, { tipo: 'fondo', id: 'fondo-1' })).rejects.toThrow('statement timeout')
  })
})
```

- [ ] **Step 2:** Crear `src/lib/papelera.ts` con las firmas vacías y correr `npx vitest run src/tests/papelera.test.ts`. Esperado: FAIL por aserción, no por importación.
- [ ] **Step 3: Implementación mínima:**

```ts
// Qué impide eliminar de verdad un documento de la papelera. Hoy: aparecer en
// un traspaso. Las FK de fund_transfers no tienen ON DELETE, y borrar el
// traspaso desde la papelera de uno sorprendería al otro (Daniel, D2).
// El motivo lo muestra la papelera desde su cargador; la acción lo vuelve a
// exigir como defensa. Módulo común: traspasosDe usa la llave de servicio.

import type { createAdminClient } from '@/lib/supabase/admin'

type ClienteServicio = ReturnType<typeof createAdminClient>

export type FilaTraspaso = {
  payer_report_id: string | null; receiver_report_id: string | null
  payer_fund_id: string | null;   receiver_fund_id: string | null
}

export function traspasosPorDocumento(traspasos: FilaTraspaso[]): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const t of traspasos) {
    for (const id of [t.payer_report_id, t.receiver_report_id, t.payer_fund_id, t.receiver_fund_id]) {
      if (id) mapa.set(id, (mapa.get(id) ?? 0) + 1)
    }
  }
  return mapa
}

export function motivoBloqueoPorTraspasos(tipo: 'rendicion' | 'fondo', traspasos: number): string | null {
  if (traspasos <= 0) return null
  const doc = tipo === 'rendicion' ? 'Esta rendición' : 'Este fondo'
  return traspasos === 1
    ? `${doc} aparece en un traspaso. Elimínalo primero desde Caja chica y vuelve a intentarlo.`
    : `${doc} aparece en ${traspasos} traspasos. Elimínalos primero desde Caja chica y vuelve a intentarlo.`
}

export async function traspasosDe(
  admin: ClienteServicio,
  { tipo, id }: { tipo: 'rendicion' | 'fondo'; id: string },
): Promise<number> {
  const columnas = tipo === 'rendicion'
    ? (['payer_report_id', 'receiver_report_id'] as const)
    : (['payer_fund_id', 'receiver_fund_id'] as const)
  const conteos = await Promise.all(columnas.map(columna =>
    admin.from('fund_transfers').select('id', { count: 'exact', head: true }).eq(columna, id)))
  for (const { error } of conteos) if (error) throw new Error(error.message)
  return conteos.reduce((suma, { count }) => suma + (count ?? 0), 0)
}
```

- [ ] **Step 4:** `npx vitest run src/tests/papelera.test.ts`. Esperado: PASS (7 pruebas).
- [ ] **Step 5: La acción como defensa.** En `permanentlyDeleteFromTrash`, en las ramas `report` y `fund`, **antes** de `archivosQueCaen` (tipo `'fondo'` en la segunda):

```ts
const bloqueo = motivoBloqueoPorTraspasos('rendicion', await traspasosDe(adminClient, { tipo: 'rendicion', id }))
if (bloqueo) throw new Error(bloqueo)
```

- [ ] **Step 6: El cargador da el motivo.** En `getTrashItems()`, después de leer rendiciones y fondos, con la sesión del admin (la RLS acota a su organización):

```ts
const { data: traspasos, error: errorTraspasos } = await supabase
  .from('fund_transfers')
  .select('payer_report_id, receiver_report_id, payer_fund_id, receiver_fund_id')
  .eq('org_id', orgId)
if (errorTraspasos) throw new Error(errorTraspasos.message)
const porDocumento = traspasosPorDocumento(traspasos ?? [])
```

  Cada rendición suma `bloqueo: motivoBloqueoPorTraspasos('rendicion', porDocumento.get(r.id) ?? 0)`, y cada fondo lo mismo con `'fondo'`.
- [ ] **Step 7: La fila.** En `trash/client.tsx`, si `r.bloqueo` (y `f.bloqueo`): mostrar el motivo debajo de la línea «Eliminada …» (`text-xs text-warning-700`) y no renderizar el botón «Eliminar permanentemente»; «Restaurar» queda. Antes de commitear, mostrarle a Daniel la fila bloqueada. Si ningún documento de la papelera tiene traspasos, usar una ruta de previsualización desechable con datos de fixture (patrón `tramos` del rediseño) y borrarla después.
- [ ] **Step 8:** `npx vitest run` (todo verde), `npx tsc --noEmit -p .`, `npx eslint` de los archivos tocados y `npx next build`. Commit: `fix(papelera): un documento con traspaso se explica en vez de fallar al eliminarlo`.

### Tarea 2.4: Despliegue y aplicación (Daniel en «pedir aprobación»)

- [ ] **Step 1:** `git -C "<raíz>" merge --ff-only <rama>` (o `--no-ff` si `main` avanzó), `push origin main`, `READY` en Vercel y el buildId nuevo en `/login`.
- [ ] **Step 2:** `apply_migration` de la 038, correr `supabase/tests/038_funciones.sql` en vivo (todas en `true`) y `get_advisors security`. Esperado:
  - Sin avisos 0028, 0029 ni 0011.
  - Sigue el de contraseñas filtradas, que se va en la Tarea 3.1 si D1 = a.
  - Sigue el INFO de `rate_limit_log`, que es intencional: la escribe solo la llave de servicio.
- [ ] **Step 3:** `apply_migration` de la 034 (nombre `034_borrar_bank_is_backup`) y comprobar: `select count(*) from information_schema.columns where table_name = 'users' and column_name = 'bank_is_backup'` → 0.
- [ ] **Step 4:** Prueba de humo: Daniel entra, abre una rendición, la bandeja y la papelera. `get_runtime_errors` de Vercel sin errores nuevos.
- [ ] **Step 5:** Actualizar el SKILL.md: la 034 y la 038 aplicadas en el listado de migraciones, con su fecha y el resultado del ensayo. B6, B7 y la parte de seguridad de B9 salen del backlog. Agregar la fila al «Registro de avance».

---

## Fase 3 — Lanzamiento (B8, B4, B10)

**Estado de partida** (2026-09-28): 57 usuarios rinden, 50 sin aprobador N1, 56 sin RUT, banco o número de cuenta, 5 pueden aprobar, 2 cargan y 3 autorizan pagos, 0 sin centro de costo. Solo 5 invitados. La consulta:

```sql
select
  count(*) filter (where can_submit)                                                    as rinden,
  count(*) filter (where can_submit and approver_l1_id is null)                         as rinden_sin_n1,
  count(*) filter (where can_submit and (rut is null or bank_name is null or bank_account is null)) as rinden_sin_banco,
  count(*) filter (where can_load_bank_transfer)                                        as cargan,
  count(*) filter (where can_authorize_bank_transfer)                                   as autorizan,
  count(*) filter (where invited_at is not null)                                        as invitados
from public.users where deleted_at is null and blocked_at is null;
```

### Tarea 3.1: Plan de Supabase (D1)

- [ ] **Si D1 = a:**
  1. Daniel pasa la organización a Pro en el panel (Billing). Es un pago con su medio de pago, así que lo hace él.
  2. En **Authentication → Providers → Email**, activar «Prevent use of leaked passwords».
  3. Verificar:
     - `get_project` → `ACTIVE_HEALTHY`.
     - **Database → Backups** muestra el primer respaldo diario al día siguiente.
     - `get_advisors security` ya no trae `auth_leaked_password_protection`.
- [ ] **Si D1 = b:** respaldo semanal que corre Daniel: `npx supabase db dump --db-url "<cadena de conexión con su contraseña>" -f respaldo-AAAA-MM-DD.sql`, guardado fuera del repo. Anotar el día fijo en el SKILL.md.
- [ ] **En los dos casos:** registrar en el SKILL.md que los archivos de Storage no entran en el respaldo de la base. Con 4 comprobantes no pesa; hay que revisarlo cuando haya volumen. Actualizar «Reglas críticas → Supabase»: con Pro, el proyecto ya no se pausa.

### Tarea 3.2: Cadenas de aprobación y datos bancarios (D3)

- [ ] **Si D3 = a:** Daniel configura cada cadena en `/admin/employees` (`ApproverConfig` → `setEmployeeApprovalChain` en `src/actions/admin.ts:1044`, que valida con `validarCadena`). Los empleados completan su banco en `/profile`, y el manual y el correo de invitación lo piden.
- [ ] **Si D3 = b:** mini-función «Planilla de alta», con su propio brainstorming corto (la pantalla de importación se muestra como Artifact) y su plan. Piezas a reusar:
  - `src/components/admin/EmployeeImport.tsx`: la lectura de Excel con SheetJS.
  - `validarCadena()` de `src/lib/permisos.ts`.
  - El núcleo de `setEmployeeApprovalChain`: extraerlo a una función común para no duplicar las reglas.
  - Las columnas `rut`, `bank_name`, `bank_account_type` y `bank_account` de `users`.

  Reglas: vista previa con errores por fila, nada se escribe si hay algún error, y un `logAudit` por empleado.
- [ ] **Hecho cuando** la consulta de partida da `rinden_sin_n1 = 0` (o solo quienes Daniel decida que no rinden, con `can_submit = false`) y `rinden_sin_banco = 0`, o hay un plan explícito para que lo completen.

### Tarea 3.3: Manual (D4)

- [ ] **Step 1:** Llevar `e2e/manual/` (`capturar.mjs`, `pdf.mjs`) a git desde la raíz, donde hoy está sin seguimiento.
- [ ] **Step 2:** Leer `capturar.mjs` para saber con qué usuario y qué datos captura. Revisar las 20 capturas buscando datos sensibles (nombres, montos, RUT) y, si hace falta, capturar con datos de demostración.
- [ ] **Step 3:** Regenerar el manual con la UI ya desplegada en la Fase 2 (cambió la papelera).
- [ ] **Step 4:** Publicarlo según D4. Para (b): `public/manual/` (HTML, `img/` y PDF). El `matcher` de `src/proxy.ts` deja pasar sin sesión solo `_next/static`, `_next/image`, `favicon.ico`, `manifest.json` e `icons`, así que `/manual/*` queda detrás de la sesión sin tocar nada. Agregar «Ayuda» en `Sidebar.tsx` y `MobileNav.tsx`, y mencionarlo en el correo de invitación (`src/lib/access-email.ts`).
- [ ] **Step 5:** Verificar sin sesión: `/manual/manual.html` redirige al login. Con sesión: se ven las 17 imágenes.

### Tarea 3.4: Revisión previa a invitar

- [ ] La consulta de partida con `rinden_sin_n1 = 0`, `cargan ≥ 1` y `autorizan ≥ 1`, y al menos un cargador distinto de un autorizador.
- [ ] Daniel revisa categorías y políticas activas en `/admin/settings`.
- [ ] Recordatorios en modo simulación con los 57, sin guardar ni enviar. Lo corre Daniel y el secreto no se escribe en ningún archivo: `curl.exe -H "Authorization: Bearer <CRON_SECRET>" "https://www.mi-rendicion.com/api/cron/reminders?simular"`. Revisar cuántos correos saldrían el primer día.
- [ ] Una invitación de prueba con el flujo completo: correo → `/set-password` → entrar → borrador con foto → enviar → aprobar N1 → cargar y autorizar.
- [ ] `get_project` en `ACTIVE_HEALTHY` y `get_advisors` sin avisos de seguridad nuevos.

### Tarea 3.5: Invitar por tandas (D5)

- [ ] **Tanda 1:** 5–10 personas que elige Daniel, de departamentos distintos y con al menos un aprobador, durante una semana. Seguimiento diario:
  - `get_runtime_errors` de Vercel.
  - `/suggestions`.
  - Los rebotes en Resend.
  - Los `edge_logs` de Supabase (la fuente completa de Storage; ver la memoria sobre los logs).
- [ ] **Tanda 2:** el resto, desde `/admin/employees` («Invitar» en lote).
- [ ] Actualizar el SKILL.md: B8 se cierra y la fecha de lanzamiento va en «Estado».

### Tarea 3.6: Ícono de la app con la marca actual

Hoy `public/icons/icon-192.png` e `icon-512.png` son el degradado índigo de «Penta Rend» (verificado el 2026-09-29), y el `manifest.json` ya usa `#03191C`. Es lo primero que ve cada empleado al instalar la PWA.

- [ ] **Step 1:** Dos o tres propuestas con los colores de `src/lib/design-tokens.ts`, mostradas como Artifact. Daniel elige.
- [ ] **Step 2:** Ajustar `scripts/generate-icons.mjs` (Tarea 0.3) a la elegida, regenerar los dos PNG y el `src/app/favicon.ico`, y desplegar con la tanda 1.

---

## Fase 4 — B5 Gasto rápido para rendiciones y caja chica

Esta fase no se implementa desde acá: su primera sesión corre brainstorming (el paso 3 se muestra como Artifact) → spec en `docs/superpowers/specs/AAAA-MM-DD-gasto-rapido-design.md` → plan propio → TDD.

- **Decidido** (Daniel, 2026-09-23): después de la foto y la confirmación, el paso 3 elige el destino: una rendición (un borrador propio o uno nuevo creado ahí) o un fondo `funds_sent` asignado al empleado. Cuando esté, `/quick` se abre a los empleados.
- **A decidir en su brainstorming:**
  - El destino por omisión.
  - Qué pasa sin borrador ni fondo.
  - Cómo se ve el paso 3.
- **Archivos:**
  - `src/app/(app)/quick/*`, con el borrado de `layout.tsx`.
  - Las acciones existentes `createExpenseReport` / `addExpenseItem` (`src/actions/expenses.ts:21`, `:56`), `listMyOpenFunds` / `addFundItem` (`src/actions/petty-cash.ts:579`, `:214`) y el `subirAdjunto` de los comprobantes.
  - Los `roles` en `MobileNav.tsx` y `Sidebar.tsx`, y `getPrimaryHrefs`.
  - El atajo de `public/manifest.json`, `rol: 'employee'` en `e2e/rutas.ts` y la sección del manual.
- **Reglas que no se negocian:**
  - Solo el dueño agrega gastos (033 §3b, `puedeCambiarGastos`).
  - Los comprobantes los escribe el servidor (035).
  - El OCR corre en una acción del servidor.
- **Hecho cuando:**
  - Un **empleado sin rol admin** registra un gasto en un borrador y en un fondo (la lección de la 030: probar como no-admin).
  - La línea base captura `/quick` en la corrida de empleado.
  - El manual está regenerado.
  - El SKILL.md está actualizado.

---

## Fase 5 — B2 Rediseño conceptual (18 pantallas, 4 sesiones visuales)

Ya rediseñadas (no se tocan sin motivo): `/petty-cash/[id]`, `/banco`, `/petty-cash`, `/admin/employees` y `/admin/reports`. `/quick` se rediseña en la Fase 4.

| Sesión | Pantallas | Por qué en este orden |
|---|---|---|
| 5A | `/`, `/expenses/[id]`, `/expenses/new`, `/reimbursements`, `/mis-gastos` | Lo que todo empleado ve cada semana |
| 5B | `/approvals`, `/approvals/[id]`, `/informes` | La decisión diaria de los aprobadores |
| 5C | `/petty-cash/new`, `/profile`, `/suggestions` | Del empleado, pero ocasionales |
| 5D | `/admin`, `/admin/settings`, `/admin/fondos`, `/admin/analisis`, `/admin/carga-historica`, `/admin/auditoria`, `/admin/trash` | Solo el admin |

Método en cada sesión (lo que funcionó en la etapa 5; ver la memoria del rediseño y la §5 de la spec):

1. Leer `docs/Rediseño/tornasol-spec.md`: la fe de erratas y la §5.
2. **Medir por bloques** con un script en el DOM antes de tocar nada. Dos diagnósticos «a ojo» salieron equivocados.
3. Propuesta como Artifact, y la aprobación de Daniel.
4. Los estados sin datos se ven con una ruta de previsualización desechable (patrón `tramos`), que se borra después.
5. Implementar.
6. `npm run audit:materiales`, `npm run audit:deuda` (en 0) y `npm run baseline:verificar`: solo pueden cambiar las pantallas del grupo. Después `baseline:crear`.
7. Regenerar el manual, desplegar y actualizar el backlog.

---

## Fase 6 — Salir a vender: B1 marca en la PWA y B3 landing (+ service worker)

Esta fase no se implementa desde acá: cada pieza pasa por brainstorming con Artifact → spec → plan.

- **Decisiones de la fase:**
  - **D7 — Service worker con caché sin conexión: sí o no.** El razonamiento está en la cabecera de `next.config.ts`. El camino técnico es `@serwist/turbopack`; `next-pwa` ya no.
  - **D8 — Landing:**
    - Dónde vive: `/` pública con el dashboard movido, o `/inicio`.
    - Qué pasa con alguien que ya tiene sesión y cae ahí.
    - Qué se vende: contacto o precios.
  - **D9 — Cómo se reconoce la organización antes de iniciar sesión**, por ejemplo con un subdominio por cliente (`penta.mi-rendicion.com`). Es lo que hace posible un favicon y un manifest por organización; sin eso, B1 no tiene de dónde sacar la marca.
- **Orden interno:**
  1. D9.
  2. B1: `src/app/manifest.ts` e íconos dinámicos. Reemplaza a `public/manifest.json` y conserva el atajo de la Fase 4.
  3. B3: landing, con `src/lib/rutas-publicas.ts`, `src/proxy.ts` y la línea base sin sesión.
  4. El service worker, si D7 = sí.

---

## Fase 7 — B9 rendimiento de la base

Cuándo: al sumar un segundo cliente, o si Vercel o los `edge_logs` muestran consultas lentas.

- [ ] **Medir primero.** `get_advisors performance` y las consultas más costosas (`pg_stat_statements`).
- [ ] **039 — políticas.** `auth.uid()` → `(select auth.uid())` en las 28 marcadas (`auth_rls_initplan`). Se ensaya con las pruebas 033, 035, 037 y 038, para garantizar que ningún permiso cambia.
- [ ] **Índices.** Para las FK que usan los joins reales, de las 37 sin índice. Los 10 `unused_index` se borran solo después de un período representativo de uso.
- [ ] **Políticas duplicadas.** Consolidar las 155 permisivas con la misma batería de pruebas. Es lo más delicado: dos políticas permisivas se combinan con OR, y juntarlas mal abre o cierra acceso.

---

## Registro de avance

| Fecha | Sesión | Fase / tarea | Resultado | Commit |
|---|---|---|---|---|
| 2026-09-29 | `funny-cerf-43c7dd` | Backlog revisado y plan escrito | Base: 410/410 pruebas, 0 huérfanos en Storage, 50 de 57 sin aprobador N1 | `e4122b1`, `33e8a65` |
| 2026-10-01 | `funny-cerf-43c7dd` | 0.1 `main` subido a GitHub | Despliegue `dpl_8pGJxVvGmaijh9iBmsW3t5HatMVe` en `READY` (solo documentación) y buildId nuevo en `/login`. Este registro va con el próximo push | `33e8a65` |
