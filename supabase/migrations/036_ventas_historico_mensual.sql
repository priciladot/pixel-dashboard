-- =====================================================================
-- 036_ventas_historico_mensual.sql — Venta mensual SIN IVA, por año, para
-- el Comparativo de Ventas Totales (2026 vs. 2025) del Dashboard Maestro.
--
-- 2025 no está sincronizado en este dashboard (arrancó en 2026) -- Pris
-- dio las cifras fijas de 2025 directamente (más confiables que lo que
-- HubSpot devolvía en vivo, que no coincidía). 2026 sale de HubSpot.
-- Snapshot manual, no hay sincronización automática todavía.
-- =====================================================================

create table if not exists public.ventas_historico_mensual (
  anio        integer not null,
  mes         integer not null check (mes between 1 and 12),
  venta_sin_iva numeric(14,2) not null,
  actualizado_en timestamptz not null default now(),
  primary key (anio, mes)
);

comment on table public.ventas_historico_mensual is
  'Venta mensual SIN IVA por año, para el Comparativo de Ventas Totales del Dashboard Maestro. 2025 es una cifra fija que dio Pris; 2026 sale de HubSpot. Multiplicar por 1.16 para el valor con IVA.';

alter table public.ventas_historico_mensual enable row level security;

create policy ventas_historico_mensual_read on public.ventas_historico_mensual for select to authenticated
  using (public.es_direccion());

create policy ventas_historico_mensual_write on public.ventas_historico_mensual for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
