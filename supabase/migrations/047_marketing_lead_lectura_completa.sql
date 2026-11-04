-- =====================================================================
-- 047_marketing_lead_lectura_completa.sql — Dana (marketing_lead): lectura
-- completa del dashboard, SIN escritura nueva
-- =====================================================================
-- es_direccion() es lo que abre la LECTURA de todo el dashboard de ventas
-- (perfiles, negocios, Monday, acumulados anuales, vistas con guardia...).
-- Se agrega 'marketing_lead' a esa lista.
--
-- Por qué no da escritura: desde 045 la única política de escritura que
-- dependía de es_direccion() (notas_gestion_ventas) usa es_direccion_escritura()
-- (solo admin/supervisor). El resto de escrituras es es_admin() o
-- es_marketing_lead(), y esta última NO cambia (Dana ya escribía en las tablas
-- de Marketing; no gana nada nuevo en ventas).
-- Reversible: volver a definir es_direccion() sin 'marketing_lead'.
-- =====================================================================

create or replace function public.es_direccion()
returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((select rol in ('admin','supervisor','talento_humano','marketing_lead') from public.profiles where id = auth.uid()), false)
$fn$;
