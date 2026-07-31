-- Política de viáticos por categoría y tipo de destino
create table public.travel_policies (
  id               uuid        primary key default gen_random_uuid(),
  org_id           uuid        not null references public.organizations(id) on delete cascade,
  name             text        not null,
  destination_type text        check (destination_type in ('local', 'regional', 'exterior')),
  category_id      uuid        references public.expense_categories(id) on delete set null,
  max_amount       numeric     not null check (max_amount > 0),
  currency         varchar(3)  not null default 'CLP',
  activo           boolean     not null default true,
  created_at       timestamptz not null default now()
);

alter table public.travel_policies enable row level security;

-- Cualquier usuario autenticado de la org puede leer
create policy "travel_policies_read" on public.travel_policies
  for select using (auth.uid() is not null and org_id = get_my_org_id());

-- Solo admins pueden gestionar
create policy "travel_policies_admin" on public.travel_policies
  for all using (is_admin() and org_id = get_my_org_id())
  with check (is_admin() and org_id = get_my_org_id());

create index idx_travel_policies_org_id on public.travel_policies(org_id);
