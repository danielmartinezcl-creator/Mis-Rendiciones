-- Tipo de notificación para los recordatorios del cron (src/app/api/cron/reminders).
--
-- Aditiva: se aplica ANTES de desplegar el código que la usa. El cron nuevo
-- inserta `type = 'reminder'`; el código viejo nunca escribe ese tipo, así que
-- aplicarla primero no rompe nada. Los recordatorios usan un tipo propio para
-- no confundirse con el aviso del momento (submission, bank_load, ...).

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'submission', 'approval', 'rejection', 'reimbursement',
    'bank_load', 'bank_auth', 'funds_sent', 'config_missing',
    'reminder'
  ));
