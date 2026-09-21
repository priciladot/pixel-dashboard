-- =====================================================================
-- 040_notas_gestion_ventas.sql — Notas de gestión individual del equipo
-- comercial (llamadas de atención / reconocimientos), igual que
-- marketing_notas (024) pero para vendedores de ventas -- un registro
-- permanente de antecedente/desempeño, sin fecha límite ni estatus de
-- cumplida/pendiente. Se muestra en el dashboard individual del
-- vendedor (/vendedor/[id]).
-- =====================================================================

create table if not exists public.notas_gestion_ventas (
  id          bigint generated always as identity primary key,
  vendedor_id uuid not null references public.profiles(id) on delete cascade,
  tipo        text not null check (tipo in ('llamada_atencion', 'reconocimiento', 'recordatorio')),
  titulo      text not null,
  detalle     text,
  creado_por  uuid references public.profiles(id),
  creado_en   timestamptz not null default now()
);

create index if not exists idx_notas_gestion_ventas_vendedor on public.notas_gestion_ventas(vendedor_id, creado_en desc);

comment on table public.notas_gestion_ventas is
  'Notas de gestión individual del equipo comercial (llamadas de atención / reconocimientos) -- registro permanente de antecedente, no un pendiente con fecha límite.';

alter table public.notas_gestion_ventas enable row level security;

create policy notas_gestion_ventas_read on public.notas_gestion_ventas for select to authenticated
  using (vendedor_id = auth.uid() or public.es_direccion());

create policy notas_gestion_ventas_write on public.notas_gestion_ventas for all to authenticated
  using (public.es_direccion()) with check (public.es_direccion());
