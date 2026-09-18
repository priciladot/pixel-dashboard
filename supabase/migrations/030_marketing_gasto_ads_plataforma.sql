-- =====================================================================
-- 030_marketing_gasto_ads_plataforma.sql — Gasto en ads POR PLATAFORMA
-- (Google/Meta/TikTok/Pinterest), para el KPI "Desempeño de Campañas
-- Digitales (ROAS/KPIs)" del perfil de Gerente de Marketing (Dana). El
-- retorno (ventas atribuidas) sale de "¿cómo llegó?" en v_deals_operativo
-- -- esta tabla solo guarda el lado del gasto, que Dana dicta mes a mes
-- por plataforma. Es un desglose más fino que marketing_gasto_ads
-- (que es el gasto total agregado, para CPL) -- no tienen por qué sumar
-- exactamente igual, cada uno se captura por separado.
-- =====================================================================

create table if not exists public.marketing_gasto_ads_plataforma (
  periodo_id  text not null references public.periodos(id),
  plataforma  text not null check (plataforma in ('google', 'meta', 'tiktok', 'pinterest')),
  gasto       numeric(12,2),
  nota        text,
  creado_por  uuid references public.profiles(id),
  actualizado_en timestamptz not null default now(),
  primary key (periodo_id, plataforma)
);

comment on table public.marketing_gasto_ads_plataforma is
  'Gasto en ads por plataforma y mes -- captura manual (Dana la dicta). gasto NULL + nota = plataforma sin inversión ese mes, no dato faltante. El retorno para ROAS sale de v_deals_operativo.como_llego, no de aquí.';

alter table public.marketing_gasto_ads_plataforma enable row level security;

create policy marketing_gasto_ads_plataforma_read on public.marketing_gasto_ads_plataforma for select to authenticated
  using (public.es_marketing_lead() or public.es_direccion());

create policy marketing_gasto_ads_plataforma_write on public.marketing_gasto_ads_plataforma for all to authenticated
  using (public.es_marketing_lead() or public.es_admin()) with check (public.es_marketing_lead() or public.es_admin());
