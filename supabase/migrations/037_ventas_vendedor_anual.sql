-- =====================================================================
-- 037_ventas_vendedor_anual.sql — Venta acumulada anual SIN IVA por
-- vendedor, para el "Desglose de venta por vendedor acumulado anual"
-- del Comparativo de Ventas en el Dashboard Maestro. Con IVA y % de
-- participación se calculan en vivo (×1.16 y contra el total del año).
-- Snapshot manual que dio Pris, no hay sincronización automática.
-- =====================================================================

create table if not exists public.ventas_vendedor_anual (
  vendedor_id   uuid not null references public.profiles(id) on delete cascade,
  anio          integer not null,
  venta_sin_iva numeric(14,2) not null,
  actualizado_en timestamptz not null default now(),
  primary key (vendedor_id, anio)
);

comment on table public.ventas_vendedor_anual is
  'Venta acumulada anual SIN IVA por vendedor -- cifra fija que dio Pris. Con IVA (×1.16) y % de participación se calculan en vivo contra el total del año.';

alter table public.ventas_vendedor_anual enable row level security;

create policy ventas_vendedor_anual_read on public.ventas_vendedor_anual for select to authenticated
  using (public.es_direccion());

create policy ventas_vendedor_anual_write on public.ventas_vendedor_anual for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
