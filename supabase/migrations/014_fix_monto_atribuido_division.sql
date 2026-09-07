-- =====================================================================
-- 014_fix_monto_atribuido_division.sql — El monto de una fila DIVIDIDA
-- ya es el monto atribuido, no el total del trato
-- =====================================================================
-- Bug real: la columna generada monto_atribuido calculaba
-- monto_total * (porcentaje_comision / 100), asumiendo que "Monto" en
-- Monday es el total del trato completo y porcentaje_comision el % que le
-- toca a esa fila. Confirmado con el dueño del tablero: NO es así -- en
-- una venta dividida, cada fila ya captura el monto que le corresponde a
-- esa persona ("Monto" = su parte, no el total). "Porcentaje de comisión"
-- es solo informativo (documenta qué fracción representa esa fila), no
-- un multiplicador a aplicar de nuevo. El total real del trato es la SUMA
-- de las filas divididas, no una de ellas repartida otra vez.
--
-- Esto estaba partiendo a la mitad (o al %) el monto real de CADA trato
-- dividido en todo el dashboard: Desglose de ventas, Origen y canal de
-- venta, y la alerta de auditoría "Monday sin canal" -- no solo en el
-- ejercicio de esta conversación.
-- =====================================================================

-- v_deals_operativo depende de esta columna -- CASCADE la tumba también,
-- se recrea exactamente igual (mismo texto que la migración 006) al final.
alter table public.monday_cierres drop column monto_atribuido cascade;

alter table public.monday_cierres add column monto_atribuido numeric(14,2)
  generated always as (coalesce(monto_total, 0)) stored;

comment on column public.monday_cierres.monto_atribuido is
  'Monto que le corresponde a ESTA fila/vendedor -- igual a monto_total, porque en una venta dividida cada fila YA captura su propia parte (no el total del trato). porcentaje_comision es solo informativo, no se vuelve a aplicar aquí.';

comment on column public.monday_cierres.porcentaje_comision is
  '% que representa esta fila del trato completo -- informativo (para reportar "Individual" vs. "División X%"), NO es un multiplicador: monto_total en esta fila ya es la parte de este vendedor, no el total del trato.';

-- ------------------------------------------------------------------
-- Recrear v_deals_operativo (idéntica a la migración 006 -- el CASCADE de
-- arriba la tumbó porque select m.monto_atribuido as monto_atribuido_con_iva)
-- ------------------------------------------------------------------
create or replace view public.v_deals_operativo as
select
  d.hubspot_id,
  d.periodo_id,
  m.vendedor_id,
  m.monto_atribuido as monto_atribuido_con_iva,
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
  'Una fila por vendedor por deal, con el monto ya repartido según Monday y tipo_negocio resuelto (Monday tapa el vacío de tipo_cliente que HubSpot no trae). Sin registro en Monday, atribución íntegra al owner de HubSpot.';
