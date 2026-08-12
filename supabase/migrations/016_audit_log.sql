-- supabase/migrations/016_audit_log.sql

create table public.audit_log (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  actor_id      uuid        references public.users(id) on delete set null,
  actor_name    text,                          -- desnormalizado para no perder info si actor se borra
  action        text        not null,          -- 'deleted'|'restored'|'updated'|'created'|'config_changed'|'bulk_updated'
  entity_type   text        not null,          -- 'expense_report'|'expense_item'|'petty_cash_fund'|'user'|'category'|'policy'|'travel_policy'|'defontana_settings'|'cost_center_assignment'|'approver_assignment'
  entity_id     text        not null,          -- UUID o identificador de la entidad
  entity_label  text,                          -- descripción legible: nombre de la rendición, del empleado, etc.
  old_value     jsonb,                         -- estado antes del cambio (null si es creación)
  new_value     jsonb,                         -- estado después del cambio (null si es borrado)
  notes         text,                          -- motivo o contexto adicional
  created_at    timestamptz not null default now()
);

-- Append-only a nivel SQL
create rule no_update_audit_log as on update to public.audit_log do instead nothing;
create rule no_delete_audit_log as on delete to public.audit_log do instead nothing;

alter table public.audit_log enable row level security;

-- Solo admins de la misma org pueden leer
create policy "admins_read_audit_log" on public.audit_log
  for select using (is_admin() and org_id = get_my_org_id());

-- Insert: cualquier función server-side con service role (admin client)
create policy "service_role_insert_audit_log" on public.audit_log
  for insert with check (true);

-- Índices para consultas frecuentes
create index idx_audit_log_org_created  on public.audit_log(org_id, created_at desc);
create index idx_audit_log_entity       on public.audit_log(entity_type, entity_id);
create index idx_audit_log_actor        on public.audit_log(actor_id);
create index idx_audit_log_action       on public.audit_log(action);
