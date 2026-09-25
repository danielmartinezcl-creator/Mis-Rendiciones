-- Permisos por asignación — parte aditiva.
-- Spec: docs/superpowers/specs/2026-09-24-permisos-y-flujo-de-aprobacion-design.md
--
-- Se puede aplicar ANTES de desplegar el código nuevo: no rompe nada del
-- código viejo. La protección de estados va en la 033, DESPUÉS del despliegue.

-- 1 ─ Suplente bancario por función ────────────────────────────────────────────
-- `bank_is_backup` era uno solo por persona, y en PENTA Francisco Hagar es
-- titular para autorizar y suplente para cargar. Con un solo interruptor no se
-- puede decir. La 033 borra `bank_is_backup` cuando ningún código lo lea.
alter table public.users
  add column bank_load_backup boolean not null default false,
  add column bank_auth_backup boolean not null default false;

update public.users
set bank_load_backup = bank_is_backup,
    bank_auth_backup = bank_is_backup
where bank_is_backup;

comment on column public.users.bank_load_backup is
  'Suplente para cargar pagos: puede hacerlo, pero el aviso le llega solo si no hay titular que pueda';
comment on column public.users.bank_auth_backup is
  'Suplente para autorizar pagos: puede hacerlo, pero el aviso le llega solo si no hay titular que pueda';

-- 2 ─ Fondos con dos niveles ───────────────────────────────────────────────────
alter table public.petty_cash_funds drop constraint petty_cash_funds_status_check;
alter table public.petty_cash_funds add constraint petty_cash_funds_status_check
  check (status in (
    'draft', 'pending_approval', 'pending_approval_l2', 'approved',
    'pending_bank_load', 'pending_bank_auth', 'funds_sent', 'submitted',
    'pending_liquidation_approval', 'pending_liquidation_l2', 'settled', 'rejected'
  ));

alter table public.petty_cash_approvals
  add column level smallint check (level in (1, 2));

alter table public.petty_cash_approvals drop constraint petty_cash_approvals_action_check;
alter table public.petty_cash_approvals add constraint petty_cash_approvals_action_check
  check (action in (
    'created', 'submitted_for_approval', 'approved', 'rejected',
    'bank_load_requested', 'bank_load_confirmed', 'bank_authorized', 'funds_sent',
    'liquidation_submitted', 'liquidation_elevated', 'liquidation_approved', 'settled',
    'returned_to_draft'
  ));

-- 3 ─ Historial de fondos: firmado e inmutable ─────────────────────────────────
-- Antes cualquier usuario podía insertar una entrada con cualquier actor_id, y
-- la regla «no operar lo propio» se decide leyendo este historial: una entrada
-- falsa de «aprobó FH» la destrababa.
drop policy "authenticated users can insert audit entries" on public.petty_cash_approvals;
create policy "each user signs own audit entries" on public.petty_cash_approvals
  for insert with check (actor_id = auth.uid());

-- Mismo patrón que la 026 para las aprobaciones de rendiciones.
create or replace function public.proteger_historial_fondos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'El historial de un fondo no se puede modificar';
  end if;
  -- DELETE: solo como cascada del borrado del fondo
  if exists (select 1 from petty_cash_funds where id = old.fund_id) then
    raise exception 'El historial de un fondo no se puede borrar';
  end if;
  return old;
end;
$$;

create trigger proteger_historial_fondos
  before update or delete on public.petty_cash_approvals
  for each row execute function public.proteger_historial_fondos();

-- 4 ─ Ver por cadena, no por permiso ───────────────────────────────────────────
-- «Aprueba» ya no deja ver todos los fondos pendientes de la empresa: cada uno
-- ve los de las personas de su cadena, y los operadores del banco los que están
-- en el banco.
create or replace function public.es_operador_bancario()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select can_load_bank_transfer or can_authorize_bank_transfer from users where id = auth.uid()),
    false)
$$;

drop policy "approver sees funds pending approval" on public.petty_cash_funds;

create policy "chain sees funds of their people" on public.petty_cash_funds
  for select using (org_id = public.get_my_org_id() and public.es_aprobador_de(employee_id));

create policy "bank operators see funds in bank" on public.petty_cash_funds
  for select using (
    org_id = public.get_my_org_id()
    and status in ('pending_bank_load', 'pending_bank_auth')
    and public.es_operador_bancario()
  );

drop policy "approver reads items during liquidation" on public.petty_cash_items;
drop policy "approver updates items during liquidation" on public.petty_cash_items;

create policy "chain reads items of their people" on public.petty_cash_items
  for select using (
    exists (
      select 1 from public.petty_cash_funds f
      where f.id = fund_id and public.es_aprobador_de(f.employee_id)
    )
  );

drop policy "participants read audit trail" on public.petty_cash_approvals;
create policy "participants read audit trail" on public.petty_cash_approvals
  for select using (
    exists (
      select 1 from public.petty_cash_funds f
      where f.id = fund_id
        and (
          f.manager_id = auth.uid()
          or f.employee_id = auth.uid()
          or public.es_aprobador_de(f.employee_id)
          or (f.org_id = public.get_my_org_id() and public.es_operador_bancario())
        )
    )
  );

-- 5 ─ Avisos de fondos ─────────────────────────────────────────────────────────
alter table public.notifications
  add column fund_id uuid references public.petty_cash_funds(id) on delete cascade;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'submission', 'approval', 'rejection', 'reimbursement',
    'bank_load', 'bank_auth', 'funds_sent', 'config_missing'
  ));
