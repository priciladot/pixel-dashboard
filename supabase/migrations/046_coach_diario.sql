-- =====================================================================
-- 046_coach_diario.sql — "Tu foco de hoy" del Coach Comercial con IA
-- =====================================================================
-- Una fila por (vendedor, día): lo que la IA generó para esa persona ese
-- día. Se usa como caché (una sola generación por persona al día) y para
-- que la IA no repita las tácticas de los últimos días.
-- Se escribe solo desde el servidor (service role); cada vendedor lee lo
-- suyo y Dirección / Talento Humano pueden leer todo.
-- =====================================================================

create table if not exists public.coach_diario (
  vendedor_id uuid not null references public.profiles(id) on delete cascade,
  fecha       date not null,
  contenido   jsonb not null,
  modelo      text,
  creado_en   timestamptz not null default now(),
  primary key (vendedor_id, fecha)
);

alter table public.coach_diario enable row level security;

create policy coach_diario_read on public.coach_diario for select to authenticated
  using (vendedor_id = auth.uid() or public.es_direccion());
