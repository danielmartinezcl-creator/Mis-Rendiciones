-- ─────────────────────────────────────────────────────────────
-- 040: vistas de filtro — las combinaciones guardadas del admin.
--
-- Son de la ORGANIZACIÓN, no de cada persona (decisión de Daniel, 2026-10-08):
-- lo que se arma para exportar a Defontana le sirve a cualquiera que tenga que
-- hacerlo, y si entra otro administrador encuentra el trabajo hecho.
--
-- Spec: docs/superpowers/specs/2026-10-08-filtros-del-admin-design.md
-- Plan: docs/superpowers/plans/2026-10-08-filtros-del-admin.md (Tarea 3)
--
-- ✅ APLICADA el 2026-10-08 (20261008220657), ANTES del despliegue: es aditiva
-- y el código viejo no lee ni escribe esta tabla. En vivo: 24/24 en verde, la
-- tabla quedó con 0 filas y sus 2 políticas.
--
-- Antes, ensayada con BEGIN/ROLLBACK contra la base real el
-- 2026-10-08: **23 ok, 0 rotas, 1 no concluyente** (el cruce entre
-- organizaciones, porque PENTA es la única que hay — y sale «no concluyente»
-- a propósito, que una prueba que no se ejercitó no es una prueba que pasó).
-- Comprobado después, en otra llamada, que no quedó rastro: `to_regclass` de
-- la tabla devuelve null. Pruebas: supabase/tests/040_vistas.sql
--
-- Es ADITIVA: una tabla nueva que el código viejo no lee ni escribe, así que
-- va ANTES del despliegue, como la 039.
--
-- ESTA MIGRACIÓN NO SIEMBRA NINGUNA VISTA, al revés de lo que decía la spec.
-- Dos de las ocho que listaba no son valores de filtro sino predicados:
--   · «Más de 5 días» — ningún preset de fecha dice «hace más de 5 días», y
--     guardar una fecha fija deja la vista vencida al día siguiente.
--   · «Sin datos bancarios» — «activos sin banco» no es un valor de Estado ni
--     de Departamento.
-- Las dos necesitan una dimensión propia, de opciones ya cocinadas, que se
-- decide en la tarea de su pantalla. Y las otras seis apuntan a claves
-- (`estados`, `contabilizacion`, `movimiento`…) que recién existen cuando esa
-- pantalla se construye: sembrarlas acá es fabricar jsonb roto. Cada pantalla
-- siembra las suyas en su tarea.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.vistas_filtro (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  pantalla    text not null check (pantalla in ('rendiciones','informes','auditoria','empleados')),
  nombre      text not null,
  -- Los `Valores` de esa pantalla, tal como los guarda el navegador. Lo que
  -- apunte a algo que ya no existe lo descarta `depurarVista` al leerlo: una
  -- vista puede nombrar a un empleado que se fue o una categoría borrada.
  filtro      jsonb not null,
  orden       int  not null default 0,
  -- Marca las que sembró el sistema. NO las protege: son de la empresa y la
  -- empresa las renombra o las borra. Sirve para distinguirlas en la auditoría
  -- y para no volver a sembrarlas si alguien las borró a propósito.
  de_fabrica  boolean not null default false,
  creada_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, pantalla, nombre)
);

create index if not exists idx_vistas_filtro_org_pantalla
  on public.vistas_filtro (org_id, pantalla, orden);

alter table public.vistas_filtro enable row level security;

-- La lee cualquier miembro de la organización: el aprobador también entra a
-- Informes, y una vista que él no ve sería una lista distinta para cada uno.
drop policy if exists "org_lee_vistas" on public.vistas_filtro;
create policy "org_lee_vistas" on public.vistas_filtro
  for select using (org_id = get_my_org_id());

-- La escribe solo el admin de SU organización, igual que `cost_centers`.
drop policy if exists "admin_administra_vistas" on public.vistas_filtro;
create policy "admin_administra_vistas" on public.vistas_filtro
  for all
  using (is_admin() and org_id = get_my_org_id())
  with check (is_admin() and org_id = get_my_org_id());

drop trigger if exists set_updated_at_vistas_filtro on public.vistas_filtro;
create trigger set_updated_at_vistas_filtro
  before update on public.vistas_filtro
  for each row execute function public.set_updated_at();
