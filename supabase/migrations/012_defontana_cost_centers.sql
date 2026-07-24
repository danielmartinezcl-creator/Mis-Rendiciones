-- ─────────────────────────────────────────────────────────────
-- 012: cost_centers, defontana_suppliers, campos Defontana v2
-- ─────────────────────────────────────────────────────────────

-- 1. Tabla cost_centers
create table if not exists public.cost_centers (
  id          varchar(50)  primary key,
  descripcion text         not null,
  imputable   boolean      not null default false,
  activo      boolean      not null default true,
  created_at  timestamptz  not null default now()
);
alter table public.cost_centers enable row level security;
create policy "authenticated_read_cost_centers" on public.cost_centers
  for select using (auth.uid() is not null);

-- 2. Seed de los 46 centros de costo PENTA
insert into public.cost_centers (id, descripcion, imputable, activo) values
  ('EMP',           'EMPRESA',                     false, true),
  ('EMPGES',        'AREAS DE GESTION',             false, true),
  ('EMPGESCOM',     'COMERCIAL',                    false, true),
  ('EMPGESCOMGCO',  'GERENCIA COMERCIAL',           true,  true),
  ('EMPGESCOMLIC',  'LICITACIONES',                 true,  true),
  ('EMPGESCOMNEG',  'NEGOCIOS',                     true,  true),
  ('EMPGESFIN',     'FINANZAS',                     false, true),
  ('EMPGESFINADM',  'ADMINISTRACION',               true,  true),
  ('EMPGESFINGER',  'GERENCIA FINANZAS',            true,  true),
  ('EMPGESFINRHH',  'RRHH',                         true,  true),
  ('EMPGESGEG',     'GERENCIA GENERAL',             false, true),
  ('EMPGESGEGGEG',  'GERENCIA GENERAL',             true,  true),
  ('EMPGESING',     'INGENIERIA',                   false, true),
  ('EMPGESINGCEI',  'CONTROL E INSTRUMENTACION',    true,  true),
  ('EMPGESINGELE',  'ELECTRICIDAD',                 true,  true),
  ('EMPGESINGGIN',  'GERENCIA INGENIERIA',          true,  true),
  ('EMPGESINGING',  'INGENIERIA',                   true,  true),
  ('EMPGESINGPRO',  'PROYECTISTAS',                 true,  true),
  ('EMPGESOPE',     'OPERACIONES',                  false, true),
  ('EMPGESOPECDO',  'CONTROL DOCUMENTAL',           true,  true),
  ('EMPGESOPECYS',  'CALIDAD Y SEGURIDAD',          true,  true),
  ('EMPGESOPEGEO',  'GERENCIA OPERACIONES',         true,  true),
  ('EMPGESOPEOPE',  'OPERACIONES',                  true,  true),
  ('EMPGESOPESUB',  'SUBCONTRATOS',                 true,  true),
  ('EMPGESVAR',     'VARIOS',                       false, true),
  ('EMPGESVAROTR',  'OTROS',                        true,  true),
  ('EMPNEG',        'AREAS DE NEGOCIOS',            false, true),
  ('EMPNEGPRA',     'PROYECTOS ANTIGUOS',           false, true),
  ('EMPNEGPRAASS',  'PROYECTOS ASS',                true,  true),
  ('EMPNEGPRACMP',  'PROYECTOS CMP',                true,  true),
  ('EMPNEGPRAKEY',  'PROYECTOS KEYPRO',             true,  true),
  ('EMPNEGPRAKPP',  'PROYECTOS KPP',                true,  true),
  ('EMPNEGPRAMEL',  'PROYECTOS MEL',                true,  true),
  ('EMPNEGPRAOTR',  'PROYECTOS OTROS',              true,  true),
  ('EMPNEGPRAPRD',  'PROYECTOS PRDW',               true,  true),
  ('EMPNEGPRASPE',  'PROYECTOS SPENCE',             true,  true),
  ('EMPNEGPRN',     'PROYECTOS NUEVOS',             false, true),
  ('EMPNEGPRNASS',  'PROYECTOS N ASS',              true,  true),
  ('EMPNEGPRNCMP',  'PROYECTOS N CMP',              true,  true),
  ('EMPNEGPRNKEY',  'PROYECTOS N KEYPRO',           true,  true),
  ('EMPNEGPRNKPP',  'PROYECTOS N KPP',              true,  true),
  ('EMPNEGPRNMEL',  'PROYECTOS N MEL',              true,  true),
  ('EMPNEGPRNOTR',  'PROYECTOS N OTROS',            true,  true),
  ('EMPNEGPRNPRD',  'PROYECTOS N PRDW',             true,  true),
  ('EMPNEGPRNSPE',  'PROYECTOS N SPENCE',           true,  true),
  ('EMPPRU',        'CENTRO PRUEBA',                true,  true)
on conflict (id) do update set descripcion = excluded.descripcion, imputable = excluded.imputable;

-- 3. Tabla defontana_suppliers (merchant → cuenta Defontana)
create table if not exists public.defontana_suppliers (
  id                     uuid        primary key default gen_random_uuid(),
  org_id                 uuid        not null references public.organizations(id) on delete cascade,
  merchant_name          text        not null,
  defontana_account_code varchar(50) not null,
  created_at             timestamptz not null default now(),
  constraint uq_defontana_suppliers unique (org_id, merchant_name)
);
alter table public.defontana_suppliers enable row level security;
create policy "admins_manage_defontana_suppliers" on public.defontana_suppliers
  for all
  using (is_admin() and org_id = get_my_org_id())
  with check (is_admin() and org_id = get_my_org_id());
create index if not exists idx_defontana_suppliers_org on public.defontana_suppliers(org_id);

-- 4. users.cost_center_id
alter table public.users
  add column if not exists cost_center_id varchar(50) references public.cost_centers(id);

-- 5. expense_items: cost_center_id + supplier_rut
alter table public.expense_items
  add column if not exists cost_center_id varchar(50) references public.cost_centers(id),
  add column if not exists supplier_rut   varchar(20);

-- 6. organizations: cuenta proveedor para facturas
alter table public.organizations
  add column if not exists defontana_provider_account varchar(50);

-- 7. expense_reports: lock de exportación
alter table public.expense_reports
  add column if not exists defontana_exported_at  timestamptz,
  add column if not exists defontana_export_ref   varchar(100);
