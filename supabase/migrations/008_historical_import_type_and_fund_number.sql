-- Agrega tipo de documento y número de fondo a expense_reports para vinculación de caja chica / rendiciones
ALTER TABLE public.expense_reports
  ADD COLUMN IF NOT EXISTS historical_type TEXT
    CHECK (historical_type IN ('rendicion', 'caja_chica'));

ALTER TABLE public.expense_reports
  ADD COLUMN IF NOT EXISTS fund_number TEXT;

CREATE INDEX IF NOT EXISTS idx_expense_reports_fund_number
  ON public.expense_reports (fund_number)
  WHERE fund_number IS NOT NULL;
