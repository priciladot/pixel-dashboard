-- =====================================================================
-- 013_punto_equilibrio.sql — Punto de Equilibrio (PE) en el semáforo
-- =====================================================================
-- El semáforo oficial de SEMÁFOROS.xlsx compara la venta contra DOS
-- umbrales: Meta (objetivo) y Punto de Equilibrio (PE) -- no contra cortes
-- genéricos de 80%/50% de la meta. Regla real:
--   Verde    = alcanzó la Meta
--   Amarillo = entre el PE y la Meta
--   Rojo     = por debajo del PE
-- Si un periodo/vendedor todavía no tiene PE capturado (histórico previo a
-- esta migración), se cae al criterio genérico anterior (80%/50%) para no
-- perder el semáforo de datos viejos.
-- =====================================================================

alter table public.objetivos
  add column if not exists objetivo_pe numeric(14,2); -- Punto de Equilibrio, CON IVA

alter table public.periodo_resumen_area
  add column if not exists objetivo_pe_iva numeric(14,2); -- PE del área, CON IVA

create or replace function public.semaforo_meta_pe(venta numeric, objetivo numeric, pe numeric)
returns text language sql immutable as $$
  select case
    when venta is null or coalesce(objetivo, 0) = 0 then 'sin_dato'
    when venta >= objetivo then 'verde'
    when pe is not null and venta >= pe then 'amarillo'
    when pe is not null then 'rojo'
    when venta / objetivo * 100 >= 80 then 'amarillo'
    when venta / objetivo * 100 >= 50 then 'naranja'
    else 'rojo'
  end
$$;

comment on function public.semaforo_meta_pe is
  'Semáforo oficial: verde >= Meta, amarillo entre PE y Meta, rojo < PE. Si pe es null, cae al criterio genérico anterior (80%/50% de la Meta) para periodos sin PE capturado.';

-- ------------------------------------------------------------------
-- v_kpi_vendedor: agrega objetivo_pe y usa el semáforo Meta+PE
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
  o.objetivo_pe,
  o.confirmado                       as objetivo_confirmado,
  case when coalesce(o.objetivo_total,0) > 0
       then round(k.venta_total_iva / o.objetivo_total * 100, 1) end            as cumplimiento_pct,
  public.semaforo_meta_pe(k.venta_total_iva, o.objetivo_total, o.objetivo_pe)    as semaforo,
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

alter view public.v_kpi_vendedor set (security_invoker = on);

-- ------------------------------------------------------------------
-- v_resumen_area: agrega objetivo_pe_iva y un semáforo Meta+PE del área
-- ------------------------------------------------------------------
create or replace view public.v_resumen_area as
select
  p.id                                   as periodo_id,
  p.etiqueta                             as periodo_etiqueta,
  p.anio, p.mes, p.cerrado,
  coalesce(a.ventana, 'kpi_4_semanas')   as ventana,
  coalesce(a.objetivo_total_iva, s.objetivo_total)   as objetivo_total_iva,
  a.objetivo_pe_iva,
  coalesce(a.venta_total_iva,    s.venta_total_iva)  as venta_total_iva,
  coalesce(a.venta_existentes_iva, s.venta_existentes_iva) as venta_existentes_iva,
  coalesce(a.venta_nuevos_iva,     s.venta_nuevos_iva)     as venta_nuevos_iva,
  case when coalesce(coalesce(a.objetivo_total_iva, s.objetivo_total), 0) > 0
       then round(coalesce(a.venta_total_iva, s.venta_total_iva)
                  / coalesce(a.objetivo_total_iva, s.objetivo_total) * 100, 1) end as cumplimiento_pct,
  public.semaforo_meta_pe(
    coalesce(a.venta_total_iva, s.venta_total_iva),
    coalesce(a.objetivo_total_iva, s.objetivo_total),
    a.objetivo_pe_iva
  )                                                   as semaforo,
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

alter view public.v_resumen_area set (security_invoker = on);

-- ------------------------------------------------------------------
-- Carga el PE del Total Área de Septiembre (ya confirmado por SEMÁFOROS.xlsx).
-- El PE por vendedor queda pendiente -- ver mensaje de chat.
-- ------------------------------------------------------------------
update public.periodo_resumen_area
set objetivo_pe_iva = 7888333.30
where periodo_id = '2026-09';
