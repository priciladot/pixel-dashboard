import { Suspense } from "react";
import Link from "next/link";
import { requiereRol } from "@/lib/auth";
import { kpisDelPeriodo, periodos, resumenArea, vendedores, dealsPorRevisar } from "@/lib/queries";
import { Card, KpiCard, Seccion, Vacio } from "@/components/ui";
import { Filtros } from "@/components/Filtros";
import { TablaComparativa } from "@/components/TablaComparativa";
import { MezclaCartera } from "@/components/MezclaCartera";
import { dias, dinero, dineroCorto, num, pct } from "@/lib/format";
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

  const [equipo, area, personas, revisar] = await Promise.all([
    kpisDelPeriodo(periodoId, ventana),
    resumenArea(periodoId),
    vendedores(),
    dealsPorRevisar(periodoId),
  ]);

  const filas = sp.vendedor ? equipo.filter((f) => f.vendedor_id === sp.vendedor) : equipo;
  const conObjetivoPorConfirmar = equipo.some((f) => f.objetivo_confirmado === false);
  const ventanaTexto =
    ventana === "kpi_4_semanas"
      ? `S1–S4: ${periodo.kpi_inicio} al ${periodo.kpi_fin}`
      : `Calendario: ${periodo.cal_inicio} al ${periodo.cal_fin}`;

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

      {/* Resumen ejecutivo ------------------------------------------------ */}
      <Seccion
        titulo="Resumen ejecutivo del área"
        descripcion={
          area?.cifra_oficial
            ? "Cifra oficial del semáforo comercial, no la suma de las filas individuales."
            : "Reconstruido sumando las filas por vendedor: aún no se captura la cifra oficial del área."
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            etiqueta="Venta del periodo"
            valor={dineroCorto(area?.venta_total_iva)}
            apoyo={dinero(area?.venta_total_iva)}
          />
          <KpiCard
            etiqueta="Cumplimiento"
            valor={pct(area?.cumplimiento_pct)}
            apoyo={`Objetivo ${dineroCorto(area?.objetivo_total_iva)}`}
            lectura={
              area?.cumplimiento_pct == null ? undefined :
              area.cumplimiento_pct >= 100 ? "En objetivo" :
              `Faltan ${dineroCorto((area.objetivo_total_iva ?? 0) - (area.venta_total_iva ?? 0))}`
            }
            estado={area?.cumplimiento_pct != null && area.cumplimiento_pct >= 100 ? "cumple" : "debajo"}
          />
          <KpiCard
            etiqueta="Negocios ganados"
            valor={num(area?.deals_ganados)}
            apoyo={area?.ganado_sin_iva ? `${dinero(area.ganado_sin_iva)} sin IVA` : undefined}
          />
          <KpiCard
            etiqueta="Tareas abiertas"
            valor={num(area?.tareas_abiertas)}
            apoyo="Sin ejecutar, acumuladas en el equipo"
            lectura={area?.tareas_abiertas && area.tareas_abiertas > 100 ? "Revisar si es un problema sistémico" : undefined}
            estado={area?.tareas_abiertas && area.tareas_abiertas > 100 ? "debajo" : undefined}
          />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <MezclaCartera
            existentes={area?.venta_existentes_iva ?? null}
            nuevos={area?.venta_nuevos_iva ?? null}
            nota={area?.notas}
          />
          <Card className="px-4 py-4 lg:col-span-2">
            <h3 className="mb-2.5 text-[13px] font-semibold text-ink">Embudo del periodo</h3>
            <Embudo
              pasos={[
                { etiqueta: "Leads registrados", valor: area?.leads_registrados ?? null },
                { etiqueta: "Empresas relevantes", valor: area?.leads_relevantes ?? null },
                { etiqueta: "Con negocio asociado", valor: area?.leads_con_deal ?? null },
                { etiqueta: "Negocios ganados", valor: area?.deals_ganados ?? null },
              ]}
            />
            {area?.deals_marketing != null && (
              <p className="mt-3 border-t border-line pt-2 text-[12px] text-ink-soft">
                Atribución a Marketing:{" "}
                <span className="tabular font-medium text-ink">{num(area.deals_marketing)} negocios</span>
                {area.monto_marketing_sin_iva != null && (
                  <> · <span className="tabular font-medium text-ink">{dinero(area.monto_marketing_sin_iva)}</span> sin IVA</>
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

      {/* Calidad de datos ------------------------------------------------- */}
      <Seccion
        titulo="Calidad de los datos"
        descripcion="Registros que la capa de sanitización dejó marcados. No rompen las métricas: quedan aparte."
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

      {area?.ciclo_cierre_promedio != null && (
        <p className="text-[12px] text-ink-muted">
          Ciclo de cierre promedio del equipo: <span className="tabular font-medium text-ink-soft">{dias(area.ciclo_cierre_promedio)}</span>
        </p>
      )}
    </>
  );
}

/** Embudo horizontal: una sola serie, etiqueta directa en cada paso. */
function Embudo({ pasos }: { pasos: Array<{ etiqueta: string; valor: number | null }> }) {
  const base = pasos[0]?.valor ?? 0;
  if (!base) return <p className="text-[13px] text-ink-soft">Sin datos de embudo para este periodo.</p>;

  // Rampa ordinal de un solo tono: el paso más claro sigue siendo legible.
  const tonos = ["#2a78d6", "#5598e7", "#86b6ef", "#1c5cab"];

  return (
    <ul className="space-y-2">
      {pasos.map((p, i) => {
        const ancho = p.valor != null ? Math.max(2, (p.valor / base) * 100) : 0;
        return (
          <li key={p.etiqueta} className="flex items-center gap-3">
            <span className="w-[150px] shrink-0 text-[12px] text-ink-soft">{p.etiqueta}</span>
            <div className="flex-1">
              <div className="barra-pista">
                <div
                  className="barra-valor"
                  style={{ width: `${ancho}%`, backgroundColor: tonos[i % tonos.length] }}
                  title={`${p.etiqueta}: ${num(p.valor)}`}
                />
              </div>
            </div>
            <span className="tabular w-24 shrink-0 text-right text-[12px] font-medium text-ink">
              {num(p.valor)}
              {i > 0 && p.valor != null && (
                <span className="ml-1 font-normal text-ink-muted">{pct((p.valor / base) * 100, 0)}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
