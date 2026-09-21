"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Perfil, Periodo } from "@/lib/types";

/**
 * Filtros en una sola fila arriba de los tableros.
 *
 * `periodoActivoId` es el periodo que la pantalla YA está usando cuando la
 * URL no trae `?periodo=` (el mes que contiene hoy, no el primero de la
 * lista -- ver periodoActivoDe() en queries.ts). Sin este prop, el <select>
 * queda con un `value` que no matchea ningún <option> (params.get regresa
 * null) y el navegador muestra la primera opción por default -- que es el
 * mes MÁS FUTURO configurado, no el que la página realmente está mostrando.
 * Eso hacía ver "Diciembre 2026" en el selector mientras el resto de la
 * pantalla ya mostraba, correctamente, los datos reales de septiembre.
 */
export function Filtros({
  periodos, vendedores = [], mostrarVentana = true, mostrarVistaTiempo = false, mostrarAlcance = false, periodoActivoId,
}: {
  periodos: Periodo[]; vendedores?: Perfil[]; mostrarVentana?: boolean; mostrarVistaTiempo?: boolean;
  mostrarAlcance?: boolean; periodoActivoId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(clave: string, valor: string) {
    const p = new URLSearchParams(params.toString());
    if (valor) p.set(clave, valor); else p.delete(clave);
    router.push(`${pathname}?${p.toString()}`);
  }

  const clase =
    "rounded border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink focus:border-serie-1 focus:outline-none";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-[12px] text-ink-soft">
        Mes
        <select className={clase} value={params.get("periodo") ?? periodoActivoId ?? ""} onChange={(e) => set("periodo", e.target.value)}>
          {periodos.map((p) => (
            <option key={p.id} value={p.id}>{p.etiqueta}</option>
          ))}
        </select>
      </label>

      {vendedores.length > 0 && (
        <label className="flex items-center gap-1.5 text-[12px] text-ink-soft">
          Vendedor
          <select className={clase} value={params.get("vendedor") ?? ""} onChange={(e) => set("vendedor", e.target.value)}>
            <option value="">Todo el equipo</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>{v.nombre_corto}</option>
            ))}
          </select>
        </label>
      )}

      {mostrarVentana && (
        <label className="flex items-center gap-1.5 text-[12px] text-ink-soft">
          Ventana
          <select className={clase} value={params.get("ventana") ?? "kpi_4_semanas"} onChange={(e) => set("ventana", e.target.value)}>
            <option value="kpi_4_semanas">KPI — 4 semanas (S1–S4)</option>
            <option value="calendario">Calendario — mes 1 al 31</option>
          </select>
        </label>
      )}

      {mostrarAlcance && (
        <label className="flex items-center gap-1.5 text-[12px] text-ink-soft">
          Alcance
          <select className={clase} value={params.get("alcance") ?? "mes"} onChange={(e) => set("alcance", e.target.value)}>
            <option value="mes">Mensual</option>
            <option value="anio">Anual (YTD)</option>
          </select>
        </label>
      )}

      {mostrarVistaTiempo && (
        <label className="flex items-center gap-1.5 text-[12px] text-ink-soft">
          Vista
          <select className={clase} value={params.get("vista") ?? "mensual"} onChange={(e) => set("vista", e.target.value)}>
            <option value="mensual">Mensual</option>
            <option value="trimestral">Trimestral (Q del mes elegido)</option>
          </select>
        </label>
      )}
    </div>
  );
}
