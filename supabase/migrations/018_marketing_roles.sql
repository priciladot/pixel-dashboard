-- =====================================================================
-- 018_marketing_roles.sql — Nuevos roles para el panel de KPIs de Marketing
-- =====================================================================
-- 'marketing' (Xuan, Santiago, Melissa, Alan -- solo su propio panel) y
-- 'marketing_lead' (Dana -- ve el panel de equipo de los 5, igual que
-- dirección ve /maestro en ventas). NO son "dirección": es_direccion()
-- sigue significando solo admin/supervisor de ventas.
--
-- Postgres no deja usar un valor de enum recién agregado en la misma
-- transacción en la que se agrega -- por eso esta migración va SOLA,
-- antes de 019_marketing_kpis.sql que sí los usa.
-- =====================================================================

alter type public.app_role add value if not exists 'marketing';
alter type public.app_role add value if not exists 'marketing_lead';
