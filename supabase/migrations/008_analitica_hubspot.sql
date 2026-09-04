-- =====================================================================
-- 008_analitica_hubspot.sql — Actividades, tareas, etapas y leads
-- =====================================================================
-- Cubre lo que hoy falta de los reportes nativos de HubSpot:
--   hubspot_deal_stages   historial de cambios de etapa (propertiesWithHistory
--                         sobre dealstage — mismo scope que ya se usa para deals)
--   hubspot_engagements   calls / emails / meetings / notes / tasks — CADA UNO
--                         es un objeto CRM separado en HubSpot, con su propio
--                         scope de lectura (crm.objects.<tipo>.read). deals.read
--                         y contacts.read NO dan acceso a estos endpoints.
--   hubspot_leads         objeto Leads (crm.objects.leads.read) si el portal lo
--                         tiene habilitado; si no, el embudo se arma solo con
--                         etapas de deals.
--
-- Ninguna de estas tablas toca kpi_mensual / periodo_resumen_area: son
-- fuente operativa nueva, no reemplazan al semáforo como fuente de dinero.
-- =====================================================================

-- ------------------------------------------------------------------
-- 1. Historial de etapas — sí funciona con el scope actual
-- ------------------------------------------------------------------
create table if not exists public.hubspot_deal_stages (
  id             bigserial primary key,
  hubspot_id     text not null,                 -- id del deal en HubSpot (no FK dura: puede llegar antes que el deal a hubspot_deals)
  etapa_anterior text,                           -- null en el primer registro de vida del deal
  etapa_nueva    text not null,
  fecha_cambio   timestamptz not null,
  ingesta_id     bigint references public.ingestas(id) on delete set null,
  raw            jsonb,
  unique (hubspot_id, etapa_nueva, fecha_cambio)
);
create index if not exists idx_stages_hubspot_id on public.hubspot_deal_stages(hubspot_id);

comment on table public.hubspot_deal_stages is
  'Historial de dealstage por deal, leído con propertiesWithHistory=dealstage sobre el mismo endpoint de deals. Habilita ciclo de cierre real por etapa, no solo fecha_creacion -> fecha_cierre.';

-- ------------------------------------------------------------------
-- 2. Actividades y tareas — necesitan scopes propios por tipo
-- ------------------------------------------------------------------
create table if not exists public.hubspot_engagements (
  hubspot_id        text not null,               -- id del engagement EN SU TIPO — no es único entre tipos (una call y un email pueden compartir id numérico)
  tipo              text not null check (tipo in ('call','email','meeting','note','task')),
  deal_id_ref       text,                         -- liga a hubspot_deals.hubspot_id; sin FK dura, mismo motivo que Monday
  vendedor_id       uuid references public.profiles(id),
  owner_hubspot_id  text,
  asunto            text,
  estado            text,                         -- para task: 'NOT_STARTED'/'COMPLETED'/etc.; para call/meeting: outcome
  fecha             timestamptz,                  -- fecha del engagement o fecha límite de la tarea
  duracion_segundos int,                          -- solo call/meeting
  ingesta_id        bigint references public.ingestas(id) on delete set null,
  raw               jsonb,
  actualizado_en    timestamptz not null default now(),
  primary key (tipo, hubspot_id)
);
create index if not exists idx_engagements_deal     on public.hubspot_engagements(deal_id_ref);
create index if not exists idx_engagements_vendedor  on public.hubspot_engagements(vendedor_id);
create index if not exists idx_engagements_tipo      on public.hubspot_engagements(tipo);

comment on table public.hubspot_engagements is
  'Calls, emails, meetings, notes y tasks — objetos CRM separados en HubSpot, cada uno con su propio scope de lectura. La llave es (tipo, hubspot_id) porque el id numérico NO es único entre tipos distintos.';

-- ------------------------------------------------------------------
-- 3. Leads — objeto nuevo de HubSpot, puede no estar habilitado
-- ------------------------------------------------------------------
create table if not exists public.hubspot_leads (
  hubspot_id     text primary key,
  deal_id_ref    text,
  vendedor_id    uuid references public.profiles(id),
  etapa          text,
  fecha_creacion timestamptz,
  ingesta_id     bigint references public.ingestas(id) on delete set null,
  raw            jsonb,
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_leads_deal      on public.hubspot_leads(deal_id_ref);
create index if not exists idx_leads_vendedor  on public.hubspot_leads(vendedor_id);

comment on table public.hubspot_leads is
  'Objeto Leads de HubSpot (crm.objects.leads.read). Puede quedar permanentemente vacía si el portal no tiene este objeto habilitado — en ese caso el embudo se arma solo con hubspot_deal_stages.';

-- ------------------------------------------------------------------
-- RLS — mismo patrón que hubspot_deals / monday_cierres
-- ------------------------------------------------------------------
alter table public.hubspot_deal_stages enable row level security;
drop policy if exists stages_read on public.hubspot_deal_stages;
create policy stages_read on public.hubspot_deal_stages for select to authenticated
  using (public.es_direccion());
drop policy if exists stages_write on public.hubspot_deal_stages;
create policy stages_write on public.hubspot_deal_stages for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

alter table public.hubspot_engagements enable row level security;
drop policy if exists engagements_read on public.hubspot_engagements;
create policy engagements_read on public.hubspot_engagements for select to authenticated
  using (public.es_direccion() or vendedor_id = auth.uid());
drop policy if exists engagements_write on public.hubspot_engagements;
create policy engagements_write on public.hubspot_engagements for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

alter table public.hubspot_leads enable row level security;
drop policy if exists leads_read on public.hubspot_leads;
create policy leads_read on public.hubspot_leads for select to authenticated
  using (public.es_direccion() or vendedor_id = auth.uid());
drop policy if exists leads_write on public.hubspot_leads;
create policy leads_write on public.hubspot_leads for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Nuevo tipo de corrida para la bitácora (ver 004_hubspot.sql / 006_monday_cierres.sql).
alter table public.ingestas
  drop constraint if exists ingestas_tipo_check,
  add constraint ingestas_tipo_check
  check (tipo in (
    'hubspot_api','hubspot_cron','hubspot_analitica',
    'monday_api','monday_cron',
    'csv','json','pdf','semaforo_xlsx'
  ));
