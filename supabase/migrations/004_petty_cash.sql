-- ============================================================
-- 004_petty_cash.sql — Módulo Caja Chica
-- Aplicado: 2026-07-13
-- Proyecto: jqtbtgduqzxkgubmzukg (Rindegastos PENTA)
-- ============================================================

-- 1. Permiso de Encargado de Fondo Fijo
alter table public.users
  add column if not exists can_manage_petty_cash boolean not null default false;

-- 2. Fondos de caja chica
create table if not exists public.petty_cash_funds (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  name             text not null,
  employee_id      uuid not null references public.users(id),
  manager_id       uuid not null references public.users(id),
  amount_requested numeric(12,2) not null check (amount_requested > 0),
  amount_approved  numeric(12,2),
  currency         text not null default 'CLP',
  period_start     date not null,
  period_end       date not null,
  description      text,
  status           text not null default 'draft'
                   check (status in (
                     'draft','pending_approval','approved','funds_sent',
                     'submitted','pending_liquidation_approval','settled','rejected'
                   )),
  settled_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint petty_cash_funds_period_valid check (period_end >= period_start)
);

-- 3. Ítems de gasto del fondo
create table if not exists public.petty_cash_items (
  id               uuid primary key default gen_random_uuid(),
  fund_id          uuid not null references public.petty_cash_funds(id) on delete cascade,
  org_id           uuid not null references public.organizations(id),
  description      text not null,
  amount           numeric(12,2) not null check (amount > 0),
  currency         text not null default 'CLP',
  exchange_rate    numeric(12,6) not null default 1,
  amount_clp       numeric(12,2) not null,
  date             date not null,
  category_id      uuid references public.expense_categories(id),
  merchant         text,
  doc_type         text check (doc_type in ('boleta','factura','factura_exenta','ticket','otro')),
  doc_number       text,
  notes            text,
  status           text not null default 'pending'
                   check (status in ('pending','approved','rejected')),
  rejection_reason text,
  created_at       timestamptz not null default now()
);

-- 4. Historial de auditoría (append-only)
create table if not exists public.petty_cash_approvals (
  id         uuid primary key default gen_random_uuid(),
  fund_id    uuid not null references public.petty_cash_funds(id) on delete cascade,
  actor_id   uuid not null references public.users(id),
  action     text not null check (action in (
    'created','submitted_for_approval','approved','rejected',
    'funds_sent','liquidation_submitted','liquidation_elevated',
    'liquidation_approved','settled'
  )),
  notes      text,
  amount     numeric(12,2),
  created_at timestamptz not null default now()
);

create rule no_update_petty_cash_approvals
  as on update to public.petty_cash_approvals do instead nothing;
create rule no_delete_petty_cash_approvals
  as on delete to public.petty_cash_approvals do instead nothing;

-- 5. Registro de transferencias bancarias
create table if not exists public.petty_cash_transfers (
  id             uuid primary key default gen_random_uuid(),
  fund_id        uuid not null references public.petty_cash_funds(id) on delete cascade,
  type           text not null check (type in (
    'disbursement','refund_to_employee','reimbursement_from_employee'
  )),
  amount         numeric(12,2) not null,
  reference      text,
  transferred_at date not null,
  registered_by  uuid not null references public.users(id),
  notes          text,
  created_at     timestamptz not null default now()
);

-- 6. Trigger updated_at en funds
create trigger set_petty_cash_funds_updated_at
  before update on public.petty_cash_funds
  for each row execute function public.set_updated_at();

-- 7. Índices
create index idx_petty_cash_funds_employee on public.petty_cash_funds(employee_id, status);
create index idx_petty_cash_funds_manager  on public.petty_cash_funds(manager_id, status);
create index idx_petty_cash_funds_org      on public.petty_cash_funds(org_id, status);
create index idx_petty_cash_items_fund     on public.petty_cash_items(fund_id);
create index idx_petty_cash_approvals_fund on public.petty_cash_approvals(fund_id, created_at);
create index idx_petty_cash_transfers_fund on public.petty_cash_transfers(fund_id);

-- 8. RLS
alter table public.petty_cash_funds     enable row level security;
alter table public.petty_cash_items     enable row level security;
alter table public.petty_cash_approvals enable row level security;
alter table public.petty_cash_transfers enable row level security;

-- ── petty_cash_funds ──────────────────────────────────────────────────────────
create policy "admin full access petty_cash_funds" on public.petty_cash_funds
  for all using (is_admin());

create policy "manager manages own funds" on public.petty_cash_funds
  for all using (manager_id = auth.uid());

create policy "employee sees assigned funds" on public.petty_cash_funds
  for select using (employee_id = auth.uid());

create policy "approver sees funds pending approval" on public.petty_cash_funds
  for select using (
    status in ('pending_approval','pending_liquidation_approval')
    and exists (select 1 from public.users u where u.id = auth.uid() and u.can_approve = true)
  );

-- ── petty_cash_items ─────────────────────────────────────────────────────────
create policy "admin full access petty_cash_items" on public.petty_cash_items
  for all using (is_admin());

create policy "employee manages items of own fund" on public.petty_cash_items
  for all using (
    exists (
      select 1 from public.petty_cash_funds f
      where f.id = fund_id and f.employee_id = auth.uid()
    )
  );

create policy "manager reads items" on public.petty_cash_items
  for select using (
    exists (
      select 1 from public.petty_cash_funds f
      where f.id = fund_id and f.manager_id = auth.uid()
    )
  );

create policy "approver reads items during liquidation" on public.petty_cash_items
  for select using (
    exists (
      select 1 from public.petty_cash_funds f
      join public.users u on u.id = auth.uid()
      where f.id = fund_id
        and f.status in ('pending_liquidation_approval','settled')
        and u.can_approve = true
    )
  );

create policy "approver updates items during liquidation" on public.petty_cash_items
  for update using (
    exists (
      select 1 from public.petty_cash_funds f
      join public.users u on u.id = auth.uid()
      where f.id = fund_id
        and f.status = 'pending_liquidation_approval'
        and u.can_approve = true
    )
  );

-- ── petty_cash_approvals (audit log) ─────────────────────────────────────────
create policy "admin full access petty_cash_approvals" on public.petty_cash_approvals
  for all using (is_admin());

create policy "authenticated users can insert audit entries" on public.petty_cash_approvals
  for insert with check (auth.uid() is not null);

create policy "participants read audit trail" on public.petty_cash_approvals
  for select using (
    exists (
      select 1 from public.petty_cash_funds f
      where f.id = fund_id
        and (f.manager_id = auth.uid() or f.employee_id = auth.uid())
    )
    or exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.can_approve = true
    )
  );

-- ── petty_cash_transfers ──────────────────────────────────────────────────────
create policy "admin full access petty_cash_transfers" on public.petty_cash_transfers
  for all using (is_admin());

create policy "manager manages transfers" on public.petty_cash_transfers
  for all using (
    exists (
      select 1 from public.petty_cash_funds f
      where f.id = fund_id and f.manager_id = auth.uid()
    )
  );

create policy "employee reads own fund transfers" on public.petty_cash_transfers
  for select using (
    exists (
      select 1 from public.petty_cash_funds f
      where f.id = fund_id and f.employee_id = auth.uid()
    )
  );
