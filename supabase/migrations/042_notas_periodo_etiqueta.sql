-- =====================================================================
-- 042_notas_periodo_etiqueta.sql — Las tarjetas de notas de gestión
-- (marketing_notas / notas_gestion_ventas) mostraban siempre la fecha
-- de creación formateada ("1 de octubre de 2026"), pero una llamada de
-- atención formal a veces resume varios meses (ej. "agosto y
-- septiembre") y no tiene un solo día real que mostrar.
--
-- Fix: columna opcional `periodo_etiqueta` -- cuando está llena, la
-- tarjeta la muestra en vez de la fecha formateada; si es null, se
-- comporta exactamente igual que antes.
-- =====================================================================

alter table public.marketing_notas
  add column if not exists periodo_etiqueta text;

alter table public.notas_gestion_ventas
  add column if not exists periodo_etiqueta text;

comment on column public.marketing_notas.periodo_etiqueta is
  'Texto libre opcional (ej. "mes de septiembre y agosto") que sustituye la fecha de creación formateada en la tarjeta cuando la nota resume un periodo, no un día puntual.';

comment on column public.notas_gestion_ventas.periodo_etiqueta is
  'Texto libre opcional (ej. "mes de septiembre y agosto") que sustituye la fecha de creación formateada en la tarjeta cuando la nota resume un periodo, no un día puntual.';
