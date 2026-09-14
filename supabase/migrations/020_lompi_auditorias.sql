-- =====================================================================
-- 020_lompi_auditorias.sql — Resultados de auditoría de Lompi (desarrollo
-- interno del jefe que audita los números de cada vendedor: puntaje +
-- hallazgos por periodo).
-- =====================================================================
-- A diferencia de HubSpot/Monday (nosotros jalamos su API), aquí es al
-- revés: Lompi nos EMPUJA los resultados a POST /api/ingesta/lompi con
-- una API key propia (LOMPI_API_KEY, variable de entorno -- no vive en
-- este repo). El vendedor se identifica por correo (mismo alias que ya
-- usa el resto de la ingesta vía profiles.email), no por un id nuevo.
-- =====================================================================

create table if not exists public.lompi_auditorias (
  id                bigint generated always as identity primary key,
  vendedor_id       uuid references public.profiles(id),
  vendedor_email_raw text not null,
  periodo           text not null,
  puntaje           numeric,
  hallazgos         jsonb not null default '[]',
  raw               jsonb,
  ingesta_id        bigint references public.ingestas(id) on delete set null,
  creado_en         timestamptz not null default now(),
  unique (vendedor_email_raw, periodo)
);

create index if not exists idx_lompi_auditorias_vendedor on public.lompi_auditorias(vendedor_id);

comment on table public.lompi_auditorias is
  'Empujado por Lompi (desarrollo interno) vía POST /api/ingesta/lompi -- un puntaje + hallazgos por vendedor y periodo.';

alter table public.lompi_auditorias enable row level security;

create policy lompi_auditorias_read on public.lompi_auditorias for select to authenticated
  using (vendedor_id = auth.uid() or public.es_direccion());

create policy lompi_auditorias_write on public.lompi_auditorias for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

alter table public.ingestas
  drop constraint if exists ingestas_tipo_check,
  add constraint ingestas_tipo_check
  check (tipo in (
    'hubspot_api','hubspot_cron','hubspot_analitica',
    'monday_api','monday_cron',
    'monday_mkt_api','monday_mkt_cron',
    'lompi_api',
    'csv','json','pdf','semaforo_xlsx'
  ));
