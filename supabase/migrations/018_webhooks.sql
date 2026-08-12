create table public.webhooks (
  id         uuid          primary key default gen_random_uuid(),
  org_id     uuid          not null references public.organizations(id) on delete cascade,
  url        text          not null,
  secret     varchar(100)  not null,
  events     text[]        not null default '{}',
  activo     boolean       not null default true,
  created_at timestamptz   not null default now(),
  constraint uq_webhook_url unique (org_id, url)
);

alter table public.webhooks enable row level security;

create policy "admins_manage_webhooks" on public.webhooks
  for all using (is_admin() and org_id = get_my_org_id())
  with check (is_admin() and org_id = get_my_org_id());
