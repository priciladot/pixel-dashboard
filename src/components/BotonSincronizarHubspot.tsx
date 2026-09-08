"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SeccionResultado {
  ok: boolean;
  error?: string;
  filasOk?: number;
  filasSanitizadas?: number;
  negociosTotal?: number;
  negociosConContactoAsociado?: number;
  etapas?: number;
  engagementsSinAsignar?: number;
  elementosLeidos?: number;
}

type Resultado =
  | { ok: true; deals: SeccionResultado; analitica: SeccionResultado; monday: SeccionResultado }
  | { ok: false; error: string };

/**
 * Atajo de "Sincronizar con HubSpot" directo en /maestro -- antes solo
 * existía en /ingesta. Dispara el mismo corte unificado que el cron
 * automático (sincronizarTodo: Deals + KPIs + contacto_ids/correos,
 * Analítica de HubSpot -- notas, correos, llamadas, tareas, cambios de
 * etapa -- y Cierres de Monday) para cuando se quiera refrescar todo de
 * golpe sin esperar al siguiente corte de las 8:30 AM o 2:00 PM.
 */
export function BotonSincronizarHubspot({ periodoId, etiqueta }: { periodoId: string; etiqueta: string }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function sincronizar() {
    setCargando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/ingesta/hubspot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodoId, ventana: "calendario", simulacion: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResultado({ ok: false, error: data.error ?? "No se pudo sincronizar." });
      } else {
        setResultado({ ok: true, deals: data.deals, analitica: data.analitica, monday: data.monday });
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
        title={`Trae negocios, actividad y cierres de Monday para ${etiqueta}`}
        className="rounded border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-surface-sunk disabled:opacity-60"
      >
        {cargando ? "Sincronizando…" : "🔄 Sincronizar HubSpot"}
      </button>
      {resultado && (
        <div className="max-w-[280px] text-right text-[11px]">
          {resultado.ok ? (
            <>
              <p className={resultado.deals.ok ? "text-ink-muted" : "text-[#d03b3b]"}>
                Deals: {resultado.deals.ok
                  ? `${resultado.deals.filasOk ?? 0} ok, ${resultado.deals.filasSanitizadas ?? 0} marcados · ${resultado.deals.negociosConContactoAsociado ?? 0}/${resultado.deals.negociosTotal ?? 0} con contacto`
                  : resultado.deals.error}
              </p>
              <p className={resultado.analitica.ok ? "text-ink-muted" : "text-[#d03b3b]"}>
                Analítica: {resultado.analitica.ok
                  ? `${resultado.analitica.etapas ?? 0} cambios de etapa, ${resultado.analitica.engagementsSinAsignar ?? 0} actividades sin asignar`
                  : resultado.analitica.error}
              </p>
              <p className={resultado.monday.ok ? "text-ink-muted" : "text-[#d03b3b]"}>
                Monday: {resultado.monday.ok
                  ? `${resultado.monday.elementosLeidos ?? 0} elementos, ${resultado.monday.filasOk ?? 0} ok`
                  : resultado.monday.error}
              </p>
            </>
          ) : (
            <p className="text-[#d03b3b]">{resultado.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
