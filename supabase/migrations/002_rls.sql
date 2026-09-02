-- =====================================================================
-- 002_rls.sql — Row Level Security (RBAC aplicado en la base de datos)
-- =====================================================================
-- Regla de oro: el control de acceso NO vive en la UI. Un vendedor con el
-- token de la app en la mano solo puede leer sus propias filas porque
-- Postgres se lo impide, no porque la pantalla no le muestre el botón.
--
--   admin       (Priscilla)                    -> lectura y escritura total
--   supervisor  (Daniel, Noelia, Talento Hum.) -> lectura total, sin escritura
--   vendedor    (Erick, Diego, Roxana, Mar,
--                Gaby)                          -> solo su propio perfil y
--                                                 solo evaluaciones publicadas
-- =====================================================================

-- Los helpers mi_rol() / es_admin() / es_direccion() se definen en
-- 001_schema.sql (las vistas los necesitan). Son SECURITY DEFINER para evitar
-- la recursión infinita de consultar profiles dentro de las políticas de
-- profiles. Aquí solo se ajusta quién puede ejecutarlos.
revoke execute on function public.mi_rol()      from public;
revoke execute on function public.es_admin()    from public;
revoke execute on function public.es_direccion() from public;
grant  execute on function public.mi_rol(), public.es_admin(), public.es_direccion() to authenticated;

-- ------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.profile_alias     enable row level security;
alter table public.periodos          enable row level security;
alter table public.periodo_semanas   enable row level security;
alter table public.objetivos         enable row level security;
alter table public.benchmarks        enable row level security;
alter table public.kpi_mensual       enable row level security;
alter table public.evaluaciones      enable row level security;
alter table public.evaluacion_brecha enable row level security;
alter table public.acciones          enable row level security;
alter table public.anexos            enable row level security;
alter table public.ingestas          enable row level security;
alter table public.hubspot_deals     enable row level security;
alter table public.catalogo_perdida  enable row level security;
alter table public.accesos_log       enable row level security;

-- ---------------- profiles ----------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.es_direccion());

drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ---------------- catálogos abiertos a cualquier usuario autenticado ----------------
do $$
declare t text;
begin
  foreach t in array array['periodos','periodo_semanas','benchmarks','catalogo_perdida'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated
                    using (public.es_admin()) with check (public.es_admin())', t, t);
  end loop;
end $$;

-- ---------------- profile_alias ----------------
drop policy if exists alias_read on public.profile_alias;
create policy alias_read on public.profile_alias for select to authenticated
  using (vendedor_id = auth.uid() or public.es_direccion());
drop policy if exists alias_write on public.profile_alias;
create policy alias_write on public.profile_alias for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ---------------- objetivos / kpi_mensual ----------------
drop policy if exists objetivos_read on public.objetivos;
create policy objetivos_read on public.objetivos for select to authenticated
  using (vendedor_id = auth.uid() or public.es_direccion());
drop policy if exists objetivos_write on public.objetivos;
create policy objetivos_write on public.objetivos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists kpi_read on public.kpi_mensual;
create policy kpi_read on public.kpi_mensual for select to authenticated
  using (vendedor_id = auth.uid() or public.es_direccion());
drop policy if exists kpi_write on public.kpi_mensual;
create policy kpi_write on public.kpi_mensual for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ---------------- evaluaciones ----------------
-- El vendedor solo ve su evaluación cuando está PUBLICADA. Los borradores
-- son visibles únicamente para dirección.
drop policy if exists evaluaciones_read on public.evaluaciones;
create policy evaluaciones_read on public.evaluaciones for select to authenticated
  using (
    public.es_direccion()
    or (vendedor_id = auth.uid() and estatus = 'publicada')
  );
drop policy if exists evaluaciones_write on public.evaluaciones;
create policy evaluaciones_write on public.evaluaciones for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Las tablas hijas heredan la visibilidad de su evaluación.
do $$
declare t text;
begin
  foreach t in array array['evaluacion_brecha','acciones','anexos'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format($f$
      create policy %I_read on public.%I for select to authenticated
      using (exists (
        select 1 from public.evaluaciones e
        where e.id = %I.evaluacion_id
          and (public.es_direccion() or (e.vendedor_id = auth.uid() and e.estatus = 'publicada'))
      ))$f$, t, t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated
                    using (public.es_admin()) with check (public.es_admin())', t, t);
  end loop;
end $$;

-- Excepción: el vendedor puede marcar el avance de SUS acciones (solo el campo
-- estatus; el resto lo protege un trigger).
drop policy if exists acciones_update_propia on public.acciones;
create policy acciones_update_propia on public.acciones for update to authenticated
  using (exists (
    select 1 from public.evaluaciones e
    where e.id = acciones.evaluacion_id and e.vendedor_id = auth.uid() and e.estatus = 'publicada'
  ))
  with check (exists (
    select 1 from public.evaluaciones e
    where e.id = acciones.evaluacion_id and e.vendedor_id = auth.uid() and e.estatus = 'publicada'
  ));

create or replace function public.acciones_solo_estatus()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.es_admin() then return new; end if;
  if new.descripcion   is distinct from old.descripcion
     or new.meta_numerica is distinct from old.meta_numerica
     or new.fecha_limite  is distinct from old.fecha_limite
     or new.orden         is distinct from old.orden
     or new.evaluacion_id is distinct from old.evaluacion_id then
    raise exception 'Solo el campo estatus puede modificarse desde el perfil del vendedor.';
  end if;
  return new;
end $$;

drop trigger if exists trg_acciones_solo_estatus on public.acciones;
create trigger trg_acciones_solo_estatus before update on public.acciones
  for each row execute function public.acciones_solo_estatus();

-- ---------------- ingestas y deals: solo dirección ----------------
drop policy if exists ingestas_read on public.ingestas;
create policy ingestas_read on public.ingestas for select to authenticated
  using (public.es_direccion());
drop policy if exists ingestas_write on public.ingestas;
create policy ingestas_write on public.ingestas for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists deals_read on public.hubspot_deals;
create policy deals_read on public.hubspot_deals for select to authenticated
  using (public.es_direccion() or vendedor_id = auth.uid());
drop policy if exists deals_write on public.hubspot_deals;
create policy deals_write on public.hubspot_deals for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ---------------- bitácora ----------------
drop policy if exists log_read on public.accesos_log;
create policy log_read on public.accesos_log for select to authenticated
  using (public.es_admin());
drop policy if exists log_insert on public.accesos_log;
create policy log_insert on public.accesos_log for insert to authenticated
  with check (usuario_id = auth.uid());

-- ------------------------------------------------------------------
-- Las vistas se ejecutan con security_invoker para que hereden el RLS
-- de las tablas base (Postgres 15+ / Supabase).
-- ------------------------------------------------------------------
alter view public.v_kpi_vendedor        set (security_invoker = on);
alter view public.v_resumen_periodo     set (security_invoker = on);
alter view public.v_deals_por_revisar   set (security_invoker = on);
alter view public.v_hubspot_por_vendedor set (security_invoker = on);

-- ------------------------------------------------------------------
-- Alta automática de perfil al crear el usuario en Supabase Auth.
-- El rol se toma de user_metadata.rol si viene; si no, 'vendedor'.
-- ------------------------------------------------------------------
create or replace function public.on_auth_user_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nombre_completo, nombre_corto, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre_completo', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'nombre_corto',
             initcap(split_part(split_part(new.email, '@', 1), '.', 1))),
    coalesce((new.raw_user_meta_data->>'rol')::app_role, 'vendedor')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created after insert on auth.users
  for each row execute function public.on_auth_user_created();

-- ---------------- cifras de área y meta anual ----------------
alter table public.periodo_resumen_area enable row level security;
alter table public.metas_anuales        enable row level security;

drop policy if exists area_read on public.periodo_resumen_area;
create policy area_read on public.periodo_resumen_area for select to authenticated
  using (public.es_direccion());
drop policy if exists area_write on public.periodo_resumen_area;
create policy area_write on public.periodo_resumen_area for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists meta_read on public.metas_anuales;
create policy meta_read on public.metas_anuales for select to authenticated
  using (public.es_direccion());
drop policy if exists meta_write on public.metas_anuales;
create policy meta_write on public.metas_anuales for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

alter view public.v_resumen_area set (security_invoker = on);
