-- =====================================================================
-- 016_actividad_contacto_empresa.sql — Actividad real registrada en el
-- CONTACTO o la EMPRESA asociada a un negocio también cuenta como
-- atención al cliente, no solo la que queda pegada directamente al Deal.
-- =====================================================================
-- Roxana detectó que varios negocios "estancados" sí tenían nota/correo/
-- llamada recientes en HubSpot, pero registrados en la ficha del contacto
-- o de la empresa, no en la tarjeta del Deal -- v_deal_actividad solo
-- miraba hubspot_engagements.deal_id_ref, así que esa actividad real era
-- invisible para el semáforo de "Focos rojos / sin atención".
--
-- Requiere que la ingesta ya esté escribiendo (código desplegado antes de
-- correr esto): hubspot_deals.contacto_ids/empresa_id y
-- hubspot_engagements.contact_id_ref/company_id_ref. Los negocios y
-- actividades ya existentes en la base quedan con estas columnas vacías
-- hasta que una ingesta los vuelva a tocar -- no hace falta borrar nada,
-- el próximo sync (cron o manual) los va rellenando.
-- =====================================================================

-- PASO 1: nuevas columnas de asociación.
alter table public.hubspot_deals
  add column if not exists contacto_ids text[] not null default '{}',
  add column if not exists empresa_id text;

alter table public.hubspot_engagements
  add column if not exists contact_id_ref text,
  add column if not exists company_id_ref text;

create index if not exists idx_deals_contacto_ids on public.hubspot_deals using gin(contacto_ids);
create index if not exists idx_deals_empresa_id   on public.hubspot_deals(empresa_id);
create index if not exists idx_engagements_contact on public.hubspot_engagements(contact_id_ref);
create index if not exists idx_engagements_company on public.hubspot_engagements(company_id_ref);

-- PASO 2: v_deal_actividad ahora considera actividad del Deal, de
-- cualquiera de sus Contactos asociados, o de su Empresa asociada -- lo
-- que sea más reciente cuenta como "hubo atención".
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
left join lateral (
  select max(g.fecha) as ultima_actividad
  from public.hubspot_engagements g
  where g.deal_id_ref = d.hubspot_id
     or (g.contact_id_ref is not null and g.contact_id_ref = any(d.contacto_ids))
     or (g.company_id_ref is not null and d.empresa_id is not null and g.company_id_ref = d.empresa_id)
) act on true
left join (
  select hubspot_id, max(empresa) as empresa
  from public.monday_cierres
  where hubspot_id is not null
  group by hubspot_id
) mc on mc.hubspot_id = d.hubspot_id;

alter view public.v_deal_actividad set (security_invoker = on);

comment on column public.v_deal_actividad.ultima_actividad_engagement is
  'Última nota/llamada/tarea/reunión REAL en HubSpot -- ligada al Deal directamente o a su Contacto/Empresa asociada. Null si nunca hubo ninguna. A diferencia de fecha_ultima_actividad, NO cuenta un cambio de etapa como atención al cliente.';

comment on column public.hubspot_deals.contacto_ids is
  'Ids de los Contactos de HubSpot asociados al negocio -- se usa para que una nota/correo registrado en el Contacto cuente como actividad del Deal.';

comment on column public.hubspot_deals.empresa_id is
  'Id de la Empresa de HubSpot asociada al negocio (la primaria si hay varias) -- mismo propósito que contacto_ids.';
