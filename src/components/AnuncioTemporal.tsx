"use client";

import { useEffect, useState } from "react";
import type { AppRole } from "@/lib/types";
import { anunciosVigentes, type Anuncio, type NivelTemperatura } from "@/lib/anuncios";

const claveOculto = (id: string) => `anuncio-oculto:${id}`;

/**
 * Banner de anuncios temporales, solo para la audiencia/rango de fechas de
 * cada anuncio (ver src/lib/anuncios.ts). La vigencia se resuelve en un
 * useEffect (no en el primer render) porque depende de la hora actual del
 * navegador -- calcularla en el render inicial podría no coincidir con lo
 * que el servidor mandó en el HTML y provocar un desajuste de hidratación.
 * Por eso el primer render (servidor y cliente, antes de montar) siempre
 * devuelve null.
 */
export function AnuncioTemporal({ rol, correo, verTodos = false }: { rol: AppRole; correo: string; verTodos?: boolean }) {
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());

  useEffect(() => {
    setAnuncios(anunciosVigentes(rol, correo, new Date(), verTodos));
  }, [rol, correo, verTodos]);

  useEffect(() => {
    if (anuncios.length === 0) return;
    const guardados = new Set<string>();
    for (const a of anuncios) {
      try {
        if (localStorage.getItem(claveOculto(a.id)) === "1") guardados.add(a.id);
      } catch {
        // localStorage no disponible (modo privado, storage bloqueado, etc.) -- se muestra igual.
      }
    }
    setOcultos(guardados);
  }, [anuncios]);

  function ocultar(id: string) {
    setOcultos((prev) => new Set(prev).add(id));
    try {
      localStorage.setItem(claveOculto(id), "1");
    } catch {
      // si no se puede guardar, queda oculto solo para esta sesión.
    }
  }

  const visibles = anuncios.filter((a) => !ocultos.has(a.id));
  if (visibles.length === 0) return null;

  return (
    <section aria-label="Anuncios del equipo" className="mb-5 space-y-3">
      {visibles.map((a) => (
        <TarjetaAnuncio key={a.id} anuncio={a} onOcultar={() => ocultar(a.id)} />
      ))}
    </section>
  );
}

const COLOR_NIVEL: Record<NivelTemperatura, string> = {
  caliente: "bg-estado-critico",
  tibio: "bg-estado-alerta",
  frio: "bg-serie-1",
};

function TarjetaAnuncio({ anuncio, onOcultar }: { anuncio: Anuncio; onOcultar: () => void }) {
  return (
    <div className="rounded-card border border-line bg-surface px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">📣 {anuncio.titulo}</h2>
          <p className="mt-1 text-[13px] text-ink-soft">{anuncio.entrada}</p>
        </div>
        <button
          type="button"
          onClick={onOcultar}
          className="shrink-0 rounded-full border border-line px-3 py-1 text-[11px] font-medium text-ink-soft hover:bg-surface-sunk focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-serie-1"
        >
          Ocultar
        </button>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        {anuncio.niveles.map((n) => (
          <div key={n.nivel} className="rounded-card border border-line bg-surface-page px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${COLOR_NIVEL[n.nivel]}`} aria-hidden="true" />
              <p className="text-[12px] font-semibold text-ink">{n.etiqueta}</p>
            </div>
            <ul className="mt-1.5 space-y-1 text-[12px] text-ink-soft">
              {n.puntos.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {anuncio.reglas.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-2.5 text-[12px] text-ink-soft">
          {anuncio.reglas.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      )}

      <p className="mt-2.5 text-[12px] italic text-ink-muted">{anuncio.cierre}</p>
    </div>
  );
}
