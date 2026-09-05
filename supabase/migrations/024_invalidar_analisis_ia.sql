-- ─────────────────────────────────────────────────────────────────────────────
-- 024 · El análisis IA se invalida donde cambian los datos
-- ─────────────────────────────────────────────────────────────────────────────
--
-- EL PROBLEMA
--
-- `generateApprovalAnalysis` guardaba el análisis en `expense_reports` y decidía
-- si el caché servía comparando `ai_analysis_at > updated_at`. Pero guardar el
-- análisis ES un UPDATE sobre esa tabla, y la tabla tiene un trigger
-- `set_updated_at()` que corre en cada UPDATE: la escritura del caché pisa la
-- misma marca contra la que después se compara.
--
-- Resultado: la condición NUNCA se cumplía. Medido antes de este cambio, sobre
-- las 4 rendiciones con análisis guardado: 0 con caché válido. En la generada el
-- mismo día, `ai_analysis_at` y `updated_at` caen en el mismo segundo.
--
-- Cada apertura de /approvals/[id] disparaba una llamada al modelo para
-- recalcular algo que ya estaba guardado. Costaba plata por VISTA en vez de por
-- rendición, sumaba segundos de espera en la pantalla más densa del sistema, y
-- obligó a marcar esa ruta como `comparar: false` en la línea base visual porque
-- el texto cambiaba en cada carga.
--
-- LA DECISIÓN
--
-- La invalidación se mueve a la base. `expenses.ts` ya anulaba el análisis al
-- agregar y al borrar un ítem —dos sitios—, pero hay ~11 lugares que modifican
-- ítems: reclasificar desde admin, los traspasos entre cajas chicas, la carga
-- histórica. Los otros nueve dejaban el caché viejo.
--
-- Repartir la responsabilidad entre once llamadores es la deuda que ya teníamos.
-- Un trigger la pone donde cambian los datos: cubre los caminos de hoy, los que
-- se agreguen mañana y el SQL manual.

create or replace function invalidar_analisis_ia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  informe uuid;
begin
  informe := coalesce(new.report_id, old.report_id);
  if informe is null then
    return coalesce(new, old);
  end if;

  /* El `and ai_analysis is not null` no es decorativo: sin él, una carga
     histórica de 300 ítems dispara 300 UPDATE sobre la misma rendición, que
     además arrastran su propio trigger de `updated_at`. Con el guard, las
     rendiciones sin análisis —la enorme mayoría— no se tocan nunca. */
  update expense_reports
     set ai_analysis    = null,
         ai_analysis_at = null
   where id = informe
     and ai_analysis is not null;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_invalidar_analisis_ia on expense_items;

create trigger trg_invalidar_analisis_ia
  after insert or update or delete on expense_items
  for each row
  execute function invalidar_analisis_ia();

comment on function invalidar_analisis_ia() is
  'Anula el análisis IA de la rendición cuando cambian sus ítems. Ver migración 024.';
