import { Card } from "./ui";
import { dinero, pct } from "@/lib/format";

/**
 * Mezcla Existentes vs. Nuevos. Dos series ⇒ leyenda siempre presente, y como
 * son solo dos también van etiquetadas directamente. Separación de 2px entre
 * segmentos para que la frontera no se lea como un tercer color.
 */
export function MezclaCartera({
  existentes, nuevos, nota,
}: { existentes: number | null; nuevos: number | null; nota?: string | null }) {
  const e = existentes ?? 0;
  const n = nuevos ?? 0;
  const total = e + n;
  const incompleto = existentes == null || nuevos == null || total === 0;

  return (
    <Card className="px-4 py-4">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-ink">Mezcla de la venta</h3>
        <span className="tabular text-[12px] text-ink-soft">{dinero(total || null)}</span>
      </div>

      {incompleto ? (
        <p className="text-[13px] text-ink-soft">
          El desglose Existentes / Nuevos no viene completo en la fuente de este periodo.
        </p>
      ) : (
        <>
          <div className="flex h-2.5 w-full gap-[2px] overflow-hidden">
            <div
              className="rounded-l-[4px]"
              style={{ width: `${(e / total) * 100}%`, backgroundColor: "#2a78d6" }}
              title={`Existentes: ${dinero(e)} (${pct((e / total) * 100)})`}
            />
            <div
              className="rounded-r-[4px]"
              style={{ width: `${(n / total) * 100}%`, backgroundColor: "#eb6834" }}
              title={`Nuevos: ${dinero(n)} (${pct((n / total) * 100)})`}
            />
          </div>

          <ul className="mt-3 space-y-1.5">
            <li className="flex items-center justify-between gap-3 text-[12px]">
              <span className="flex items-center gap-2 text-ink-soft">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: "#2a78d6" }} aria-hidden="true" />
                Cartera existente
              </span>
              <span className="tabular font-medium text-ink">{dinero(e)} · {pct((e / total) * 100)}</span>
            </li>
            <li className="flex items-center justify-between gap-3 text-[12px]">
              <span className="flex items-center gap-2 text-ink-soft">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: "#eb6834" }} aria-hidden="true" />
                Cartera nueva
              </span>
              <span className="tabular font-medium text-ink">{dinero(n)} · {pct((n / total) * 100)}</span>
            </li>
          </ul>
        </>
      )}

      {nota && <p className="mt-3 border-t border-line pt-2 text-[11px] text-ink-muted">{nota}</p>}
    </Card>
  );
}
