-- =====================================================================
-- 026_marketing_notas_recordatorio.sql — Agrega 'recordatorio' a los
-- tipos válidos de marketing_notas (ej. guía de acompañamiento para la
-- lead de Marketing con su equipo), junto a 'llamada_atencion' y
-- 'reconocimiento'.
-- =====================================================================

alter table public.marketing_notas
  drop constraint if exists marketing_notas_tipo_check,
  add constraint marketing_notas_tipo_check
  check (tipo in ('llamada_atencion', 'reconocimiento', 'recordatorio'));
