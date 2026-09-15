-- =====================================================================
-- 025_marketing_tareas_cuota_semanal.sql — Agrega 'cuota_semanal' a los
-- tipos válidos de marketing_tareas (ej. "contenido para WhatsApp de
-- Estado, cada martes"), junto a 'cuota_mensual' y 'suelta'.
-- =====================================================================

alter table public.marketing_tareas
  drop constraint if exists marketing_tareas_tipo_check,
  add constraint marketing_tareas_tipo_check
  check (tipo in ('cuota_mensual', 'cuota_semanal', 'suelta'));
