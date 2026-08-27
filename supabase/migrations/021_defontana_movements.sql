-- 021_defontana_movements.sql
-- Configuración Defontana por tipo de movimiento.
--
-- Hasta ahora el export solo sabía armar el asiento de una rendición de gastos:
-- cuentas de gasto al Debe y la contrapartida (Fondos por Rendir) al Haber.
-- Los adelantos, las devoluciones y los traspasos caían en esa misma lógica y
-- salían como si fueran gastos.
--
-- Cada movimiento tiene su propio asiento:
--   Adelanto     Debe  Fondos por Rendir   / Haber Banco   (tipo doc CARGO, N° doc DDMMYY)
--   Gastos       Debe  cuentas de gasto    / Haber Fondos por Rendir
--   Devolución   Debe  Banco               / Haber Fondos por Rendir (tipo doc ABONO, N° doc DDMMYY)
--   Traspaso     Debe  Fondos por Rendir (ficha receptor) / Haber Fondos por Rendir (ficha pagador)
--
-- La cuenta Fondos por Rendir es la que ya vive en defontana_contra_account.

alter table public.organizations
  add column if not exists defontana_bank_account          text,
  add column if not exists defontana_voucher_type_advance  text,
  add column if not exists defontana_voucher_type_return   text,
  add column if not exists defontana_voucher_type_transfer text,
  add column if not exists defontana_doc_type_advance      text default 'CARGO',
  add column if not exists defontana_doc_type_return       text default 'ABONO';

comment on column public.organizations.defontana_bank_account is
  'Cuenta contable del banco para adelantos y devoluciones (ej: 1.1.1010.20.01). Sin ella esos movimientos no se exportan.';
comment on column public.organizations.defontana_voucher_type_advance is
  'Tipo de comprobante para adelantos. Si queda nulo se usa defontana_voucher_type.';
comment on column public.organizations.defontana_voucher_type_return is
  'Tipo de comprobante para devoluciones. Si queda nulo se usa defontana_voucher_type.';
comment on column public.organizations.defontana_voucher_type_transfer is
  'Tipo de comprobante para traspasos entre responsables. Si queda nulo se usa defontana_voucher_type.';
comment on column public.organizations.defontana_doc_type_advance is
  'Tipo de documento de la línea de banco en un adelanto (movimiento bancario de salida).';
comment on column public.organizations.defontana_doc_type_return is
  'Tipo de documento de la línea de banco en una devolución (movimiento bancario de entrada).';
