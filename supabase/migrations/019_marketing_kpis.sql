-- =====================================================================
-- 019_marketing_kpis.sql — Panel de KPIs de Marketing (Dana, Xuan,
-- Santiago, Melissa, Alan), sincronizado desde el tablero de Monday
-- "Registro de KPIs - Marketing" (board 18421094583).
-- =====================================================================
-- Requiere que 018_marketing_roles.sql ya haya corrido (usa los valores
-- de enum 'marketing'/'marketing_lead').
-- =====================================================================

-- PASO 1: mapeo directo a la persona real de Monday. A diferencia de
-- ventas (donde un nombre libre de Monday se resuelve por alias difuso,
-- y eso ya causó un duplicado real por acentos -- "Pricila Domínguez" vs
-- "Pricila Dominguez"), aquí se mapea por el ID NUMÉRICO de persona de
-- Monday desde el inicio, que no tiene ambigüedad de ortografía.
alter table public.profiles
  add column if not exists monday_person_id text unique;

comment on column public.profiles.monday_person_id is
  'Id numérico de la persona en Monday.com (columna "Responsables" de Registro/Repositorio de KPIs) -- null para quien no tiene cuenta de Monday.';

-- PASO 2: función de acceso al panel de equipo -- la lead de Marketing,
-- o dirección de ventas (que ya ve todo lo demás).
create or replace function public.es_marketing_lead()
returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((select rol in ('marketing_lead','admin','supervisor') from public.profiles where id = auth.uid()), false)
$fn$;

-- PASO 2b: profiles_select (002_rls.sql) es "id = auth.uid() or es_direccion()"
-- -- eso NO cubre a la lead de Marketing viendo el perfil de Xuan/Santiago/
-- Melissa/Alan desde el panel de equipo (es_direccion() solo es admin/
-- supervisor de ventas). Postgres combina políticas permisivas del mismo
-- comando con OR, así que basta con AGREGAR una política más -- no hace
-- falta tocar la que ya existe.
create policy profiles_select_marketing on public.profiles for select to authenticated
  using (public.es_marketing_lead());

-- PASO 3: una fila = una métrica de una persona (o varias, si el reto es
-- compartido) en una semana de un mes, tal como vive en el tablero.
create table if not exists public.marketing_kpis (
  elemento_id       text primary key,      -- item id de Monday
  nombre_kpi        text not null,         -- "Leads calificados generados", "MQL", etc. (nombre del item, sin el emoji de semáforo)
  unidad            text,                  -- Números / Porcentaje / Tiempo
  equipo            text,
  responsable_ids   uuid[] not null default '{}',  -- resuelto contra profiles.monday_person_id
  responsables_raw  text,                  -- nombres tal como vienen de Monday -- respaldo de despliegue si el mapeo de arriba no encuentra a alguien
  mes               text,
  semana            text,
  cronograma_inicio date,
  cronograma_fin    date,
  meta              numeric,
  umbral_amarillo   numeric,
  umbral_rojo       numeric,
  resultado         numeric,
  pct_cumplimiento  numeric,
  semaforo          text check (semaforo in ('Verde','Amarillo','Rojo')),
  ingesta_id        bigint references public.ingestas(id) on delete set null,
  raw               jsonb,
  actualizado_en    timestamptz not null default now()
);

create index if not exists idx_marketing_kpis_responsables on public.marketing_kpis using gin(responsable_ids);
create index if not exists idx_marketing_kpis_cronograma on public.marketing_kpis(cronograma_inicio, cronograma_fin);

comment on table public.marketing_kpis is
  'Sincronizado desde el tablero de Monday "Registro de KPIs - Marketing" (18421094583) -- Meta/umbrales/Resultado/%Cumplimiento/Semáforo ya vienen calculados por Monday, aquí solo se guardan.';

-- PASO 4: RLS -- mismo patrón de 2 políticas que el resto del proyecto.
alter table public.marketing_kpis enable row level security;

create policy marketing_kpis_read on public.marketing_kpis for select to authenticated
  using (
    auth.uid() = any(responsable_ids)
    or public.es_marketing_lead()
  );

create policy marketing_kpis_write on public.marketing_kpis for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- PASO 5: nuevos tipos de corrida para la bitácora de ingestas.
alter table public.ingestas
  drop constraint if exists ingestas_tipo_check,
  add constraint ingestas_tipo_check
  check (tipo in (
    'hubspot_api','hubspot_cron','hubspot_analitica',
    'monday_api','monday_cron',
    'monday_mkt_api','monday_mkt_cron',
    'csv','json','pdf','semaforo_xlsx'
  ));
