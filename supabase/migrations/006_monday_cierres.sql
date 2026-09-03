-- =====================================================================
-- 006_monday_cierres.sql — Cierres reales y ventas divididas (Monday.com)
-- =====================================================================
-- Tablero "Deals Ganados 2026 - HubSpot" (board_id 18408527402). Monday es
-- la fuente para la división de montos cuando dos vendedores colaboran en
-- un mismo evento; HubSpot no modela eso (un deal = un solo owner).
-- =====================================================================

create table if not exists public.monday_cierres (
  elemento_id           text primary key,                          -- Monday item id
  hubspot_id_ref         text,                                       -- liga a hubspot_deals.hubspot_id; sin FK dura: Monday puede ir adelante de la sincronización de HubSpot
  vendedor_principal_id  uuid references public.profiles(id),
  covendedor_id          uuid references public.profiles(id),
  monto_total            numeric(14,2),
  porcentaje_division    numeric(5,2),                               -- % que corresponde al vendedor principal, ej. 60.00
  monto_vendedor         numeric(14,2),
  monto_covendedor       numeric(14,2),
  estado_proyecto        text,                                       -- label de status tal como viene del tablero
  mes_evento             text,                                       -- texto libre del tablero, ej. "Agosto 2026"; no siempre coincide con el periodo KPI
  fecha_cierre           date,
  ingesta_id             bigint references public.ingestas(id) on delete set null,
  raw                    jsonb,                                      -- payload crudo del item, para no descartar nada que aún no se mapea
  actualizado_en         timestamptz not null default now(),
  constraint monday_cierres_covendedor_distinto
    check (covendedor_id is null or covendedor_id is distinct from vendedor_principal_id)
);

create index if not exists idx_monday_hubspot_ref     on public.monday_cierres(hubspot_id_ref);
create index if not exists idx_monday_vendedor        on public.monday_cierres(vendedor_principal_id);
create index if not exists idx_monday_covendedor      on public.monday_cierres(covendedor_id);

comment on table public.monday_cierres is
  'Cierres del tablero de Monday "Deals Ganados 2026 - HubSpot". Fuente de la división de montos cuando dos vendedores colaboran en el mismo evento; HubSpot solo conoce un owner por deal.';
comment on column public.monday_cierres.porcentaje_division is
  '% del monto_total que corresponde a vendedor_principal. El resto es de covendedor cuando existe.';

alter table public.monday_cierres enable row level security;

drop policy if exists monday_read on public.monday_cierres;
create policy monday_read on public.monday_cierres for select to authenticated
  using (
    public.es_direccion()
    or vendedor_principal_id = auth.uid()
    or covendedor_id = auth.uid()
  );

drop policy if exists monday_write on public.monday_cierres;
create policy monday_write on public.monday_cierres for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- La bitácora de ingestas ya distingue el tipo de corrida (ver 004_hubspot.sql).
alter table public.ingestas
  drop constraint if exists ingestas_tipo_check,
  add constraint ingestas_tipo_check
  check (tipo in ('hubspot_api','hubspot_cron','monday_api','monday_cron','csv','json','pdf','semaforo_xlsx'));

-- ------------------------------------------------------------------
-- Vista de atribución comercial: reparte el monto ganado de cada deal
-- entre uno o dos vendedores según lo que diga Monday. Sin registro de
-- división en Monday, la atribución es íntegra al owner de HubSpot
-- (comportamiento actual, sin cambio).
-- ------------------------------------------------------------------
create or replace view public.v_atribucion_comercial as
select
  d.hubspot_id,
  d.periodo_id,
  m.vendedor_principal_id as vendedor_id,
  coalesce(m.monto_vendedor, d.monto_con_iva) as monto_atribuido_con_iva,
  'principal_dividido'::text as rol_atribucion,
  m.elemento_id as monday_elemento_id,
  d.cerrado_ganado
from public.hubspot_deals d
join public.monday_cierres m on m.hubspot_id_ref = d.hubspot_id
where m.covendedor_id is not null

union all

select
  d.hubspot_id,
  d.periodo_id,
  m.covendedor_id as vendedor_id,
  m.monto_covendedor as monto_atribuido_con_iva,
  'covendedor'::text as rol_atribucion,
  m.elemento_id as monday_elemento_id,
  d.cerrado_ganado
from public.hubspot_deals d
join public.monday_cierres m on m.hubspot_id_ref = d.hubspot_id
where m.covendedor_id is not null

union all

select
  d.hubspot_id,
  d.periodo_id,
  d.vendedor_id,
  d.monto_con_iva as monto_atribuido_con_iva,
  'unico'::text as rol_atribucion,
  null::text as monday_elemento_id,
  d.cerrado_ganado
from public.hubspot_deals d
where not exists (
  select 1 from public.monday_cierres m
  where m.hubspot_id_ref = d.hubspot_id and m.covendedor_id is not null
);

alter view public.v_atribucion_comercial set (security_invoker = on);

comment on view public.v_atribucion_comercial is
  'Una fila por vendedor por deal. Cuando Monday registra covendedor, el monto se reparte en dos filas (principal_dividido + covendedor) en vez de duplicarse completo para ambos.';
