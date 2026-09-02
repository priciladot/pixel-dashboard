"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import type { Periodo } from "@/lib/types";

type Resultado = Record<string, unknown> & { error?: string };

export function PanelIngesta({ periodos }: { periodos: Periodo[] }) {
  const router = useRouter();
  const [periodoId, setPeriodoId] = useState(periodos[0]?.id ?? "");
  const [ventana, setVentana] = useState<"kpi_4_semanas" | "calendario">("kpi_4_semanas");
  const [simulacion, setSimulacion] = useState(true);
  const [cargando, setCargando] = useState<"hubspot" | "archivo" | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const periodo = periodos.find((p) => p.id === periodoId);
  const rango = periodo
    ? ventana === "kpi_4_semanas"
      ? `${periodo.kpi_inicio} al ${periodo.kpi_fin}`
      : `${periodo.cal_inicio} al ${periodo.cal_fin}`
    : "—";

  const clase = "rounded border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink focus:border-serie-1 focus:outline-none";

  async function correrHubspot() {
    setCargando("hubspot");
    setResultado(null);
    try {
      const res = await fetch("/api/ingesta/hubspot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodoId, ventana, simulacion }),
      });
      setResultado(await res.json());
      if (!simulacion) router.refresh();
    } catch {
      setResultado({ error: "No se pudo contactar el servidor." });
    } finally {
      setCargando(null);
    }
  }

  async function subirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setCargando("archivo");
    setResultado(null);

    const form = new FormData();
    form.append("archivo", archivo);
    form.append("periodoId", periodoId);
    form.append("ventana", ventana);

    try {
      const res = await fetch("/api/ingesta/archivo", { method: "POST", body: form });
      setResultado(await res.json());
      router.refresh();
    } catch {
      setResultado({ error: "No se pudo subir el archivo." });
    } finally {
      setCargando(null);
      e.target.value = "";
    }
  }

  return (
    <div className="mb-8">
      <Card className="px-4 py-4">
        <div className="flex flex-wrap items-end gap-3 border-b border-line pb-4">
          <label className="flex flex-col gap-1 text-[12px] text-ink-soft">
            Periodo
            <select className={clase} value={periodoId} onChange={(e) => setPeriodoId(e.target.value)}>
              {periodos.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[12px] text-ink-soft">
            Ventana de fechas
            <select className={clase} value={ventana} onChange={(e) => setVentana(e.target.value as typeof ventana)}>
              <option value="kpi_4_semanas">KPI — 4 semanas (S1–S4)</option>
              <option value="calendario">Calendario — mes 1 al 31</option>
            </select>
          </label>

          <p className="pb-1.5 text-[12px] text-ink-muted">
            Rango que se consultará: <span className="tabular font-medium text-ink-soft">{rango}</span>
          </p>
        </div>

        <div className="grid gap-4 pt-4 md:grid-cols-2">
          {/* HubSpot ---------------------------------------------------- */}
          <div>
            <h3 className="text-[13px] font-semibold text-ink">Sincronizar con HubSpot</h3>
            <p className="mt-1 text-[12px] text-ink-soft">
              Trae los negocios creados y cerrados en el rango, los asigna por propietario y
              recalcula embudo, ticket y ciclo. Las cifras de venta las sigue mandando el semáforo.
            </p>
            <label className="mt-2.5 flex items-center gap-2 text-[12px] text-ink-soft">
              <input type="checkbox" checked={simulacion} onChange={(e) => setSimulacion(e.target.checked)} />
              Simulación (solo reporta, no escribe)
            </label>
            <button
              onClick={correrHubspot}
              disabled={cargando !== null || !periodoId}
              className="mt-2.5 rounded bg-ink px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-60"
            >
              {cargando === "hubspot" ? "Sincronizando…" : simulacion ? "Correr simulación" : "Sincronizar y guardar"}
            </button>
          </div>

          {/* Archivos --------------------------------------------------- */}
          <div>
            <h3 className="text-[13px] font-semibold text-ink">Cargar archivo histórico</h3>
            <p className="mt-1 text-[12px] text-ink-soft">
              <span className="font-medium">.csv / .json</span> exportación de HubSpot ·{" "}
              <span className="font-medium">.xlsx</span> semáforo comercial (manda sobre las cifras de venta) ·{" "}
              <span className="font-medium">.pdf</span> evaluación 1:1 ya generada (se extrae para revisión).
            </p>
            <input
              type="file"
              accept=".csv,.tsv,.json,.xlsx,.xls,.pdf"
              onChange={subirArchivo}
              disabled={cargando !== null || !periodoId}
              className="mt-2.5 block w-full text-[12px] text-ink-soft file:mr-3 file:rounded file:border-0 file:bg-surface-sunk file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink"
            />
            {cargando === "archivo" && <p className="mt-2 text-[12px] text-ink-soft">Procesando archivo…</p>}
          </div>
        </div>
      </Card>

      {resultado && (
        <Card className={`mt-3 px-4 py-3.5 ${resultado.error ? "border-[#f3c2c2]" : ""}`}>
          <p className="text-[13px] font-medium text-ink">
            {resultado.error ? "La ingesta no se completó" : "Resultado de la ingesta"}
          </p>
          <pre className="mt-2 max-h-[320px] overflow-auto rounded bg-surface-sunk px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft">
{JSON.stringify(resultado, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}
