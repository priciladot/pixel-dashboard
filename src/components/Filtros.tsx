"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Perfil, Periodo } from "@/lib/types";

/** Filtros en una sola fila arriba de los tableros. */
export function Filtros({
  periodos, vendedores = [], mostrarVentana = true,
}: { periodos: Periodo[]; vendedores?: Perfil[]; mostrarVentana?: boolean }) {
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
        <select className={clase} value={params.get("periodo") ?? ""} onChange={(e) => set("periodo", e.target.value)}>
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
    </div>
  );
}
