-- ─────────────────────────────────────────────────────────────
-- 016: multi-tenancy cost_centers
-- Agrega org_id a cost_centers para aislar datos por organización.
-- Los 46 centros existentes se asignan a PENTA (org fija 000...001).
-- Las nuevas organizaciones parten sin centros y agregan los propios.
-- ─────────────────────────────────────────────────────────────

-- 1. Agregar columna org_id (nullable primero para poder hacer el UPDATE)
alter table public.cost_centers
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;

-- 2. Asignar todos los centros existentes a PENTA
update public.cost_centers
  set org_id = '00000000-0000-0000-0000-000000000001'
  where org_id is null;

-- 3. Hacer org_id obligatorio
alter table public.cost_centers
  alter column org_id set not null;

-- 4. Índice para performance en queries filtradas por org
create index if not exists idx_cost_centers_org_id on public.cost_centers(org_id);

-- 5. Reemplazar RLS permisiva por filtro estricto de org
drop policy if exists "authenticated_read_cost_centers" on public.cost_centers;

-- Cualquier miembro de la org puede leer sus centros
create policy "org_read_cost_centers" on public.cost_centers
  for select using (org_id = get_my_org_id());

-- Solo admins pueden crear/editar/eliminar centros de su org
create policy "admin_manage_cost_centers" on public.cost_centers
  for all
  using (is_admin() and org_id = get_my_org_id())
  with check (is_admin() and org_id = get_my_org_id());

-- NOTA: el PK sigue siendo id varchar(50) por compatibilidad con FKs existentes
-- (users.cost_center_id, expense_items.cost_center_id).
-- Restricción documentada: los códigos de centros deben ser únicos entre todas las
-- organizaciones del sistema. En la práctica no hay colisión porque cada empresa
-- usa su propia convención de nomenclatura.
