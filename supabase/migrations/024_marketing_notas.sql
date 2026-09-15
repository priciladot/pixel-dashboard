-- =====================================================================
-- 024_marketing_notas.sql — Notas de gestión individual de Marketing
-- (llamadas de atención / reconocimientos) -- a diferencia de
-- marketing_tareas (un entregable con fecha límite que se resuelve),
-- esto es un registro permanente de antecedente/desempeño, sin
-- "vencimiento" ni estatus de cumplida/pendiente.
-- =====================================================================

create table if not exists public.marketing_notas (
  id          bigint generated always as identity primary key,
  vendedor_id uuid not null references public.profiles(id) on delete cascade,
  tipo        text not null check (tipo in ('llamada_atencion', 'reconocimiento')),
  titulo      text not null,
  detalle     text,
  creado_por  uuid references public.profiles(id),
  creado_en   timestamptz not null default now()
);

create index if not exists idx_marketing_notas_vendedor on public.marketing_notas(vendedor_id, creado_en desc);

comment on table public.marketing_notas is
  'Notas de gestión individual de Marketing (llamadas de atención / reconocimientos) -- registro permanente de antecedente, no un pendiente con fecha límite.';

alter table public.marketing_notas enable row level security;

create policy marketing_notas_read on public.marketing_notas for select to authenticated
  using (vendedor_id = auth.uid() or public.es_marketing_lead());

create policy marketing_notas_write on public.marketing_notas for all to authenticated
  using (public.es_marketing_lead()) with check (public.es_marketing_lead());
