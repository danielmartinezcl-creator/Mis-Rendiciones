-- Agrega campos de lock de exportación Defontana a petty_cash_funds
alter table public.petty_cash_funds
  add column if not exists defontana_exported_at  timestamptz,
  add column if not exists defontana_export_ref   varchar(100);
