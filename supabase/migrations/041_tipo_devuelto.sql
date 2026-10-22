-- Tipo de notificación para «devuelto para corregir».
--
-- Aditiva, igual que la 036: se aplica ANTES de desplegar el código que la usa.
-- El código viejo nunca escribe este tipo, así que aplicarla primero no rompe
-- nada y aplicarla después dejaría el insert rechazado.
--
-- POR QUÉ NECESITA UN TIPO PROPIO, y no es un detalle cosmético:
--
-- Devolver para corregir salió el 2026-10-21 para caja chica reusando el tipo
-- 'rejection', porque era el más parecido y no había otro. El resultado es que
-- al empleado le llega el aviso en vivo «Un fondo de caja chica fue rechazado»
-- cuando en realidad se lo devolvieron para que lo corrija — exactamente la
-- confusión que el botón vino a resolver. El texto del correo sí distingue, pero
-- el aviso de la campana se arma SOLO con el tipo (`textoNotificacion`, porque
-- `notifications` no guarda texto), así que ahí no había nada que distinguir.
--
-- Un documento devuelto sigue vivo y la pelota está del lado de quien lo pidió;
-- uno rechazado está cerrado. Que los dos se vean igual es lo que hace que la
-- persona arme un documento nuevo en vez de corregir el que tiene.

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'submission', 'approval', 'rejection', 'reimbursement',
    'bank_load', 'bank_auth', 'funds_sent', 'config_missing',
    'reminder', 'returned'
  ));
