import { Suspense } from "react";
import Link from "next/link";
import { requiereRol } from "@/lib/auth";
import {
  kpisDelPeriodo, periodos, resumenArea, vendedores, dealsPorRevisar,
  tareasAbiertas, etapaActualDeals, dealsEstancados, motivosPerdida, resumenOperativoMonday,
  accionesPrioritarias, ventasConProducto,
  type DealEstancado, type MotivoPerdida, type ResumenOperativoMonday,
  type AccionPrioritaria, type VentaProducto, type DealPorRevisar,
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

  const [equipo, area, personas, revisar, tareas, etapasActuales, estancados, perdidas, operativoMonday, acciones, ventasProducto] = await Promise.all([
    kpisDelPeriodo(periodoId, ventana),
    resumenArea(periodoId),
    vendedores(),
    dealsPorRevisar(periodoId, sp.vendedor),
    tareasAbiertas(sp.vendedor),
    etapaActualDeals(periodoId, sp.vendedor),
    dealsEstancados(periodoId, sp.vendedor, 7),
    motivosPerdida(periodoId, sp.vendedor),
    resumenOperativoMonday(periodoId, sp.vendedor),
    accionesPrioritarias(sp.vendedor, 5),
    ventasConProducto(periodoId, sp.vendedor),
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

      {/* Copiloto: acciones prioritarias + focos rojos ----------------------
          "Alertas de producto inactivo" queda pendiente — necesita una
          regla de tendencia histórica que todavía no está definida. */}
      <Seccion
        titulo="Acciones prioritarias del día"
        descripcion={
          seleccionado
            ? `Tareas vencidas de ${seleccionado.nombre_corto}, ordenadas por el monto del negocio en riesgo.`
            : "Tareas vencidas de todo el equipo, ordenadas por el monto del negocio en riesgo."
        }
      >
        <AccionesPrioritarias acciones={acciones} mapaVendedores={mapaVendedores} mostrarVendedor={!seleccionado} />
      </Seccion>

      <Seccion
        titulo="Focos rojos — negocios estancados"
        descripcion={
          seleccionado
            ? `Negocios de ${seleccionado.nombre_corto} en etapa activa sin actividad real (nota, correo, llamada o tarea) hace 7+ días.`
            : "Negocios de todo el equipo en etapa activa sin actividad real hace 7+ días."
        }
      >
        <NegociosEstancados filas={estancados} mapaVendedores={mapaVendedores} mostrarVendedor={!seleccionado} />
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

      {/* Ventas y productos cerrados ----------------------------------------- */}
      <Seccion
        titulo="Desglose de ventas y productos cerrados"
        descripcion={
          seleccionado
            ? `Negocios ganados de ${seleccionado.nombre_corto} en el periodo, con empresa y producto de Monday.`
            : "Negocios ganados del periodo, con empresa y producto de Monday."
        }
      >
        <VentasProductosTabla filas={ventasProducto} mapaVendedores={mapaVendedores} mostrarVendedor={!seleccionado} />
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
                    <th className="px-4 py-2.5 font-medium">Monto sin IVA</th>
                    <th className="px-4 py-2.5 font-medium">Qué hay que hacer</th>
                  </tr>
                </thead>
                <tbody>
                  {revisar.slice(0, 25).map((d) => (
                    <tr key={d.hubspot_id} className="border-b border-line/70 last:border-0">
                      <td className="px-4 py-2.5 text-ink">{d.nombre ?? `#${d.hubspot_id}`}</td>
                      <td className="px-4 py-2.5 tabular text-ink-soft">{dinero(d.monto_sin_iva)}</td>
                      <td className="px-4 py-2.5">
                        <ul className="space-y-1">
                          {d.flags.map((f) => (
                            <li key={f} className="text-[12px] text-[#8a6100]">
                              {accionBandera(f, d)}
                            </li>
                          ))}
                        </ul>
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
  if (filas.length === 0) {
    return (
      <Card className="px-5 py-6 text-center text-[13px] text-ink-soft">
        Ningún negocio en etapa activa lleva 7+ días sin actividad real.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
              {mostrarVendedor && <th className="px-4 py-2.5 font-medium">Vendedor</th>}
              <th className="px-4 py-2.5 font-medium">Negocio</th>
              <th className="px-4 py-2.5 font-medium">Empresa / Agencia</th>
              <th className="px-4 py-2.5 font-medium">Etapa</th>
              <th className="px-4 py-2.5 font-medium">Monto</th>
              <th className="px-4 py-2.5 font-medium">Sin actividad</th>
            </tr>
          </thead>
          <tbody>
            {filas.slice(0, 15).map((f) => (
              <tr key={f.hubspot_id} className="border-b border-line/70 last:border-0">
                {mostrarVendedor && (
                  <td className="px-4 py-2.5 text-ink-soft">{f.vendedor_id ? mapaVendedores.get(f.vendedor_id) ?? "Sin asignar" : "Sin asignar"}</td>
                )}
                <td className="px-4 py-2.5 text-ink">{f.nombre ?? `#${f.hubspot_id}`}</td>
                <td className="px-4 py-2.5 text-ink-soft">{f.empresa ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-soft">{nombreEtapa(f.etapa_actual)}</td>
                <td className="px-4 py-2.5 tabular text-ink-soft">{dinero(f.monto_con_iva)}</td>
                <td className="px-4 py-2.5 tabular font-medium text-[#8a3b1f]">{f.dias_sin_actividad}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length > 15 && (
        <p className="border-t border-line bg-surface-sunk px-4 py-2 text-[11px] text-ink-muted">
          Mostrando 15 de {filas.length} negocios estancados.
        </p>
      )}
    </Card>
  );
}

/** Tareas vencidas más importantes por monto del deal asociado — no una lista pasiva. */
function AccionesPrioritarias({
  acciones, mapaVendedores, mostrarVendedor,
}: { acciones: AccionPrioritaria[]; mapaVendedores: Map<string, string>; mostrarVendedor: boolean }) {
  if (acciones.length === 0) {
    return (
      <Card className="px-5 py-6 text-center text-[13px] text-ink-soft">
        Sin tareas vencidas con negocio asociado.
      </Card>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {acciones.map((a) => (
        <Card key={a.hubspot_id} className="px-4 py-3.5">
          <p className="text-[13px] font-medium text-ink">
            {a.asunto ?? "Dar seguimiento"}
            {a.empresa && <> — <span className="text-ink-soft">{a.empresa}</span></>}
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">
            {a.deal_nombre ?? "Negocio sin nombre"}
            {a.deal_monto_con_iva != null && <> · <span className="tabular font-medium text-ink">{dinero(a.deal_monto_con_iva)}</span></>}
          </p>
          {a.correo_cliente && <p className="mt-0.5 truncate text-[11px] text-ink-muted" title={a.correo_cliente}>{a.correo_cliente}</p>}
          <p className="mt-1.5 text-[12px] font-medium text-[#8a3b1f]">
            Atrasada desde {a.fecha ? new Date(a.fecha).toLocaleDateString("es-MX") : "—"}
            {mostrarVendedor && a.vendedor_id && ` · ${mapaVendedores.get(a.vendedor_id) ?? "Sin asignar"}`}
          </p>
        </Card>
      ))}
    </div>
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

/** Traduce una bandera de sanitización en la instrucción concreta para resolverla, con nombre de quién debe actuar. */
function accionBandera(flag: string, d: DealPorRevisar): string {
  const negocio = d.nombre ?? `#${d.hubspot_id}`;
  switch (flag) {
    case "owner_vacio":
    case "owner_sin_mapear":
      return `Pricila: asignar vendedor a "${negocio}" en HubSpot.`;
    case "diferido_sin_fecha_reactivacion":
      return `${d.vendedor}: definir fecha de reactivación en HubSpot para "${negocio}".`;
    case "monto_faltante":
      return `${d.vendedor}: capturar el monto de "${negocio}" en HubSpot.`;
    case "duplicado":
      return `Pricila: revisar posible duplicado de "${negocio}".`;
    case "fuera_de_periodo":
      return `Pricila: revisar la fecha de cierre de "${negocio}" — cae fuera del periodo esperado.`;
    case "etapa_desconocida":
      return `Pricila: etapa no reconocida en "${negocio}", revisar el pipeline en HubSpot.`;
    case "division_doble_conteo":
      return `Pricila: confirmar en Monday si "${negocio}" es una división antes de contarlo dos veces.`;
    default:
      return `${d.vendedor}: revisar "${negocio}" (${flag.replaceAll("_", " ")}).`;
  }
}

/** Ventas ganadas del periodo con empresa/producto de Monday, agrupadas visualmente por vendedor. */
function VentasProductosTabla({
  filas, mapaVendedores, mostrarVendedor,
}: { filas: VentaProducto[]; mapaVendedores: Map<string, string>; mostrarVendedor: boolean }) {
  if (filas.length === 0) {
    return (
      <Card className="px-5 py-6 text-center text-[13px] text-ink-soft">
        Ningún negocio ganado con datos de Monday cruzados en este periodo.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
              {mostrarVendedor && <th className="px-4 py-2.5 font-medium">Vendedor</th>}
              <th className="px-4 py-2.5 font-medium">Empresa / Agencia</th>
              <th className="px-4 py-2.5 font-medium">Correo de contacto</th>
              <th className="px-4 py-2.5 font-medium">Producto(s)</th>
              <th className="px-4 py-2.5 font-medium">Monto (con IVA)</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.hubspot_id} className="border-b border-line/70 last:border-0">
                {mostrarVendedor && (
                  <td className="px-4 py-2.5 text-ink">{f.vendedor_id ? mapaVendedores.get(f.vendedor_id) ?? "Sin asignar" : "Sin asignar"}</td>
                )}
                <td className="px-4 py-2.5 text-ink-soft">{f.empresa ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-soft">{f.correo_cliente ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-soft">{f.productos ?? "—"}</td>
                <td className="px-4 py-2.5 tabular font-medium text-ink">{dinero(f.monto_con_iva)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line bg-surface-sunk px-4 py-2 text-[11px] text-ink-muted">
        {filas.length} negocios ganados con cruce de Monday. Los que no tienen registro en Monday no aparecen aquí — empresa y producto solo existen para negocios capturados en ese tablero.
      </p>
    </Card>
  );
}
