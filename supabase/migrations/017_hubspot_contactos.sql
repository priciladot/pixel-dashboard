-- =====================================================================
-- 017_hubspot_contactos.sql — Email real del Contacto asociado al Deal
-- =====================================================================
-- "Correo de contacto" en Focos Rojos / Pipeline / Calidad de Datos salía
-- vacío para negocios abiertos porque nunca se ingestó el objeto Contacto
-- de HubSpot -- hubspot_deals.contacto_ids (migración 016) solo guarda
-- los IDS de los contactos asociados, no su email. Esta tabla guarda ESE
-- email, ingestado aparte (HubSpot no expone el correo como propiedad del
-- Deal, solo como asociación).
-- =====================================================================

create table if not exists public.hubspot_contacts (
  hubspot_id     text primary key,
  email          text,
  ingesta_id     bigint references public.ingestas(id) on delete set null,
  raw            jsonb,
  actualizado_en timestamptz not null default now()
);

comment on table public.hubspot_contacts is
  'Solo el email de los Contactos de HubSpot asociados a algún negocio -- ingestado vía buscarContactosPorId() a partir de hubspot_deals.contacto_ids.';

alter table public.hubspot_contacts enable row level security;

-- Mismo criterio que hubspot_deal_stages (migración 015): dirección ve
-- todo, un vendedor solo ve contactos ligados a SUS propios negocios.
create policy contacts_read on public.hubspot_contacts for select to authenticated
  using (
    public.es_direccion()
    or exists (
      select 1 from public.hubspot_deals d
      where d.vendedor_id = auth.uid()
        and hubspot_contacts.hubspot_id = any(d.contacto_ids)
    )
  );

create policy contacts_write on public.hubspot_contacts for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
