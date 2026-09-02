import { Suspense } from "react";
import { requiereRol } from "@/lib/auth";
import { periodos, ultimasIngestas } from "@/lib/queries";
import { Card, Seccion } from "@/components/ui";
import { PanelIngesta } from "./PanelIngesta";

export const dynamic = "force-dynamic";

const ESTATUS: Record<string, { texto: string; color: string; icono: string }> = {
  en_proceso:              { texto: "En proceso",   color: "#52514e", icono: "◐" },
  completada:              { texto: "Completada",   color: "#006300", icono: "✓" },
  completada_con_avisos:   { texto: "Con avisos",   color: "#8a6100", icono: "⚑" },
  error:                   { texto: "Error",        color: "#d03b3b", icono: "▲" },
};

export default async function Ingesta() {
  await requiereRol("admin");
  const [lista, historial] = await Promise.all([periodos(), ultimasIngestas()]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold tracking-tight text-ink">Ingesta de datos</h1>
        <p className="mt-0.5 text-[13px] text-ink-soft">
          Carga del histórico y sincronización con HubSpot. Ninguna fila se descarta: lo que llega
          incompleto se etiqueta y sale del cálculo maestro, no de la base.
        </p>
      </div>

      <Suspense fallback={null}>
        <PanelIngesta periodos={lista} />
      </Suspense>

      <Seccion titulo="Historial de ingestas" descripcion="Las últimas 15 corridas.">
        {historial.length === 0 ? (
          <Card className="px-5 py-6 text-center text-[13px] text-ink-soft">
            Todavía no se ha corrido ninguna ingesta.
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-2.5 font-medium">Fecha</th>
                    <th className="px-4 py-2.5 font-medium">Tipo</th>
                    <th className="px-4 py-2.5 font-medium">Periodo</th>
                    <th className="px-4 py-2.5 font-medium">Archivo</th>
                    <th className="px-4 py-2.5 font-medium">Leídas</th>
                    <th className="px-4 py-2.5 font-medium">Limpias</th>
                    <th className="px-4 py-2.5 font-medium">Marcadas</th>
                    <th className="px-4 py-2.5 font-medium">Estatus</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((h) => {
                    const e = ESTATUS[h.estatus] ?? ESTATUS.en_proceso;
                    return (
                      <tr key={h.id} className="border-b border-line/70 last:border-0">
                        <td className="px-4 py-2.5 tabular text-ink-soft">
                          {new Date(h.iniciado_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="px-4 py-2.5 text-ink">{h.tipo.replaceAll("_", " ")}</td>
                        <td className="px-4 py-2.5 text-ink-soft">{h.periodo_id ?? "—"}</td>
                        <td className="max-w-[200px] truncate px-4 py-2.5 text-ink-soft">{h.archivo_nombre ?? "—"}</td>
                        <td className="px-4 py-2.5 tabular text-ink-soft">{h.filas_leidas}</td>
                        <td className="px-4 py-2.5 tabular text-ink-soft">{h.filas_ok}</td>
                        <td className="px-4 py-2.5 tabular text-ink-soft">{h.filas_sanitizadas}</td>
                        <td className="px-4 py-2.5 font-medium" style={{ color: e.color }}>
                          <span aria-hidden="true">{e.icono}</span> {e.texto}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Seccion>
    </>
  );
}
