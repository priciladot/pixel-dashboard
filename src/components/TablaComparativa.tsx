import Link from "next/link";
import { Card, BarraCumplimiento, SemaforoBadge, CalidadBadge } from "./ui";
import { dias, dinero, num, pct } from "@/lib/format";
import type { KpiVendedor } from "@/lib/types";

/**
 * Tabla comparativa de desempeño. Una sola serie por columna de magnitud
 * (cumplimiento), así que no lleva leyenda: el encabezado la nombra. La barra
 * es la lectura rápida; el número exacto va al lado en cifras tabulares.
 */
export function TablaComparativa({
  filas, enlazable = true,
}: { filas: KpiVendedor[]; enlazable?: boolean }) {
  if (filas.length === 0) {
    return (
      <Card className="px-5 py-8 text-center text-[13px] text-ink-soft">
        No hay KPIs cargados para este periodo.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5 font-medium">Vendedor</th>
              <th className="px-4 py-2.5 font-medium">Venta (con IVA)</th>
              <th className="px-4 py-2.5 font-medium">Objetivo</th>
              <th className="w-[190px] px-4 py-2.5 font-medium">Cumplimiento</th>
              <th className="px-4 py-2.5 font-medium">Conversión</th>
              <th className="px-4 py-2.5 font-medium">Ticket prom.</th>
              <th className="px-4 py-2.5 font-medium">Ciclo</th>
              <th className="px-4 py-2.5 font-medium">Tareas abiertas</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-b border-line/70 last:border-0 hover:bg-surface-sunk">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {enlazable ? (
                      <Link
                        href={`/vendedor/${f.vendedor_id}`}
                        className="font-medium text-ink underline decoration-line-strong decoration-1 underline-offset-2 hover:decoration-ink"
                      >
                        {f.nombre_corto}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">{f.nombre_corto}</span>
                    )}
                    <CalidadBadge calidad={f.calidad} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-muted">{f.nombre_completo}</p>
                </td>
                <td className="px-4 py-3 tabular font-medium text-ink">{dinero(f.venta_total_iva)}</td>
                <td className="px-4 py-3 tabular text-ink-soft">
                  {dinero(f.objetivo_total)}
                  {f.objetivo_total != null && f.objetivo_confirmado === false && (
                    <span className="ml-1 text-[11px] text-ink-muted" title="Objetivo reconstruido, pendiente de confirmar contra el semáforo.">
                      *
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1"><BarraCumplimiento pct={f.cumplimiento_pct} /></div>
                    <span className="tabular w-14 text-right font-medium text-ink">{pct(f.cumplimiento_pct)}</span>
                  </div>
                  <div className="mt-1"><SemaforoBadge estado={f.semaforo} /></div>
                </td>
                <td className="px-4 py-3 tabular text-ink-soft">
                  {pct(f.tasa_conversion_pct)}
                  {f.conversion_es_reportada && (
                    <span className="ml-1 text-[11px] text-ink-muted" title="Tasa tomada de la fuente oficial, no recalculada.">†</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular text-ink-soft">{dinero(f.ticket_promedio_sin_iva)}</td>
                <td className="px-4 py-3 tabular text-ink-soft">{dias(f.ciclo_cierre_dias)}</td>
                <td className="px-4 py-3 tabular text-ink-soft">{num(f.tareas_abiertas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line bg-surface-sunk px-4 py-2 text-[11px] text-ink-muted">
        Cifras de venta CON IVA (semáforo comercial). Ticket promedio SIN IVA (HubSpot). Factor de
        conversión 1.16. <span className="font-medium">*</span> objetivo por confirmar ·{" "}
        <span className="font-medium">†</span> tasa reportada por la fuente.
      </div>
    </Card>
  );
}
