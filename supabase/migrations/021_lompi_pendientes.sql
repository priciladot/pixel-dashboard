-- =====================================================================
-- 021_lompi_pendientes.sql — Pendientes individuales de Lompi (ej. un
-- WhatsApp sin responder) con ciclo de vida abierto/resuelto, para poder
-- calcular "lleva N días sin atender" y una racha de días al corriente.
-- =====================================================================
-- A diferencia de lompi_auditorias (020, un puntaje por periodo), aquí
-- cada fila es UN pendiente que persiste mientras siga abierto: Lompi
-- manda, en cada corrida, la FOTO de lo que sigue pendiente AHORA -- si
-- algo que antes estaba abierto ya no aparece, se marca resuelto aquí
-- (ingestarPendientesLompi hace el diff, no esta migración).
--
-- Lompi identifica al vendedor por su NÚMERO DE WHATSAPP, no por correo
-- -- de ahí la columna nueva en profiles. Si el teléfono no machea a
-- nadie, se intenta por correo como respaldo (mismo alias de siempre).
-- =====================================================================

alter table public.profiles
  add column if not exists telefono text unique;

comment on column public.profiles.telefono is
  'Número de WhatsApp de la persona, tal como lo manda Lompi -- null para quien no tiene número dado de alta.';

create table if not exists public.lompi_pendientes (
  id                bigint generated always as identity primary key,
  clave_externa     text,                     -- id propio de Lompi para este pendiente, si lo manda
  vendedor_id       uuid references public.profiles(id),
  vendedor_ref_raw  text not null,            -- teléfono o correo tal como llegó, para diagnosticar sin match
  tipo              text not null,            -- 'whatsapp', y lo que Lompi vaya agregando después
  descripcion       text,
  detectado_en      timestamptz not null default now(),
  ultima_vez_visto  timestamptz not null default now(),
  resuelto_en       timestamptz,
  ingesta_id        bigint references public.ingestas(id) on delete set null,
  raw               jsonb
);

create index if not exists idx_lompi_pendientes_vendedor_abiertos
  on public.lompi_pendientes(vendedor_id, tipo)
  where resuelto_en is null;

comment on table public.lompi_pendientes is
  'Empujado por Lompi vía POST /api/ingesta/lompi (campo "pendientes") -- una fila por pendiente individual, con su fecha de detección y de resolución.';

alter table public.lompi_pendientes enable row level security;

create policy lompi_pendientes_read on public.lompi_pendientes for select to authenticated
  using (vendedor_id = auth.uid() or public.es_direccion());

create policy lompi_pendientes_write on public.lompi_pendientes for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
