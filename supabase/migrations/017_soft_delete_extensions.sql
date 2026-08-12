-- supabase/migrations/017_soft_delete_extensions.sql

-- deleted_by / modified_by en tablas que tienen soft delete
alter table public.expense_reports
  add column if not exists deleted_by  uuid references public.users(id) on delete set null,
  add column if not exists modified_by uuid references public.users(id) on delete set null;

alter table public.petty_cash_funds
  add column if not exists deleted_by  uuid references public.users(id) on delete set null;

-- Soft delete en expense_items (actualmente es hard delete)
alter table public.expense_items
  add column if not exists deleted_at  timestamptz,
  add column if not exists deleted_by  uuid references public.users(id) on delete set null;

-- Soft delete en expense_categories
alter table public.expense_categories
  add column if not exists deleted_at  timestamptz,
  add column if not exists deleted_by  uuid references public.users(id) on delete set null;

-- Presupuesto mensual por categoría
alter table public.expense_categories
  add column if not exists monthly_budget_clp numeric;

-- Dedup key para notificaciones
alter table public.notifications
  add column if not exists dedup_key varchar(150);

create unique index if not exists idx_notifications_dedup
  on public.notifications(org_id, dedup_key)
  where dedup_key is not null;

-- Rate limiting (ventana deslizante por user+action)
create table if not exists public.rate_limit_log (
  id         bigserial   primary key,
  user_id    uuid        not null references public.users(id) on delete cascade,
  action     varchar(50) not null,
  created_at timestamptz not null default now()
);
create index idx_rate_limit_log_lookup on public.rate_limit_log(user_id, action, created_at desc);
-- Auto-limpieza: registros > 2h son irrelevantes
