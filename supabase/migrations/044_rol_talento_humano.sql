-- =====================================================================
-- 044_rol_talento_humano.sql — Nuevo rol 'talento_humano' (solo lectura)
-- =====================================================================
-- Postgres no deja usar un valor de enum recién agregado en la misma
-- transacción en la que se agrega -- por eso esta migración va SOLA,
-- antes de 045_talento_humano_lectura.sql (mismo patrón que 018).
-- =====================================================================

alter type public.app_role add value if not exists 'talento_humano';
