-- Suplente bancario: tiene el permiso de cargar o autorizar transferencias y
-- lo puede usar cuando quiera, pero NO recibe los avisos — esos van a los
-- titulares. Es para quien cubre en casos extraordinarios (en PENTA, Roberto
-- Hagar cuando Francisco no puede autorizar).
--
-- No es un permiso aparte: modifica a `can_load_bank_transfer` y
-- `can_authorize_bank_transfer`. Sin ninguno de los dos, no hace nada.
-- La regla vive en `destinatariosBancarios` (src/lib/bank-helpers.ts).

alter table public.users
  add column bank_is_backup boolean not null default false;

comment on column public.users.bank_is_backup is
  'Suplente bancario: puede cargar/autorizar, pero los avisos van solo a los titulares';
