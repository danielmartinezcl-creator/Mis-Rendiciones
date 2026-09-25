-- El estado y los montos aprobados solo los cambia el servidor.
-- Spec: docs/superpowers/specs/2026-09-24-permisos-y-flujo-de-aprobacion-design.md §5
--
-- Las reglas de quién puede dar cada paso viven UNA vez, en src/lib/permisos.ts,
-- y el servidor escribe con la llave de servicio después de preguntarles. Esta
-- migración no repite las reglas: impide saltarse el servidor. Una sesión de
-- usuario (auth.uid() no nulo) — incluida la del admin — ya no puede mover un
-- estado, tocar un monto aprobado, cambiar a quién se le paga ni escribir el
-- historial. La llave de servicio y el SQL manual, sí.
--
-- Por qué un disparador y no RLS: RLS no puede comparar el valor anterior de una
-- columna con el nuevo. El disparador ve los dos.
--
-- APLICAR SOLO DESPUÉS de desplegar el código que escribe con la llave de
-- servicio: el código viejo cambia estados y escribe el historial con la sesión
-- y fallaría. Al final hay un bloque «Para revertir».
--
-- Los nombres de las políticas que se borran se verificaron contra la base el
-- 2026-09-25 (pg_policies). Van SIN «if exists» a propósito: si alguno cambió,
-- la migración se detiene en vez de dejar abierta una puerta que se creía cerrada.

-- 1 ─ Rendiciones ──────────────────────────────────────────────────────────────
create or replace function public.proteger_estado_rendicion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;

  -- «Carga histórica» saca a la rendición del flujo normal (se marca reembolsada
  -- a mano, vuelve a «aprobada» al revertir): solo un admin la declara.
  -- IF anidado: `old` solo se lee en un UPDATE.
  if coalesce(new.is_historical_import, false) and not coalesce(is_admin(), false) then
    if tg_op = 'INSERT' then
      raise exception 'Solo un admin marca una rendición como carga histórica';
    end if;
    if not coalesce(old.is_historical_import, false) then
      raise exception 'Solo un admin marca una rendición como carga histórica';
    end if;
  end if;

  if tg_op = 'INSERT' then
    -- Las cargas históricas entran ya cerradas, y solo las crea un admin. Solo
    -- estados finales: una histórica «en carga bancaria» sería un pago nuevo
    -- que nadie aprobó.
    if new.status <> 'draft' and not (
      coalesce(new.is_historical_import, false)
      and coalesce(is_admin(), false)
      and new.status in ('approved', 'partially_approved', 'reimbursed')
    ) then
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

  -- Una vez enviada, a quién se le paga no cambia: si no, se aprueba la de
  -- otra persona y después se la pasa a uno mismo (el ataque del fondo 193).
  if old.status <> 'draft' and (
       new.submitter_id         is distinct from old.submitter_id
    or new.org_id               is distinct from old.org_id
    or new.is_historical_import is distinct from old.is_historical_import
  ) then
    raise exception 'Quién rinde y de qué organización es una rendición no cambian después de enviarla';
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

  -- «Carga histórica» saca al fondo del flujo normal: solo un admin la declara.
  -- IF anidado: `old` solo se lee en un UPDATE.
  if coalesce(new.is_historical_import, false) and not coalesce(is_admin(), false) then
    if tg_op = 'INSERT' then
      raise exception 'Solo un admin marca un fondo como carga histórica';
    end if;
    if not coalesce(old.is_historical_import, false) then
      raise exception 'Solo un admin marca un fondo como carga histórica';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' and not (
      coalesce(new.is_historical_import, false)
      and coalesce(is_admin(), false)
      and new.status = 'settled'
    ) then
      raise exception 'Un fondo nuevo solo puede crearse en borrador';
    end if;
    return new;
  end if;

  if new.status          is distinct from old.status
  or new.amount_approved is distinct from old.amount_approved
  or new.settled_at      is distinct from old.settled_at then
    raise exception 'El estado y el monto aprobado de un fondo solo los cambia la aplicación, paso a paso';
  end if;

  -- El fondo 193: la EFF lo aprobaba como N1 del beneficiario y después se
  -- ponía ella como beneficiaria. Enviado el fondo, eso ya no se mueve.
  if old.status <> 'draft' and (
       new.employee_id          is distinct from old.employee_id
    or new.manager_id           is distinct from old.manager_id
    or new.org_id               is distinct from old.org_id
    or new.is_historical_import is distinct from old.is_historical_import
  ) then
    raise exception 'El beneficiario, el encargado y la organización de un fondo no cambian después de enviarlo';
  end if;
  return new;
end;
$$;

create trigger proteger_estado_fondo
  before insert or update on public.petty_cash_funds
  for each row execute function public.proteger_estado_fondo();

-- 3 ─ Ítems: la decisión sobre cada gasto ──────────────────────────────────────
-- Un gasto nuevo entra pendiente. Si no, se agregaba a una rendición un ítem
-- ya «aprobado» que nadie revisó. Excepción: el admin cargando históricos.
create or replace function public.proteger_estado_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  historico boolean;
begin
  if auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending' then
      if tg_table_name = 'expense_items' then
        select is_historical_import into historico from expense_reports where id = new.report_id;
      else
        select is_historical_import into historico from petty_cash_funds where id = new.fund_id;
      end if;
      if not (coalesce(historico, false) and coalesce(is_admin(), false)) then
        raise exception 'Un gasto nuevo entra pendiente: la decisión la registra la aplicación';
      end if;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'La decisión sobre un gasto solo la registra la aplicación';
  end if;
  return new;
end;
$$;

create trigger proteger_estado_item
  before insert or update on public.expense_items
  for each row execute function public.proteger_estado_item();

create trigger proteger_estado_item
  before insert or update on public.petty_cash_items
  for each row execute function public.proteger_estado_item();

-- 4 ─ El aprobador ya no escribe con su sesión ─────────────────────────────────
-- Decide por el servidor (llave de servicio, después de `exigirPaso`). Estas
-- dos políticas le dejaban tocar cualquier columna de la rendición y de sus
-- ítems — montos, fechas, proveedor — mientras la rendición estaba en su nivel.
-- La única escritura que las usaba (el caché del análisis IA) ya va por el servidor.
drop policy "approver can update submitted reports" on public.expense_reports;
-- No está en ninguna migración del repositorio: se creó a mano. Nombre leído de pg_policies.
drop policy "approver can update item status" on public.expense_items;

-- 5 ─ El encargado del fondo (EFF) solo edita borradores ───────────────────────
-- «manager manages own funds» era ALL y sin WITH CHECK: el EFF podía cambiar
-- cualquier columna de sus fondos en cualquier estado, también a quién se le
-- paga. Las transiciones van por el servidor; con su sesión, solo el borrador.
drop policy "manager manages own funds" on public.petty_cash_funds;

create policy "manager reads own funds" on public.petty_cash_funds
  for select using (manager_id = auth.uid());

create policy "manager creates draft funds" on public.petty_cash_funds
  for insert with check (manager_id = auth.uid() and status = 'draft');

create policy "manager edits own drafts" on public.petty_cash_funds
  for update
  using      (manager_id = auth.uid() and status = 'draft')
  with check (manager_id = auth.uid() and status = 'draft');

create policy "manager deletes own drafts" on public.petty_cash_funds
  for delete using (manager_id = auth.uid() and status = 'draft');

-- 6 ─ Historiales que se pueden creer ──────────────────────────────────────────
-- De estos historiales salen las reglas: quién cargó (no autoriza), quién
-- aprobó. Los escribe solo el servidor, con el actor de la sesión.
-- Fondos: el admin lee, no escribe (antes era ALL).
drop policy "admin full access petty_cash_approvals" on public.petty_cash_approvals;
create policy "admin reads petty_cash_approvals" on public.petty_cash_approvals
  for select using (
    public.is_admin()
    and exists (
      select 1 from public.petty_cash_funds f
      where f.id = fund_id and f.org_id = public.get_my_org_id()
    )
  );
drop policy "each user signs own audit entries" on public.petty_cash_approvals;

-- Rendiciones: ningún código inserta ya con la sesión (todo pasa por la llave
-- de servicio tras `exigirPaso`).
drop policy "approvers can insert approvals" on public.expense_report_approvals;

-- La columna bank_is_backup NO se borra acá: va en la 034, que se aplica cuando
-- el código nuevo lleve un tiempo estable (un rollback instantáneo de Vercel al
-- código viejo la lee).

-- ─────────────────────────────────────────────────────────────────────────────
-- Para revertir (pegar en el editor SQL, en este orden):
--
-- drop trigger if exists proteger_estado_rendicion on public.expense_reports;
-- drop trigger if exists proteger_estado_fondo     on public.petty_cash_funds;
-- drop trigger if exists proteger_estado_item      on public.expense_items;
-- drop trigger if exists proteger_estado_item      on public.petty_cash_items;
-- drop function if exists public.proteger_estado_rendicion();
-- drop function if exists public.proteger_estado_fondo();
-- drop function if exists public.proteger_estado_item();
--
-- create policy "approver can update submitted reports" on public.expense_reports
--   for update
--   using      (status in ('submitted', 'pending_l2') and public.es_aprobador_de(submitter_id))
--   with check (status in ('submitted', 'pending_l2', 'approved', 'partially_approved', 'rejected')
--               and public.es_aprobador_de(submitter_id));
-- create policy "approver can update item status" on public.expense_items
--   for update using (
--     report_id in (
--       select er.id from public.expense_reports er
--       join public.users sub on sub.id = er.submitter_id
--       where sub.approver_l1_id = auth.uid() or sub.approver_l2_id = auth.uid()
--          or (sub.approver_l1_backup_id = auth.uid()
--              and sub.backup_active_from is not null and sub.backup_active_until is not null
--              and sub.backup_active_from <= current_date and sub.backup_active_until >= current_date)
--     )
--     or report_id in (
--       select er.id from public.expense_reports er
--       join public.employee_policies ep on ep.user_id = er.submitter_id
--       join public.approval_policies ap on ap.id = ep.policy_id
--       where ap.levels @> jsonb_build_array(jsonb_build_object('approver_id', auth.uid()::text))
--     )
--   );
--
-- drop policy if exists "manager reads own funds"     on public.petty_cash_funds;
-- drop policy if exists "manager creates draft funds" on public.petty_cash_funds;
-- drop policy if exists "manager edits own drafts"    on public.petty_cash_funds;
-- drop policy if exists "manager deletes own drafts"  on public.petty_cash_funds;
-- create policy "manager manages own funds" on public.petty_cash_funds
--   for all using (manager_id = auth.uid());
--
-- drop policy if exists "admin reads petty_cash_approvals" on public.petty_cash_approvals;
-- create policy "admin full access petty_cash_approvals" on public.petty_cash_approvals
--   for all using (public.is_admin());
-- create policy "each user signs own audit entries" on public.petty_cash_approvals
--   for insert with check (actor_id = auth.uid());
-- create policy "approvers can insert approvals" on public.expense_report_approvals
--   for insert with check (approver_id = auth.uid());
