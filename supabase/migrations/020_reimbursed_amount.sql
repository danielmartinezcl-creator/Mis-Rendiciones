-- Agrega el monto real pagado al reembolsar una rendición.
-- Permite detectar diferencias (exceso o déficit) respecto al monto aprobado.
ALTER TABLE public.expense_reports
  ADD COLUMN IF NOT EXISTS reimbursed_amount numeric;
