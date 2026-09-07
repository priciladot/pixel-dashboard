import { requiereRol } from "@/lib/auth";
import { TorreDeControl } from "@/components/TorreDeControl";

export const dynamic = "force-dynamic";

export default async function Maestro({
  searchParams,
}: { searchParams: Promise<{ periodo?: string; vendedor?: string; ventana?: string }> }) {
  await requiereRol("admin", "supervisor");
  const sp = await searchParams;

  return (
    <TorreDeControl
      periodoIdParam={sp.periodo}
      ventanaParam={sp.ventana}
      vendedorIdForzado={sp.vendedor}
      mostrarFiltroVendedor
      mostrarEncabezado
    />
  );
}
