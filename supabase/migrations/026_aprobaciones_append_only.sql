-- El historial de aprobaciones no se reescribe.
--
-- `expense_report_approvals` es la evidencia de quién aprobó o rechazó cada
-- gasto. La documentación decía que era append-only por reglas de Postgres,
-- pero esas reglas nunca existieron en la base: solo RLS lo protegía, y RLS
-- no alcanza a la clave de servicio ni al editor SQL.
--
-- Tres garantías, todas en la base (valen para la app, la service role y el SQL
-- manual):
--   1. Una aprobación no se edita nunca.
--   2. Una aprobación no se borra suelta: solo cae junto con su rendición.
--   3. Una rendición con aprobaciones solo la puede borrar un administrador.
--      Cualquier otro recibe un error que le dice que se lo pida a uno.

-- 1 y 2 ────────────────────────────────────────────────────────────────────────

create or replace function public.proteger_aprobaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'El historial de aprobaciones no se puede modificar';
  end if;

  -- DELETE: se permite solo como cascada del borrado de la rendición. El
  -- ON DELETE CASCADE corre después de borrar la fila padre, así que si la
  -- rendición todavía existe, alguien está borrando la aprobación a mano.
  if exists (select 1 from expense_reports where id = old.report_id) then
    raise exception 'El historial de aprobaciones no se puede borrar';
  end if;

  return old;
end;
$$;

create trigger proteger_aprobaciones
  before update or delete on public.expense_report_approvals
  for each row execute function public.proteger_aprobaciones();

-- 3 ────────────────────────────────────────────────────────────────────────────

create or replace function public.borrar_rendicion_con_aprobaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- is_admin() lee auth.uid(): con la service role o desde el editor SQL es
  -- null y el borrado se rechaza. Es a propósito — la papelera borra con el
  -- cliente del admin, no con la service role, para que esto se pueda verificar.
  if exists (select 1 from expense_report_approvals where report_id = old.id)
     and not coalesce(is_admin(), false) then
    raise exception 'Esta rendición tiene aprobaciones registradas: solo un administrador puede eliminarla';
  end if;

  return old;
end;
$$;

create trigger borrar_rendicion_con_aprobaciones
  before delete on public.expense_reports
  for each row execute function public.borrar_rendicion_con_aprobaciones();
