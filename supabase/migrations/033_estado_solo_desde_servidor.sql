-- El estado y los montos aprobados solo los cambia el servidor.
-- Spec: docs/superpowers/specs/2026-09-24-permisos-y-flujo-de-aprobacion-design.md §5
--
-- Las reglas de quién puede dar cada paso viven UNA vez, en src/lib/permisos.ts,
-- y el servidor escribe con la llave de servicio después de preguntarles. Esta
-- migración no repite las reglas: impide saltarse el servidor. Una sesión de
-- usuario (auth.uid() no nulo) — incluida la del admin — ya no puede mover un
-- estado ni tocar un monto aprobado. La llave de servicio y el SQL manual, sí.
--
-- Por qué un disparador y no RLS: RLS no puede comparar el valor anterior de una
-- columna con el nuevo. El disparador ve los dos.
--
-- APLICAR SOLO DESPUÉS de desplegar el código que escribe con la llave de
-- servicio: el código viejo cambia estados con la sesión y fallaría.

-- 1 ─ Rendiciones ──────────────────────────────────────────────────────────────
create or replace function public.proteger_estado_rendicion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    -- Las cargas históricas entran aprobadas, y solo las crea un admin
    if new.status <> 'draft' and not (coalesce(new.is_historical_import, false) and coalesce(is_admin(), false)) then
      raise exception 'Una rendición nueva solo puede crearse en borrador';
    end if;
    return new;
  end if;

  if new.status            is distinct from old.status
  or new.approved_amount   is distinct from old.approved_amount
  or new.approved_at       is distinct from old.approved_at
  or new.reimbursed_at     is distinct from old.reimbursed_at
  or new.reimbursed_by     is distinct from old.reimbursed_by
  or new.reimbursed_amount is distinct from old.reimbursed_amount
  or new.payment_reference is distinct from old.payment_reference then
    raise exception 'El estado y los montos aprobados solo los cambia la aplicación, paso a paso';
  end if;
  return new;
end;
$$;

create trigger proteger_estado_rendicion
  before insert or update on public.expense_reports
  for each row execute function public.proteger_estado_rendicion();

-- 2 ─ Fondos ───────────────────────────────────────────────────────────────────
create or replace function public.proteger_estado_fondo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' and not (coalesce(new.is_historical_import, false) and coalesce(is_admin(), false)) then
      raise exception 'Un fondo nuevo solo puede crearse en borrador';
    end if;
    return new;
  end if;

  if new.status          is distinct from old.status
  or new.amount_approved is distinct from old.amount_approved
  or new.settled_at      is distinct from old.settled_at then
    raise exception 'El estado y el monto aprobado de un fondo solo los cambia la aplicación, paso a paso';
  end if;
  return new;
end;
$$;

create trigger proteger_estado_fondo
  before insert or update on public.petty_cash_funds
  for each row execute function public.proteger_estado_fondo();

-- 3 ─ Ítems: la decisión sobre cada gasto ──────────────────────────────────────
create or replace function public.proteger_estado_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  if new.status is distinct from old.status then
    raise exception 'La decisión sobre un gasto solo la registra la aplicación';
  end if;
  return new;
end;
$$;

create trigger proteger_estado_item
  before update on public.expense_items
  for each row execute function public.proteger_estado_item();

create trigger proteger_estado_item
  before update on public.petty_cash_items
  for each row execute function public.proteger_estado_item();

-- 4 ─ Suplencia bancaria vieja ─────────────────────────────────────────────────
-- Reemplazada por bank_load_backup / bank_auth_backup en la 032.
alter table public.users drop column bank_is_backup;
