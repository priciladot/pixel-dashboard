import { Suspense } from "react";
import {
  vendedores, periodos, periodoActivoDe,
  kpisMarketingSemanaActual, diagnosticoMarketingCoach, disciplinaMarketing,
  type KpiMarketing, type AccionMarketingCoach, type DisciplinaMarketing, type RetoSemanaMarketing,
} from "@/lib/queries";
import type { EstatusReto } from "@/lib/queries";
import { Card, Seccion, Vacio } from "@/components/ui";
import { Filtros } from "@/components/Filtros";
import { formatearRangoFechas } from "@/lib/format";

/**
 * Torre de Control de Marketing -- mismo patrón dual que TorreDeControl.tsx
 * (equipo/individual, RLS como candado real, no esta prop): sin
 * `vendedorIdForzado` muestra el resumen de los 5 (link a cada perfil);
 * con `vendedorIdForzado` muestra el detalle de esa persona -- KPIs de la
 * semana, Coach de Marketing, y Ritmo semanal S1-S4.
 */
export async function MarketingTorreDeControl({
  periodoIdParam, vendedorIdForzado, mostrarEncabezado,
}: {
  periodoIdParam?: string;
  vendedorIdForzado?: string;
  mostrarEncabezado?: boolean;
}) {
  const lista = await periodos();
  if (lista.length === 0) return <Vacio titulo="No hay periodos configurados" />;

  const periodoId = periodoIdParam && lista.some((p) => p.id === periodoIdParam)
    ? periodoIdParam
    : (periodoActivoDe(lista) ?? lista[0]).id;
  const periodo = lista.find((p) => p.id === periodoId)!;

  const personas = await vendedores();
  const equipoMarketing = personas.filter((p) => p.rol === "marketing" || p.rol === "marketing_lead");

  if (!vendedorIdForzado) {
    const resumenes = await Promise.all(equipoMarketing.map(async (p) => {
      const semanaActual = await kpisMarketingSemanaActual(p.id, periodoId);
      return {
        persona: p,
        semanaActual,
        verdes: semanaActual.kpis.filter((k) => k.semaforo === "Verde").length,
        amarillos: semanaActual.kpis.filter((k) => k.semaforo === "Amarillo").length,
        rojos: semanaActual.kpis.filter((k) => k.semaforo === "Rojo").length,
      };
    }));

    return (
      <>
        {mostrarEncabezado && (
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight text-ink">Marketing — Equipo</h1>
              <p className="mt-0.5 text-[13px] text-ink-soft">{periodo.etiqueta} · Semáforo de la semana vigente</p>
            </div>
            <Suspense fallback={null}>
              <Filtros periodos={lista} periodoActivoId={periodoId} />
            </Suspense>
          </div>
        )}

        <Seccion titulo="KPIs de la semana — equipo" descripcion="Semáforo de cada persona en la semana en curso. Entra a un perfil para ver el detalle y las recomendaciones.">
          {resumenes.length === 0 ? (
            <Vacio titulo="No hay personas de Marketing configuradas todavía" detalle="Crea sus cuentas con rol 'marketing' o 'marketing_lead' en profiles." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {resumenes.map(({ persona, semanaActual, verdes, amarillos, rojos }) => (
                <a key={persona.id} href={`/mkt/${persona.id}`} className="block">
                  <Card className="px-4 py-4 transition-shadow duration-200 hover:shadow-md">
                    <p className="text-[13px] font-semibold text-ink">{persona.nombre_completo}</p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {semanaActual.inicio && semanaActual.fin
                        ? formatearRangoFechas(semanaActual.inicio, semanaActual.fin)
                        : "Sin semana configurada"}
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-[13px] tabular">
                      <span style={{ color: "#0ca30c" }}>● {verdes}</span>
                      <span style={{ color: "#8a6100" }}>◐ {amarillos}</span>
                      <span style={{ color: "#d03b3b" }}>▲ {rojos}</span>
                    </div>
                  </Card>
                </a>
              ))}
            </div>
          )}
        </Seccion>
      </>
    );
  }

  const persona = personas.find((p) => p.id === vendedorIdForzado);
  const [semanaActual, coach, disciplina] = await Promise.all([
    kpisMarketingSemanaActual(vendedorIdForzado, periodoId),
    diagnosticoMarketingCoach(vendedorIdForzado, periodoId),
    disciplinaMarketing(vendedorIdForzado, periodoId),
  ]);

  return (
    <>
      {mostrarEncabezado && persona && (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight text-ink">{persona.nombre_completo}</h1>
            <p className="mt-0.5 text-[13px] text-ink-soft">{persona.puesto ?? "Marketing"} · {periodo.etiqueta}</p>
          </div>
          <Suspense fallback={null}>
            <Filtros periodos={lista} periodoActivoId={periodoId} />
          </Suspense>
        </div>
      )}

      <Seccion
        titulo="KPIs de esta semana"
        descripcion={
          semanaActual.inicio && semanaActual.fin
            ? `Semana ${semanaActual.semana ?? "—"} · ${formatearRangoFechas(semanaActual.inicio, semanaActual.fin)}`
            : "Sin semana configurada para este periodo."
        }
      >
        <TablaKpisSemana kpis={semanaActual.kpis} />
      </Seccion>

      <Seccion titulo="🎯 Coach de Marketing" descripcion="Diagnóstico de la semana vigente y qué hacer para mejorar cada métrica en riesgo.">
        <CoachMarketing acciones={coach} />
      </Seccion>

      {disciplina && (
        <Seccion titulo="📊 Ritmo semanal (S1-S4)" descripcion="Semáforo general por semana del mes -- Cumplido si todo estuvo en verde.">
          <DisciplinaMarketingTabla disciplina={disciplina} />
        </Seccion>
      )}
    </>
  );
}

const SEMAFORO_ESTILO: Record<"Verde" | "Amarillo" | "Rojo", { etiqueta: string; icono: string; color: string; bg: string; borde: string }> = {
  Verde:    { etiqueta: "Verde",    icono: "●", color: "#0ca30c", bg: "#e9f7e9", borde: "#bfe6bf" },
  Amarillo: { etiqueta: "Amarillo", icono: "◐", color: "#8a6100", bg: "#fdf4e0", borde: "#f2dfae" },
  Rojo:     { etiqueta: "Rojo",     icono: "▲", color: "#d03b3b", bg: "#fdecec", borde: "#f3c2c2" },
};

function SemaforoMktBadge({ estado }: { estado: "Verde" | "Amarillo" | "Rojo" | null }) {
  if (!estado) return <span className="text-[11px] text-ink-muted">Sin dato</span>;
  const s = SEMAFORO_ESTILO[estado];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ color: s.color, backgroundColor: s.bg, borderColor: s.borde }}
    >
      <span aria-hidden="true">{s.icono}</span>
      {s.etiqueta}
    </span>
  );
}

function TablaKpisSemana({ kpis }: { kpis: KpiMarketing[] }) {
  if (kpis.length === 0) {
    return <Card className="px-5 py-6 text-center text-[13px] text-ink-soft">Sin KPIs capturados para esta semana todavía.</Card>;
  }
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5 font-medium">KPI</th>
              <th className="px-4 py-2.5 font-medium">Meta</th>
              <th className="px-4 py-2.5 font-medium">Resultado</th>
              <th className="px-4 py-2.5 font-medium">% Cumplimiento</th>
              <th className="px-4 py-2.5 font-medium">Semáforo</th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((k) => (
              <tr key={k.elemento_id} className="border-b border-line/70 transition-colors last:border-0 hover:bg-surface-sunk">
                <td className="px-4 py-2.5 text-ink">{k.nombre_kpi}</td>
                <td className="px-4 py-2.5 tabular text-ink-soft">{k.meta ?? "—"}</td>
                <td className="px-4 py-2.5 tabular text-ink-soft">{k.resultado ?? "—"}</td>
                <td className="px-4 py-2.5 tabular text-ink-soft">{k.pct_cumplimiento != null ? `${k.pct_cumplimiento}%` : "—"}</td>
                <td className="px-4 py-2.5"><SemaforoMktBadge estado={k.semaforo} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const COLOR_CATEGORIA_MKT: Record<AccionMarketingCoach["categoria"], string> = {
  leads: "#c0392b", engagement: "#2a78d6", respuesta: "#8a6100", crm: "#a04a25", contenido: "#1f9d55", general: "#52514e",
};
const ETIQUETA_CATEGORIA_MKT: Record<AccionMarketingCoach["categoria"], string> = {
  leads: "Leads", engagement: "Engagement", respuesta: "Tiempo de respuesta", crm: "CRM / Monday", contenido: "Contenido", general: "General",
};

/** Coach de Marketing: un mensaje por cada KPI en riesgo esta semana, 100% derivado del semáforo ya calculado por Monday. */
function CoachMarketing({ acciones }: { acciones: AccionMarketingCoach[] }) {
  if (acciones.length === 0) {
    return (
      <div className="rounded-card border px-4 py-3.5 shadow-sm transition-shadow duration-200 hover:shadow-md" style={{ backgroundColor: "#0ca30c1a", borderColor: "#0ca30c40" }}>
        <p className="text-[13px] text-ink-soft">
          ✅ Sin focos de atención esta semana -- todo tu semáforo está en verde, o todavía no hay KPIs capturados.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {acciones.map((a) => (
        <div
          key={a.nombre_kpi}
          className="rounded-card border px-4 py-3 shadow-sm transition-shadow duration-200 hover:shadow-md"
          style={{ backgroundColor: `${COLOR_CATEGORIA_MKT[a.categoria]}14`, borderColor: `${COLOR_CATEGORIA_MKT[a.categoria]}33` }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: COLOR_CATEGORIA_MKT[a.categoria] }}>
            {ETIQUETA_CATEGORIA_MKT[a.categoria]}
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">{a.diagnostico}</p>
          <p className="mt-1.5 text-[13px] text-ink">{a.mensaje}</p>
        </div>
      ))}
    </div>
  );
}

const ESTATUS_RETO_MKT: Record<EstatusReto, { etiqueta: string; icono: string; color: string; bg: string; borde: string }> = {
  cumplido:     { etiqueta: "Cumplido",     icono: "●", color: "#0ca30c", bg: "#e9f7e9", borde: "#bfe6bf" },
  en_progreso:  { etiqueta: "En progreso",  icono: "◐", color: "#8a6100", bg: "#fdf4e0", borde: "#f2dfae" },
  no_alcanzado: { etiqueta: "No alcanzado", icono: "▲", color: "#d03b3b", bg: "#fdecec", borde: "#f3c2c2" },
  sin_dato:     { etiqueta: "Sin dato",     icono: "○", color: "#52514e", bg: "#f2f1ed", borde: "#e1e0d9" },
  pendiente:    { etiqueta: "Pendiente",    icono: "○", color: "#52514e", bg: "#f2f1ed", borde: "#e1e0d9" },
};

function EstatusBadgeMkt({ estado }: { estado: EstatusReto }) {
  const s = ESTATUS_RETO_MKT[estado];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ color: s.color, backgroundColor: s.bg, borderColor: s.borde }}
    >
      <span aria-hidden="true">{s.icono}</span>
      {s.etiqueta}
    </span>
  );
}

function DisciplinaMarketingTabla({ disciplina }: { disciplina: DisciplinaMarketing }) {
  const { semanas, rachaSemanas } = disciplina;
  if (semanas.length === 0) {
    return <p className="text-[13px] text-ink-soft">Sin calendario de semanas (S1-S4) configurado para este periodo.</p>;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const etiquetaTemporalDe = (s: RetoSemanaMarketing): string => (s.esSemanaActual ? "En curso" : s.fin < hoy ? "Pasada" : "Próxima");

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div
          className={`rounded-full border px-3 py-1 text-[12px] font-medium ${rachaSemanas > 0 ? "" : "border-line bg-surface-sunk text-ink"}`}
          style={rachaSemanas > 0 ? { color: "#0ca30c", backgroundColor: "#0ca30c1a", borderColor: "#0ca30c40" } : undefined}
        >
          🔥 Racha: {rachaSemanas} semana{rachaSemanas === 1 ? "" : "s"} consecutiva{rachaSemanas === 1 ? "" : "s"}
        </div>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5 font-medium">Semana</th>
                <th className="px-4 py-2.5 font-medium">KPIs</th>
                <th className="px-4 py-2.5 font-medium">Verde / Amarillo / Rojo</th>
                <th className="px-4 py-2.5 font-medium">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {semanas.map((s) => (
                <tr key={s.semana} className="border-b border-line/70 transition-colors last:border-0 hover:bg-surface-sunk">
                  <td className="px-4 py-2.5 text-ink">
                    {s.etiqueta}
                    <span className={`ml-1.5 text-[10px] font-medium ${s.esSemanaActual ? "text-serie-1" : "text-ink-muted"}`}>
                      ({etiquetaTemporalDe(s)})
                    </span>
                    <span className="block text-[11px] font-normal text-ink-muted">{formatearRangoFechas(s.inicio, s.fin)}</span>
                  </td>
                  <td className="px-4 py-2.5 tabular text-ink-soft">{s.totalKpis}</td>
                  <td className="px-4 py-2.5 tabular text-ink-soft">{s.cumplidos} / {s.amarillos} / {s.rojos}</td>
                  <td className="px-4 py-2.5"><EstatusBadgeMkt estado={s.estatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
