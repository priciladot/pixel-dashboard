import { notFound } from "next/navigation";
import { esDireccion, requiereSesion } from "@/lib/auth";
import { perfilPorId } from "@/lib/queries";
import { MarketingTorreDeControl } from "@/components/MarketingTorreDeControl";

export const dynamic = "force-dynamic";

/**
 * Perfil individual de Marketing -- calcado de /vendedor/[id]: el RLS de
 * `profiles` y de `marketing_kpis` (auth.uid() = any(responsable_ids) or
 * es_marketing_lead()) es el candado real, no esta pantalla. Si alguien
 * manipula la URL a otro id, perfilPorId() regresa null a quien no tenga
 * derecho a verlo.
 */
export default async function VistaMarketing({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const sesion = await requiereSesion();
  const { id } = await params;
  const sp = await searchParams;

  const persona = await perfilPorId(id);
  if (!persona) notFound();

  const propio = sesion.id === persona.id;

  return (
    <>
      {!propio && esDireccion(sesion) && (
        <p className="mb-3 text-[11px] text-ink-muted">Vista de supervisión — este perfil no es el tuyo.</p>
      )}
      <MarketingTorreDeControl periodoIdParam={sp.periodo} vendedorIdForzado={persona.id} mostrarEncabezado />
    </>
  );
}
