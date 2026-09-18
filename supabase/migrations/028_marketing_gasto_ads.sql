-- =====================================================================
-- 028_marketing_gasto_ads.sql — Inversión y gasto real de ads por mes,
-- para el KPI "Costo por Lead (CPL) / Conversión del Funnel Digital" del
-- perfil de Gerente de Marketing (Dana). No viene de HubSpot ni de
-- Monday -- Dana lo dicta mes a mes -- así que es una tabla chica de
-- captura manual, calcada del patrón de marketing_notas/marketing_tareas.
-- =====================================================================

create table if not exists public.marketing_gasto_ads (
  periodo_id    text primary key references public.periodos(id),
  presupuesto   numeric(12,2),
  gasto_real    numeric(12,2) not null,
  creado_por    uuid references public.profiles(id),
  actualizado_en timestamptz not null default now()
);

comment on table public.marketing_gasto_ads is
  'Inversión planeada y gasto real en ads por mes calendario -- captura manual (Dana la dicta), usada para CPL = gasto_real / leads calificados del mes.';

alter table public.marketing_gasto_ads enable row level security;

create policy marketing_gasto_ads_read on public.marketing_gasto_ads for select to authenticated
  using (public.es_marketing_lead() or public.es_direccion());

create policy marketing_gasto_ads_write on public.marketing_gasto_ads for all to authenticated
  using (public.es_marketing_lead() or public.es_admin()) with check (public.es_marketing_lead() or public.es_admin());
