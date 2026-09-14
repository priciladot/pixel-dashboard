-- =====================================================================
-- 022_marketing_tareas.sql — Pendientes/tareas de Marketing asignadas a
-- mano por Dana (lead) o dirección (ej. "3 eventos registrados antes del
-- día 11"), con fecha límite y escalamiento por atraso -- calcado del
-- patrón de lompi_pendientes (edad calculada en la app, no aquí), pero
-- estas se crean a mano, no las empuja un sistema externo.
-- =====================================================================
-- Soporta dos tipos:
--   'cuota_mensual' -- una meta recurrente (ej. "3 eventos/mes"), una fila
--                       por persona y por mes en que aplica.
--   'suelta'        -- una tarea puntual con su propia fecha límite.
-- =====================================================================

create table if not exists public.marketing_tareas (
  id                 bigint generated always as identity primary key,
  vendedor_id        uuid not null references public.profiles(id) on delete cascade,
  periodo_id         text references public.periodos(id),
  titulo             text not null,
  descripcion        text,
  tipo               text not null check (tipo in ('cuota_mensual','suelta')),
  cantidad_requerida int,
  cantidad_actual    int,
  fecha_limite       date not null,
  estatus            text not null default 'pendiente' check (estatus in ('pendiente','cumplida')),
  creado_por         uuid references public.profiles(id),
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);

create index if not exists idx_marketing_tareas_vendedor on public.marketing_tareas(vendedor_id, estatus);

comment on table public.marketing_tareas is
  'Pendientes/tareas de Marketing asignadas a mano (no las empuja un sistema externo) -- cuotas mensuales recurrentes o tareas sueltas, con fecha límite.';

alter table public.marketing_tareas enable row level security;

create policy marketing_tareas_read on public.marketing_tareas for select to authenticated
  using (vendedor_id = auth.uid() or public.es_marketing_lead());

create policy marketing_tareas_write on public.marketing_tareas for all to authenticated
  using (public.es_marketing_lead()) with check (public.es_marketing_lead());
