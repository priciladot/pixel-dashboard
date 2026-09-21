-- =====================================================================
-- 034_metas_semaforo.sql — Metas de 3 niveles (Verde/Amarillo/Rojo) por
-- vendedor y mes, separadas por Existentes y Nuevos, más el Punto de
-- Equilibrio individual -- para el "Reporte Semanal y Semáforos de
-- Desempeño Comercial" del Dashboard Maestro.
--
-- La tabla `objetivos` ya existente solo guarda UN objetivo por bloque
-- (no 3 niveles) y el PE solo existe a nivel área -- esta tabla es la
-- pieza que faltaba, sin tocar `objetivos`. Todo con IVA incluido (así
-- lo confirmó Pris): Rojo no se guarda aparte, es "< amarillo" por
-- definición.
-- =====================================================================

create table if not exists public.metas_semaforo (
  vendedor_id         uuid not null references public.profiles(id) on delete cascade,
  periodo_id          text not null references public.periodos(id) on delete cascade,
  existentes_verde    numeric(14,2) not null,
  existentes_amarillo numeric(14,2) not null,
  nuevos_verde        numeric(14,2) not null,
  nuevos_amarillo     numeric(14,2) not null,
  punto_equilibrio    numeric(14,2) not null,
  actualizado_en      timestamptz not null default now(),
  primary key (vendedor_id, periodo_id)
);

comment on table public.metas_semaforo is
  'Metas de 3 niveles (Verde/Amarillo/Rojo, con IVA) por vendedor y mes, separadas en Existentes y Nuevos, más su Punto de Equilibrio individual. Rojo = cualquier resultado por debajo del umbral Amarillo.';

alter table public.metas_semaforo enable row level security;

create policy metas_semaforo_read on public.metas_semaforo for select to authenticated
  using (vendedor_id = auth.uid() or public.es_direccion());

create policy metas_semaforo_write on public.metas_semaforo for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
