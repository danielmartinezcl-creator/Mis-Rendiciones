-- supabase/migrations/007_historical_import_flag.sql
ALTER TABLE public.expense_reports
  ADD COLUMN IF NOT EXISTS is_historical_import BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.petty_cash_funds
  ADD COLUMN IF NOT EXISTS is_historical_import BOOLEAN NOT NULL DEFAULT false;
