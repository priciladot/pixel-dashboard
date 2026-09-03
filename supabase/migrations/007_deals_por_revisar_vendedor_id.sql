-- =====================================================================
-- 007_deals_por_revisar_vendedor_id.sql
-- =====================================================================
-- Bug: el filtro de vendedor en /maestro no recortaba la tabla "Calidad de
-- los datos" porque v_deals_por_revisar nunca exponía vendedor_id — solo el
-- nombre ya resuelto ("vendedor"). Sin la columna, el código no tenía nada
-- contra qué comparar el ?vendedor= de la URL.
-- =====================================================================

create or replace view public.v_deals_por_revisar as
select
  d.hubspot_id, d.nombre, d.owner_nombre_raw, d.owner_hubspot_id,
  d.vendedor_id,
  coalesce(p.nombre_corto, 'Sin asignar / Por revisar') as vendedor,
  d.monto_sin_iva, d.monto_con_iva, d.etapa, d.fecha_cierre, d.periodo_id,
  d.flags, d.es_division, d.ingesta_id
from public.hubspot_deals d
left join public.profiles p on p.id = d.vendedor_id
where d.calidad <> 'ok' or cardinality(d.flags) > 0;

alter view public.v_deals_por_revisar set (security_invoker = on);
