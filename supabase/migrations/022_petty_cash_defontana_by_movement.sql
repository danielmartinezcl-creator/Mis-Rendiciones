-- 022_petty_cash_defontana_by_movement.sql
-- Contabilización por movimiento en los fondos de caja chica vivos.
--
-- Hasta ahora un fondo vivo tenía una sola marca (petty_cash_funds.defontana_exported_at)
-- y el export solo tomaba los gastos aprobados: el adelanto y los reembolsos, que en un
-- fondo vivo son transferencias bancarias y no ítems, nunca llegaban a Defontana.
--
-- Con una marca por ítem y por transferencia se puede contabilizar cada movimiento
-- cuando queda firme, sin esperar a que el fondo se liquide:
--   Fondos enviados / Devolución al empleado  → asiento de Adelanto   (banco CARGO)
--   Gastos aprobados                          → asiento de Gastos
--   Reembolso del empleado                    → asiento de Devolución (banco ABONO)

alter table public.petty_cash_items
  add column if not exists defontana_exported_at timestamptz,
  add column if not exists defontana_export_ref  text;

alter table public.petty_cash_transfers
  add column if not exists defontana_exported_at timestamptz,
  add column if not exists defontana_export_ref  text;

comment on column public.petty_cash_items.defontana_exported_at is
  'Momento en que el gasto se contabilizó en Defontana. Nulo = pendiente.';
comment on column public.petty_cash_transfers.defontana_exported_at is
  'Momento en que el movimiento bancario se contabilizó en Defontana. Nulo = pendiente.';

create index if not exists idx_petty_cash_items_defontana
  on public.petty_cash_items(fund_id) where defontana_exported_at is null;
create index if not exists idx_petty_cash_transfers_defontana
  on public.petty_cash_transfers(fund_id) where defontana_exported_at is null;
