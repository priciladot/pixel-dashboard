-- =====================================================================
-- 039_resultado_confirmado_vendedor.sql — Resultado real CONFIRMADO A
-- MANO por vendedor y mes, con IVA incluido.
--
-- El "Resultado" del Semáforo se calculaba como MAX(Monday deduplicado,
-- oficial de HubSpot) -- una regla que Pris confirmó semanas atrás con
-- ejemplos reales. Pero tanto Monday como HubSpot pueden seguir teniendo
-- errores puntuales (montos de más, negocios que no debían contar ese
-- mes, etc.) que ninguna de las dos fuentes por sí sola resuelve -- solo
-- Pris, revisando caso por caso, sabe cuál es el número real.
--
-- Esta tabla es la ÚLTIMA palabra: si existe una fila aquí para
-- (vendedor, periodo), gana sobre cualquier cálculo de Monday/HubSpot en
-- resultadoRealPorVendedor(). Si no existe, se sigue usando MAX(Monday,
-- oficial) como respaldo automático.
-- =====================================================================

create table if not exists public.resultado_confirmado_vendedor (
  vendedor_id    uuid not null references public.profiles(id) on delete cascade,
  periodo_id     text not null references public.periodos(id) on delete cascade,
  monto_con_iva  numeric(14,2) not null,
  actualizado_en timestamptz not null default now(),
  primary key (vendedor_id, periodo_id)
);

comment on table public.resultado_confirmado_vendedor is
  'Resultado real confirmado a mano por Pris para un vendedor/mes (con IVA) -- tiene prioridad sobre el cálculo automático MAX(Monday, HubSpot) en resultadoRealPorVendedor().';

alter table public.resultado_confirmado_vendedor enable row level security;

create policy resultado_confirmado_vendedor_read on public.resultado_confirmado_vendedor for select to authenticated
  using (vendedor_id = auth.uid() or public.es_direccion());

create policy resultado_confirmado_vendedor_write on public.resultado_confirmado_vendedor for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
