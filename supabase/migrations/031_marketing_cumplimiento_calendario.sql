-- =====================================================================
-- 031_marketing_cumplimiento_calendario.sql — Cumplimiento del Calendario
-- de Marketing (KPI 4 del perfil de Gerente de Marketing), por mes y
-- plataforma. Fuente: tablero de Monday "✅Campañas MKT" (18391821018) --
-- "Fecha y horario - Entrega FINAL" vs. "Fecha Límite de Entrega" de
-- cada campaña (columna "Días de atraso": ≤0 = a tiempo, >0 = atrasado).
--
-- Se descartó el criterio original (subelementos con estatus "Listo" /
-- "No se entregó a tiempo"): ese campo casi no se usa en las campañas de
-- Julio-Septiembre 2026 (solo 2 de más de 60 elementos lo tienen
-- capturado), así que hubiera dado 100% de forma artificial. Las fechas
-- de entrega sí están razonablemente capturadas para Agosto/Septiembre.
--
-- Captura manual por ahora (snapshot jalado de Monday por el asistente),
-- no hay sincronización automática todavía -- ver tarea pendiente de
-- construir la ingesta real de este tablero.
-- =====================================================================

create table if not exists public.marketing_cumplimiento_calendario (
  periodo_id  text not null references public.periodos(id),
  plataforma  text not null check (plataforma in ('facebook', 'instagram', 'google', 'pinterest', 'tiktok', 'youtube')),
  a_tiempo    integer not null default 0,
  atrasado    integer not null default 0,
  sin_resolver integer not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (periodo_id, plataforma)
);

comment on table public.marketing_cumplimiento_calendario is
  'Cumplimiento de fechas de entrega por mes y plataforma, del tablero de Monday "✅Campañas MKT" -- a_tiempo/atrasado viene de comparar Fecha Límite de Entrega vs. Fecha y horario - Entrega FINAL. sin_resolver = campaña sin fecha de entrega final capturada todavía (no cuenta ni a favor ni en contra). Snapshot manual, no sincronización automática.';

alter table public.marketing_cumplimiento_calendario enable row level security;

create policy marketing_cumplimiento_calendario_read on public.marketing_cumplimiento_calendario for select to authenticated
  using (public.es_marketing_lead() or public.es_direccion());

create policy marketing_cumplimiento_calendario_write on public.marketing_cumplimiento_calendario for all to authenticated
  using (public.es_marketing_lead() or public.es_admin()) with check (public.es_marketing_lead() or public.es_admin());
