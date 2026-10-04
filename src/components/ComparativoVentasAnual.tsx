import { comparativoVentasAnual } from "@/lib/queries";
import { Card, KpiCard } from "@/components/ui";
import { dinero } from "@/lib/format";

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Ventas Totales Comparativo (2026 vs. 2025) + Meta Anual -- Dashboard
 * Maestro. 2025 es una cifra fija (Pris la dio directo, HubSpot en vivo
 * no coincidía); 2026 sale de HubSpot. Snapshot manual en
 * ventas_historico_mensual, no hay sincronización automática todavía.
 */
export async function ComparativoVentasAnual() {
  const { filas, meta, porVendedor } = await comparativoVentasAnual();

  const total2025SinIva = filas.reduce((acc, f) => acc + (f.venta2025SinIva ?? 0), 0);
  const total2026SinIva = filas.reduce((acc, f) => acc + (f.venta2026SinIva ?? 0), 0);
  const totalMetaConIva = filas.reduce((acc, f) => acc + (f.metaMesConIva ?? 0), 0);
  const hayAmbosAnios = filas.some((f) => f.venta2025SinIva != null) && filas.some((f) => f.venta2026SinIva != null);

  return (
    <div className="space-y-3">
      {meta && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard etiqueta={`Meta anual ${meta.anio} (con IVA)`} valor={dinero(meta.objetivoIva)} />
          <KpiCard
            etiqueta="Llevamos"
            valor={`${meta.avancePct.toFixed(1)}%`}
            estado={meta.avancePct >= 100 ? "cumple" : meta.avancePct >= 80 ? "arriba" : "debajo"}
            lectura={
              meta.metaAFechaIva != null
                ? `Meta acumulada Ene-${MESES_CORTOS[Number(meta.corteEtiqueta.split("-")[1]) - 1]} (no la anual): ${dinero(meta.metaAFechaIva)}`
                : "vs. meta anual (falta capturar meta mensual de algún mes)"
            }
          />
          <KpiCard etiqueta="Faltante para meta anual" valor={dinero(Math.max(0, meta.faltanteIva))} />
          <KpiCard etiqueta={`Venta acumulada (con IVA, corte ${meta.corteEtiqueta})`} valor={dinero(meta.acumuladoIva)} />
        </div>
      )}
      {/* La nota original de metas_anuales quedó fija al corte de julio (con
          números viejos) -- se omite aquí para no confundir; el avance ya
          se recalcula en vivo con los meses corregidos. */}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-ink-muted">
                <th className="px-3 py-2 font-medium">Mes</th>
                <th className="border-l border-line px-3 py-2 font-medium">2025 sin IVA</th>
                <th className="px-3 py-2 font-medium">2025 con IVA</th>
                <th className="border-l border-line px-3 py-2 font-medium">2026 sin IVA</th>
                <th className="px-3 py-2 font-medium">2026 con IVA</th>
                <th className="border-l border-line px-3 py-2 font-medium">Variación YoY</th>
                <th className="border-l border-line px-3 py-2 font-medium">Meta 2026</th>
                <th className="px-3 py-2 font-medium">Cumplimiento</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.mes} className="border-b border-line/70 last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">{f.etiquetaMes}</td>
                  <td className="px-3 py-2 tabular text-ink-soft">{f.venta2025SinIva != null ? dinero(f.venta2025SinIva) : "—"}</td>
                  <td className="px-3 py-2 tabular text-ink-soft">{f.venta2025ConIva != null ? dinero(f.venta2025ConIva) : "—"}</td>
                  <td className="px-3 py-2 tabular text-ink-soft">{f.venta2026SinIva ? dinero(f.venta2026SinIva) : "—"}</td>
                  <td className="px-3 py-2 tabular text-ink-soft">{f.venta2026ConIva ? dinero(f.venta2026ConIva) : "—"}</td>
                  <td className="px-3 py-2 tabular font-medium" style={{ color: f.variacionPct == null ? undefined : f.variacionPct >= 0 ? "#0ca30c" : "#d03b3b" }}>
                    {f.variacionPct == null ? "—" : `${f.variacionPct > 0 ? "+" : ""}${f.variacionPct.toFixed(1)}%`}
                  </td>
                  <td className="px-3 py-2 tabular text-ink-soft">{f.metaMesConIva != null ? dinero(f.metaMesConIva) : "—"}</td>
                  <td className="px-3 py-2 tabular font-medium" style={{ color: f.cumplimientoMesPct == null ? undefined : f.cumplimientoMesPct >= 100 ? "#0ca30c" : "#d03b3b" }}>
                    {f.cumplimientoMesPct == null ? "—" : `${f.cumplimientoMesPct.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
              {hayAmbosAnios && (
                <tr className="border-t border-line bg-surface-sunk font-semibold">
                  <td className="px-3 py-2 text-ink">Total</td>
                  <td className="px-3 py-2 tabular text-ink">{dinero(total2025SinIva)}</td>
                  <td className="px-3 py-2 tabular text-ink">{dinero(total2025SinIva * 1.16)}</td>
                  <td className="px-3 py-2 tabular text-ink">{dinero(total2026SinIva)}</td>
                  <td className="px-3 py-2 tabular text-ink">{dinero(total2026SinIva * 1.16)}</td>
                  <td className="px-3 py-2 tabular" style={{ color: total2026SinIva >= total2025SinIva ? "#0ca30c" : "#d03b3b" }}>
                    {total2025SinIva > 0 ? `${(((total2026SinIva - total2025SinIva) / total2025SinIva) * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-2 tabular text-ink">{dinero(totalMetaConIva)}</td>
                  <td className="px-3 py-2 tabular text-ink">{totalMetaConIva > 0 ? `${((total2026SinIva * 1.16 / totalMetaConIva) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line bg-surface-sunk px-4 py-3 text-[11px] leading-relaxed text-ink-muted">
          2025 y 2026 son cifras fijas que dio Pris (no vienen de una sincronización automática) -- los meses futuros muestran "—". "Con IVA" = sin
          IVA × 1.16. El total de "Meta 2026" en la fila Total es la meta anual completa (los 12 meses); por eso el % de Cumplimiento de esa fila
          compara la venta de los meses transcurridos contra la meta del año completo, y es distinto al % de la tarjeta "Llevamos" de arriba (que
          compara contra la meta acumulada solo de los meses transcurridos).
        </p>
      </Card>

      {porVendedor.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-line px-4 py-2.5 text-[12px] font-semibold text-ink">
            Desglose de venta por vendedor — acumulado {meta?.anio ?? ""}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-ink-muted">
                  <th className="px-3 py-2 font-medium">Vendedor</th>
                  <th className="px-3 py-2 font-medium">Sin IVA</th>
                  <th className="px-3 py-2 font-medium">Con IVA</th>
                  <th className="px-3 py-2 font-medium">% participación</th>
                </tr>
              </thead>
              <tbody>
                {porVendedor.map((v) => (
                  <tr key={v.vendedorId} className="border-b border-line/70 last:border-0">
                    <td className="px-3 py-2 font-medium text-ink">{v.nombre}</td>
                    <td className="px-3 py-2 tabular text-ink-soft">{dinero(v.ventaSinIva)}</td>
                    <td className="px-3 py-2 tabular text-ink-soft">{dinero(v.ventaConIva)}</td>
                    <td className="px-3 py-2 tabular text-ink-soft">{v.pctParticipacion.toFixed(2)}%</td>
                  </tr>
                ))}
                <tr className="border-t border-line bg-surface-sunk font-semibold">
                  <td className="px-3 py-2 text-ink">Total</td>
                  <td className="px-3 py-2 tabular text-ink">{dinero(porVendedor.reduce((acc, v) => acc + v.ventaSinIva, 0))}</td>
                  <td className="px-3 py-2 tabular text-ink">{dinero(porVendedor.reduce((acc, v) => acc + v.ventaConIva, 0))}</td>
                  <td className="px-3 py-2 tabular text-ink">100.00%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="border-t border-line bg-surface-sunk px-4 py-3 text-[11px] text-ink-muted">
            Cifra fija que dio Pris para el año completo -- % participación es contra el total de esta tabla (con IVA).
          </p>
        </Card>
      )}
    </div>
  );
}
