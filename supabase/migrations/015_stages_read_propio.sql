-- =====================================================================
-- 015_stages_read_propio.sql — Un vendedor debe poder leer el historial
-- de etapas de SUS PROPIOS negocios
-- =====================================================================
-- hubspot_deal_stages solo se leía si public.es_direccion() -- correcto
-- mientras el historial de etapas solo se usaba en /maestro (admin). Ahora
-- que el perfil individual del vendedor (/vendedor/[id]) también muestra
-- su Embudo, Disciplina Comercial y Suite de Analítica (todo construido
-- sobre v_deal_etapa_actual / v_deal_actividad, que dependen de esta
-- tabla), un vendedor normal necesita ver el historial de SUS deals -- la
-- tabla no tiene vendedor_id propio, así que se valida por join contra
-- hubspot_deals.
-- =====================================================================

drop policy if exists stages_read on public.hubspot_deal_stages;
create policy stages_read on public.hubspot_deal_stages for select to authenticated
  using (
    public.es_direccion()
    or exists (
      select 1 from public.hubspot_deals d
      where d.hubspot_id = hubspot_deal_stages.hubspot_id
        and d.vendedor_id = auth.uid()
    )
  );
