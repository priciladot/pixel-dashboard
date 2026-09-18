"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Lompi nos EMPUJA sus datos por webhook (ver src/app/api/ingesta/lompi/
 * route.ts) -- no existe ninguna API de Lompi a la que nosotros podamos
 * llamar para pedirle una corrida bajo demanda. Este botón NO fuerza a
 * Lompi a mandar nada nuevo; solo vuelve a leer de la base lo último que
 * él ya nos haya empujado, para no depender de recargar la página a mano.
 */
export function BotonRevisarLompi() {
  const router = useRouter();
  const [revisando, setRevisando] = useState(false);

  function revisar() {
    setRevisando(true);
    router.refresh();
    setTimeout(() => setRevisando(false), 600);
  }

  return (
    <button
      onClick={revisar}
      disabled={revisando}
      title="Vuelve a leer lo último que Lompi haya mandado -- no le pide a Lompi que corra de nuevo."
      className="rounded border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:bg-surface-sunk disabled:opacity-60"
    >
      {revisando ? "Revisando…" : "🔄 Revisar ahora"}
    </button>
  );
}
