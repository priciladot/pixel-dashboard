"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Resultado =
  | { ok: true; elementosLeidos: number; filasOk: number; sinAsignar: number }
  | { ok: false; error: string };

/**
 * Atajo manual para /mkt -- este mismo tablero ya se sincroniza solo 2
 * veces al día como parte del corte unificado de HubSpot/Monday
 * (sincronizarTodo), pero Dana no tiene por qué esperar a ese corte para
 * refrescar los KPIs de Marketing.
 */
export function BotonSincronizarMarketing() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function sincronizar() {
    setCargando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/ingesta/monday-marketing", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setResultado({ ok: false, error: data.error ?? "No se pudo sincronizar." });
      } else {
        setResultado({ ok: true, elementosLeidos: data.elementosLeidos ?? 0, filasOk: data.filasOk ?? 0, sinAsignar: data.sinAsignar ?? 0 });
        router.refresh();
      }
    } catch {
      setResultado({ ok: false, error: "No se pudo contactar el servidor." });
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={sincronizar}
        disabled={cargando}
        title="Trae los KPIs más recientes del tablero de Monday"
        className="rounded border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-surface-sunk disabled:opacity-60"
      >
        {cargando ? "Sincronizando…" : "🔄 Sincronizar Marketing"}
      </button>
      {resultado && (
        <p className={`max-w-[260px] text-right text-[11px] ${resultado.ok ? "text-ink-muted" : "text-[#d03b3b]"}`}>
          {resultado.ok
            ? `Listo -- ${resultado.elementosLeidos} KPIs, ${resultado.filasOk} ok${resultado.sinAsignar > 0 ? `, ${resultado.sinAsignar} sin responsable mapeado` : ""}.`
            : resultado.error}
        </p>
      )}
    </div>
  );
}
