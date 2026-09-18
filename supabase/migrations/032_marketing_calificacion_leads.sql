-- =====================================================================
-- 032_marketing_calificacion_leads.sql — % real de leads calificados
-- (SQL) contra el TOTAL de leads del mes, para el KPI 1 "Generación de
-- Leads Calificados" del perfil de Gerente de Marketing (meta ≥80%).
--
-- Es un dato DISTINTO del "Leads calificados generados" que ya viene del
-- tablero "Registro de KPIs - Marketing" (ese es un conteo semanal sin
-- el total de leads contra el que comparar). Este sale del tablero
-- "🏵️Leads" de Monday (1060 elementos), columna "Estatus Lead"
-- (MQL/SQL/No es calificado/Venta) por columna "Mes". calificados =
-- SQL + Venta (ambos ya pasaron el filtro de calificación).
--
-- Snapshot manual (jalado por el asistente), no hay sincronización
-- automática todavía.
-- =====================================================================

create table if not exists public.marketing_calificacion_leads (
  periodo_id  text primary key references public.periodos(id),
  total_leads integer not null,
  calificados integer not null,
  actualizado_en timestamptz not null default now()
);

comment on table public.marketing_calificacion_leads is
  'Total de leads del mes vs. calificados (SQL+Venta), del tablero de Monday "🏵️Leads" -- para el % real contra la meta de ≥80% del perfil de Gerente de Marketing. Snapshot manual.';

alter table public.marketing_calificacion_leads enable row level security;

create policy marketing_calificacion_leads_read on public.marketing_calificacion_leads for select to authenticated
  using (public.es_marketing_lead() or public.es_direccion());

create policy marketing_calificacion_leads_write on public.marketing_calificacion_leads for all to authenticated
  using (public.es_marketing_lead() or public.es_admin()) with check (public.es_marketing_lead() or public.es_admin());
