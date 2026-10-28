import { leerCoachDelDia } from "@/lib/coach-ia";
import { CoachIATarjeta } from "@/components/CoachIATarjeta";
import { CoachIAGenerar } from "@/components/CoachIAGenerar";

/** Si ya se generó hoy lo muestra al instante; si no, lo pide aparte. Sin llave de IA o sin la tabla, no muestra nada. */
export async function CoachIADelDia({ vendedorId }: { vendedorId: string }) {
  const estado = await leerCoachDelDia(vendedorId);
  if (estado.tipo === "listo") return <CoachIATarjeta contenido={estado.contenido} />;
  if (estado.tipo === "pendiente") return <CoachIAGenerar vendedorId={vendedorId} />;
  return null;
}
