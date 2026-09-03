-- =====================================================================
-- 006_monday_cierres.sql — Cierres reales y ventas divididas (Monday.com)
-- =====================================================================
-- Tablero "Deals Ganados 2026 - HubSpot" (board_id 18408527402). Estructura
-- real confirmada en la interfaz del tablero: cada fila (item) es la
-- porción de UN vendedor sobre un negocio. Monday también trae información
-- operativa/comercial que HubSpot no tiene (tipo de negocio, producto,
-- fechas de evento, viáticos) — se guarda completa para no perderla, aunque
-- hoy solo `tipo_negocio` se use para rellenar un vacío de HubSpot.
--
-- Atribución:
--   Individual o 100%  -> monto_atribuido = monto_total
--   Dividido           -> monto_atribuido = monto_total × (porcentaje_comision / 100)
-- =====================================================================

create table if not exists public.monday_cierres (
  elemento_id           text primary key,                          -- Monday item id

  -- Cruce con HubSpot
  hubspot_id            text,                                       -- llave de enlace con hubspot_deals.hubspot_id; sin FK dura, Monday puede ir adelante de esa sincronización
  link_hubspot          text,

  -- Atribución
  vendedor_id           uuid references public.profiles(id),        -- "Propietario" resuelto a perfil
  propietario           text,                                       -- nombre tal como viene del tablero, para depurar cuando no resuelva alias
  estado_proyecto       text,                                       -- 'Individual' | 'Compartida/Dividida'
  porcentaje_comision   numeric(5,2),                                -- % de este vendedor sobre monto_total (100 si es Individual)
  monto_total           numeric(14,2),
  monto_atribuido       numeric(14,2) generated always as (
                           round(coalesce(monto_total, 0) * coalesce(porcentaje_comision, 0) / 100, 2)
                         ) stored,                                   -- nunca se calcula a mano en la app

  -- Cierre y origen — tipo_negocio llena el vacío que HubSpot no trae
  tipo_negocio          text check (tipo_negocio in ('existente','nuevo','por_revisar')),
  como_llego            text,
  herramienta_venta     text,
  empresa               text,
  correo_cliente        text,

  -- Fechas operativas
  inicio_evento         date,
  fin_evento            date,
  mes_evento            text,                                       -- texto libre del tablero, ej. "Agosto 2026"; no siempre coincide con el periodo KPI
  semana                text,
  dias_activacion       int,
  fecha_cierre          date,

  -- Detalle comercial / producto
  area_pixel_factory    text,
  marca_evento          text,
  productos             text,
  num_productos         int,
  num_activaciones      int,
  viaticos              numeric(14,2),

  ingesta_id            bigint references public.ingestas(id) on delete set null,
  raw                   jsonb,                                      -- payload crudo del item completo, para no descartar columnas que aún no se mapean
  actualizado_en        timestamptz not null default now()
);

create index if not exists idx_monday_hubspot_id on public.monday_cierres(hubspot_id);
create index if not exists idx_monday_vendedor    on public.monday_cierres(vendedor_id);

comment on table public.monday_cierres is
  'Una fila = la porción de un vendedor sobre un negocio, según el tablero de Monday "Deals Ganados 2026 - HubSpot". Un negocio dividido son dos filas (una por persona). También trae datos operativos/comerciales que HubSpot no modela.';
comment on column public.monday_cierres.porcentaje_comision is
  '% de este vendedor sobre monto_total. 100 cuando Estado de Proyecto es Individual (la app lo normaliza así si el tablero lo deja vacío).';
comment on column public.monday_cierres.monto_atribuido is
  'monto_total × (porcentaje_comision / 100), calculado siempre por la base de datos — nunca a mano en el código de ingesta.';
comment on column public.monday_cierres.tipo_negocio is
  'New Business / Cliente existente del tablero, reducido a la misma dicotomía que hubspot_deals.tipo_cliente (existente/nuevo/por_revisar) para poder usarse como respaldo cuando HubSpot no lo trae.';

alter table public.monday_cierres enable row level security;

drop policy if exists monday_read on public.monday_cierres;
create policy monday_read on public.monday_cierres for select to authenticated
  using (public.es_direccion() or vendedor_id = auth.uid());

drop policy if exists monday_write on public.monday_cierres;
create policy monday_write on public.monday_cierres for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- La bitácora de ingestas ya distingue el tipo de corrida (ver 004_hubspot.sql).
alter table public.ingestas
  drop constraint if exists ingestas_tipo_check,
  add constraint ingestas_tipo_check
  check (tipo in ('hubspot_api','hubspot_cron','monday_api','monday_cron','csv','json','pdf','semaforo_xlsx'));

-- ------------------------------------------------------------------
-- Vista operativa: una fila por vendedor por negocio, con el monto ya
-- repartido y el tipo de negocio resuelto (Monday tapa el vacío de
-- HubSpot cuando este último no lo trae). Si Monday no tiene ninguna fila
-- para el hubspot_id, la atribución es íntegra al owner de HubSpot y
-- tipo_negocio cae al tipo_cliente que ya traía HubSpot.
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
