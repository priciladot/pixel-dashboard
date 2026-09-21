-- =====================================================================
-- 038_meta_mensual_iva.sql — Meta mensual CON IVA (no es pareja mes a
-- mes, Pris la ha ido ajustando) para calcular "Llevamos" contra la
-- meta acumulada a la fecha, no contra la meta anual completa antes de
-- que termine el año.
-- =====================================================================

alter table public.ventas_historico_mensual
  add column if not exists meta_con_iva numeric(14,2);

comment on column public.ventas_historico_mensual.meta_con_iva is
  'Meta del mes, CON IVA -- no es pareja mes a mes (Pris la ajusta). "Llevamos" = venta acumulada real ÷ suma de metas de los meses ya transcurridos.';
