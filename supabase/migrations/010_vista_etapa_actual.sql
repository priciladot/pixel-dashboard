-- =====================================================================
-- 010_vista_etapa_actual.sql — Etapa vigente por deal
-- =====================================================================
-- hubspot_deal_stages guarda TODO el historial (una fila por cambio) — para
-- el embudo y para detectar negocios estancados hace falta la etapa más
-- reciente de cada deal, no el historial completo. DISTINCT ON no es algo
-- que PostgREST pueda hacer desde el cliente, por eso es una vista.
-- =====================================================================

create or replace view public.v_deal_etapa_actual as
select distinct on (s.hubspot_id)
  s.hubspot_id,
  s.etapa_nueva as etapa_actual,
  s.fecha_cambio as fecha_ultimo_cambio,
  d.periodo_id,
  d.vendedor_id,
  d.nombre,
  d.monto_con_iva,
  d.cerrado_ganado
from public.hubspot_deal_stages s
join public.hubspot_deals d on d.hubspot_id = s.hubspot_id
order by s.hubspot_id, s.fecha_cambio desc;

alter view public.v_deal_etapa_actual set (security_invoker = on);

comment on view public.v_deal_etapa_actual is
  'Una fila por deal con su etapa más reciente (no el historial completo). Base del embudo y de la detección de negocios estancados.';
