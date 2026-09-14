import { esMarketingLead, requiereRol } from "@/lib/auth";
import { MarketingTorreDeControl } from "@/components/MarketingTorreDeControl";
import { BotonSincronizarMarketing } from "@/components/BotonSincronizarMarketing";

export const dynamic = "force-dynamic";

/** Panel de equipo de Marketing -- calcado de /maestro (ventas), gateado a admin/supervisor/marketing_lead. */
export default async function MarketingEquipo({
  searchParams,
}: { searchParams: Promise<{ periodo?: string }> }) {
  const perfil = await requiereRol("admin", "supervisor", "marketing_lead");
  const sp = await searchParams;

  return (
    <>
      {esMarketingLead(perfil) && (
        <div className="mb-3 flex justify-end">
          <BotonSincronizarMarketing />
        </div>
      )}
      <MarketingTorreDeControl periodoIdParam={sp.periodo} mostrarEncabezado />
    </>
  );
}
