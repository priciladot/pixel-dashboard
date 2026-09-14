import { Suspense } from "react";
import {
  vendedores, periodos, periodoActivoDe,
  kpisMarketingSemanaActual, diagnosticoMarketingCoach, disciplinaMarketing, tareasMarketing, historialMarketingMensual,
  type KpiMarketing, type AccionMarketingCoach, type DisciplinaMarketing, type RetoSemanaMarketing, type TareaMarketing,
  type ResumenMarketingMes,
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
    const todasLasTareas = await tareasMarketing();
    const resumenes = await Promise.all(equipoMarketing.map(async (p) => {
      const semanaActual = await kpisMarketingSemanaActual(p.id, periodoId);
      const tareasPersona = todasLasTareas.filter((t) => t.vendedor_id === p.id);
      return {
        persona: p,
        semanaActual,
        verdes: semanaActual.kpis.filter((k) => k.semaforo === "Verde").length,
        amarillos: semanaActual.kpis.filter((k) => k.semaforo === "Amarillo").length,
        rojos: semanaActual.kpis.filter((k) => k.semaforo === "Rojo").length,
        atrasadas: tareasPersona.filter((t) => t.dias_para_vencer < 0).length,
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
              {resumenes.map(({ persona, semanaActual, verdes, amarillos, rojos, atrasadas }) => (
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
                      {atrasadas > 0 && (
                        <span className="ml-auto rounded-full bg-[#fdecec] px-2 py-0.5 text-[11px] font-medium text-[#d03b3b]">
                          ⏰ {atrasadas} atrasada{atrasadas === 1 ? "" : "s"}
                        </span>
                      )}
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
  const indicePeriodo = lista.findIndex((p) => p.id === periodoId);
  const periodosHistorial = lista.slice(indicePeriodo, indicePeriodo + 3).map((p) => p.id);

  const [semanaActual, coach, disciplina, tareas, historial] = await Promise.all([
    kpisMarketingSemanaActual(vendedorIdForzado, periodoId),
    diagnosticoMarketingCoach(vendedorIdForzado, periodoId),
    disciplinaMarketing(vendedorIdForzado, periodoId),
    tareasMarketing(vendedorIdForzado),
    historialMarketingMensual(vendedorIdForzado, periodosHistorial),
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

      <Seccion titulo="📋 Pendientes y tareas" descripcion="Entregables asignados por dirección/lead de Marketing -- cuotas mensuales o tareas puntuales, con fecha límite.">
        <TareasMarketingLista tareas={tareas} />
      </Seccion>

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

      <Seccion titulo="📅 Histórico (últimos 3 meses)" descripcion="Total de KPIs verde/amarillo/rojo de cada mes, sin tener que cambiar el selector uno por uno.">
        <HistorialMarketingTabla historial={historial} />
      </Seccion>
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

/** Pendientes/tareas asignadas a mano (marketing_tareas) -- rojo si ya venció, amarillo si vence en 2 días o menos. */
function TareasMarketingLista({ tareas }: { tareas: TareaMarketing[] }) {
  if (tareas.length === 0) {
    return <Card className="px-5 py-6 text-center text-[13px] text-ink-soft">Sin pendientes abiertos.</Card>;
  }
  return (
    <ul className="space-y-2">
      {tareas.map((t) => {
        const atrasada = t.dias_para_vencer < 0;
        const porVencer = t.dias_para_vencer >= 0 && t.dias_para_vencer <= 2;
        const color = atrasada ? "#d03b3b" : porVencer ? "#8a6100" : "#0ca30c";
        const bg = atrasada ? "#fdecec" : porVencer ? "#fdf4e0" : "#e9f7e9";
        const borde = atrasada ? "#f3c2c2" : porVencer ? "#f2dfae" : "#bfe6bf";
        const etiquetaFecha = atrasada
          ? `Venció hace ${Math.abs(t.dias_para_vencer)} día${Math.abs(t.dias_para_vencer) === 1 ? "" : "s"}`
          : t.dias_para_vencer === 0
            ? "Vence hoy"
            : `Vence en ${t.dias_para_vencer} día${t.dias_para_vencer === 1 ? "" : "s"}`;
        return (
          <li key={t.id} className="rounded-card border px-4 py-3" style={{ backgroundColor: bg, borderColor: borde }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-ink">{t.titulo}</p>
              <span className="text-[11px] font-semibold" style={{ color }}>{etiquetaFecha}</span>
            </div>
            {t.descripcion && <p className="mt-1 text-[12px] text-ink-soft">{t.descripcion}</p>}
            {t.cantidad_requerida != null && (
              <p className="mt-1 text-[12px] text-ink-muted">
                Avance: {t.cantidad_actual ?? 0} de {t.cantidad_requerida}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Histórico combinado de varios meses (historialMarketingMensual) -- un renglón por mes, sin cambiar el selector de periodo. */
function HistorialMarketingTabla({ historial }: { historial: ResumenMarketingMes[] }) {
  if (historial.length === 0) {
    return <Card className="px-5 py-6 text-center text-[13px] text-ink-soft">Sin histórico disponible todavía.</Card>;
  }
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5 font-medium">Mes</th>
              <th className="px-4 py-2.5 font-medium">KPIs capturados</th>
              <th className="px-4 py-2.5 font-medium">Verde / Amarillo / Rojo</th>
              <th className="px-4 py-2.5 font-medium">Detalle por KPI (peor color del mes)</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((m) => (
              <tr key={m.periodoId} className="border-b border-line/70 transition-colors last:border-0 hover:bg-surface-sunk">
                <td className="px-4 py-2.5 text-ink">{m.etiqueta}</td>
                <td className="px-4 py-2.5 tabular text-ink-soft">
                  {m.totalKpis === 0 ? <span className="text-ink-muted">Sin datos</span> : m.totalKpis}
                </td>
                <td className="px-4 py-2.5 tabular text-ink-soft">
                  <span style={{ color: "#0ca30c" }}>{m.verdes}</span>{" / "}
                  <span style={{ color: "#8a6100" }}>{m.amarillos}</span>{" / "}
                  <span style={{ color: "#d03b3b" }}>{m.rojos}</span>
                </td>
                <td className="px-4 py-2.5">
                  <ChipsKpiPorColor detalle={m.detalleKpis} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
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

/** Chips de nombre_kpi coloreados por semáforo -- reusado por la tabla semanal y la de histórico mensual. */
function ChipsKpiPorColor({ detalle }: { detalle: Array<{ nombre_kpi: string; semaforo: "Verde" | "Amarillo" | "Rojo" }> }) {
  if (detalle.length === 0) return <span className="text-ink-muted">—</span>;
  const ESTILO = {
    Verde: { color: "#0ca30c", backgroundColor: "#e9f7e9" },
    Amarillo: { color: "#8a6100", backgroundColor: "#fdf4e0" },
    Rojo: { color: "#d03b3b", backgroundColor: "#fdecec" },
  } as const;
  return (
    <div className="flex flex-wrap gap-1">
      {detalle.map((k, i) => (
        <span
          key={`${k.nombre_kpi}-${i}`}
          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={ESTILO[k.semaforo]}
        >
          {k.nombre_kpi}
        </span>
      ))}
    </div>
  );
}

function DisciplinaMarketingTabla({ disciplina }: { disciplina: DisciplinaMarketing }) {
  const { semanas, rachaSemanas } = disciplina;
  if (semanas.length === 0) {
    return <p className="text-[13px] text-ink-soft">Sin calendario de semanas (S1-S4) configurado para este periodo.</p>;
  }
  const etiquetaTemporalDe = (s: RetoSemanaMarketing): string => (s.esSemanaActual ? "En curso" : "Pasada");

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
          <table className="w-full min-w-[780px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5 font-medium">Semana</th>
                <th className="px-4 py-2.5 font-medium">KPIs</th>
                <th className="px-4 py-2.5 font-medium">Verde / Amarillo / Rojo</th>
                <th className="px-4 py-2.5 font-medium">Estatus</th>
                <th className="px-4 py-2.5 font-medium">Detalle por KPI</th>
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
                    <span className="block text-[11px] font-normal text-ink-muted">
                      {s.inicio && s.fin ? formatearRangoFechas(s.inicio, s.fin) : "Sin fecha de cronograma"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 tabular text-ink-soft">{s.totalKpis}</td>
                  <td className="px-4 py-2.5 tabular text-ink-soft">{s.cumplidos} / {s.amarillos} / {s.rojos}</td>
                  <td className="px-4 py-2.5"><EstatusBadgeMkt estado={s.estatus} /></td>
                  <td className="px-4 py-2.5">
                    <ChipsKpiPorColor detalle={s.detalleKpis} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
