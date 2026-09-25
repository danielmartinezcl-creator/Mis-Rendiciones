-- Pruebas de la 033 con sesiones reales SIN rol admin (lección de la 030: las
-- fallas de permisos solo aparecen sin superpoderes). Todo corre en una
-- transacción que se deshace. Si alguna prueba falla, termina con
-- «PROTECCIÓN ROTA»; si pasa, deja avisos «OK».
begin;

-- Katherine: encargada del fondo n°193 (lo puede ver y editar por RLS)
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.users where full_name ilike 'Corval%' limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare n int;
begin
  -- 1. Mover el estado de un fondo propio
  begin
    update public.petty_cash_funds set status = 'pending_bank_load' where manager_id = auth.uid();
    get diagnostics n = row_count;
    if n > 0 then raise exception 'PROTECCIÓN ROTA: una sesión movió el estado de % fondo(s)', n; end if;
    raise notice 'Prueba 1 no concluyente: la sesión no ve fondos propios';
  exception when others then
    if sqlerrm like 'PROTECCIÓN ROTA%' then raise; end if;
    raise notice 'OK 1: %', sqlerrm;
  end;

  -- 2. Firmar el historial con el nombre de otra persona
  begin
    insert into public.petty_cash_approvals (fund_id, actor_id, action)
    select f.id, (select id from public.users where full_name ilike 'Hagar Mill%' limit 1), 'approved'
    from public.petty_cash_funds f where f.manager_id = auth.uid() limit 1;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'PROTECCIÓN ROTA: una sesión firmó el historial como otra persona'; end if;
    raise notice 'Prueba 2 no concluyente: la sesión no ve fondos propios';
  exception when others then
    if sqlerrm like 'PROTECCIÓN ROTA%' then raise; end if;
    raise notice 'OK 2: %', sqlerrm;
  end;

  -- 3. Mover el estado de una rendición propia
  begin
    update public.expense_reports set status = 'approved' where submitter_id = auth.uid();
    get diagnostics n = row_count;
    if n > 0 then raise exception 'PROTECCIÓN ROTA: una sesión movió el estado de % rendición(es)', n; end if;
    raise notice 'Prueba 3 no concluyente: la sesión no tiene rendiciones';
  exception when others then
    if sqlerrm like 'PROTECCIÓN ROTA%' then raise; end if;
    raise notice 'OK 3: %', sqlerrm;
  end;

  -- 4. Crear una rendición ya aprobada
  begin
    insert into public.expense_reports (org_id, submitter_id, title, status, total_amount, approved_amount, currency)
    values (public.get_my_org_id(), auth.uid(), 'prueba 033', 'approved', 1000, 1000, 'CLP');
    raise exception 'PROTECCIÓN ROTA: una sesión creó una rendición aprobada';
  exception when others then
    if sqlerrm like 'PROTECCIÓN ROTA%' then raise; end if;
    raise notice 'OK 4: %', sqlerrm;
  end;
end $$;

reset role;

-- El admin con su sesión tampoco mueve estados
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.users where role = 'admin' and full_name ilike 'Martinez Daniel%' limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare n int;
begin
  update public.expense_reports set status = 'reimbursed' where status = 'pending_bank_load';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'PROTECCIÓN ROTA: el admin movió estados con su sesión'; end if;
  raise notice 'Prueba 5 no concluyente: no hay rendiciones en carga';
exception when others then
  if sqlerrm like 'PROTECCIÓN ROTA%' then raise; end if;
  raise notice 'OK 5: %', sqlerrm;
end $$;

rollback;
