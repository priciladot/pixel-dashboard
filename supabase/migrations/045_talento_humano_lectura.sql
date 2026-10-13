-- =====================================================================
-- 045_talento_humano_lectura.sql — Talento Humano: ver perfiles, SIN editar
-- =====================================================================
-- Requiere que 044 ya haya corrido (el valor de enum debe estar confirmado).
--
-- 1) es_direccion() pasa a incluir 'talento_humano'. Es lo que hoy abre la
--    LECTURA de todos los perfiles de ventas (y las vistas con guardia
--    `where es_direccion()`). Revisado: las únicas políticas de ESCRITURA
--    que dependían de es_direccion() son las de notas_gestion_ventas (ver 2).
--    El resto de escrituras es es_admin() o es_marketing_lead(), que NO
--    cambian y NO incluyen a talento_humano.
-- 2) notas_gestion_ventas: la escritura se separa a es_direccion_escritura()
--    (solo admin/supervisor, como era hasta hoy).
-- 3) Marketing: 4 tablas leían solo con es_marketing_lead() (que se queda
--    igual porque también gobierna escritura). Se agrega una política de
--    SOLO SELECT para talento_humano en cada una.
-- Reversible: borrar las políticas *_th_read y volver a definir
-- es_direccion() sin 'talento_humano'.
-- =====================================================================

create or replace function public.es_direccion()
returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((select rol in ('admin','supervisor','talento_humano') from public.profiles where id = auth.uid()), false)
$fn$;

create or replace function public.es_direccion_escritura()
returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((select rol in ('admin','supervisor') from public.profiles where id = auth.uid()), false)
$fn$;

create or replace function public.es_talento_humano()
returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((select rol = 'talento_humano' from public.profiles where id = auth.uid()), false)
$fn$;

revoke execute on function public.es_direccion_escritura(), public.es_talento_humano() from public;
grant  execute on function public.es_direccion_escritura(), public.es_talento_humano() to authenticated;

-- 2) Notas de gestión de ventas: escribir sigue siendo solo admin/supervisor
drop policy if exists notas_gestion_ventas_write on public.notas_gestion_ventas;
create policy notas_gestion_ventas_write on public.notas_gestion_ventas for all to authenticated
  using (public.es_direccion_escritura()) with check (public.es_direccion_escritura());

-- 3) Marketing: lectura para talento_humano (solo SELECT)
create policy marketing_kpis_th_read on public.marketing_kpis for select to authenticated
  using (public.es_talento_humano());
create policy marketing_tareas_th_read on public.marketing_tareas for select to authenticated
  using (public.es_talento_humano());
create policy marketing_metricas_canal_th_read on public.marketing_metricas_canal for select to authenticated
  using (public.es_talento_humano());
create policy marketing_notas_th_read on public.marketing_notas for select to authenticated
  using (public.es_talento_humano());
