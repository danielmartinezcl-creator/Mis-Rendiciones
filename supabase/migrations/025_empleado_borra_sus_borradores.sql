-- El empleado no podía eliminar sus propios borradores.
--
-- `expense_reports` tenía políticas de SELECT, INSERT y UPDATE para el rendidor,
-- pero ninguna de DELETE: solo la del admin (FOR ALL). Con RLS, un DELETE sin
-- política que lo habilite no falla — afecta 0 filas y devuelve éxito, así que
-- `deleteExpenseReport` registraba «deleted» en la auditoría y la rendición
-- seguía ahí.
--
-- Mismo alcance que la política de UPDATE: solo lo propio y solo en borrador.
-- Los ítems, notificaciones y adjuntos de aprobación caen por ON DELETE CASCADE.

create policy "submitter can delete own drafts"
  on public.expense_reports
  for delete
  using (submitter_id = auth.uid() and status = 'draft');
