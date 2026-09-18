-- =====================================================================
-- 029_marketing_seguidores.sql — Seguidores por red social, para el KPI
-- "Crecimiento de Ecosistema Digital" del perfil de Gerente de Marketing
-- (Dana): meta = tendencia creciente mes a mes. No hay integración con
-- las APIs de Instagram/Facebook/Pinterest -- Dana dicta la foto de
-- seguidores cada vez que la tiene a mano, y se compara contra la toma
-- anterior de la misma red para ver la tendencia.
-- =====================================================================

create table if not exists public.marketing_seguidores (
  id          bigint generated always as identity primary key,
  red         text not null check (red in ('instagram', 'facebook', 'pinterest', 'tiktok', 'youtube')),
  fecha       date not null,
  seguidores  integer not null,
  alcance     integer,
  engagement  numeric(6,2),
  creado_por  uuid references public.profiles(id),
  creado_en   timestamptz not null default now(),
  unique (red, fecha)
);

comment on table public.marketing_seguidores is
  'Fotos periódicas de seguidores/alcance/engagement por red social, dictadas por Dana -- sin integración con las APIs de cada plataforma. Alimenta el KPI "Crecimiento de Ecosistema Digital" (tendencia mes a mes).';

alter table public.marketing_seguidores enable row level security;

create policy marketing_seguidores_read on public.marketing_seguidores for select to authenticated
  using (public.es_marketing_lead() or public.es_direccion());

create policy marketing_seguidores_write on public.marketing_seguidores for all to authenticated
  using (public.es_marketing_lead() or public.es_admin()) with check (public.es_marketing_lead() or public.es_admin());
