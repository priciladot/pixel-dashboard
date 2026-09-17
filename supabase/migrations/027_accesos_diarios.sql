-- =====================================================================
-- 027_accesos_diarios.sql — Días activos por persona (no inicios de
-- sesión): con sesión persistente, "cuántas veces inició sesión" casi no
-- dice nada -- alguien puede tener la sesión abierta 3 días y seguir
-- usando el dashboard sin volver a "loguearse". Se registra máximo UNA
-- fila por persona por día de calendario, la primera vez que carga
-- cualquier página del área autenticada ese día.
-- =====================================================================

create table if not exists public.accesos_diarios (
  vendedor_id   uuid not null references public.profiles(id) on delete cascade,
  fecha         date not null,
  primera_vez   timestamptz not null default now(),
  primary key (vendedor_id, fecha)
);

comment on table public.accesos_diarios is
  'Un renglón por persona por día en que abrió el dashboard -- días activos, no conteo de inicios de sesión.';

alter table public.accesos_diarios enable row level security;

-- Cada quien lee y escribe su propio renglón (se registra desde el layout
-- autenticado, con el cliente normal de sesión, no el de servicio).
create policy accesos_diarios_propio on public.accesos_diarios for all to authenticated
  using (vendedor_id = auth.uid()) with check (vendedor_id = auth.uid());

-- Dirección y la lead de Marketing ven el historial completo del equipo.
create policy accesos_diarios_lectura_equipo on public.accesos_diarios for select to authenticated
  using (public.es_direccion() or public.es_marketing_lead());
