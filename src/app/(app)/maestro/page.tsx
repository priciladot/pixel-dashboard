import { esAdmin, requiereRol } from "@/lib/auth";
import { periodos, periodoActivoDe } from "@/lib/queries";
import { TorreDeControl } from "@/components/TorreDeControl";
import { BotonSincronizarHubspot } from "@/components/BotonSincronizarHubspot";

export const dynamic = "force-dynamic";

export default async function Maestro({
  searchParams,
}: { searchParams: Promise<{ periodo?: string; vendedor?: string; ventana?: string; vista?: string }> }) {
  const perfil = await requiereRol("admin", "supervisor");
  const sp = await searchParams;

  // Mismo criterio de resolución que TorreDeControl -- el botón debe
  // sincronizar el periodo que realmente se está viendo, no un default
  // distinto al de la pantalla. periodoActivoDe() es el mes que contiene
  // HOY, no lista[0] (que es el más FUTURO configurado -- periodos()
  // ordena descendente para el selector -- así que sin ?periodo en la URL
  // esto terminaba cayendo en diciembre en pleno septiembre).
  const lista = await periodos();
  const periodoId = sp.periodo && lista.some((p) => p.id === sp.periodo)
    ? sp.periodo
    : (periodoActivoDe(lista) ?? lista[0])?.id;
  const periodo = lista.find((p) => p.id === periodoId);

  return (
    <>
      {esAdmin(perfil) && periodoId && periodo && (
        <div className="mb-3 flex justify-end">
          <BotonSincronizarHubspot periodoId={periodoId} etiqueta={periodo.etiqueta} />
        </div>
      )}
      <TorreDeControl
        periodoIdParam={sp.periodo}
        ventanaParam={sp.ventana}
        vistaParam={sp.vista}
        vendedorIdForzado={sp.vendedor}
        mostrarFiltroVendedor
        mostrarEncabezado
      />
    </>
  );
}
