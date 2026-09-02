-- =====================================================================
-- 003_seed.sql — Catálogos, calendario de KPI y línea base de Julio 2026
-- =====================================================================
-- ORDEN DE EJECUCIÓN
--   1. Crea los usuarios en Supabase Auth (Dashboard > Authentication > Users,
--      o vía `npm run crear-usuarios`).
--   2. Corre este script. Empareja por EMAIL, así que los correos de abajo
--      deben coincidir exactamente con los de Auth.
--
-- IMPORTANTE: los correos de los vendedores son PLACEHOLDERS. Sustitúyelos
-- por los reales antes de correr el script.
-- =====================================================================

-- ------------------------------------------------------------------
-- Helper: alta/actualización de perfil emparejando por email
-- ------------------------------------------------------------------
create or replace function public.seed_perfil(
  p_email       text,
  p_nombre      text,
  p_corto       text,
  p_rol         app_role,
  p_puesto      text default null,
  p_hubspot_id  text default null,
  p_alias       text[] default '{}'
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; a text;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise notice 'Usuario % no existe en auth.users — se omite. Créalo primero en Supabase Auth.', p_email;
    return null;
  end if;

  insert into public.profiles (id, email, nombre_completo, nombre_corto, rol, puesto, hubspot_owner_id)
  values (v_id, p_email, p_nombre, p_corto, p_rol, p_puesto, p_hubspot_id)
  on conflict (id) do update set
    email            = excluded.email,
    nombre_completo  = excluded.nombre_completo,
    nombre_corto     = excluded.nombre_corto,
    rol              = excluded.rol,
    puesto           = excluded.puesto,
    hubspot_owner_id = coalesce(excluded.hubspot_owner_id, public.profiles.hubspot_owner_id);

  foreach a in array (p_alias || array[p_nombre, p_corto, p_email]) loop
    insert into public.profile_alias (vendedor_id, alias) values (v_id, a)
    on conflict (vendedor_id, alias) do nothing;
  end loop;

  return v_id;
end $$;

-- ------------------------------------------------------------------
-- 1. Personas y roles
-- ------------------------------------------------------------------
select public.seed_perfil('pris@digitalpixel.studio',   'Priscila Domínguez',       'Pris',   'admin',
       'Líder Comercial y de Marketing', null, array['Priscilla','Priss','Priscila Dominguez']);

select public.seed_perfil('daniel@digitalpixel.studio',  'Daniel Cebada',            'Daniel', 'supervisor',
       'CEO', null, array['Daniel Cebada','D. Cebada']);
select public.seed_perfil('noelia@digitalpixel.studio',  'Noelia',                   'Noelia', 'supervisor',
       'COO');
select public.seed_perfil('th@digitalpixel.studio',      'Talento Humano',           'TH',     'supervisor',
       'Talento Humano', null, array['Recursos Humanos','RH','HR']);

select public.seed_perfil('erick@digitalpixel.studio',   'Erick Jiménez',            'Erick',  'vendedor',
       'Ejecutivo Comercial', null, array['Erick Jimenez','E. Jiménez']);
select public.seed_perfil('diego@digitalpixel.studio',   'Diego Ramírez',            'Diego',  'vendedor',
       'Ejecutivo Comercial', null, array['Diego Ramirez','D. Ramírez']);
select public.seed_perfil('roxana@digitalpixel.studio',  'Roxana Mendoza',           'Roxana', 'vendedor',
       'Ejecutiva Comercial', null, array['Roxana Mendoza','Rox']);
select public.seed_perfil('mar@digitalpixel.studio',     'María Gaytán Casillas',    'Mar',    'vendedor',
       'Ejecutiva Comercial', null, array['Mar Gaytan','Mar Gaytán','Maria Gaytan Casillas','María Gaytán']);
select public.seed_perfil('gabriela@digitalpixel.studio','Gabriela Gutiérrez',       'Gaby',   'vendedor',
       'Ejecutiva Comercial', null, array['Gaby','Gabriela Gutierrez','G. Gutiérrez']);

-- ------------------------------------------------------------------
-- 2. Calendario de KPI — bloques de 4 semanas
-- ------------------------------------------------------------------
-- Julio 2026: S1 25 jun–1 jul, S2 2–8 jul, S3 9–15 jul, S4 16–22 jul.
-- La semana 23–29 jul pertenece a AGOSTO S1 (así lo define el calendario
-- interno). La cadencia de 7 días continúa a partir de ahí.
insert into public.periodos (id, etiqueta, anio, mes, kpi_inicio, kpi_fin, cal_inicio, cal_fin, cerrado) values
  ('2026-07', 'Julio 2026',      2026, 7, '2026-06-25', '2026-07-22', '2026-07-01', '2026-07-31', true),
  ('2026-08', 'Agosto 2026',     2026, 8, '2026-07-23', '2026-08-19', '2026-08-01', '2026-08-31', true),
  ('2026-09', 'Septiembre 2026', 2026, 9, '2026-08-20', '2026-09-16', '2026-09-01', '2026-09-30', false)
on conflict (id) do update set
  etiqueta = excluded.etiqueta, kpi_inicio = excluded.kpi_inicio, kpi_fin = excluded.kpi_fin,
  cal_inicio = excluded.cal_inicio, cal_fin = excluded.cal_fin;

insert into public.periodo_semanas (periodo_id, semana, inicio, fin) values
  ('2026-07', 1, '2026-06-25', '2026-07-01'),
  ('2026-07', 2, '2026-07-02', '2026-07-08'),
  ('2026-07', 3, '2026-07-09', '2026-07-15'),
  ('2026-07', 4, '2026-07-16', '2026-07-22'),
  ('2026-08', 1, '2026-07-23', '2026-07-29'),
  ('2026-08', 2, '2026-07-30', '2026-08-05'),
  ('2026-08', 3, '2026-08-06', '2026-08-12'),
  ('2026-08', 4, '2026-08-13', '2026-08-19'),
  ('2026-09', 1, '2026-08-20', '2026-08-26'),
  ('2026-09', 2, '2026-08-27', '2026-09-02'),
  ('2026-09', 3, '2026-09-03', '2026-09-09'),
  ('2026-09', 4, '2026-09-10', '2026-09-16')
on conflict (periodo_id, semana) do update set inicio = excluded.inicio, fin = excluded.fin;

-- ------------------------------------------------------------------
-- 3. Estándares universales de la evaluación
-- ------------------------------------------------------------------
insert into public.benchmarks (indicador, valor_min, valor_max, unidad, descripcion) values
  ('correos',      500,  null, 'correos',     'Mínimo 500 correos enviados en el periodo'),
  ('leads',         20,    25, 'leads',       'Entre 20 y 25 leads trabajados en el periodo'),
  ('actividades', 1000,  null, 'actividades', 'Mínimo 1,000 actividades registradas en el periodo'),
  ('tareas_abiertas', null, 20, 'tareas',     'Tareas sin ejecutar acumuladas — tope de tolerancia')
on conflict (indicador) do update set
  valor_min = excluded.valor_min, valor_max = excluded.valor_max,
  unidad = excluded.unidad, descripcion = excluded.descripcion;

-- ------------------------------------------------------------------
-- 4. Catálogo de motivos de pérdida (5 categorías)
-- ------------------------------------------------------------------
insert into public.catalogo_perdida (categoria, descripcion, requiere_fecha_reactivacion, puede_cerrar_como_perdido) values
  ('Perdido en competencia',      'El cliente compró a otro proveedor.',                    false, true),
  ('Perdido por capacidad propia','No se pudo atender por capacidad, agenda o inventario.', false, true),
  ('Descalificado en origen',     'El lead nunca cumplió el filtro de calificación.',       false, true),
  ('Diferido',                    'Se posterga. NO puede cerrarse como perdido y exige fecha de reactivación.', true, false),
  ('Cerrado sin venta',           'El proceso terminó sin compra y sin competidor identificado.', false, true)
on conflict (categoria) do update set
  descripcion = excluded.descripcion,
  requiere_fecha_reactivacion = excluded.requiere_fecha_reactivacion,
  puede_cerrar_como_perdido = excluded.puede_cerrar_como_perdido;

-- ------------------------------------------------------------------
-- 5. Meta anual 2026
-- ------------------------------------------------------------------
insert into public.metas_anuales (anio, objetivo_iva, acumulado_iva, corte_periodo_id, ritmo_lineal_pct, notas) values
  (2026, 108000000.00, 60083485.47, '2026-07', 58.30,
   'Acumulado 55.6% contra ritmo lineal requerido de 58.3%. Faltante $47.9M en 5 meses = $9.58M/mes.')
on conflict (anio) do update set
  objetivo_iva = excluded.objetivo_iva, acumulado_iva = excluded.acumulado_iva,
  corte_periodo_id = excluded.corte_periodo_id, ritmo_lineal_pct = excluded.ritmo_lineal_pct,
  notas = excluded.notas;

-- ------------------------------------------------------------------
-- 6. Cifra oficial del área — Julio 2026 (semáforo comercial, CON IVA)
-- ------------------------------------------------------------------
insert into public.periodo_resumen_area (
  periodo_id, ventana, objetivo_total_iva, venta_total_iva,
  venta_existentes_iva, venta_nuevos_iva,
  leads_registrados, leads_relevantes, leads_con_deal,
  deals_ganados, ganado_sin_iva, deals_marketing, monto_marketing_sin_iva,
  tareas_abiertas, notas
) values (
  '2026-07', 'kpi_4_semanas', 9283333.31, 5758989.07,
  4403982.92, 1355006.15,
  156, 127, 141,
  58, 4644400.00, 29, 1990329.00,
  641,
  'Semáforo comercial (CON IVA) como fuente autoritativa. 76.5% de los ingresos vienen de cartera Existente. Marketing atribuye 42.9% del ingreso.'
) on conflict (periodo_id) do update set
  objetivo_total_iva = excluded.objetivo_total_iva, venta_total_iva = excluded.venta_total_iva,
  venta_existentes_iva = excluded.venta_existentes_iva, venta_nuevos_iva = excluded.venta_nuevos_iva,
  leads_registrados = excluded.leads_registrados, leads_relevantes = excluded.leads_relevantes,
  leads_con_deal = excluded.leads_con_deal, deals_ganados = excluded.deals_ganados,
  ganado_sin_iva = excluded.ganado_sin_iva, deals_marketing = excluded.deals_marketing,
  monto_marketing_sin_iva = excluded.monto_marketing_sin_iva,
  tareas_abiertas = excluded.tareas_abiertas, notas = excluded.notas;

-- ------------------------------------------------------------------
-- 7. Objetivos individuales Julio 2026
-- ------------------------------------------------------------------
-- ATENCIÓN: estos objetivos están RECONSTRUIDOS a partir de venta / % de
-- cumplimiento reportado, porque el objetivo individual no venía en la
-- fuente. La suma da $9,293,038 contra los $9,283,333.31 del área (0.1% de
-- diferencia por redondeo de los porcentajes). Quedan marcados como
-- confirmado = false: sustitúyelos por los objetivos reales del semáforo.
insert into public.objetivos (vendedor_id, periodo_id, objetivo_total, confirmado)
select p.id, '2026-07', v.objetivo, false
from (values
  ('Daniel', 1866145.00),
  ('Mar',    1567032.00),
  ('Pris',   1567062.00),
  ('Gaby',   1566400.00),
  ('Erick',   832968.00),
  ('Roxana', 1186571.00),
  ('Diego',   706860.00)
) as v(corto, objetivo)
join public.profiles p on p.nombre_corto = v.corto
on conflict (vendedor_id, periodo_id) do update set
  objetivo_total = excluded.objetivo_total, confirmado = excluded.confirmado;

-- ------------------------------------------------------------------
-- 8. KPIs individuales Julio 2026 (línea base del histórico)
-- ------------------------------------------------------------------
-- Solo se cargan las cifras que existen en la fuente. El desglose
-- Existentes/Nuevos por vendedor no venía en el reporte (salvo Diego, cuyos
-- Existentes son $0), así que el trigger marca esas filas como 'parcial'.
insert into public.kpi_mensual (
  vendedor_id, periodo_id, ventana,
  venta_existentes_iva, venta_nuevos_iva, venta_total_iva,
  tareas_abiertas, ticket_promedio_sin_iva, ciclo_cierre_dias,
  tasa_conversion_reportada, fuente, notas
)
select p.id, '2026-07', 'kpi_4_semanas',
       v.existentes, v.nuevos, v.total,
       v.tareas, v.ticket, v.ciclo, v.conv, 'semaforo', v.nota
from (values
  ('Daniel', null::numeric, null::numeric, 2149799.00, null::int, null::numeric, null::numeric, null::numeric,
   'Fila con inconsistencias de registro en HubSpot: sin desglose ni actividad asociada.'),
  ('Mar',    null::numeric, null::numeric, 1349214.56,  92, 118234.85,  34.5, 12.10, null),
  ('Pris',   null::numeric, null::numeric, 1054632.56, null,      null, null,  null,
   'Rol de liderazgo: se mide venta, no actividad operativa individual.'),
  ('Gaby',   null::numeric, null::numeric,  744040.24, 135, 160421.62,  24.5, 15.80, null),
  ('Erick',  null::numeric, null::numeric,  238228.91, 104, 121280.11,  57.5, 12.00, null),
  ('Roxana', null::numeric, null::numeric,  189851.40, 211, 131206.25, 117.3, 11.10,
   'Caída simultánea en todos los indicadores de actividad con calidad de contacto intacta.'),
  ('Diego',  0,             33222.40,        33222.40,  99, 161397.57,  19.2,  0.00,
   'Existentes en $0: el resultado depende por completo de cartera nueva.')
) as v(corto, existentes, nuevos, total, tareas, ticket, ciclo, conv, nota)
join public.profiles p on p.nombre_corto = v.corto
on conflict (vendedor_id, periodo_id, ventana) do update set
  venta_existentes_iva      = excluded.venta_existentes_iva,
  venta_nuevos_iva          = excluded.venta_nuevos_iva,
  venta_total_iva           = excluded.venta_total_iva,
  tareas_abiertas           = excluded.tareas_abiertas,
  ticket_promedio_sin_iva   = excluded.ticket_promedio_sin_iva,
  ciclo_cierre_dias         = excluded.ciclo_cierre_dias,
  tasa_conversion_reportada = excluded.tasa_conversion_reportada,
  fuente                    = excluded.fuente,
  notas                     = excluded.notas;

-- ------------------------------------------------------------------
-- 9. Hallazgos transversales de Julio 2026 como contexto de mercado
--    reutilizable en las evaluaciones individuales.
-- ------------------------------------------------------------------
create table if not exists public.contexto_mercado (
  id         bigserial primary key,
  periodo_id text references public.periodos(id) on delete cascade,
  titulo     text not null,
  cuerpo     text not null
);
alter table public.contexto_mercado enable row level security;
drop policy if exists ctx_read on public.contexto_mercado;
create policy ctx_read on public.contexto_mercado for select to authenticated using (true);
drop policy if exists ctx_write on public.contexto_mercado;
create policy ctx_write on public.contexto_mercado for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

insert into public.contexto_mercado (periodo_id, titulo, cuerpo) values
  ('2026-07', 'Estacionalidad Q3',
   'Q3 concentra graduaciones y Back to School. Q4 cambia el escenario: F1 y Corona Capital compiten por el Autódromo.'),
  ('2026-07', 'La actividad no predice el ingreso',
   'El negocio se sostiene en cartera instalada: 76.5% del ingreso proviene de Existentes. Un buen porcentaje de actividad no compensa un resultado bajo en pesos.'),
  ('2026-07', 'Dos fallas idénticas de proceso',
   'En los cinco vendedores: etapas de SEGUIMIENTO en 0 segundos y catálogo de motivos de pérdida contaminado.'),
  ('2026-07', '641 tareas abiertas sin ejecutar',
   'Roxana 211, Gaby 135, Erick 104, Diego 99, Mar 92. Revisar si es un cambio sistémico en la generación/asignación de tareas antes de leerlo como cinco fallas individuales.')
on conflict do nothing;
