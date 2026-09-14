-- =====================================================================
-- 023_marketing_metricas_canal.sql — Métricas por canal de Marketing que
-- SÍ tienen columna de persona real en Monday (a diferencia de ADS,
-- Pinterest, Engagement Cuenta, CTR META y Soporte operativo, donde la
-- atribución no vive en Monday -- ver investigación del 2026-09-14,
-- quedan para una siguiente pasada con reglas fijas en código).
--
-- Tableros integrados aquí:
--   Individual Engagement | KPIS (18425462511) -- Alcance, Interacción
--   CTR Individual| KPIS         (18429615591) -- Visualizaciones, Clics, CTR (calculado)
-- =====================================================================

create table if not exists public.marketing_metricas_canal (
  id                bigint generated always as identity primary key,
  tablero           text not null,
  elemento_id       text not null,
  nombre_metrica    text not null,
  valor             numeric,
  responsable_ids   uuid[] not null default '{}',
  responsables_raw  text,
  semana            text,
  ingesta_id        bigint references public.ingestas(id) on delete set null,
  raw               jsonb,
  actualizado_en    timestamptz not null default now(),
  unique (tablero, elemento_id)
);

create index if not exists idx_marketing_metricas_canal_responsables
  on public.marketing_metricas_canal using gin(responsable_ids);

comment on table public.marketing_metricas_canal is
  'Métricas por canal de Marketing con columna de persona real en Monday (Individual Engagement, CTR Individual) -- sin meta/semáforo, son números crudos por semana.';

alter table public.marketing_metricas_canal enable row level security;

create policy marketing_metricas_canal_read on public.marketing_metricas_canal for select to authenticated
  using (auth.uid() = any(responsable_ids) or public.es_marketing_lead());

create policy marketing_metricas_canal_write on public.marketing_metricas_canal for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
