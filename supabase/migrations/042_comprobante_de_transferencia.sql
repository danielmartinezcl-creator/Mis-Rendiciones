-- El comprobante de una transferencia de caja chica.
--
-- Pedido de Daniel (2026-10-22), mirando el recuadro «Registrar transferencia de
-- diferencia»: ahí se anota la referencia bancaria y la fecha, pero no había
-- dónde adjuntar la captura de la transferencia — y es justo el momento en que
-- se la tiene en la mano, igual que la boleta al cargar un gasto.
--
-- ADITIVA Y NULLABLE: va ANTES del despliegue. El código viejo no lee esta
-- columna y nunca la escribe, así que aplicarla primero no rompe nada.
--
-- POR QUÉ ACÁ Y NO EN UNA TABLA NUEVA
--
-- `approval_attachments` ya es «un archivo colgado de un documento que no
-- pertenece a un gasto puntual», con su bucket, su RLS (037), su subida y su
-- firma desde el servidor. Lo único que le faltaba era saber a QUÉ
-- transferencia corresponde el comprobante: un fondo tiene la entrega inicial y
-- la devolución del saldo, y sin el vínculo los dos archivos quedan sueltos al
-- pie del fondo sin decir cuál prueba cuál.
--
-- `fund_id` SE SIGUE LLENANDO. No es redundante: la única política que quedó
-- tras la 037 («respaldos_visibles_con_su_documento») se apoya en `report_id` /
-- `fund_id`, así que un respaldo con solo `transfer_id` sería invisible para
-- todos. Que la columna vieja siga siendo la que manda es lo que hace que esta
-- migración no pueda romper la visibilidad de nada.

alter table public.approval_attachments
  add column transfer_id uuid references public.petty_cash_transfers(id) on delete cascade;

comment on column public.approval_attachments.transfer_id is
  'Si el respaldo prueba una transferencia concreta del fondo, cuál. `fund_id` se llena igual: es el que usa la RLS.';

-- Para listar los comprobantes de las transferencias de un fondo sin recorrer
-- todos sus respaldos. Parcial: la enorme mayoría de las filas no son de una
-- transferencia.
create index idx_approval_attachments_transfer
  on public.approval_attachments(transfer_id)
  where transfer_id is not null;
