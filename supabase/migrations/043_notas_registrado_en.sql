-- =====================================================================
-- 043_notas_registrado_en.sql — Separa "cuándo se registró la nota" de
-- "cuándo ocurrieron los hechos" en las Notas de gestión.
--
-- La tarjeta muestra como fecha principal el periodo de los hechos
-- (`periodo_etiqueta`, o la fecha de la nota si no hay periodo). Esta
-- columna opcional guarda la fecha real de registro en el sistema y se
-- muestra como línea secundaria ("Registrada el ..."). Queda en null
-- donde no hay información que respalde la fecha -- nunca se rellena con
-- la fecha actual automáticamente, y no toca ninguna fecha existente.
-- =====================================================================

alter table public.marketing_notas
  add column if not exists registrado_en timestamptz;

alter table public.notas_gestion_ventas
  add column if not exists registrado_en timestamptz;

comment on column public.marketing_notas.registrado_en is
  'Fecha real en que la nota se registró en el sistema (opcional). La fecha/periodo de los hechos va en periodo_etiqueta o creado_en.';
comment on column public.notas_gestion_ventas.registrado_en is
  'Fecha real en que la nota se registró en el sistema (opcional). La fecha/periodo de los hechos va en periodo_etiqueta o creado_en.';
