-- Datos de ejemplo para las capturas del manual. Solo toca la cuenta demo
-- «Daniel Martinez Prueba» (c275fffe…) y documentos con ids fijos aaaa0001 / bbbb0001.
-- Se devuelven a la papelera con datos-demo-revertir.sql apenas terminan las capturas.

-- 1. Saca de la papelera los documentos de septiembre que siguen sirviendo
update expense_reports set deleted_at = null, deleted_by = null
 where id in ('aaaa0001-0000-4000-8000-000000000001',   -- borrador
              'aaaa0001-0000-4000-8000-000000000002',   -- aprobada, carga bancaria pendiente
              'aaaa0001-0000-4000-8000-000000000004');  -- reembolsada
update petty_cash_funds set deleted_at = null
 where id = 'bbbb0001-0000-4000-8000-000000000001';     -- fondo con fondos enviados

-- 2. Una rendición nueva EN REVISIÓN, con Daniel (admin) como N1: es la que se
--    fotografía desde la bandeja del aprobador. La de Antofagasta no sirve: ya
--    tiene una aprobación en su historial, que es inmutable.
insert into expense_reports (id, org_id, submitter_id, title, description, status, current_level,
  total_amount, approved_amount, currency, created_at, updated_at, submitted_at,
  cadena_l1_id, cadena_fijada_at, is_historical_import)
values ('aaaa0001-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000001',
  'c275fffe-a4c5-439b-8ae1-9c19fef2bcad', 'Revisión de equipos Planta Talca',
  'Mantención programada de tableros', 'submitted', 1, 126000, 0, 'CLP',
  '2026-10-26 13:10:00+00', '2026-10-27 21:40:00+00', '2026-10-27 21:40:00+00',
  '0467b447-6e77-4aa9-9076-8c2d5c14f905', '2026-10-27 21:40:00+00', false)
-- En una segunda corrida ya existe: solo se saca de la papelera.
on conflict (id) do update set deleted_at = null;

insert into expense_items (report_id, org_id, description, merchant, amount, currency, amount_clp, date, doc_type, status, item_type, category_id)
select 'aaaa0001-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000001', d, m, a, 'CLP', a, f::date, t, 'pending', 'expense', c::uuid
from (values
  ('Combustible ida y vuelta', 'Estación de servicio Ruta 5 Sur', 42300, '2026-10-26', 'boleta',  'd9cad391-a49d-4f2e-8109-e15d4d996477'),
  ('Peajes autopista',         'Ruta del Maule',                   9800, '2026-10-26', 'boleta',  '31844516-d2d6-4199-bae6-17d1726b211d'),
  ('Almuerzo en terreno',      'Restaurante Las Delicias',        15900, '2026-10-26', 'boleta',  'c2795ec4-2074-4728-a85a-0654bd4804b4'),
  ('Hotel una noche',          'Hotel Talca Centro',              58000, '2026-10-26', 'factura', '774317fe-cd19-438c-97c6-a710b4223b63')
) v(d, m, a, f, t, c)
where not exists (select 1 from expense_items where report_id = 'aaaa0001-0000-4000-8000-000000000005');

-- 3. La ficha demo con datos bancarios, y sin «administra caja chica»: así el
--    formulario de fondo se ve como lo ve cualquier empleado.
update users set bank_name = 'Banco Estado', bank_account_type = 'vista',
  bank_account = '12345678', can_manage_petty_cash = false
 where id = 'c275fffe-a4c5-439b-8ae1-9c19fef2bcad';
