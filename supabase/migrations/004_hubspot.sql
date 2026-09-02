-- =====================================================================
-- 004_hubspot.sql — Conexión con el portal real de HubSpot
-- =====================================================================
-- Los valores de este archivo NO son inventados: salen de leer el portal.
--   * Los owner IDs son los reales, incluidos los duplicados inactivos
--     (Erick, Gaby, Daniel y Pris tienen un ID viejo y uno vigente; los
--     negocios históricos siguen colgados del viejo).
--   * Las propiedades personalizadas son las que existen hoy en Deals.
-- =====================================================================

-- ------------------------------------------------------------------
-- 1. Mapa de propietarios: varios owner IDs -> una persona
-- ------------------------------------------------------------------
-- profiles.hubspot_owner_id solo admite uno. Esta tabla resuelve el caso
-- real: cuentas duplicadas en HubSpot que apuntan a la misma persona.
create table if not exists public.hubspot_owner_map (
  owner_id     text primary key,
  vendedor_id  uuid not null references public.profiles(id) on delete cascade,
  nombre_raw   text,
  activo       boolean not null default true,
  nota         text
);
create index if not exists idx_owner_map_vendedor on public.hubspot_owner_map(vendedor_id);

alter table public.hubspot_owner_map enable row level security;
drop policy if exists owner_map_read on public.hubspot_owner_map;
create policy owner_map_read on public.hubspot_owner_map for select to authenticated
  using (public.es_direccion());
drop policy if exists owner_map_write on public.hubspot_owner_map;
create policy owner_map_write on public.hubspot_owner_map for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

insert into public.hubspot_owner_map (owner_id, vendedor_id, nombre_raw, activo, nota)
select v.owner_id, p.id, v.nombre_raw, v.activo, v.nota
from (values
  ('26395721',  'Pris',   'Pricila Domínguez',      true,  null),
  ('20495620',  'Pris',   'Pricila Dominguez',      false, 'Cuenta anterior — negocios históricos'),
  ('26405238',  'Daniel', 'Daniel Cebada',          true,  null),
  ('16977021',  'Daniel', 'Daniel Cebada',          false, 'Cuenta anterior — negocios históricos'),
  ('88208161',  'Erick',  'Erick Jimenez',          true,  null),
  ('88181276',  'Erick',  'Erick Jimenez',          false, 'Cuenta anterior — negocios históricos'),
  ('90345924',  'Diego',  'Diego Ramírez',          true,  null),
  ('80956812',  'Roxana', 'Roxana Mendoza',         true,  null),
  ('414692018', 'Gaby',   'Gabriela Gutierrez',     true,  null),
  ('204866184', 'Gaby',   'Gabriela Gutierrez',     false, 'Cuenta anterior — negocios históricos'),
  ('618845046', 'Mar',    'María Gaytán Casillas',  true,  null),
  ('79910864',  'Noelia', 'Noelia Arri',            false, 'Dirección — aparece como propietaria en algunos negocios')
) as v(owner_id, corto, nombre_raw, activo, nota)
join public.profiles p on p.nombre_corto = v.corto
on conflict (owner_id) do update set
  vendedor_id = excluded.vendedor_id,
  nombre_raw  = excluded.nombre_raw,
  activo      = excluded.activo,
  nota        = excluded.nota;

-- El ID vigente también se guarda en profiles, para tenerlo a la mano.
update public.profiles p
set hubspot_owner_id = m.owner_id
from public.hubspot_owner_map m
where m.vendedor_id = p.id and m.activo and p.hubspot_owner_id is distinct from m.owner_id;

-- ------------------------------------------------------------------
-- 2. Catálogo de cierre: las dos categorías puente que ya existen
--    en la propiedad "Categoría de cierre" del portal
-- ------------------------------------------------------------------
insert into public.catalogo_perdida (categoria, descripcion, requiere_fecha_reactivacion, puede_cerrar_como_perdido, activo) values
  ('No es pérdida — reclasificar', 'Se cerró como perdido por error. Debe reclasificarse.', false, false, true),
  ('Criterio anterior / Sin categorizar', 'Negocios del histórico anteriores al catálogo nuevo.', false, true, true)
on conflict (categoria) do update set
  descripcion = excluded.descripcion,
  requiere_fecha_reactivacion = excluded.requiere_fecha_reactivacion,
  puede_cerrar_como_perdido = excluded.puede_cerrar_como_perdido;

-- ------------------------------------------------------------------
-- 3. Campos que aporta el portal y que faltaban en la tabla de deals
-- ------------------------------------------------------------------
alter table public.hubspot_deals
  add column if not exists fecha_reactivacion date,
  add column if not exists clasificacion_raw  text,
  add column if not exists pipeline           text;

comment on column public.hubspot_deals.fecha_reactivacion is
  'De la propiedad fecha_de_reactivacion. Obligatoria cuando la categoría de cierre es "Diferido".';
comment on column public.hubspot_deals.clasificacion_raw is
  'Valor original de clasificacion_de_lead_cliente__prueba_gab_ antes de reducirlo a existente/nuevo.';

-- Bandera nueva: "Diferido" sin fecha de reactivación es un incumplimiento
-- de la regla del catálogo, no un dato faltante cualquiera.
create or replace view public.v_diferidos_sin_fecha as
select d.hubspot_id, d.nombre, coalesce(p.nombre_corto, 'Sin asignar / Por revisar') as vendedor,
       d.monto_sin_iva, d.fecha_cierre, d.periodo_id, d.motivo_perdida
from public.hubspot_deals d
left join public.profiles p on p.id = d.vendedor_id
where d.categoria_perdida = 'Diferido' and d.fecha_reactivacion is null;
alter view public.v_diferidos_sin_fecha set (security_invoker = on);

-- ------------------------------------------------------------------
-- 4. Bitácora de corridas automáticas del cron
-- ------------------------------------------------------------------
alter table public.ingestas
  drop constraint if exists ingestas_tipo_check,
  add constraint ingestas_tipo_check
  check (tipo in ('hubspot_api','hubspot_cron','csv','json','pdf','semaforo_xlsx'));
