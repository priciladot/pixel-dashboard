-- =====================================================================
-- 011_vista_actividad_deal.sql — Última actividad real por negocio
-- =====================================================================
-- Bug real en el cálculo de "negocios estancados": usaba
-- hubspot_deals.cerrado_ganado para filtrar "abiertos", pero ese campo es
-- una foto vieja del último sync de deals — puede decir false (cerrado)
-- para un negocio que ya se reactivó y hoy está en una etapa activa según
-- el historial real (hubspot_deal_stages). Por eso "abiertos" siempre daba
-- 0 filas. Aquí "abierto" se decide por la etapa vigente, no por ese campo.
--
-- Además, cruza la fecha de la última actividad real (nota, correo,
-- llamada, tarea o reunión en hubspot_engagements) — no solo el último
-- cambio de etapa — y la empresa de Monday cuando existe.
-- =====================================================================

create or replace view public.v_deal_actividad as
select
  d.hubspot_id,
  d.periodo_id,
  d.vendedor_id,
  d.nombre,
  d.monto_con_iva,
  e.etapa_actual,
  greatest(e.fecha_ultimo_cambio, coalesce(act.ultima_actividad, e.fecha_ultimo_cambio)) as fecha_ultima_actividad,
  mc.empresa
from public.hubspot_deals d
join public.v_deal_etapa_actual e on e.hubspot_id = d.hubspot_id
left join (
  select deal_id_ref as hubspot_id, max(fecha) as ultima_actividad
  from public.hubspot_engagements
  where deal_id_ref is not null
  group by deal_id_ref
) act on act.hubspot_id = d.hubspot_id
left join (
  select hubspot_id, max(empresa) as empresa
  from public.monday_cierres
  where hubspot_id is not null
  group by hubspot_id
) mc on mc.hubspot_id = d.hubspot_id;

alter view public.v_deal_actividad set (security_invoker = on);

comment on view public.v_deal_actividad is
  'Última actividad real por negocio (mayor entre cambio de etapa y actividad de HubSpot), con empresa de Monday. "Abierto" se decide por la etapa vigente (ver pipeline-etapas.ts), no por hubspot_deals.cerrado_ganado, que puede quedar desactualizado tras una reactivación.';
