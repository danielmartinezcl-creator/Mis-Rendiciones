-- El saldo inicial de la cuenta Fondos por Rendir, por empleado.
--
-- ADITIVA Y NULLABLE: va ANTES del despliegue. El código viejo no lee estas
-- columnas y nunca las escribe.
--
-- POR QUÉ HACE FALTA
--
-- La app conoce sus movimientos desde el 12-12-2025 (el primero de las cargas
-- históricas), pero la cuenta NO arrancó en cero ese día: PENTA ya tenía fondos
-- entregados antes, y Daniel tiene en su contabilidad datos que nunca pasaron
-- por la app. Sin un punto de partida, el acumulado del reporte se va negativo
-- en cuatro meses de 2026 y no cuadra contra el mayor.
--
-- POR QUÉ POR EMPLEADO Y NO UN TOTAL
--
-- El reporte es la COMPOSICIÓN de la cuenta: un número global no se puede
-- repartir entre las personas, y entonces ninguna fila cuadraría aunque el
-- total sí. Es un dato de la ficha, como el centro de costo o el banco.
--
-- La fecha de corte es UNA sola, de la organización: el saldo inicial de todos
-- se mide al mismo día o no suma.

alter table public.users
  add column saldo_inicial_fxr_clp numeric(14,2);

comment on column public.users.saldo_inicial_fxr_clp is
  'Saldo de Fondos por Rendir de esta persona a `organizations.fxr_fecha_corte`, según la contabilidad. Positivo = deudor.';

alter table public.organizations
  add column fxr_fecha_corte date;

comment on column public.organizations.fxr_fecha_corte is
  'Día al que están medidos los `saldo_inicial_fxr_clp`. Los movimientos de la app POSTERIORES a esta fecha se suman encima.';
