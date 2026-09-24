-- Un aprobador que no es admin NUNCA pudo cerrar una rendición.
--
-- La política «approver can update submitted reports» tenía USING con
-- `status in ('submitted','pending_l2')` y ningún WITH CHECK. Sin WITH CHECK,
-- Postgres le exige lo mismo a la fila NUEVA: pasar la rendición a 'approved'
-- la dejaba fuera de la política y el UPDATE se rechazaba («new row violates
-- row-level security policy»). Los ítems sí quedaban aprobados, el log de
-- aprobación sí se insertaba y los correos sí salían: solo el estado no se movía.
--
-- Salió a la luz el 2026-09-24, en la primera aprobación de alguien sin rol
-- admin (los admins pasan por «admin can manage all reports in org»).
--
-- Ahora: USING dice qué rendiciones puede tocar (las que esperan su decisión);
-- WITH CHECK dice a qué estados las puede llevar (los de una decisión).

-- La condición «soy aprobador de este rendidor» es la misma que tenía la
-- política (L1, L2, suplente vigente o política legacy). Va en una función para
-- no escribirla dos veces; security definer como get_my_org_id(), para leer
-- `users` sin pasar por su RLS.
create or replace function public.es_aprobador_de(p_submitter uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from users sub
    where sub.id = p_submitter
      and (
        sub.approver_l1_id = auth.uid()
        or sub.approver_l2_id = auth.uid()
        or (sub.approver_l1_backup_id = auth.uid()
            and sub.backup_active_from  is not null
            and sub.backup_active_until is not null
            and sub.backup_active_from  <= current_date
            and sub.backup_active_until >= current_date)
      )
  )
  or exists (
    select 1
    from approval_policies ap
    join employee_policies ep on ep.policy_id = ap.id
    where ep.user_id = p_submitter
      and ap.levels @> jsonb_build_array(jsonb_build_object('approver_id', auth.uid()::text))
  )
$$;

drop policy "approver can update submitted reports" on public.expense_reports;

create policy "approver can update submitted reports" on public.expense_reports
  for update
  using (
    status in ('submitted', 'pending_l2')
    and public.es_aprobador_de(submitter_id)
  )
  with check (
    status in ('submitted', 'pending_l2', 'approved', 'partially_approved', 'rejected')
    and public.es_aprobador_de(submitter_id)
  );
