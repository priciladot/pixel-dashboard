-- =====================================================================
-- 041_ventas_vendedor_anual_live.sql — El Desglose de venta por vendedor
-- (acumulado 2026) se congeló en una sola foto (21-sep) y nunca se volvió
-- a tocar, mientras que Ventas Totales sí recalcula el mes en curso en
-- vivo -- eso generó una disparidad real de $1,700,116.88 entre ambos
-- módulos (detectada y conciliada exacta al centavo el 2026-09-24).
--
-- Fix: `ventas_vendedor_anual.venta_sin_iva` deja de ser "el año completo
-- congelado" y pasa a ser "congelado SOLO hasta `mes_congelado_hasta`" --
-- el código (comparativoVentasAnual) le suma en vivo el resultado real
-- de cada mes posterior con resultadoRealPorVendedor(), el mismo mecanismo
-- que ya usa Ventas Totales para el mes en curso. Así los dos módulos
-- nunca vuelven a desalinearse.
--
-- El valor de venta_sin_iva se recalcula aquí para QUITARLE la porción de
-- septiembre que ya traía (la cifra que Pris confirmó el 21-sep antes de
-- todas las correcciones posteriores: $4,990,382.80 con IVA, repartida
-- por vendedor) -- verificado que el resultado suma exacto contra el
-- acumulado de enero-agosto ya conocido ($58,232,783.25 sin IVA).
-- =====================================================================

alter table public.ventas_vendedor_anual
  add column if not exists mes_congelado_hasta int;

comment on column public.ventas_vendedor_anual.mes_congelado_hasta is
  'Mes (1-12) hasta el cual venta_sin_iva ya está confirmado/congelado. Los meses posteriores a este, hasta el mes en curso, se suman en vivo con resultadoRealPorVendedor() en comparativoVentasAnual() -- nunca se dejan en la foto vieja.';

update public.ventas_vendedor_anual set mes_congelado_hasta = 8, venta_sin_iva = case vendedor_id
  when 'a93bfea7-8f00-4206-8b9f-a1f6b1418094' then 7037760.37  -- Pris
  when '54bd7780-7400-4b1c-9da9-6791d5d355da' then 8441471.97  -- Gaby
  when 'ebfc6ac7-357a-44bf-9595-7d23bd152125' then 4604186.00  -- Roxana
  when '44ea509d-7d69-4fc7-98d8-97f3809e3e11' then 10207148.50 -- Mar
  when 'ee12562d-a140-4316-b584-87fee849ef8b' then 3007886.10  -- Erick
  when '75565a82-b711-4a41-a75f-4045f8aad9d5' then 611585.00   -- Diego
  when '1d478cee-7cf5-4c69-b98b-48ce4757c099' then 24322745.31 -- Daniel
  else venta_sin_iva
end
where anio = 2026;
