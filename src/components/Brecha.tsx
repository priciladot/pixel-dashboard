import { Card } from "./ui";
import { contraEstandar, num } from "@/lib/format";
import type { Benchmark, FilaBrecha, KpiVendedor } from "@/lib/types";

/**
 * §2 Análisis de brecha / Eficiencia operativa.
 * Cuatro columnas en la MISMA fila: Indicador | Valor | Estándar | Lectura.
 * Si la evaluación cualitativa ya trae filas capturadas, se muestran tal cual;
 * si no, se derivan de los KPIs contra los estándares universales.
 */
export function Brecha({
  filas, kpi, estandares,
}: { filas: FilaBrecha[]; kpi: KpiVendedor | null; estandares: Record<string, Benchmark> }) {
  const derivadas = filas.length > 0 ? [] : derivarFilas(kpi, estandares);
  const datos = filas.length > 0
    ? filas.map((f) => ({
        indicador: f.indicador,
        valor: f.valor_vendedor ?? "—",
        estandar: f.estandar_esperado ?? "—",
        lectura: f.lectura ?? "—",
        tono: "#52514e",
      }))
    : derivadas;

  if (datos.length === 0) {
    return (
      <Card className="px-5 py-8 text-center text-[13px] text-ink-soft">
        Sin indicadores de actividad cargados para este periodo.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5 font-medium">Indicador</th>
              <th className="px-4 py-2.5 font-medium">Resultado del periodo</th>
              <th className="px-4 py-2.5 font-medium">Estándar esperado</th>
              <th className="px-4 py-2.5 font-medium">Lectura</th>
            </tr>
          </thead>
          <tbody>
            {datos.map((d, i) => (
              <tr key={i} className="border-b border-line/70 last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{d.indicador}</td>
                <td className="px-4 py-3 tabular text-ink">{d.valor}</td>
                <td className="px-4 py-3 tabular text-ink-soft">{d.estandar}</td>
                <td className="px-4 py-3" style={{ color: d.tono }}>{d.lectura}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function derivarFilas(kpi: KpiVendedor | null, est: Record<string, Benchmark>) {
  if (!kpi) return [];
  const def: Array<{ indicador: string; valor: number | null; clave: string }> = [
    { indicador: "Correos enviados",      valor: kpi.correos_enviados,    clave: "correos" },
    { indicador: "Leads trabajados",      valor: kpi.leads_registrados,   clave: "leads" },
    { indicador: "Actividades registradas", valor: kpi.actividades_totales, clave: "actividades" },
    { indicador: "Tareas abiertas sin ejecutar", valor: kpi.tareas_abiertas, clave: "tareas_abiertas" },
  ];

  return def
    .filter((d) => d.valor != null || est[d.clave])
    .map((d) => {
      const b = est[d.clave];
      const l = contraEstandar(d.valor, b?.valor_min, b?.valor_max);
      const estandar = b
        ? b.valor_min != null && b.valor_max != null
          ? `${num(b.valor_min)}–${num(b.valor_max)} ${b.unidad ?? ""}`.trim()
          : b.valor_min != null
            ? `${num(b.valor_min)}+ ${b.unidad ?? ""}`.trim()
            : `máx. ${num(b.valor_max)} ${b.unidad ?? ""}`.trim()
        : "—";
      const tono =
        l.estado === "debajo" ? "#d03b3b" :
        l.estado === "arriba" ? "#a04a25" :
        l.estado === "cumple" ? "#006300" : "#898781";
      return {
        indicador: d.indicador,
        valor: d.valor == null ? "Sin dato" : num(d.valor),
        estandar,
        lectura: l.texto,
        tono,
      };
    });
}
