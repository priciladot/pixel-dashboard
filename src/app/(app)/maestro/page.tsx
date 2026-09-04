import { Suspense } from "react";
import Link from "next/link";
import { requiereRol } from "@/lib/auth";
import {
  kpisDelPeriodo, periodos, resumenArea, vendedores, dealsPorRevisar,
  tareasAbiertas, etapaActualDeals, dealsEstancados, motivosPerdida, resumenOperativoMonday,
  type TareaAbierta, type DealEstancado, type MotivoPerdida, type ResumenOperativoMonday,
} from "@/lib/queries";
import { Card, KpiCard, Seccion, Vacio } from "@/components/ui";
import { Filtros } from "@/components/Filtros";
import { TablaComparativa } from "@/components/TablaComparativa";
import { MezclaCartera } from "@/components/MezclaCartera";
import { dias, dinero, dineroCorto, num, pct } from "@/lib/format";
import { ETAPAS_PIPELINE, nombreEtapa } from "@/lib/pipeline-etapas";
import type { Ventana } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Maestro({
  searchParams,
}: { searchParams: Promise<{ periodo?: string; vendedor?: string; ventana?: string }> }) {
  await requiereRol("admin", "supervisor");
  const sp = await searchParams;

  const lista = await periodos();
  if (lista.length === 0) {
    return <Vacio titulo="No hay periodos configurados" detalle="Corre la migración 003_seed.sql para crear el calendario de KPI." />;
  }

  const periodoId = sp.periodo && lista.some((p) => p.id === sp.periodo) ? sp.periodo : lista[0].id;
  const ventana: Ventana = sp.ventana === "calendario" ? "calendario" : "kpi_4_semanas";
  const periodo = lista.find((p) => p.id === periodoId)!;

  const [equipo, area, personas, revisar, tareas, etapasActuales, estancados, perdidas, operativoMonday] = await Promise.all([
    kpisDelPeriodo(periodoId, ventana),
    resumenArea(periodoId),
    vendedores(),
    dealsPorRevisar(periodoId, sp.vendedor),
    tareasAbiertas(sp.vendedor),
    etapaActualDeals(periodoId, sp.vendedor),
    dealsEstancados(periodoId, sp.vendedor, 7),
    motivosPerdida(periodoId, sp.vendedor),
    resumenOperativoMonday(periodoId, sp.vendedor),
  ]);

  const filas = sp.vendedor ? equipo.filter((f) => f.vendedor_id === sp.vendedor) : equipo;
  const tareasAtrasadas = tareas.filter((t) => t.atrasada).length;
  const mapaVendedores = new Map(personas.map((p) => [p.id, p.nombre_corto]));
  const conObjetivoPorConfirmar = equipo.some((f) => f.objetivo_confirmado === false);
  const ventanaTexto =
    ventana === "kpi_4_semanas"
      ? `S1–S4: ${periodo.kpi_inicio} al ${periodo.kpi_fin}`
      : `Calendario: ${periodo.cal_inicio} al ${periodo.cal_fin}`;

  // Con un vendedor filtrado, el resumen ejecutivo muestra SUS cifras (de
  // v_kpi_vendedor, la misma fuente que la tabla comparativa) en vez de la
  // cifra oficial del área — antes se seguía mostrando el total del área sin
  // importar el filtro. Sin filtro, o si el id no resolvió a nadie, se cae al
  // resumen del área de siempre.
  const seleccionado = sp.vendedor ? filas[0] : undefined;
  const resumen = seleccionado
    ? {
        titulo: `Resumen ejecutivo — ${seleccionado.nombre_corto}`,
        cifraOficial: false,
        venta_total_iva: seleccionado.venta_total_iva,
        objetivo_total_iva: seleccionado.objetivo_total,
        cumplimiento_pct: seleccionado.cumplimiento_pct,
        deals_ganados: seleccionado.deals_ganados,
        ganado_sin_iva: null as number | null,
        tareas_abiertas: tareas.length,
        venta_existentes_iva: seleccionado.venta_existentes_iva,
        venta_nuevos_iva: seleccionado.venta_nuevos_iva,
        notas: seleccionado.notas,
        deals_marketing: null as number | null,
        monto_marketing_sin_iva: null as number | null,
        ciclo_cierre_promedio: seleccionado.ciclo_cierre_dias,
      }
    : {
        titulo: "Resumen ejecutivo del área",
        cifraOficial: Boolean(area?.venta_total_iva != null),
        venta_total_iva: area?.venta_total_iva ?? null,
        objetivo_total_iva: area?.objetivo_total_iva ?? null,
        cumplimiento_pct: area?.cumplimiento_pct ?? null,
        deals_ganados: area?.deals_ganados ?? null,
        ganado_sin_iva: area?.ganado_sin_iva ?? null,
        tareas_abiertas: tareas.length,
        venta_existentes_iva: area?.venta_existentes_iva ?? null,
        venta_nuevos_iva: area?.venta_nuevos_iva ?? null,
        notas: area?.notas ?? null,
        deals_marketing: area?.deals_marketing ?? null,
        monto_marketing_sin_iva: area?.monto_marketing_sin_iva ?? null,
        ciclo_cierre_promedio: area?.ciclo_cierre_promedio ?? null,
      };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-ink">Dashboard maestro</h1>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {periodo.etiqueta} · <span className="tabular">{ventanaTexto}</span>
            {periodo.cerrado && <span className="ml-2 text-ink-muted">Periodo cerrado</span>}
          </p>
        </div>
        <Suspense fallback={null}>
          <Filtros periodos={lista} vendedores={personas.filter((p) => p.rol === "vendedor")} />
        </Suspense>
      </div>

      {/* Focos rojos -------------------------------------------------------
          Copiloto operativo: solo la parte con reglas claras (>7 días sin
          movimiento de etapa, tareas vencidas). "Acciones del día" y
          "alertas de producto inactivo" quedan para una siguiente iteración
          — necesitan reglas de negocio que todavía no están definidas. */}
      <Seccion
        titulo="Focos rojos"
        descripcion={
          seleccionado
            ? `Negocios de ${seleccionado.nombre_corto} sin movimiento 7+ días, y tareas vencidas.`
            : "Negocios de todo el equipo sin movimiento 7+ días, y tareas vencidas."
        }
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <NegociosEstancados filas={estancados} mapaVendedores={mapaVendedores} mostrarVendedor={!seleccionado} />
          <TareasVencidas tareas={tareas.filter((t) => t.atrasada)} mapaVendedores={mapaVendedores} mostrarVendedor={!seleccionado} />
        </div>
      </Seccion>

      {/* Resumen ejecutivo ------------------------------------------------ */}
      <Seccion
        titulo={resumen.titulo}
        descripcion={
          seleccionado
            ? "Cifras de este vendedor para el periodo — misma fuente que la tabla comparativa de abajo."
            : resumen.cifraOficial
              ? "Cifra oficial del semáforo comercial, no la suma de las filas individuales."
              : "Reconstruido sumando las filas por vendedor: aún no se captura la cifra oficial del área."
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            etiqueta={seleccionado ? "Venta del vendedor" : "Venta del periodo"}
            valor={dineroCorto(resumen.venta_total_iva)}
            apoyo={dinero(resumen.venta_total_iva)}
          />
          <KpiCard
            etiqueta="Cumplimiento"
            valor={pct(resumen.cumplimiento_pct)}
            apoyo={`Objetivo ${dineroCorto(resumen.objetivo_total_iva)}`}
            lectura={
              resumen.cumplimiento_pct == null ? undefined :
              resumen.cumplimiento_pct >= 100 ? "En objetivo" :
              `Faltan ${dineroCorto((resumen.objetivo_total_iva ?? 0) - (resumen.venta_total_iva ?? 0))}`
            }
            estado={resumen.cumplimiento_pct != null && resumen.cumplimiento_pct >= 100 ? "cumple" : "debajo"}
          />
          <KpiCard
            etiqueta="Negocios ganados"
            valor={num(resumen.deals_ganados)}
            apoyo={resumen.ganado_sin_iva ? `${dinero(resumen.ganado_sin_iva)} sin IVA` : undefined}
          />
          <KpiCard
            etiqueta="Tareas abiertas"
            valor={num(resumen.tareas_abiertas)}
            apoyo={`${num(tareasAtrasadas)} atrasadas · HubSpot`}
            lectura={tareasAtrasadas > 0 ? `${tareasAtrasadas} vencidas sin completar` : undefined}
            estado={tareasAtrasadas > 0 ? "debajo" : undefined}
          />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <MezclaCartera
            existentes={resumen.venta_existentes_iva}
            nuevos={resumen.venta_nuevos_iva}
            nota={resumen.notas}
          />
          <Card className="px-4 py-4 lg:col-span-2">
            <h3 className="mb-2.5 text-[13px] font-semibold text-ink">
              {seleccionado ? `Embudo de ${seleccionado.nombre_corto}` : "Embudo del periodo"}
              <span className="ml-1.5 font-normal text-ink-muted">— etapa vigente de cada negocio, HubSpot</span>
            </h3>
            <EmbudoEtapas filas={etapasActuales} />
            {resumen.deals_marketing != null && (
              <p className="mt-3 border-t border-line pt-2 text-[12px] text-ink-soft">
                Atribución a Marketing:{" "}
                <span className="tabular font-medium text-ink">{num(resumen.deals_marketing)} negocios</span>
                {resumen.monto_marketing_sin_iva != null && (
                  <> · <span className="tabular font-medium text-ink">{dinero(resumen.monto_marketing_sin_iva)}</span> sin IVA</>
                )}
              </p>
            )}
          </Card>
        </div>
      </Seccion>

      {/* Comparativo ------------------------------------------------------ */}
      <Seccion
        titulo="Comparativa de desempeño y cumplimiento"
        descripcion={`${filas.length} de ${equipo.length} registros del periodo.`}
        acciones={
          sp.vendedor ? (
            <Link href={`/maestro?periodo=${periodoId}&ventana=${ventana}`} className="text-[12px] text-ink-soft underline">
              Quitar filtro de vendedor
            </Link>
          ) : undefined
        }
      >
        <TablaComparativa filas={filas} />
        {conObjetivoPorConfirmar && (
          <p className="mt-2 text-[12px] text-ink-muted">
            Los objetivos marcados con <span className="font-medium">*</span> están reconstruidos a partir del
            porcentaje de cumplimiento reportado. Captúralos desde el semáforo para que el comparativo sea exacto.
          </p>
        )}
      </Seccion>

      {/* Origen y canal de venta (Monday) ----------------------------------- */}
      <Seccion
        titulo="Origen y canal de venta"
        descripcion={
          seleccionado
            ? `Tipo de negocio y canal de origen de ${seleccionado.nombre_corto}, según el tablero de Monday.`
            : "Tipo de negocio y canal de origen del equipo, según el tablero de Monday."
        }
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <TipoNegocioResumen filas={operativoMonday.porTipoNegocio} />
          <CanalesVenta filas={operativoMonday.porCanal} />
        </div>
      </Seccion>

      {/* Motivos de pérdida -------------------------------------------------- */}
      <Seccion
        titulo="Motivos de pérdida"
        descripcion={
          seleccionado
            ? `Catálogo real de categoria_perdida para los negocios perdidos de ${seleccionado.nombre_corto}.`
            : "Catálogo real de categoria_perdida para los negocios perdidos del equipo."
        }
      >
        <MotivosPerdidaLista filas={perdidas} />
      </Seccion>

      {/* Calidad de datos ------------------------------------------------- */}
      <Seccion
        titulo="Calidad de los datos"
        descripcion={
          seleccionado
            ? `Registros de ${seleccionado.nombre_corto} que la capa de sanitización dejó marcados.`
            : "Registros que la capa de sanitización dejó marcados. No rompen las métricas: quedan aparte."
        }
      >
        {revisar.length === 0 ? (
          <Card className="px-5 py-6 text-center text-[13px] text-ink-soft">
            Ningún registro marcado en este periodo.
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-2.5 font-medium">Negocio</th>
                    <th className="px-4 py-2.5 font-medium">Propietario en HubSpot</th>
                    <th className="px-4 py-2.5 font-medium">Asignado a</th>
                    <th className="px-4 py-2.5 font-medium">Monto sin IVA</th>
                    <th className="px-4 py-2.5 font-medium">Banderas</th>
                  </tr>
                </thead>
                <tbody>
                  {revisar.slice(0, 25).map((d) => (
                    <tr key={d.hubspot_id} className="border-b border-line/70 last:border-0">
                      <td className="px-4 py-2.5 text-ink">{d.nombre ?? `#${d.hubspot_id}`}</td>
                      <td className="px-4 py-2.5 text-ink-soft">{d.owner_nombre_raw ?? "—"}</td>
                      <td className="px-4 py-2.5 text-ink-soft">{d.vendedor}</td>
                      <td className="px-4 py-2.5 tabular text-ink-soft">{dinero(d.monto_sin_iva)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {d.flags.map((f) => (
                            <span
                              key={f}
                              className="rounded border border-[#f2dfae] bg-[#fdf4e0] px-1.5 py-0.5 text-[11px] text-[#8a6100]"
                            >
                              {f.replaceAll("_", " ")}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {revisar.length > 25 && (
              <p className="border-t border-line bg-surface-sunk px-4 py-2 text-[11px] text-ink-muted">
                Mostrando 25 de {revisar.length} registros marcados.
              </p>
            )}
          </Card>
        )}
      </Seccion>

      {resumen.ciclo_cierre_promedio != null && (
        <p className="text-[12px] text-ink-muted">
          {seleccionado ? `Ciclo de cierre de ${seleccionado.nombre_corto}` : "Ciclo de cierre promedio del equipo"}:{" "}
          <span className="tabular font-medium text-ink-soft">{dias(resumen.ciclo_cierre_promedio)}</span>
        </p>
      )}
    </>
  );
}

/** Embudo real: etapa vigente de cada negocio (v_deal_etapa_actual), no un proxy de leads. */
function EmbudoEtapas({ filas }: { filas: Array<{ etapa_actual: string }> }) {
  if (filas.length === 0) {
    return <p className="text-[13px] text-ink-soft">Sin historial de etapas para este periodo — corre la sincronización de analítica.</p>;
  }

  const conteos = new Map<string, number>();
  for (const f of filas) conteos.set(f.etapa_actual, (conteos.get(f.etapa_actual) ?? 0) + 1);

  const base = filas.length;
  const tonoPorResultado: Record<"abierto" | "ganado" | "perdido", string> = {
    abierto: "#2a78d6", ganado: "#1f9d55", perdido: "#c0392b",
  };

  return (
    <ul className="space-y-1.5">
      {ETAPAS_PIPELINE.map((e) => {
        const valor = conteos.get(e.id) ?? 0;
        const ancho = base ? Math.max(valor > 0 ? 2 : 0, (valor / base) * 100) : 0;
        return (
          <li key={e.id} className="flex items-center gap-3">
            <span className="w-[150px] shrink-0 truncate text-[12px] text-ink-soft" title={e.label}>{e.label}</span>
            <div className="flex-1">
              <div className="barra-pista">
                <div
                  className="barra-valor"
                  style={{ width: `${ancho}%`, backgroundColor: tonoPorResultado[e.resultado] }}
                  title={`${e.label}: ${valor}`}
                />
              </div>
            </div>
            <span className="tabular w-20 shrink-0 text-right text-[12px] font-medium text-ink">
              {valor}
              <span className="ml-1 font-normal text-ink-muted">{pct(base ? (valor / base) * 100 : null, 0)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Negocios abiertos sin cambio de etapa en 7+ días (dealsEstancados en queries.ts). */
function NegociosEstancados({
  filas, mapaVendedores, mostrarVendedor,
}: { filas: DealEstancado[]; mapaVendedores: Map<string, string>; mostrarVendedor: boolean }) {
  return (
    <Card className="px-4 py-4">
      <h3 className="mb-2.5 text-[13px] font-semibold text-ink">
        Negocios estancados <span className="font-normal text-ink-muted">({filas.length})</span>
      </h3>
      {filas.length === 0 ? (
        <p className="text-[13px] text-ink-soft">Ningún negocio abierto lleva 7+ días sin moverse de etapa.</p>
      ) : (
        <ul className="space-y-2">
          {filas.slice(0, 8).map((f) => (
            <li key={f.hubspot_id} className="flex items-center justify-between gap-3 border-b border-line/70 pb-1.5 text-[12px] last:border-0">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink" title={f.nombre ?? f.hubspot_id}>{f.nombre ?? `#${f.hubspot_id}`}</p>
                <p className="text-ink-muted">
                  {nombreEtapa(f.etapa_actual)}
                  {mostrarVendedor && f.vendedor_id && ` · ${mapaVendedores.get(f.vendedor_id) ?? "Sin asignar"}`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular font-medium text-[#8a3b1f]">{f.dias_sin_movimiento}d</p>
                <p className="tabular text-ink-muted">{dinero(f.monto_con_iva)}</p>
              </div>
            </li>
          ))}
          {filas.length > 8 && (
            <li className="text-[11px] text-ink-muted">y {filas.length - 8} más…</li>
          )}
        </ul>
      )}
    </Card>
  );
}

/** Tareas de HubSpot con fecha vencida y sin completar. */
function TareasVencidas({
  tareas, mapaVendedores, mostrarVendedor,
}: { tareas: TareaAbierta[]; mapaVendedores: Map<string, string>; mostrarVendedor: boolean }) {
  return (
    <Card className="px-4 py-4">
      <h3 className="mb-2.5 text-[13px] font-semibold text-ink">
        Tareas vencidas <span className="font-normal text-ink-muted">({tareas.length})</span>
      </h3>
      {tareas.length === 0 ? (
        <p className="text-[13px] text-ink-soft">Sin tareas vencidas.</p>
      ) : (
        <ul className="space-y-2">
          {tareas.slice(0, 8).map((t) => (
            <li key={t.hubspot_id} className="flex items-center justify-between gap-3 border-b border-line/70 pb-1.5 text-[12px] last:border-0">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink" title={t.asunto ?? t.hubspot_id}>{t.asunto ?? `Tarea #${t.hubspot_id}`}</p>
                {mostrarVendedor && t.vendedor_id && (
                  <p className="text-ink-muted">{mapaVendedores.get(t.vendedor_id) ?? "Sin asignar"}</p>
                )}
              </div>
              <span className="shrink-0 tabular text-[#8a3b1f]">{t.fecha ? new Date(t.fecha).toLocaleDateString("es-MX") : "—"}</span>
            </li>
          ))}
          {tareas.length > 8 && (
            <li className="text-[11px] text-ink-muted">y {tareas.length - 8} más…</li>
          )}
        </ul>
      )}
    </Card>
  );
}

/** Existente vs. nuevo, respaldado por Monday cuando HubSpot no lo trae (ver v_deals_operativo). */
function TipoNegocioResumen({ filas }: { filas: ResumenOperativoMonday["porTipoNegocio"] }) {
  const total = filas.reduce((acc, f) => acc + f.deals, 0);
  const etiquetas: Record<string, string> = { existente: "Existente", nuevo: "Nuevo", por_revisar: "Sin clasificar" };

  return (
    <Card className="px-4 py-4">
      <h3 className="mb-2.5 text-[13px] font-semibold text-ink">Tipo de negocio</h3>
      {total === 0 ? (
        <p className="text-[13px] text-ink-soft">Sin negocios de Monday cruzados en este periodo.</p>
      ) : (
        <ul className="space-y-1.5">
          {[...filas].sort((a, b) => b.deals - a.deals).map((f) => (
            <li key={f.tipo} className="flex items-center gap-3 text-[12px]">
              <span className="w-28 shrink-0 text-ink-soft">{etiquetas[f.tipo] ?? f.tipo}</span>
              <div className="flex-1">
                <div className="barra-pista">
                  <div className="barra-valor" style={{ width: `${Math.max(2, (f.deals / total) * 100)}%`, backgroundColor: "#2a78d6" }} />
                </div>
              </div>
              <span className="tabular w-32 shrink-0 text-right font-medium text-ink">
                {f.deals} · {dinero(f.monto_con_iva)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Canal de origen real (Monday "¿Cómo llegó?"). */
function CanalesVenta({ filas }: { filas: ResumenOperativoMonday["porCanal"] }) {
  const total = filas.reduce((acc, f) => acc + f.deals, 0);

  return (
    <Card className="px-4 py-4">
      <h3 className="mb-2.5 text-[13px] font-semibold text-ink">Canal de origen</h3>
      {total === 0 ? (
        <p className="text-[13px] text-ink-soft">Sin negocios de Monday cruzados en este periodo.</p>
      ) : (
        <ul className="space-y-1.5">
          {filas.slice(0, 8).map((f) => (
            <li key={f.canal} className="flex items-center gap-3 text-[12px]">
              <span className="w-28 shrink-0 truncate text-ink-soft" title={f.canal}>{f.canal}</span>
              <div className="flex-1">
                <div className="barra-pista">
                  <div className="barra-valor" style={{ width: `${Math.max(2, (f.deals / total) * 100)}%`, backgroundColor: "#5598e7" }} />
                </div>
              </div>
              <span className="tabular w-32 shrink-0 text-right font-medium text-ink">
                {f.deals} · {dinero(f.monto_con_iva)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-ink-muted">
        En vista grupal, un negocio dividido entre dos vendedores cuenta una vez por cada uno.
      </p>
    </Card>
  );
}

/** Catálogo real de categoria_perdida — no una lista inventada de motivos. */
function MotivosPerdidaLista({ filas }: { filas: MotivoPerdida[] }) {
  const total = filas.reduce((acc, f) => acc + f.deals, 0);

  if (total === 0) {
    return (
      <Card className="px-5 py-6 text-center text-[13px] text-ink-soft">
        Ningún negocio perdido con motivo capturado en este periodo.
      </Card>
    );
  }

  return (
    <Card className="px-4 py-4">
      <ul className="space-y-1.5">
        {filas.map((f) => (
          <li key={f.categoria_perdida} className="flex items-center gap-3 text-[12px]">
            <span className="w-56 shrink-0 truncate text-ink-soft" title={f.categoria_perdida}>{f.categoria_perdida}</span>
            <div className="flex-1">
              <div className="barra-pista">
                <div className="barra-valor" style={{ width: `${Math.max(2, (f.deals / total) * 100)}%`, backgroundColor: "#c0392b" }} />
              </div>
            </div>
            <span className="tabular w-32 shrink-0 text-right font-medium text-ink">
              {f.deals} · {dinero(f.monto_sin_iva)} sin IVA
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
