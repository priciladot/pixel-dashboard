-- =====================================================================
-- 012_auditoria_higiene.sql — Columna de actividad pura para auditoría
-- =====================================================================
-- v_deal_actividad (migración 011) mezcla cambio de etapa + actividad real
-- en fecha_ultima_actividad -- correcto para "negocios estancados" (un
-- cambio de etapa SÍ cuenta como avance), pero incorrecto para la alerta de
-- "abandono de cliente": ahí se necesita saber si hubo una nota/llamada/
-- tarea real, sin que un cambio de etapa automático maquille la falta de
-- atención. Se agrega la columna cruda al final (CREATE OR REPLACE VIEW no
-- admite insertar columnas a media lista, solo al final).
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
  mc.empresa,
  act.ultima_actividad as ultima_actividad_engagement
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

comment on column public.v_deal_actividad.ultima_actividad_engagement is
  'Última nota/llamada/tarea/reunión REAL en HubSpot -- null si nunca hubo ninguna. A diferencia de fecha_ultima_actividad, NO cuenta un cambio de etapa como atención al cliente.';
