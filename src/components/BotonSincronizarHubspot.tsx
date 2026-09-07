"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Resultado =
  | { ok: true; filasOk: number; filasSanitizadas: number; negociosTotal: number; negociosConContactoAsociado: number }
  | { ok: false; error: string };

/**
 * Atajo de "Sincronizar con HubSpot" directo en /maestro -- antes solo
 * existía en /ingesta. Usa el mismo endpoint (POST /api/ingesta/hubspot,
 * ya gateado a admin del lado del servidor) con simulacion:false y la
 * ventana calendario del periodo que se esté viendo, así que trae deals,
 * contacto_ids y (vía escribirContactos) los correos de HubSpot Contacts
 * sin tener que salir del Dashboard Maestro.
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
        setResultado({
          ok: true,
          filasOk: data.filasOk ?? 0,
          filasSanitizadas: data.filasSanitizadas ?? 0,
          negociosTotal: data.diagnostico?.negociosTotal ?? 0,
          negociosConContactoAsociado: data.diagnostico?.negociosConContactoAsociado ?? 0,
        });
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
        title={`Trae negocios y contactos de HubSpot para ${etiqueta}`}
        className="rounded border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-surface-sunk disabled:opacity-60"
      >
        {cargando ? "Sincronizando…" : "🔄 Sincronizar HubSpot"}
      </button>
      {resultado && (
        <p className={`max-w-[260px] text-right text-[11px] ${resultado.ok ? "text-ink-muted" : "text-[#d03b3b]"}`}>
          {resultado.ok
            ? `Listo -- ${resultado.filasOk} negocios ok, ${resultado.filasSanitizadas} marcados · ${resultado.negociosConContactoAsociado}/${resultado.negociosTotal} con contacto de HubSpot asociado.`
            : resultado.error}
        </p>
      )}
    </div>
  );
}
