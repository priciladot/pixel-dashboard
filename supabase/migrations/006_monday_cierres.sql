-- =====================================================================
-- 006_monday_cierres.sql — Cierres reales y ventas divididas (Monday.com)
-- =====================================================================
-- Tablero "Deals Ganados 2026 - HubSpot" (board_id 18408527402). Estructura
-- real confirmada en la interfaz del tablero: cada fila (item) es la
-- porción de UN vendedor sobre un negocio, con tres columnas:
--   * Estado de Proyecto      'Individual' | 'Compartida/Dividida'
--   * Porcentaje de comisión  % exacto de ese vendedor sobre el monto total
--   * Propietario             el ejecutivo dueño de esa porción
-- Un negocio dividido entre dos vendedores son DOS filas en Monday (una por
-- persona), no una fila con dos columnas de persona. La atribución es:
--   Individual o 100%  -> monto_atribuido = monto_total
--   Dividido           -> monto_atribuido = monto_total × (porcentaje / 100)
-- =====================================================================

create table if not exists public.monday_cierres (
  elemento_id           text primary key,                          -- Monday item id
  hubspot_id_ref         text,                                       -- liga a hubspot_deals.hubspot_id; sin FK dura: Monday puede ir adelante de la sincronización de HubSpot
  vendedor_id            uuid references public.profiles(id),        -- "Propietario" de esta porción
  estado_proyecto        text,                                       -- 'Individual' | 'Compartida/Dividida', tal como viene del tablero
  porcentaje_comision    numeric(5,2),                               -- % de este vendedor sobre monto_total (100 si es Individual)
  monto_total            numeric(14,2),
  monto_atribuido        numeric(14,2) generated always as (
                            round(coalesce(monto_total, 0) * coalesce(porcentaje_comision, 0) / 100, 2)
                          ) stored,                                   -- monto_total × (porcentaje_comision / 100); nunca se calcula a mano en la app
  mes_evento             text,                                       -- texto libre del tablero, ej. "Agosto 2026"; no siempre coincide con el periodo KPI
  fecha_cierre           date,
  ingesta_id             bigint references public.ingestas(id) on delete set null,
  raw                    jsonb,                                      -- payload crudo del item, para no descartar nada que aún no se mapea
  actualizado_en         timestamptz not null default now()
);

create index if not exists idx_monday_hubspot_ref on public.monday_cierres(hubspot_id_ref);
create index if not exists idx_monday_vendedor     on public.monday_cierres(vendedor_id);

comment on table public.monday_cierres is
  'Una fila = la porción de un vendedor sobre un negocio, según el tablero de Monday "Deals Ganados 2026 - HubSpot". Un negocio dividido son dos filas (una por persona), no dos columnas en una fila.';
comment on column public.monday_cierres.porcentaje_comision is
  '% de este vendedor sobre monto_total. 100 cuando Estado de Proyecto es Individual (la app lo normaliza así si el tablero lo deja vacío).';
comment on column public.monday_cierres.monto_atribuido is
  'monto_total × (porcentaje_comision / 100), calculado siempre por la base de datos — nunca a mano en el código de ingesta.';

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
-- Vista de atribución comercial: una fila por vendedor por negocio.
-- Si Monday tiene filas para ese hubspot_id, mandan ellas (ya vienen
-- repartidas). Si no hay ninguna fila de Monday para el negocio, la
-- atribución es íntegra al owner de HubSpot (comportamiento actual).
-- ------------------------------------------------------------------
create or replace view public.v_atribucion_comercial as
select
  d.hubspot_id,
  d.periodo_id,
  m.vendedor_id,
  m.monto_atribuido as monto_atribuido_con_iva,
  m.estado_proyecto,
  m.elemento_id as monday_elemento_id,
  d.cerrado_ganado
from public.hubspot_deals d
join public.monday_cierres m on m.hubspot_id_ref = d.hubspot_id

union all

select
  d.hubspot_id,
  d.periodo_id,
  d.vendedor_id,
  d.monto_con_iva as monto_atribuido_con_iva,
  'Individual'::text as estado_proyecto,
  null::text as monday_elemento_id,
  d.cerrado_ganado
from public.hubspot_deals d
where not exists (
  select 1 from public.monday_cierres m where m.hubspot_id_ref = d.hubspot_id
);

alter view public.v_atribucion_comercial set (security_invoker = on);

comment on view public.v_atribucion_comercial is
  'Una fila por vendedor por deal. Con registro(s) en Monday para el hubspot_id, esas filas mandan (ya vienen repartidas); sin registro, atribución íntegra al owner de HubSpot.';
