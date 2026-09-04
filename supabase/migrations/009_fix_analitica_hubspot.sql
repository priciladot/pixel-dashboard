-- =====================================================================
-- 009_fix_analitica_hubspot.sql — Recrea las 3 tablas de 008 con el
-- esquema correcto (las que quedaron creadas divergían: PK distinta,
-- columnas renombradas, sin ingesta_id para trazabilidad). Las tablas
-- están vacías (ninguna ingesta llegó a completarse), así que no hay
-- riesgo de pérdida de datos al recrearlas.
-- =====================================================================

drop table if exists public.hubspot_deal_stages cascade;
drop table if exists public.hubspot_engagements cascade;
drop table if exists public.hubspot_leads cascade;

-- ------------------------------------------------------------------
-- 1. Historial de etapas
-- ------------------------------------------------------------------
create table public.hubspot_deal_stages (
  id             bigserial primary key,
  hubspot_id     text not null,
  etapa_anterior text,
  etapa_nueva    text not null,
  fecha_cambio   timestamptz not null,
  ingesta_id     bigint references public.ingestas(id) on delete set null,
  raw            jsonb,
  unique (hubspot_id, etapa_nueva, fecha_cambio)
);
create index idx_stages_hubspot_id on public.hubspot_deal_stages(hubspot_id);

comment on table public.hubspot_deal_stages is
  'Historial de dealstage por deal, leído con propertiesWithHistory=dealstage vía /deals/batch/read. Habilita ciclo de cierre real por etapa.';

-- ------------------------------------------------------------------
-- 2. Actividades y tareas
-- ------------------------------------------------------------------
create table public.hubspot_engagements (
  hubspot_id        text not null,
  tipo              text not null check (tipo in ('call','email','meeting','note','task')),
  deal_id_ref       text,
  vendedor_id       uuid references public.profiles(id),
  owner_hubspot_id  text,
  asunto            text,
  estado            text,
  fecha             timestamptz,
  duracion_segundos int,
  ingesta_id        bigint references public.ingestas(id) on delete set null,
  raw               jsonb,
  actualizado_en    timestamptz not null default now(),
  primary key (tipo, hubspot_id)
);
create index idx_engagements_deal      on public.hubspot_engagements(deal_id_ref);
create index idx_engagements_vendedor  on public.hubspot_engagements(vendedor_id);
create index idx_engagements_tipo      on public.hubspot_engagements(tipo);

comment on table public.hubspot_engagements is
  'Calls, emails, meetings, notes y tasks. Llave (tipo, hubspot_id) porque el id numérico no es único entre tipos distintos.';

-- ------------------------------------------------------------------
-- 3. Leads
-- ------------------------------------------------------------------
create table public.hubspot_leads (
  hubspot_id     text primary key,
  deal_id_ref    text,
  vendedor_id    uuid references public.profiles(id),
  etapa          text,
  fecha_creacion timestamptz,
  ingesta_id     bigint references public.ingestas(id) on delete set null,
  raw            jsonb,
  actualizado_en timestamptz not null default now()
);
create index idx_leads_deal      on public.hubspot_leads(deal_id_ref);
create index idx_leads_vendedor  on public.hubspot_leads(vendedor_id);

comment on table public.hubspot_leads is
  'Objeto Leads de HubSpot. Puede quedar vacía si el portal no lo tiene habilitado.';

-- ------------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------------
alter table public.hubspot_deal_stages enable row level security;
create policy stages_read on public.hubspot_deal_stages for select to authenticated
  using (public.es_direccion());
create policy stages_write on public.hubspot_deal_stages for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

alter table public.hubspot_engagements enable row level security;
create policy engagements_read on public.hubspot_engagements for select to authenticated
  using (public.es_direccion() or vendedor_id = auth.uid());
create policy engagements_write on public.hubspot_engagements for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

alter table public.hubspot_leads enable row level security;
create policy leads_read on public.hubspot_leads for select to authenticated
  using (public.es_direccion() or vendedor_id = auth.uid());
create policy leads_write on public.hubspot_leads for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
