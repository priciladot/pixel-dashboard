import { Suspense } from "react";
import {
  vendedores, periodos, periodoActivoDe,
  kpisMarketingSemanaActual, diagnosticoMarketingCoach, disciplinaMarketing, tareasMarketing, historialMarketingMensual,
  metricasCanalDelVendedor, notasGestionMarketing, panelGerenteMarketing,
  type KpiMarketing, type AccionMarketingCoach, type DisciplinaMarketing, type RetoSemanaMarketing, type TareaMarketing,
  type ResumenMarketingMes, type MetricaCanal, type NotaGestion, type PanelGerenteMarketing,
} from "@/lib/queries";
import type { EstatusReto } from "@/lib/queries";
import { Card, Seccion, Vacio } from "@/components/ui";
import { Filtros } from "@/components/Filtros";
import { formatearRangoFechas, dinero } from "@/lib/format";

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
                      {semanaActual.semana != null
                        ? `Semana ${semanaActual.semana} de ${periodo.etiqueta}`
                        : "Sin semana capturada todavía"}
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

  const [semanaActual, coach, disciplina, tareas, historial, metricasCanal, notas, panelGerente] = await Promise.all([
    kpisMarketingSemanaActual(vendedorIdForzado, periodoId),
    diagnosticoMarketingCoach(vendedorIdForzado, periodoId),
    disciplinaMarketing(vendedorIdForzado, periodoId),
    tareasMarketing(vendedorIdForzado),
    historialMarketingMensual(vendedorIdForzado, periodosHistorial),
    metricasCanalDelVendedor(vendedorIdForzado),
    notasGestionMarketing(vendedorIdForzado),
    persona?.rol === "marketing_lead" ? panelGerenteMarketing([...periodosHistorial].reverse()) : Promise.resolve(null as PanelGerenteMarketing | null),
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

      {/* Primero el contexto cualitativo (notas), luego los pendientes y los
          números -- para que quien entra al perfil primero entienda la
          historia (reconocimientos/llamadas de atención) antes de ver el
          detalle de KPIs. */}
      {notas.length > 0 && (
        <Seccion titulo="📝 Notas de gestión" descripcion="Llamadas de atención y reconocimientos -- antecedente permanente, no un pendiente con fecha límite.">
          <NotasGestionLista notas={notas} />
        </Seccion>
      )}

      {panelGerente && (
        <Seccion
          titulo="🧭 Perfil de Gerente de Marketing — KPIs de área"
          descripcion="Los 5 KPIs del perfil vigente de Gerente de Marketing, por mes calendario -- no por persona."
        >
          <PanelGerenteMarketingTarjeta panel={panelGerente} />
        </Seccion>
      )}

      <Seccion titulo="📋 Pendientes y tareas" descripcion="Entregables asignados por dirección/lead de Marketing -- cuotas mensuales o tareas puntuales, con fecha límite.">
        <TareasMarketingLista tareas={tareas} />
      </Seccion>

      <Seccion
        titulo="KPIs de esta semana"
        descripcion={
          semanaActual.semana != null
            ? `Semana ${semanaActual.semana} de ${periodo.etiqueta} -- la última que el equipo ya capturó en Monday.`
            : "Sin semana capturada todavía para este mes."
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

      {metricasCanal.length > 0 && (
        <Seccion titulo="📡 Métricas por canal" descripcion="Alcance/Interacción/CTR de los tableros de canal con datos por persona -- última semana capturada.">
          <MetricasCanalTabla metricas={metricasCanal} />
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

/** Pendientes/tareas asignadas a mano (marketing_tareas) -- rojo si ya venció, amarillo si vence en 2 días o menos. */
const FORMATO_FECHA_NOTA = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" });

/** Notas de gestión (marketing_notas) -- llamadas de atención / reconocimientos, sin fecha límite ni estatus. */
function NotasGestionLista({ notas }: { notas: NotaGestion[] }) {
  return (
    <ul className="space-y-2">
      {notas.map((n) => {
        const ESTILO_NOTA = {
          llamada_atencion: { color: "#d03b3b", bg: "#fdecec", borde: "#f3c2c2", etiqueta: "⚠️ Llamada de atención" },
          reconocimiento: { color: "#0ca30c", bg: "#e9f7e9", borde: "#bfe6bf", etiqueta: "✅ Reconocimiento" },
          recordatorio: { color: "#2a78d6", bg: "#2a78d614", borde: "#2a78d640", etiqueta: "💡 Recordatorio" },
        } as const;
        const { color, bg, borde, etiqueta } = ESTILO_NOTA[n.tipo];
        return (
          <li key={n.id} className="rounded-card border px-4 py-3" style={{ backgroundColor: bg, borderColor: borde }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-ink">
                <span style={{ color }}>{etiqueta}</span>
                {" — "}{n.titulo}
              </p>
              <span className="text-[11px] text-ink-muted">{FORMATO_FECHA_NOTA.format(new Date(n.creado_en))}</span>
            </div>
            {n.detalle && <p className="mt-1 text-[12px] text-ink-soft">{n.detalle}</p>}
          </li>
        );
      })}
    </ul>
  );
}

const ETIQUETA_PLATAFORMA: Record<string, string> = {
  google: "Ads",
  meta: "Meta (Facebook/Instagram)",
  tiktok: "TikTok",
  pinterest: "Pinterest",
};

const ETIQUETA_RED: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  pinterest: "Pinterest",
  tiktok: "TikTok",
  youtube: "YouTube",
};

/** Los 5 KPIs del perfil de Gerente de Marketing -- por mes calendario, área completa (no por persona). */
function PanelGerenteMarketingTarjeta({ panel }: { panel: PanelGerenteMarketing }) {
  return (
    <div className="space-y-3">
      {/* KPI 1 y 2: Leads Calificados + CPL/Conversión MQL→SQL ------------ */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5 font-medium">Mes</th>
                <th className="px-4 py-2.5 font-medium">Leads calificados (SQL)</th>
                <th className="px-4 py-2.5 font-medium">MQL</th>
                <th className="px-4 py-2.5 font-medium">Conversión MQL→SQL (meta ≥20%)</th>
                <th className="px-4 py-2.5 font-medium">Gasto de plataformas</th>
                <th className="px-4 py-2.5 font-medium">CPL</th>
              </tr>
            </thead>
            <tbody>
              {panel.meses.map((m) => {
                const cumpleConversion = m.conversionMqlSql != null && m.conversionMqlSql >= 20;
                return (
                  <tr key={m.periodoId} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ink">{m.mes}</td>
                    <td className="px-4 py-2.5 tabular text-ink-soft">{m.leadsCalificados}</td>
                    <td className="px-4 py-2.5 tabular text-ink-soft">{m.mql || "—"}</td>
                    <td className="px-4 py-2.5 tabular font-medium" style={{ color: m.conversionMqlSql == null ? undefined : cumpleConversion ? "#0ca30c" : "#d03b3b" }}>
                      {m.conversionMqlSql == null ? "Sin MQL capturado" : `${m.conversionMqlSql.toFixed(1)}%`}
                    </td>
                    <td className="px-4 py-2.5 tabular text-ink-soft">{m.gastoAdsReal != null ? dinero(m.gastoAdsReal) : "—"}</td>
                    <td className="px-4 py-2.5 tabular text-ink-soft">{m.cpl != null ? dinero(m.cpl) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line bg-surface-sunk px-4 py-3 text-[11px] leading-relaxed text-ink-muted">
          <p><span className="font-medium text-ink-soft">Leads calificados (SQL):</span> suma de "Leads calificados generados" del tablero de Monday "Registro de KPIs - Marketing" -- se suman TODAS las semanas capturadas de ese mes, de TODO el equipo de Marketing (no es un promedio ni el dato de una sola persona).</p>
          <p className="mt-1"><span className="font-medium text-ink-soft">MQL:</span> mismo tablero y mismo criterio (suma de todas las semanas del mes), fila "MQL".</p>
          <p className="mt-1"><span className="font-medium text-ink-soft">Conversión MQL→SQL:</span> Leads calificados del mes ÷ MQL del mes × 100. Meta del perfil de Gerente: ≥20% (verde) / por debajo (rojo).</p>
          <p className="mt-1"><span className="font-medium text-ink-soft">Gasto de plataformas:</span> suma de TODO lo invertido ese mes en las 4 plataformas (Ads/Google + Meta + TikTok + Pinterest) -- captura manual, no viene de ninguna API.</p>
          <p className="mt-1"><span className="font-medium text-ink-soft">CPL:</span> Gasto de plataformas (las 4 sumadas) ÷ Leads calificados del mes.</p>
        </div>
      </Card>

      {/* KPI 3: ROAS por plataforma -------------------------------------- */}
      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-2.5 text-[12px] font-semibold text-ink">
          Desempeño de campañas digitales (ROAS) — meta: ROI positivo
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5 font-medium">Mes</th>
                <th className="px-4 py-2.5 font-medium">Plataforma</th>
                <th className="px-4 py-2.5 font-medium">Gasto</th>
                <th className="px-4 py-2.5 font-medium">Ventas atribuidas</th>
                <th className="px-4 py-2.5 font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {panel.meses.flatMap((m) =>
                m.plataformas.map((p) => (
                  <tr key={`${m.periodoId}-${p.plataforma}`} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-2.5 text-ink-soft">{m.mes}</td>
                    <td className="px-4 py-2.5 text-ink">{ETIQUETA_PLATAFORMA[p.plataforma]}</td>
                    <td className="px-4 py-2.5 tabular text-ink-soft">
                      {p.gasto != null ? dinero(p.gasto) : p.nota ? p.nota : "Sin dato"}
                    </td>
                    <td className="px-4 py-2.5 tabular text-ink-soft">{dinero(p.ventasAtribuidasIva)}</td>
                    <td className="px-4 py-2.5 tabular font-medium" style={{ color: p.roas == null ? undefined : p.roas >= 1 ? "#0ca30c" : "#d03b3b" }}>
                      {p.roas != null ? `${p.roas.toFixed(2)}x` : "—"}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line bg-surface-sunk px-4 py-3 text-[11px] leading-relaxed text-ink-muted">
          <p><span className="font-medium text-ink-soft">Gasto:</span> lo que Dana dictó para esa plataforma y mes -- captura manual, no una API. "Sin dato" = todavía no se ha capturado (no es $0).</p>
          <p className="mt-1"><span className="font-medium text-ink-soft">Ventas atribuidas:</span> suma de negocios GANADOS cuyo campo "¿cómo llegó?" (capturado por el vendedor en HubSpot/Monday al cerrar) es "Facebook" o "Instagram" → fila Meta; "Ads", "Adds", "Llamada"/"Llamadas" o "Formulario" → fila Ads. Pinterest y TikTok no tienen ningún cierre con ese "¿cómo llegó?" todavía, por eso muestran $0 -- no significa que no haya inversión, significa que ningún negocio ganado se atribuyó a esa plataforma.</p>
          <p className="mt-1"><span className="font-medium text-ink-soft">ROAS:</span> Ventas atribuidas ÷ Gasto. Ej. Julio Ads: $25,080 ÷ $17,385 = 1.44x (verde, ≥1x = retorno positivo). Sale "—" cuando no hay gasto capturado.</p>
        </div>
      </Card>

      {/* KPI 4: Cumplimiento del calendario -- pendiente de integrar ------ */}
      <Card className="px-4 py-4">
        <h3 className="text-[13px] font-semibold text-ink">Cumplimiento del Calendario de Marketing (meta ≥95%)</h3>
        <p className="mt-1.5 text-[12px] text-ink-soft">
          Pendiente de integrar -- ya localizamos el tablero de Monday ("✅Campañas MKT", agrupado por Facebook/Instagram/Google/Pinterest/YT,
          con un estatus de "Listo"/"No se entregó a tiempo" por entregable) pero falta construir la sincronización. En cuanto esté lista, este KPI
          se calcula solo, sin captura manual.
        </p>
      </Card>

      {/* KPI 5: Crecimiento de Ecosistema Digital ------------------------- */}
      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-2.5 text-[12px] font-semibold text-ink">
          Crecimiento de Ecosistema Digital — meta: tendencia creciente mes a mes
        </div>
        <TablaSeguidores seguidores={panel.seguidores} />
      </Card>
    </div>
  );
}

/** Tácticas genéricas por red cuando NO hubo crecimiento (0% o negativo) contra la toma anterior. */
const TACTICAS_CRECIMIENTO_RED: Record<string, string> = {
  instagram: "Publicar con más frecuencia (Reels/Carruseles suelen dar más alcance que fotos sueltas), colaborar con cuentas aliadas para exposición cruzada, y usar pauta de descubrimiento para llegar a audiencias nuevas -- no solo a los que ya te siguen.",
  facebook: "Revisar horarios de publicación contra cuándo está activa tu audiencia, impulsar el contenido con mejor desempeño orgánico con un poco de pauta, y promover la página en las publicaciones de Instagram para cruzar audiencias.",
  pinterest: "Pinterest premia la frecuencia -- subir Pines nuevos de forma constante (no solo reciclar contenido de otras redes), usar palabras clave reales en título y descripción de cada Pin, y crear tableros temáticos organizados por producto/servicio.",
  tiktok: "Publicar con mayor frecuencia y participar en tendencias/sonidos vigentes, usar los primeros 2 segundos del video para enganchar antes del scroll, y revisar qué formato (tutorial, detrás de cámaras, etc.) retuvo más a la audiencia.",
  youtube: "Optimizar título/miniatura de los videos existentes para mejorar el CTR, mantener una cadencia de subida constante, y usar Shorts para atraer audiencia nueva hacia el canal.",
};

/** Seguidores por red, con el cambio vs. la toma anterior de esa misma red. */
function TablaSeguidores({ seguidores }: { seguidores: PanelGerenteMarketing["seguidores"] }) {
  if (seguidores.length === 0) {
    return <p className="px-4 py-4 text-[13px] text-ink-soft">Sin capturas de seguidores todavía.</p>;
  }

  const porRed = new Map<string, typeof seguidores>();
  for (const s of seguidores) porRed.set(s.red, [...(porRed.get(s.red) ?? []), s]);

  const sinCrecimiento: Array<{ red: string; cambio: number }> = [];
  for (const [red, filas] of porRed) {
    if (filas.length < 2) continue;
    const anterior = filas[filas.length - 2].seguidores;
    const actual = filas[filas.length - 1].seguidores;
    const cambio = anterior > 0 ? ((actual - anterior) / anterior) * 100 : 0;
    if (cambio <= 0) sinCrecimiento.push({ red, cambio });
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5 font-medium">Red</th>
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Seguidores</th>
              <th className="px-4 py-2.5 font-medium">Cambio vs. toma anterior</th>
            </tr>
          </thead>
          <tbody>
            {[...porRed.entries()].flatMap(([red, filas]) =>
              filas.map((f, i) => {
                const anterior = i > 0 ? filas[i - 1].seguidores : null;
                const cambio = anterior != null && anterior > 0 ? ((f.seguidores - anterior) / anterior) * 100 : null;
                return (
                  <tr key={`${red}-${f.fecha}`} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-2.5 text-ink">{i === 0 ? (ETIQUETA_RED[red] ?? red) : ""}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{new Date(f.fecha).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="px-4 py-2.5 tabular text-ink-soft">{f.seguidores.toLocaleString("es-MX")}</td>
                    <td className="px-4 py-2.5 tabular font-medium" style={{ color: cambio == null ? undefined : cambio > 0 ? "#0ca30c" : cambio < 0 ? "#d03b3b" : "#8a6100" }}>
                      {cambio == null ? "—" : `${cambio > 0 ? "+" : ""}${cambio.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-line bg-surface-sunk px-4 py-3 text-[11px] leading-relaxed text-ink-muted">
        <p><span className="font-medium text-ink-soft">Seguidores:</span> foto que Dana dicta cada vez que la tiene a mano (no hay integración con las APIs de cada red) -- no es un promedio, es el total exacto de ese día.</p>
        <p className="mt-1"><span className="font-medium text-ink-soft">Cambio vs. toma anterior:</span> % de diferencia contra la captura previa de esa misma red (no contra el mes calendario anterior si no hubo una captura ese mes). La meta del perfil de Gerente es que este número sea positivo mes a mes, en cada red -- 0.0% significa que no hubo NINGÚN crecimiento desde la última vez que se capturó, no es un error de cálculo.</p>
      </div>

      {sinCrecimiento.length > 0 && (
        <div className="space-y-2 border-t border-line px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a6100]">Sin crecimiento desde la toma anterior -- qué hacer</p>
          {sinCrecimiento.map(({ red, cambio }) => (
            <div key={red} className="rounded-card border px-3 py-2.5" style={{ backgroundColor: "#fdf4e0", borderColor: "#f2dfae" }}>
              <p className="text-[12px] font-medium text-ink">
                {ETIQUETA_RED[red] ?? red} — {cambio === 0 ? "0% de cambio (se quedó exactamente igual)" : `${cambio.toFixed(1)}% (bajó)`}
              </p>
              <p className="mt-1 text-[12px] text-ink-soft">
                {TACTICAS_CRECIMIENTO_RED[red] ?? "Revisar qué contenido publicado en el último periodo tuvo mejor alcance/interacción y repetir ese formato con más frecuencia."}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ItemTareaMarketing({ t }: { t: TareaMarketing }) {
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
    <li className="rounded-card border px-4 py-3" style={{ backgroundColor: bg, borderColor: borde }}>
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
}

/**
 * Críticas (atrasadas o vencen en 2 días o menos) arriba, siempre a la
 * vista. Las que todavía tienen tiempo de sobra (verde) no se ocultan --
 * solo se separan hasta abajo, en su propia sección, para que lo urgente
 * no se pierda entre lo que no lo es.
 */
function TareasMarketingLista({ tareas }: { tareas: TareaMarketing[] }) {
  if (tareas.length === 0) {
    return <Card className="px-5 py-6 text-center text-[13px] text-ink-soft">Sin pendientes abiertos.</Card>;
  }
  const criticas = tareas.filter((t) => t.dias_para_vencer <= 2);
  const conTiempo = tareas.filter((t) => t.dias_para_vencer > 2);

  return (
    <div className="space-y-4">
      {criticas.length > 0 && (
        <ul className="space-y-2">
          {criticas.map((t) => <ItemTareaMarketing key={t.id} t={t} />)}
        </ul>
      )}
      {conTiempo.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Con tiempo de sobra
          </p>
          <ul className="space-y-2">
            {conTiempo.map((t) => <ItemTareaMarketing key={t.id} t={t} />)}
          </ul>
        </div>
      )}
    </div>
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

/** Métricas por canal (marketing_metricas_canal) -- sin meta/semáforo, son números crudos por semana. */
function MetricasCanalTabla({ metricas }: { metricas: MetricaCanal[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5 font-medium">Tablero</th>
              <th className="px-4 py-2.5 font-medium">Métrica</th>
              <th className="px-4 py-2.5 font-medium">Semana</th>
              <th className="px-4 py-2.5 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {metricas.map((m) => (
              <tr key={`${m.tablero}-${m.nombreMetrica}`} className="border-b border-line/70 transition-colors last:border-0 hover:bg-surface-sunk">
                <td className="px-4 py-2.5 text-ink-soft">{m.tablero}</td>
                <td className="px-4 py-2.5 text-ink">{m.nombreMetrica}</td>
                <td className="px-4 py-2.5 text-ink-soft">{m.semana ?? "—"}</td>
                <td className="px-4 py-2.5 tabular text-ink-soft">
                  {m.valor == null ? "—" : m.nombreMetrica === "CTR" ? `${(m.valor * 100).toFixed(2)}%` : m.valor}
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
