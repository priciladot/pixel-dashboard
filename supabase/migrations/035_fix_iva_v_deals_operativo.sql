-- =====================================================================
-- 035_fix_iva_v_deals_operativo.sql — v_deals_operativo.monto_atribuido_
-- con_iva NO tenía IVA aplicado -- el nombre de la columna era engañoso.
--
-- Verificado contra HubSpot en vivo: monday_cierres.monto_total llega
-- IDÉNTICO al "amount" de HubSpot (sin IVA), sin ningún ×1.16 en la
-- cadena. La rama de deals SIN match en Monday ya usaba
-- d.monto_con_iva (que sí tiene IVA, de hubspot_deals) -- solo la rama
-- CON match en Monday le faltaba el ×1.16.
--
-- Esto afectaba 3 funcionalidades que consumen esta vista: Origen y
-- canal de venta (mensual e histórico), el ROAS del panel de Gerente de
-- Marketing de Dana, y el nuevo Reporte de Semáforos de Desempeño
-- Comercial -- las 3 quedan corregidas de una vez al arreglar la vista.
-- =====================================================================

create or replace view public.v_deals_operativo as
select
  d.hubspot_id,
  d.periodo_id,
  m.vendedor_id,
  (m.monto_atribuido * 1.16)::numeric(14,2) as monto_atribuido_con_iva,
  m.estado_proyecto,
  coalesce(m.tipo_negocio, d.tipo_cliente) as tipo_negocio,
  m.elemento_id as monday_elemento_id,
  m.empresa,
  m.correo_cliente,
  m.como_llego,
  m.herramienta_venta,
  m.area_pixel_factory,
  m.marca_evento,
  m.productos,
  m.num_productos,
  m.num_activaciones,
  m.viaticos,
  m.inicio_evento,
  m.fin_evento,
  m.mes_evento,
  m.semana,
  m.dias_activacion,
  m.link_hubspot,
  d.cerrado_ganado
from public.hubspot_deals d
join public.monday_cierres m on m.hubspot_id = d.hubspot_id

union all

select
  d.hubspot_id,
  d.periodo_id,
  d.vendedor_id,
  d.monto_con_iva as monto_atribuido_con_iva,
  'Individual'::text as estado_proyecto,
  d.tipo_cliente as tipo_negocio,
  null::text as monday_elemento_id,
  null::text as empresa,
  null::text as correo_cliente,
  null::text as como_llego,
  null::text as herramienta_venta,
  null::text as area_pixel_factory,
  null::text as marca_evento,
  null::text as productos,
  null::int as num_productos,
  null::int as num_activaciones,
  null::numeric as viaticos,
  null::date as inicio_evento,
  null::date as fin_evento,
  null::text as mes_evento,
  null::text as semana,
  null::int as dias_activacion,
  null::text as link_hubspot,
  d.cerrado_ganado
from public.hubspot_deals d
where not exists (
  select 1 from public.monday_cierres m where m.hubspot_id = d.hubspot_id
);

alter view public.v_deals_operativo set (security_invoker = on);

comment on view public.v_deals_operativo is
  'Una fila por vendedor por deal, con el monto ya repartido según Monday (×1.16 para reflejar IVA -- Monday captura montos sin IVA) y tipo_negocio resuelto. Sin registro en Monday, atribución íntegra al owner de HubSpot (monto_con_iva ya trae IVA de origen).';
