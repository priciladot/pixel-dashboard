"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "./ui";
import type { Accion } from "@/lib/types";

const ESTATUS: Record<Accion["estatus"], { etiqueta: string; icono: string; color: string }> = {
  pendiente:    { etiqueta: "Pendiente",  icono: "○", color: "#898781" },
  en_curso:     { etiqueta: "En curso",   icono: "◐", color: "#8a6100" },
  cumplida:     { etiqueta: "Cumplida",   icono: "✓", color: "#006300" },
  no_cumplida:  { etiqueta: "No cumplida", icono: "✕", color: "#d03b3b" },
};

const ORDEN: Accion["estatus"][] = ["pendiente", "en_curso", "cumplida", "no_cumplida"];

/**
 * §3 Acciones pertinentes / Plan de acción inmediato.
 * El vendedor puede mover el estatus de SUS acciones; el RLS y un trigger
 * impiden que edite la descripción o la meta.
 */
export function Acciones({ acciones, editable }: { acciones: Accion[]; editable: boolean }) {
  const [lista, setLista] = useState(acciones);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (lista.length === 0) {
    return (
      <Card className="px-5 py-8 text-center text-[13px] text-ink-soft">
        Sin acciones registradas para este periodo.
      </Card>
    );
  }

  function cambiar(id: number, estatus: Accion["estatus"]) {
    const previo = lista;
    setLista((l) => l.map((a) => (a.id === id ? { ...a, estatus } : a)));
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: err } = await supabase.from("acciones").update({ estatus }).eq("id", id);
      if (err) {
        setLista(previo);
        setError("No se pudo guardar el cambio. Revisa tus permisos e inténtalo de nuevo.");
      }
    });
  }

  return (
    <Card className="divide-y divide-line">
      {error && (
        <p className="bg-[#fdecec] px-4 py-2 text-[12px] text-[#d03b3b]">{error}</p>
      )}
      {lista.map((a, i) => {
        const e = ESTATUS[a.estatus];
        return (
          <div key={a.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-ink">
                <span className="mr-1.5 font-medium text-ink-muted tabular">{i + 1}.</span>
                {a.descripcion}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-soft">
                {a.meta_numerica && <span className="tabular font-medium">Meta: {a.meta_numerica}</span>}
                {a.fecha_limite && <span>Límite: {a.fecha_limite}</span>}
              </div>
            </div>

            {editable ? (
              <select
                value={a.estatus}
                disabled={pendiente}
                onChange={(ev) => cambiar(a.id, ev.target.value as Accion["estatus"])}
                aria-label={`Estatus de la acción ${i + 1}`}
                className="shrink-0 rounded border border-line bg-surface px-2 py-1 text-[12px] text-ink"
                style={{ color: e.color }}
              >
                {ORDEN.map((k) => (
                  <option key={k} value={k}>{`${ESTATUS[k].icono} ${ESTATUS[k].etiqueta}`}</option>
                ))}
              </select>
            ) : (
              <span className="shrink-0 text-[12px] font-medium" style={{ color: e.color }}>
                <span aria-hidden="true">{e.icono}</span> {e.etiqueta}
              </span>
            )}
          </div>
        );
      })}
    </Card>
  );
}
