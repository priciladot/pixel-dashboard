-- =====================================================================
-- 033_marketing_calificacion_leads_mql.sql — Agrega el MQL real (mismo
-- tablero de Monday "🏵️Leads", columna Estatus Lead = "MQL") a
-- marketing_calificacion_leads, para no necesitar una tabla aparte.
-- =====================================================================

alter table public.marketing_calificacion_leads
  add column if not exists mql integer;

comment on column public.marketing_calificacion_leads.mql is
  'Leads con Estatus Lead = "MQL" ese mes, del mismo tablero "🏵️Leads" -- distinto del MQL auto-reportado de marketing_kpis (puede dar conversiones >100% por desfase de tiempo entre cuándo un lead entra como MQL y cuándo el negocio se crea en HubSpot).';
