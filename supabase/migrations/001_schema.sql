-- =====================================================================
-- PIXEL.play — Dashboard de Ventas y Evaluación de Desempeño
-- 001_schema.sql — Estructura base (PostgreSQL / Supabase)
-- =====================================================================
-- Convenciones del negocio codificadas aquí:
--   * El semáforo comercial es CON IVA; HubSpot es SIN IVA. Factor = 1.16.
--   * El calendario de KPI divide el mes en 4 semanas (S1–S4), NO en mes
--     calendario. Cada periodo guarda ambas ventanas y toda métrica declara
--     cuál usó.
--   * Toda fila proveniente de HubSpot conserva su trazabilidad (raw + flags)
--     y nunca se descarta: se etiqueta.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------
-- 1. Roles y perfiles
-- ------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('admin', 'supervisor', 'vendedor');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text not null unique,
  nombre_completo   text not null,
  nombre_corto      text not null,              -- 'Erick', 'Gaby', 'Mar'
  rol               app_role not null default 'vendedor',
  puesto            text,
  hubspot_owner_id  text unique,                -- llave de mapeo con HubSpot
  activo            boolean not null default true,
  fecha_ingreso     date,
  avatar_url        text,
  creado_en         timestamptz not null default now()
);

comment on column public.profiles.hubspot_owner_id is
  'ID numérico del owner en HubSpot. Si es null, los deals de esta persona caen en "Sin asignar / Por revisar".';

-- Alias de nombres tal como aparecen escritos en CSV/PDF/HubSpot,
-- para resolver "María Gaytán Casillas" == "Mar Gaytan" == "mar.g@..."
create table if not exists public.profile_alias (
  id          bigserial primary key,
  vendedor_id uuid not null references public.profiles(id) on delete cascade,
  alias       text not null,
  alias_norm  text generated always as (lower(btrim(alias))) stored,
  unique (vendedor_id, alias)
);
create index if not exists idx_alias_norm on public.profile_alias(alias_norm);

-- ------------------------------------------------------------------
-- 2. Calendario de periodos (bloques de 4 semanas + ventana calendario)
-- ------------------------------------------------------------------
create table if not exists public.periodos (
  id          text primary key,                  -- '2026-07'
  etiqueta    text not null,                     -- 'Julio 2026'
  anio        int  not null,
  mes         int  not null check (mes between 1 and 12),
  kpi_inicio  date not null,                     -- inicio de S1
  kpi_fin     date not null,                     -- fin de S4
  cal_inicio  date not null,                     -- 1 del mes (incentivos)
  cal_fin     date not null,                     -- fin del mes
  cerrado     boolean not null default false,
  unique (anio, mes)
);

create table if not exists public.periodo_semanas (
  periodo_id text not null references public.periodos(id) on delete cascade,
  semana     int  not null check (semana between 1 and 4),
  inicio     date not null,
  fin        date not null,
  primary key (periodo_id, semana)
);

-- ------------------------------------------------------------------
-- 3. Objetivos y benchmarks
-- ------------------------------------------------------------------
create table if not exists public.objetivos (
  id                  bigserial primary key,
  vendedor_id         uuid not null references public.profiles(id) on delete cascade,
  periodo_id          text not null references public.periodos(id) on delete cascade,
  objetivo_total      numeric(14,2) not null,     -- CON IVA
  objetivo_existentes numeric(14,2),
  objetivo_nuevos     numeric(14,2),
  confirmado          boolean not null default false,
  unique (vendedor_id, periodo_id)
);

-- Estándares universales de la evaluación (sección "Brecha / Eficiencia")
create table if not exists public.benchmarks (
  indicador   text primary key,      -- 'correos', 'leads', 'actividades'
  valor_min   numeric,
  valor_max   numeric,
  unidad      text,
  descripcion text
);

-- ------------------------------------------------------------------
-- 4. KPIs mensuales consolidados (lo que alimenta los tableros)
-- ------------------------------------------------------------------
do $$ begin
  create type ventana_kpi as enum ('kpi_4_semanas', 'calendario');
exception when duplicate_object then null; end $$;

do $$ begin
  create type calidad_dato as enum ('ok', 'parcial', 'por_revisar');
exception when duplicate_object then null; end $$;

create table if not exists public.kpi_mensual (
  id                      bigserial primary key,
  vendedor_id             uuid not null references public.profiles(id) on delete cascade,
  periodo_id              text not null references public.periodos(id) on delete cascade,
  ventana                 ventana_kpi not null default 'kpi_4_semanas',

  -- Ventas (fuente autoritativa: semáforo comercial, CON IVA)
  -- El desglose Existentes/Nuevos puede llegar después que el total: por eso
  -- venta_total_iva es columna propia. Si viene null, un trigger la calcula
  -- desde el desglose; si viene el total y el desglose está incompleto, se
  -- respeta el total y la fila se marca 'parcial'.
  venta_existentes_iva    numeric(14,2),
  venta_nuevos_iva        numeric(14,2),
  venta_total_iva         numeric(14,2) not null default 0,

  -- Embudo
  leads_registrados       int,
  leads_relevantes        int,
  deals_creados           int,
  deals_ganados           int,
  deals_perdidos          int,

  -- Actividad operativa
  correos_enviados        int,
  llamadas                int,
  reuniones               int,
  actividades_totales     int,
  tareas_abiertas         int,

  -- Eficiencia
  ticket_promedio_sin_iva numeric(14,2),
  ciclo_cierre_dias       numeric(6,1),
  -- Tasa de conversión tal como la reportó la fuente oficial. Cuando existe,
  -- manda sobre el cálculo deals_ganados / leads_registrados.
  tasa_conversion_reportada numeric(5,2),

  -- Trazabilidad
  fuente                  text not null default 'manual'
                            check (fuente in ('manual','semaforo','hubspot_api','archivo')),
  ingesta_id              bigint,
  calidad                 calidad_dato not null default 'ok',
  notas                   text,
  actualizado_en          timestamptz not null default now(),
  unique (vendedor_id, periodo_id, ventana)
);

-- ------------------------------------------------------------------
-- 5. Evaluación cualitativa mensual (las 6 secciones del reporte 1:1)
-- ------------------------------------------------------------------
create table if not exists public.evaluaciones (
  id               bigserial primary key,
  vendedor_id      uuid not null references public.profiles(id) on delete cascade,
  periodo_id       text not null references public.periodos(id) on delete cascade,
  estatus          text not null default 'borrador' check (estatus in ('borrador','publicada')),
  calificacion     numeric(3,2) check (calificacion between 0 and 5),
  diagnostico      text,          -- §1 Diagnóstico actual
  contexto_mercado text,          -- §4 Contexto de mercado y eficiencia
  feedback         text,          -- §5 Feedback honesto/directo
  ventana_declarada ventana_kpi not null default 'kpi_4_semanas',
  autor_id         uuid references public.profiles(id),
  archivo_origen   text,          -- nombre del PDF/DOCX del que se importó
  publicada_en     timestamptz,
  creado_en        timestamptz not null default now(),
  unique (vendedor_id, periodo_id)
);

-- §2 Análisis de brecha — tabla de 4 columnas
create table if not exists public.evaluacion_brecha (
  id              bigserial primary key,
  evaluacion_id   bigint not null references public.evaluaciones(id) on delete cascade,
  orden           int not null default 0,
  indicador       text not null,
  valor_vendedor  text,
  estandar_esperado text,
  lectura         text
);

-- §3 Acciones pertinentes / Plan de acción inmediato
create table if not exists public.acciones (
  id            bigserial primary key,
  evaluacion_id bigint not null references public.evaluaciones(id) on delete cascade,
  orden         int not null default 0,
  descripcion   text not null,
  meta_numerica text,
  fecha_limite  date,
  estatus       text not null default 'pendiente'
                  check (estatus in ('pendiente','en_curso','cumplida','no_cumplida'))
);

-- §6 Anexos
create table if not exists public.anexos (
  id            bigserial primary key,
  evaluacion_id bigint not null references public.evaluaciones(id) on delete cascade,
  titulo        text,
  storage_path  text not null,
  tipo          text
);

-- ------------------------------------------------------------------
-- 6. Ingestas (HubSpot API + archivos históricos)
-- ------------------------------------------------------------------
create table if not exists public.ingestas (
  id                bigserial primary key,
  tipo              text not null check (tipo in ('hubspot_api','csv','json','pdf','semaforo_xlsx')),
  periodo_id        text references public.periodos(id),
  archivo_nombre    text,
  storage_path      text,
  ejecutado_por     uuid references public.profiles(id),
  iniciado_en       timestamptz not null default now(),
  terminado_en      timestamptz,
  estatus           text not null default 'en_proceso'
                      check (estatus in ('en_proceso','completada','completada_con_avisos','error')),
  filas_leidas      int not null default 0,
  filas_ok          int not null default 0,
  filas_sanitizadas int not null default 0,
  filas_rechazadas  int not null default 0,
  resumen           jsonb,
  error             text
);

alter table public.kpi_mensual
  drop constraint if exists kpi_mensual_ingesta_fk,
  add constraint kpi_mensual_ingesta_fk
  foreign key (ingesta_id) references public.ingestas(id) on delete set null;

-- Deals crudos + saneados
create table if not exists public.hubspot_deals (
  hubspot_id        text primary key,
  ingesta_id        bigint references public.ingestas(id) on delete set null,
  nombre            text,
  owner_hubspot_id  text,
  owner_nombre_raw  text,
  vendedor_id       uuid references public.profiles(id),   -- null => Sin asignar / Por revisar
  monto_sin_iva     numeric(14,2),
  monto_con_iva     numeric(14,2) generated always as (round(coalesce(monto_sin_iva,0) * 1.16, 2)) stored,
  etapa             text,
  cerrado_ganado    boolean,
  fecha_creacion    timestamptz,
  fecha_cierre      timestamptz,
  periodo_id        text references public.periodos(id),
  tipo_cliente      text check (tipo_cliente in ('existente','nuevo','por_revisar')),
  origen            text,
  atribucion        text,                                   -- 'marketing' | 'ventas' | null
  motivo_perdida    text,
  categoria_perdida text,
  es_division       boolean not null default false,
  flags             text[] not null default '{}',
  calidad           calidad_dato not null default 'ok',
  raw               jsonb,
  actualizado_en    timestamptz not null default now()
);
create index if not exists idx_deals_periodo   on public.hubspot_deals(periodo_id);
create index if not exists idx_deals_vendedor  on public.hubspot_deals(vendedor_id);
create index if not exists idx_deals_calidad   on public.hubspot_deals(calidad);

comment on column public.hubspot_deals.flags is
  'Marcas de sanitización: owner_sin_mapear, monto_faltante, fecha_faltante, duplicado, division_doble_conteo, fuera_de_periodo, etapa_desconocida.';

-- Catálogo de motivos de pérdida (5 categorías)
create table if not exists public.catalogo_perdida (
  id                           serial primary key,
  categoria                    text not null unique,
  descripcion                  text,
  requiere_fecha_reactivacion  boolean not null default false,
  puede_cerrar_como_perdido    boolean not null default true,
  activo                       boolean not null default true
);

-- Bitácora de acceso (quién vio qué perfil)
create table if not exists public.accesos_log (
  id         bigserial primary key,
  usuario_id uuid references public.profiles(id) on delete set null,
  accion     text not null,
  recurso    text,
  creado_en  timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- 7. Funciones de negocio
-- ------------------------------------------------------------------
create or replace function public.con_iva(monto numeric)
returns numeric language sql immutable as $$ select round(coalesce(monto,0) * 1.16, 2) $$;

create or replace function public.sin_iva(monto numeric)
returns numeric language sql immutable as $$ select round(coalesce(monto,0) / 1.16, 2) $$;

-- Helpers de rol. Viven aquí porque las vistas de más abajo los usan; el RLS
-- de 002 solo les ajusta permisos de ejecución.
create or replace function public.mi_rol()
returns app_role
language sql stable security definer set search_path = public as $fn$
  select rol from public.profiles where id = auth.uid()
$fn$;

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((select rol = 'admin' from public.profiles where id = auth.uid()), false)
$fn$;

create or replace function public.es_direccion()
returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((select rol in ('admin','supervisor') from public.profiles where id = auth.uid()), false)
$fn$;

create or replace function public.semaforo(cumplimiento numeric)
returns text language sql immutable as $$
  select case
    when cumplimiento is null then 'sin_dato'
    when cumplimiento >= 100  then 'verde'
    when cumplimiento >=  80  then 'amarillo'
    when cumplimiento >=  50  then 'naranja'
    else 'rojo'
  end
$$;

-- Devuelve el periodo al que pertenece una fecha según la ventana de KPI (4 semanas)
create or replace function public.periodo_de(f date, ventana ventana_kpi default 'kpi_4_semanas')
returns text language sql stable as $$
  select p.id from public.periodos p
  where case when ventana = 'kpi_4_semanas'
             then f between p.kpi_inicio and p.kpi_fin
             else f between p.cal_inicio and p.cal_fin end
  limit 1
$$;

-- ------------------------------------------------------------------
-- 8. Vistas de lectura para los tableros
-- ------------------------------------------------------------------
create or replace view public.v_kpi_vendedor as
select
  k.id,
  k.vendedor_id,
  p.nombre_corto,
  p.nombre_completo,
  p.rol,
  k.periodo_id,
  per.etiqueta                       as periodo_etiqueta,
  per.anio, per.mes,
  k.ventana,
  k.venta_existentes_iva,
  k.venta_nuevos_iva,
  k.venta_total_iva,
  public.sin_iva(k.venta_total_iva)  as venta_total_sin_iva,
  o.objetivo_total,
  o.confirmado                       as objetivo_confirmado,
  case when coalesce(o.objetivo_total,0) > 0
       then round(k.venta_total_iva / o.objetivo_total * 100, 1) end            as cumplimiento_pct,
  public.semaforo(
    case when coalesce(o.objetivo_total,0) > 0
         then round(k.venta_total_iva / o.objetivo_total * 100, 1) end)         as semaforo,
  case when coalesce(k.venta_total_iva,0) > 0
       then round(coalesce(k.venta_existentes_iva,0) / k.venta_total_iva * 100, 1) end as pct_existentes,
  coalesce(
    k.tasa_conversion_reportada,
    case when coalesce(k.leads_registrados,0) > 0
         then round(k.deals_ganados::numeric / k.leads_registrados * 100, 1) end
  )                                                                             as tasa_conversion_pct,
  (k.tasa_conversion_reportada is not null)                                     as conversion_es_reportada,
  k.leads_registrados, k.leads_relevantes, k.deals_creados, k.deals_ganados, k.deals_perdidos,
  k.correos_enviados, k.llamadas, k.reuniones, k.actividades_totales, k.tareas_abiertas,
  k.ticket_promedio_sin_iva, k.ciclo_cierre_dias,
  k.fuente, k.calidad, k.notas, k.actualizado_en
from public.kpi_mensual k
join public.profiles  p   on p.id  = k.vendedor_id
join public.periodos  per on per.id = k.periodo_id
left join public.objetivos o on o.vendedor_id = k.vendedor_id and o.periodo_id = k.periodo_id;

create or replace view public.v_resumen_periodo as
select
  periodo_id,
  periodo_etiqueta,
  ventana,
  count(*)                                       as vendedores,
  sum(venta_total_iva)                           as venta_total_iva,
  sum(venta_existentes_iva)                      as venta_existentes_iva,
  sum(venta_nuevos_iva)                          as venta_nuevos_iva,
  sum(objetivo_total)                            as objetivo_total,
  case when coalesce(sum(objetivo_total),0) > 0
       then round(sum(venta_total_iva) / sum(objetivo_total) * 100, 1) end as cumplimiento_pct,
  sum(leads_registrados)                         as leads_registrados,
  sum(deals_ganados)                             as deals_ganados,
  sum(tareas_abiertas)                           as tareas_abiertas,
  round(avg(ciclo_cierre_dias), 1)               as ciclo_cierre_promedio,
  count(*) filter (where calidad <> 'ok')        as registros_por_revisar
from public.v_kpi_vendedor
group by periodo_id, periodo_etiqueta, ventana;

-- Deals que la capa de sanitización dejó marcados para revisión
create or replace view public.v_deals_por_revisar as
select
  d.hubspot_id, d.nombre, d.owner_nombre_raw, d.owner_hubspot_id,
  coalesce(p.nombre_corto, 'Sin asignar / Por revisar') as vendedor,
  d.monto_sin_iva, d.monto_con_iva, d.etapa, d.fecha_cierre, d.periodo_id,
  d.flags, d.es_division, d.ingesta_id
from public.hubspot_deals d
left join public.profiles p on p.id = d.vendedor_id
where d.calidad <> 'ok' or cardinality(d.flags) > 0;

-- Comparativo por vendedor calculado directo de HubSpot (control cruzado
-- contra el semáforo; recuerda: HubSpot es SIN IVA)
create or replace view public.v_hubspot_por_vendedor as
select
  d.periodo_id,
  coalesce(p.nombre_corto, 'Sin asignar / Por revisar') as vendedor,
  d.vendedor_id,
  count(*)                                              as deals,
  count(*) filter (where d.cerrado_ganado)              as deals_ganados,
  sum(d.monto_sin_iva) filter (where d.cerrado_ganado)  as ganado_sin_iva,
  sum(d.monto_con_iva) filter (where d.cerrado_ganado)  as ganado_con_iva,
  round(avg(d.monto_sin_iva) filter (where d.cerrado_ganado), 2) as ticket_promedio_sin_iva,
  round(avg(extract(epoch from (d.fecha_cierre - d.fecha_creacion)) / 86400)
        filter (where d.cerrado_ganado), 1)             as ciclo_cierre_dias,
  count(*) filter (where cardinality(d.flags) > 0)      as filas_marcadas
from public.hubspot_deals d
left join public.profiles p on p.id = d.vendedor_id
group by d.periodo_id, p.nombre_corto, d.vendedor_id;

-- ------------------------------------------------------------------
-- 9. Cifras de área y meta anual (fuente: semáforo comercial)
-- ------------------------------------------------------------------
-- El total del área no siempre es la suma de las filas por vendedor (hay
-- ventas sin propietario, ajustes y divisiones). Esta tabla guarda la cifra
-- oficial del área para que el Dashboard Maestro no la reconstruya sumando.
create table if not exists public.periodo_resumen_area (
  periodo_id              text primary key references public.periodos(id) on delete cascade,
  ventana                 ventana_kpi not null default 'kpi_4_semanas',
  objetivo_total_iva      numeric(14,2),
  venta_total_iva         numeric(14,2),
  venta_existentes_iva    numeric(14,2),
  venta_nuevos_iva        numeric(14,2),
  leads_registrados       int,
  leads_relevantes        int,
  leads_con_deal          int,
  deals_ganados           int,
  ganado_sin_iva          numeric(14,2),
  deals_marketing         int,
  monto_marketing_sin_iva numeric(14,2),
  tareas_abiertas         int,
  notas                   text
);

create table if not exists public.metas_anuales (
  anio               int primary key,
  objetivo_iva       numeric(16,2) not null,
  acumulado_iva      numeric(16,2),
  corte_periodo_id   text references public.periodos(id),
  ritmo_lineal_pct   numeric(5,2),
  notas              text
);

-- ------------------------------------------------------------------
-- 10. Trigger: coherencia del total vs. desglose
-- ------------------------------------------------------------------
create or replace function public.kpi_normaliza_totales()
returns trigger language plpgsql as $$
declare suma numeric;
begin
  suma := coalesce(new.venta_existentes_iva, 0) + coalesce(new.venta_nuevos_iva, 0);

  -- Sin total explícito: se calcula desde el desglose.
  if new.venta_total_iva is null or new.venta_total_iva = 0 then
    new.venta_total_iva := suma;
  end if;

  -- Desglose incompleto pero total presente: la fila queda marcada.
  if (new.venta_existentes_iva is null or new.venta_nuevos_iva is null)
     and new.venta_total_iva > 0 then
    if new.calidad = 'ok' then new.calidad := 'parcial'; end if;
    new.notas := coalesce(new.notas || ' | ', '')
                 || 'Desglose Existentes/Nuevos incompleto: solo total del semáforo.';
  -- Desglose completo que no cuadra con el total (tolerancia $1.00).
  elsif abs(suma - new.venta_total_iva) > 1 then
    new.calidad := 'por_revisar';
    new.notas := coalesce(new.notas || ' | ', '')
                 || format('Descuadre: Existentes+Nuevos = %s vs total = %s.', suma, new.venta_total_iva);
  end if;

  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists trg_kpi_normaliza on public.kpi_mensual;
create trigger trg_kpi_normaliza before insert or update on public.kpi_mensual
  for each row execute function public.kpi_normaliza_totales();

-- ------------------------------------------------------------------
-- 11. Vista de área: cifra oficial con respaldo en la suma por vendedor
-- ------------------------------------------------------------------
create or replace view public.v_resumen_area as
select
  p.id                                   as periodo_id,
  p.etiqueta                             as periodo_etiqueta,
  p.anio, p.mes, p.cerrado,
  coalesce(a.ventana, 'kpi_4_semanas')   as ventana,
  coalesce(a.objetivo_total_iva, s.objetivo_total)   as objetivo_total_iva,
  coalesce(a.venta_total_iva,    s.venta_total_iva)  as venta_total_iva,
  coalesce(a.venta_existentes_iva, s.venta_existentes_iva) as venta_existentes_iva,
  coalesce(a.venta_nuevos_iva,     s.venta_nuevos_iva)     as venta_nuevos_iva,
  case when coalesce(coalesce(a.objetivo_total_iva, s.objetivo_total), 0) > 0
       then round(coalesce(a.venta_total_iva, s.venta_total_iva)
                  / coalesce(a.objetivo_total_iva, s.objetivo_total) * 100, 1) end as cumplimiento_pct,
  coalesce(a.leads_registrados, s.leads_registrados) as leads_registrados,
  a.leads_relevantes,
  a.leads_con_deal,
  coalesce(a.deals_ganados, s.deals_ganados)         as deals_ganados,
  a.ganado_sin_iva,
  a.deals_marketing,
  a.monto_marketing_sin_iva,
  coalesce(a.tareas_abiertas, s.tareas_abiertas)     as tareas_abiertas,
  s.vendedores,
  s.registros_por_revisar,
  s.ciclo_cierre_promedio,
  (a.periodo_id is not null)                         as cifra_oficial,
  a.notas
from public.periodos p
left join public.periodo_resumen_area a on a.periodo_id = p.id
left join public.v_resumen_periodo    s on s.periodo_id = p.id and s.ventana = 'kpi_4_semanas'
-- Sin esta guardia, un vendedor vería su propia venta presentada como el total
-- del área (el respaldo suma solo las filas que su RLS le permite leer).
where public.es_direccion();
