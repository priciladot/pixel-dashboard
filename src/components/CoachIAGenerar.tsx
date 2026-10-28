"use client";

import { useEffect, useState } from "react";
import { CoachIATarjeta } from "@/components/CoachIATarjeta";
import type { CoachDelDia } from "@/lib/coach-ia";

/**
 * La primera persona que abre el perfil del día dispara la generación (tarda
 * unos segundos); se pide aparte de la página para que esta no se quede
 * esperando. El resto del día ya viene guardado y se muestra al instante.
 */
export function CoachIAGenerar({ vendedorId }: { vendedorId: string }) {
  const [estado, setEstado] = useState<"cargando" | "error" | { contenido: CoachDelDia }>("cargando");

  useEffect(() => {
    let activo = true;
    fetch("/api/coach-ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendedorId }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { contenido: CoachDelDia };
        if (activo) setEstado({ contenido: d.contenido });
      })
      .catch(() => {
        if (activo) setEstado("error");
      });
    return () => {
      activo = false;
    };
  }, [vendedorId]);

  if (estado === "error") return null;
  if (estado === "cargando") {
    return (
      <div className="rounded-card border border-line bg-surface-sunk px-4 py-3 text-[13px] text-ink-soft">
        🤖 Preparando tu foco de hoy…
      </div>
    );
  }
  return <CoachIATarjeta contenido={estado.contenido} />;
}
