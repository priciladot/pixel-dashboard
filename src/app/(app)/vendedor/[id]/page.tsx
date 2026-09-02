import { Suspense } from "react";
import { notFound } from "next/navigation";
import { esDireccion, requiereSesion } from "@/lib/auth";
import {
  benchmarks, contextoMercado, evaluacionDe, historicoDe, kpiDe, perfilPorId, periodos,
} from "@/lib/queries";
import { Card, CalidadBadge, KpiCard, Seccion, SemaforoBadge, Vacio } from "@/components/ui";
import { Filtros } from "@/components/Filtros";
import { Brecha } from "@/components/Brecha";
import { Acciones } from "@/components/Acciones";
import { Historico } from "@/components/Historico";
import { MezclaCartera } from "@/components/MezclaCartera";
import { dias, dinero, dineroCorto, num, pct } from "@/lib/format";
import type { Ventana } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function VistaVendedor({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string; ventana?: string }>;
}) {
  const sesion = await requiereSesion();
  const { id } = await params;
  const sp = await searchParams;

  // El RLS ya impide leer el perfil de alguien más; si esto viene vacío es
  // porque el usuario no tiene derecho a verlo.
  const persona = await perfilPorId(id);
  if (!persona) notFound();

  const propio = sesion.id === persona.id;
  const lista = await periodos();
  if (lista.length === 0) return <Vacio titulo="No hay periodos configurados" />;

  const periodoId = sp.periodo && lista.some((p) => p.id === sp.periodo) ? sp.periodo : lista[0].id;
  const ventana: Ventana = sp.ventana === "calendario" ? "calendario" : "kpi_4_semanas";
  const periodo = lista.find((p) => p.id === periodoId)!;

  const [kpi, hist, evaluacion, estandares, contexto] = await Promise.all([
    kpiDe(persona.id, periodoId, ventana),
    historicoDe(persona.id, ventana),
    evaluacionDe(persona.id, periodoId),
    benchmarks(),
    contextoMercado(periodoId),
  ]);

  const faltante =
    kpi?.objetivo_total != null ? Math.max(0, kpi.objetivo_total - kpi.venta_total_iva) : null;

  return (
    <>
      {/* Encabezado del colaborador ---------------------------------------- */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[20px] font-semibold tracking-tight text-ink">{persona.nombre_completo}</h1>
            {kpi && <SemaforoBadge estado={kpi.semaforo} />}
            {kpi && <CalidadBadge calidad={kpi.calidad} />}
          </div>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {persona.puesto ?? "Equipo comercial"} · {periodo.etiqueta} ·{" "}
            <span className="tabular">
              {ventana === "kpi_4_semanas"
                ? `S1–S4: ${periodo.kpi_inicio} al ${periodo.kpi_fin}`
                : `Calendario: ${periodo.cal_inicio} al ${periodo.cal_fin}`}
            </span>
          </p>
          {!propio && esDireccion(sesion) && (
            <p className="mt-1 text-[11px] text-ink-muted">Vista de supervisión — este perfil no es el tuyo.</p>
          )}
        </div>
        <Suspense fallback={null}>
          <Filtros periodos={lista} />
        </Suspense>
      </div>

      {!kpi ? (
        <Vacio
          titulo="Sin métricas cargadas para este periodo"
          detalle="En cuanto se cargue el reporte del mes o se corra la ingesta de HubSpot, aparecerán aquí."
        />
      ) : (
        <>
          {/* Objetivos de venta ------------------------------------------- */}
          <Seccion titulo="Objetivos de venta" descripcion="Cifras con IVA, tomadas del semáforo comercial.">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard etiqueta="Venta del periodo" valor={dineroCorto(kpi.venta_total_iva)} apoyo={dinero(kpi.venta_total_iva)} />
              <KpiCard
                etiqueta="Objetivo"
                valor={dineroCorto(kpi.objetivo_total)}
                apoyo={kpi.objetivo_confirmado === false ? "Reconstruido — por confirmar" : dinero(kpi.objetivo_total)}
              />
              <KpiCard
                etiqueta="Cumplimiento"
                valor={pct(kpi.cumplimiento_pct)}
                apoyo={faltante ? `Faltan ${dinero(faltante)}` : "Objetivo alcanzado"}
                lectura={
                  kpi.cumplimiento_pct == null ? "Sin objetivo capturado"
                    : kpi.cumplimiento_pct >= 100 ? "En objetivo"
                    : kpi.cumplimiento_pct >= 80 ? "Cerca del objetivo"
                    : kpi.cumplimiento_pct >= 50 ? "Rezagado frente al objetivo"
                    : "Resultado crítico frente al objetivo"
                }
                estado={kpi.cumplimiento_pct != null && kpi.cumplimiento_pct >= 100 ? "cumple" : "debajo"}
              />
              <KpiCard
                etiqueta="Venta sin IVA"
                valor={dineroCorto(kpi.venta_total_sin_iva)}
                apoyo="Base comparable contra HubSpot"
              />
            </div>
          </Seccion>

          {/* Eficiencia y mercado ------------------------------------------ */}
          <Seccion
            titulo="Eficiencia y métricas de mercado"
            descripcion="Cómo se produjo el resultado, no solo cuánto."
          >
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="grid grid-cols-2 gap-3 lg:col-span-2">
                <KpiCard
                  etiqueta="Tasa de conversión"
                  valor={pct(kpi.tasa_conversion_pct)}
                  apoyo={kpi.conversion_es_reportada ? "Tasa reportada por la fuente" : "Ganados ÷ leads trabajados"}
                />
                <KpiCard
                  etiqueta="Ticket promedio"
                  valor={dineroCorto(kpi.ticket_promedio_sin_iva)}
                  apoyo="Sin IVA, por negocio ganado"
                />
                <KpiCard
                  etiqueta="Ciclo de cierre"
                  valor={kpi.ciclo_cierre_dias != null ? dias(kpi.ciclo_cierre_dias) : "—"}
                  apoyo="De creación del negocio al cierre"
                  lectura={kpi.ciclo_cierre_dias != null && kpi.ciclo_cierre_dias > 60 ? "Ciclo largo: revisa la cadencia de seguimiento" : undefined}
                  estado={kpi.ciclo_cierre_dias != null && kpi.ciclo_cierre_dias > 60 ? "debajo" : undefined}
                />
                <KpiCard
                  etiqueta="Tareas abiertas"
                  valor={num(kpi.tareas_abiertas)}
                  apoyo="Sin ejecutar al cierre del periodo"
                  lectura={
                    kpi.tareas_abiertas != null && kpi.tareas_abiertas > (estandares["tareas_abiertas"]?.valor_max ?? 20)
                      ? "Por encima del tope de tolerancia"
                      : undefined
                  }
                  estado={
                    kpi.tareas_abiertas != null && kpi.tareas_abiertas > (estandares["tareas_abiertas"]?.valor_max ?? 20)
                      ? "arriba" : undefined
                  }
                />
              </div>
              <MezclaCartera existentes={kpi.venta_existentes_iva} nuevos={kpi.venta_nuevos_iva} nota={kpi.notas} />
            </div>
          </Seccion>

          {/* Brecha -------------------------------------------------------- */}
          <Seccion
            titulo="Análisis de brecha / eficiencia operativa"
            descripcion="Cada indicador contra su estándar universal, en la misma fila."
          >
            <Brecha filas={evaluacion?.brecha ?? []} kpi={kpi} estandares={estandares} />
          </Seccion>
        </>
      )}

      {/* Evaluación cualitativa --------------------------------------------- */}
      {evaluacion && (
        <>
          {evaluacion.evaluacion.diagnostico && (
            <Seccion titulo="Diagnóstico del periodo">
              <Card className="px-5 py-4">
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink">
                  {evaluacion.evaluacion.diagnostico}
                </p>
              </Card>
            </Seccion>
          )}

          <Seccion
            titulo="Acciones pertinentes"
            descripcion={propio ? "Puedes mover el estatus de tus acciones conforme avances." : undefined}
          >
            <Acciones acciones={evaluacion.acciones} editable={propio} />
          </Seccion>

          {evaluacion.evaluacion.feedback && (
            <Seccion titulo="Retroalimentación mensual">
              <Card className="border-l-[3px] border-l-serie-1 px-5 py-4">
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink">
                  {evaluacion.evaluacion.feedback}
                </p>
                {evaluacion.evaluacion.calificacion != null && (
                  <p className="mt-3 border-t border-line pt-2.5 text-[12px] text-ink-soft">
                    Calificación del periodo:{" "}
                    <span className="tabular font-semibold text-ink">
                      {evaluacion.evaluacion.calificacion.toFixed(2)} / 5.00
                    </span>
                  </p>
                )}
              </Card>
            </Seccion>
          )}
        </>
      )}

      {/* Contexto de mercado ------------------------------------------------ */}
      {contexto.length > 0 && (
        <Seccion titulo="Contexto de mercado" descripcion="Lo que estaba pasando alrededor del número.">
          <div className="grid gap-3 sm:grid-cols-2">
            {contexto.map((c) => (
              <Card key={c.id} className="px-4 py-3.5">
                <p className="text-[13px] font-medium text-ink">{c.titulo}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{c.cuerpo}</p>
              </Card>
            ))}
          </div>
        </Seccion>
      )}

      {/* Histórico ---------------------------------------------------------- */}
      <Seccion titulo="Histórico de meses anteriores">
        <Historico filas={hist} vendedorId={persona.id} periodoActivo={periodoId} />
      </Seccion>
    </>
  );
}
