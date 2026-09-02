import Link from "next/link";
import { Card, SemaforoBadge } from "./ui";
import { dinero, pct } from "@/lib/format";
import type { KpiVendedor } from "@/lib/types";

/**
 * Histórico mes a mes. Serie única (venta con IVA) sobre el mismo eje: una
 * columna por periodo, alto proporcional al máximo del histórico. Cada barra
 * lleva su etiqueta directa porque son pocas.
 */
export function Historico({
  filas, vendedorId, periodoActivo,
}: { filas: KpiVendedor[]; vendedorId: string; periodoActivo: string }) {
  if (filas.length === 0) {
    return (
      <Card className="px-5 py-8 text-center text-[13px] text-ink-soft">
        Todavía no hay meses cargados en el histórico.
      </Card>
    );
  }

  const cronologico = [...filas].reverse();
  const maximo = Math.max(...cronologico.map((f) => f.venta_total_iva || 0), 1);

  return (
    <Card className="px-4 py-4">
      <div className="flex items-end gap-3 overflow-x-auto pb-1">
        {cronologico.map((f) => {
          const alto = Math.max(4, Math.round((f.venta_total_iva / maximo) * 132));
          const activo = f.periodo_id === periodoActivo;
          return (
            <Link
              key={f.periodo_id}
              href={`/vendedor/${vendedorId}?periodo=${f.periodo_id}`}
              className="group flex w-[92px] shrink-0 flex-col items-center gap-1.5"
              title={`${f.periodo_etiqueta}: ${dinero(f.venta_total_iva)} · ${pct(f.cumplimiento_pct)} de cumplimiento`}
            >
              <span className="tabular text-[11px] font-medium text-ink">{dinero(f.venta_total_iva)}</span>
              <div className="flex h-[136px] w-full items-end justify-center">
                <div
                  className="w-11 rounded-t-[4px] transition-opacity group-hover:opacity-80"
                  style={{ height: alto, backgroundColor: activo ? "#2a78d6" : "#9ec5f4" }}
                />
              </div>
              <span className={`text-[12px] ${activo ? "font-semibold text-ink" : "text-ink-soft"}`}>
                {f.periodo_etiqueta}
              </span>
              <SemaforoBadge estado={f.semaforo} compacto />
            </Link>
          );
        })}
      </div>
      <p className="mt-2 border-t border-line pt-2 text-[11px] text-ink-muted">
        Venta total con IVA por periodo de KPI (bloque de 4 semanas). Da clic en un mes para abrirlo.
      </p>
    </Card>
  );
}
