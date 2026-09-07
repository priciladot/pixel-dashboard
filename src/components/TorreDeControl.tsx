import { Suspense } from "react";
import {
  kpisDelPeriodo, periodos, resumenArea, vendedores,
  tareasAbiertas, etapaActualDeals, dealsEstancados, motivosPerdida,
  ventasConProducto, alertasHigiene, diagnosticoCoach, disciplinaComercial,
  type DealEstancado, type MotivoPerdida,
  type VentaProducto, type AlertaAuditoria, type AccionCoach,
  type DisciplinaComercial as TDisciplinaComercial, type EstatusReto, type RetoSemana,
} from "@/lib/queries";
import { Card, KpiCard, Seccion, Vacio, SemaforoBadge } from "@/components/ui";
import { Filtros } from "@/components/Filtros";
import { TablaComparativa } from "@/components/TablaComparativa";
import { MezclaCartera } from "@/components/MezclaCartera";
import { dias, dinero, dineroCorto, formatearRangoFechas, num, pct } from "@/lib/format";
import { ETAPAS_PIPELINE, nombreEtapa } from "@/lib/pipeline-etapas";
import type { Ventana } from "@/lib/types";

/**
 * Torre de Control: los 3 Pasos consolidados (Diagnóstico y Meta / Ritmo
 * de Cierre y Ejecución Semanal / Focos Rojos y Desglose Operativo) --
 * sin widgets repetidos: la Comparativa se oculta con un vendedor
 * filtrado (su cuota ya está en el Centro de Mando), y el antiguo
 * "Análisis de brecha" quedó fundido como una línea de actividad del mes
 * dentro de Mi Ritmo de Cierre. La usan dos rutas:
 *  - /maestro (admin/supervisor): mostrarFiltroVendedor=true,
 *    vendedorIdForzado opcional (viene del dropdown, puede ser "todo el
 *    equipo").
 *  - /vendedor/[id] (autoservicio): mostrarFiltroVendedor=false,
 *    vendedorIdForzado SIEMPRE presente y fijo (el id de la URL, ya
 *    validado por RLS en la página que llama) -- nunca se lee de un
 *    parámetro que el usuario pueda cambiar, así que no hay forma de que
 *    un vendedor vea el filtro de otro compañero.
 */
export async function TorreDeControl({
  periodoIdParam, ventanaParam, vendedorIdForzado, mostrarFiltroVendedor, mostrarEncabezado,
}: {
  periodoIdParam?: string;
  ventanaParam?: string;
  vendedorIdForzado?: string;
  mostrarFiltroVendedor: boolean;
  mostrarEncabezado: boolean;
}) {
  const vendedorId = vendedorIdForzado;

  const lista = await periodos();
  if (lista.length === 0) {
    return <Vacio titulo="No hay periodos configurados" detalle="Corre la migración 003_seed.sql para crear el calendario de KPI." />;
  }

  const periodoId = periodoIdParam && lista.some((p) => p.id === periodoIdParam) ? periodoIdParam : lista[0].id;
  const ventana: Ventana = ventanaParam === "calendario" ? "calendario" : "kpi_4_semanas";
  const periodo = lista.find((p) => p.id === periodoId)!;

  const [
    equipo, area, personas, tareas, etapasActuales, estancados, perdidas,
    ventasProducto, higiene, coachAcciones, disciplina,
  ] = await Promise.all([
    kpisDelPeriodo(periodoId, ventana),
    resumenArea(periodoId),
    vendedores(),
    tareasAbiertas(vendedorId),
    etapaActualDeals(periodoId, vendedorId),
    dealsEstancados(periodoId, vendedorId, 7),
    motivosPerdida(periodoId, vendedorId),
    ventasConProducto(periodoId, vendedorId),
    alertasHigiene(periodoId, vendedorId, 5),
    vendedorId ? diagnosticoCoach(periodoId, vendedorId) : Promise.resolve([] as AccionCoach[]),
    vendedorId ? disciplinaComercial(periodoId, vendedorId) : Promise.resolve(null as TDisciplinaComercial | null),
  ]);

  const filas = vendedorId ? equipo.filter((f) => f.vendedor_id === vendedorId) : equipo;
  const tareasAtrasadas = tareas.filter((t) => t.atrasada).length;
  const mapaVendedores = new Map(personas.map((p) => [p.id, p.nombre_corto]));
  const conObjetivoPorConfirmar = equipo.some((f) => f.objetivo_confirmado === false);
  const [rangoInicio, rangoFin] = ventana === "kpi_4_semanas"
    ? [periodo.kpi_inicio, periodo.kpi_fin]
    : [periodo.cal_inicio, periodo.cal_fin];
  const ventanaTexto = `Evaluando ventas cerradas del ${formatearRangoFechas(rangoInicio, rangoFin)}`;

  // Con un vendedor filtrado, el resumen ejecutivo muestra SUS cifras (de
  // v_kpi_vendedor, la misma fuente que la tabla comparativa) en vez de la
  // cifra oficial del área — antes se seguía mostrando el total del área sin
  // importar el filtro. Sin filtro, o si el id no resolvió a nadie, se cae al
  // resumen del área de siempre.
  const seleccionado = vendedorId ? filas[0] : undefined;
  const resumen = seleccionado
    ? {
        titulo: `🎯 Mi Centro de Mando — ${seleccionado.nombre_corto}`,
        cifraOficial: false,
        venta_total_iva: seleccionado.venta_total_iva,
        objetivo_total_iva: seleccionado.objetivo_total,
        objetivo_pe_iva: seleccionado.objetivo_pe,
        cumplimiento_pct: seleccionado.cumplimiento_pct,
        semaforo: seleccionado.semaforo,
        deals_ganados: seleccionado.deals_ganados,
        ganado_sin_iva: null as number | null,
        tareas_abiertas: tareas.length,
        venta_existentes_iva: seleccionado.venta_existentes_iva,
        venta_nuevos_iva: seleccionado.venta_nuevos_iva,
        deals_marketing: null as number | null,
        monto_marketing_sin_iva: null as number | null,
        ciclo_cierre_promedio: seleccionado.ciclo_cierre_dias,
      }
    : {
        titulo: "🎯 Centro de Mando del área",
        cifraOficial: Boolean(area?.venta_total_iva != null),
        venta_total_iva: area?.venta_total_iva ?? null,
        objetivo_total_iva: area?.objetivo_total_iva ?? null,
        objetivo_pe_iva: area?.objetivo_pe_iva ?? null,
        cumplimiento_pct: area?.cumplimiento_pct ?? null,
        semaforo: area?.semaforo ?? "sin_dato",
        deals_ganados: area?.deals_ganados ?? null,
        ganado_sin_iva: area?.ganado_sin_iva ?? null,
        tareas_abiertas: tareas.length,
        venta_existentes_iva: area?.venta_existentes_iva ?? null,
        venta_nuevos_iva: area?.venta_nuevos_iva ?? null,
        deals_marketing: area?.deals_marketing ?? null,
        monto_marketing_sin_iva: area?.monto_marketing_sin_iva ?? null,
        ciclo_cierre_promedio: area?.ciclo_cierre_promedio ?? null,
      };

  return (
    <>
      {mostrarEncabezado && (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight text-ink">
              {seleccionado ? `Hola, ${seleccionado.nombre_corto} 👋` : "Dashboard maestro"}
            </h1>
            <p className="mt-0.5 text-[13px] text-ink-soft">
              {periodo.etiqueta} · {ventanaTexto}
              {periodo.cerrado && <span className="ml-2 text-ink-muted">Periodo cerrado</span>}
            </p>
          </div>
          <Suspense fallback={null}>
            <Filtros
              periodos={lista}
              vendedores={mostrarFiltroVendedor ? personas.filter((p) => p.rol === "vendedor") : []}
            />
          </Suspense>
        </div>
      )}

      <ActoHeader numero={1} color="#2a78d6" titulo="Diagnóstico y Meta" />

      {/* Resumen ejecutivo -------------------------------------------------- */}
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
            etiqueta="Venta oficial del periodo (con IVA)"
            valor={dineroCorto(resumen.venta_total_iva)}
            apoyo={dinero(resumen.venta_total_iva)}
          />
          <div>
            <KpiCard
              etiqueta="Cumplimiento"
              valor={pct(resumen.cumplimiento_pct)}
              apoyo={`Meta ${dineroCorto(resumen.objetivo_total_iva)}${resumen.objetivo_pe_iva ? ` · PE ${dineroCorto(resumen.objetivo_pe_iva)}` : ""}`}
              lectura={
                resumen.cumplimiento_pct == null ? undefined :
                resumen.semaforo === "verde" ? "En objetivo" :
                resumen.semaforo === "amarillo" ? `Sobre el PE, faltan ${dineroCorto((resumen.objetivo_total_iva ?? 0) - (resumen.venta_total_iva ?? 0))} para la Meta` :
                resumen.objetivo_pe_iva ? `Debajo del PE por ${dineroCorto(resumen.objetivo_pe_iva - (resumen.venta_total_iva ?? 0))}` :
                `Faltan ${dineroCorto((resumen.objetivo_total_iva ?? 0) - (resumen.venta_total_iva ?? 0))}`
              }
              estado={resumen.cumplimiento_pct != null && resumen.cumplimiento_pct >= 100 ? "cumple" : "debajo"}
            />
            <div className="mt-1.5"><SemaforoBadge estado={resumen.semaforo} compacto /></div>
          </div>
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

      {resumen.ciclo_cierre_promedio != null && (
        <p className="-mt-5 mb-8 text-[12px] text-ink-muted">
          {seleccionado ? `Ciclo de cierre de ${seleccionado.nombre_corto}` : "Ciclo de cierre promedio del equipo"}:{" "}
          <span className="tabular font-medium text-ink-soft">{dias(resumen.ciclo_cierre_promedio)}</span>
        </p>
      )}

      {/* Coach Comercial -----------------------------------------------------
          Solo aplica a un vendedor filtrado: es un diagnóstico individual,
          no tiene lectura agregada de equipo. */}
      <Seccion
        titulo="💡 El Coach Comercial"
        descripcion={seleccionado ? `Diagnóstico táctico de ${seleccionado.nombre_corto} para este mes.` : "Filtra por vendedor para ver su Coach Comercial."}
      >
        {seleccionado ? (
          <CoachComercial acciones={coachAcciones} />
        ) : (
          <Vacio titulo="Selecciona un vendedor" detalle="El Coach Comercial diagnostica a una persona a la vez -- filtra arriba." />
        )}
      </Seccion>

      {/* Comparativo -- solo tiene sentido comparando gente. Con un vendedor
          filtrado su cuota y cumplimiento ya están arriba en el Centro de
          Mando, así que aquí se oculta para no repetir la misma cifra dos
          veces. */}
      {!seleccionado && (
        <Seccion
          titulo="Comparativa de desempeño y cumplimiento"
          descripcion={`${filas.length} de ${equipo.length} registros del periodo. Venta: cifra oficial del Semáforo Comercial (captura manual), no un cálculo automático de HubSpot.`}
        >
          <TablaComparativa filas={filas} />
          {conObjetivoPorConfirmar && (
            <p className="mt-2 text-[12px] text-ink-muted">
              Los objetivos marcados con <span className="font-medium">*</span> están reconstruidos a partir del
              porcentaje de cumplimiento reportado. Captúralos desde el semáforo para que el comparativo sea exacto.
            </p>
          )}
        </Seccion>
      )}

      <ActoHeader numero={2} color="#1baf7a" titulo="Ritmo de Cierre y Ejecución Semanal (S1-S4)" />

      {seleccionado && disciplina && (
        <Seccion
          titulo="📊 Mi Ritmo de Cierre (S1-S4)"
          descripcion={`Cumplimiento semana a semana (S1-S4) de ${seleccionado.nombre_corto} contra su propia meta y ritmo, calendario real de ${periodo.etiqueta}.`}
        >
          <DisciplinaComercial disciplina={disciplina} tareasAtrasadas={tareasAtrasadas} />
          {(seleccionado.correos_enviados != null || seleccionado.leads_registrados != null || seleccionado.actividades_totales != null) && (
            <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-ink-muted">
              Actividad del mes (semáforo comercial, no HubSpot):{" "}
              {seleccionado.correos_enviados != null && <>{num(seleccionado.correos_enviados)} correos · </>}
              {seleccionado.leads_registrados != null && <>{num(seleccionado.leads_registrados)} leads trabajados · </>}
              {seleccionado.actividades_totales != null && <>{num(seleccionado.actividades_totales)} actividades registradas</>}
            </p>
          )}
        </Seccion>
      )}

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

      {/* Auditoría de higiene: HubSpot vs. Monday ---------------------------- */}
      <Seccion
        titulo={`Focos rojos de auditoría e higiene (${higiene.length})`}
        descripcion={
          seleccionado
            ? `Inconsistencias de captura de ${seleccionado.nombre_corto} entre HubSpot y Monday, y clientes sin atención 5+ días.`
            : "Inconsistencias de captura entre HubSpot y Monday, y clientes sin atención 5+ días, para todo el equipo."
        }
      >
        <AlertasHigiene alertas={higiene} />
      </Seccion>

      <ActoHeader numero={3} color="#eda100" titulo="Focos Rojos y Desglose Operativo" />

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
  const nombresVendedores = nombresDeVendedores(mapaVendedores);
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
              <tr key={f.hubspot_id} className="border-b border-line/70 transition-colors last:border-0 hover:bg-surface-sunk">
                {mostrarVendedor && (
                  <td className="px-4 py-2.5 text-ink-soft">{f.vendedor_id ? mapaVendedores.get(f.vendedor_id) ?? "Sin asignar" : "Sin asignar"}</td>
                )}
                <td className="px-4 py-2.5 text-ink">{f.nombre ?? `#${f.hubspot_id}`}</td>
                <td className="px-4 py-2.5 text-ink-soft">{empresaSegura(f.empresa, nombresVendedores, "")}</td>
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


/**
 * "Empresa / Agencia" viene de una columna de Monday que a veces queda
 * vacía o, por error de captura en el tablero, con el nombre de un
 * vendedor en vez del cliente. Nunca se despliega el nombre de un
 * vendedor ahí -- si `empresa` coincide con alguien del equipo, o viene
 * vacía, se usa `respaldo` (el nombre del deal en HubSpot, o "—").
 */
function normalizarNombre(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function empresaSegura(empresa: string | null | undefined, nombresVendedores: Set<string>, respaldo: string): string {
  const limpio = empresa?.trim();
  if (!limpio) return respaldo || "—";
  const normalizado = normalizarNombre(limpio);
  // Coincidencia exacta ("Gaby") o el nombre de un vendedor metido en un
  // texto más largo ("Venta de Pris", "Pris - referido") -- cualquiera de
  // los dos casos es un error de captura en Monday, no una empresa real.
  const esNombreDeVendedor = [...nombresVendedores].some(
    (n) => normalizado === n || normalizado.includes(n),
  );
  if (esNombreDeVendedor) return respaldo || "—";
  return limpio;
}

function nombresDeVendedores(mapaVendedores: Map<string, string>): Set<string> {
  return new Set([...mapaVendedores.values()].map(normalizarNombre));
}

function VentasProductosTabla({
  filas, mapaVendedores, mostrarVendedor,
}: { filas: VentaProducto[]; mapaVendedores: Map<string, string>; mostrarVendedor: boolean }) {
  const nombresVendedores = nombresDeVendedores(mapaVendedores);
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
              <th className="px-4 py-2.5 font-medium">Canal</th>
              <th className="px-4 py-2.5 font-medium">Monto en Monday (sin IVA)</th>
              <th className="px-4 py-2.5 font-medium">Monto con IVA (×1.16)</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.hubspot_id} className="border-b border-line/70 transition-colors last:border-0 hover:bg-surface-sunk">
                {mostrarVendedor && (
                  <td className="px-4 py-2.5 text-ink">{f.vendedor_id ? mapaVendedores.get(f.vendedor_id) ?? "Sin asignar" : "Sin asignar"}</td>
                )}
                <td className="px-4 py-2.5 text-ink-soft">{empresaSegura(f.empresa, nombresVendedores, f.nombre_deal ?? "")}</td>
                <td className="px-4 py-2.5 text-ink-soft">{f.correo_cliente ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-soft">{f.productos ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-soft">{f.canal ?? "—"}</td>
                <td className="px-4 py-2.5 tabular text-ink-soft">{dinero(f.monto_sin_iva)}</td>
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

const ETIQUETA_ALERTA: Record<AlertaAuditoria["tipo"], string> = {
  ganado_sin_monday: "Falta en Monday",
  monday_sin_canal: "Canal sin capturar",
  sin_atencion: "Sin atención",
};

/** Discrepancias HubSpot vs. Monday y clientes sin seguimiento real -- convierte el hueco de captura en pendientes concretos. */
function AlertasHigiene({ alertas }: { alertas: AlertaAuditoria[] }) {
  if (alertas.length === 0) {
    return (
      <Card className="px-5 py-6 text-center text-[13px] text-ink-soft">
        Sin inconsistencias de captura ni clientes sin atención en este periodo.
      </Card>
    );
  }

  return (
    <ul className="space-y-2">
      {alertas.map((a) => (
        <li key={`${a.tipo}-${a.hubspot_id}`} className="flex items-start gap-3 rounded-card border border-[#f4cbb6] bg-[#fdeee7] px-3.5 py-2.5">
          <span className="mt-0.5 shrink-0 rounded border border-[#f4cbb6] bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#a04a25]">
            {ETIQUETA_ALERTA[a.tipo]}
          </span>
          <p className="text-[13px] text-ink">{a.mensaje}</p>
        </li>
      ))}
    </ul>
  );
}

/** Banner visual de cada Acto -- pill de color + título, para que la narrativa de la página se note en pantalla, no solo en el código. */
function ActoHeader({ numero, color, titulo, subtitulo }: { numero: number; color: string; titulo: string; subtitulo?: string }) {
  return (
    <div className="mb-4 mt-2 flex items-center gap-2.5">
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
        style={{ color, backgroundColor: `${color}1a` }}
      >
        Acto {numero}
      </span>
      <h2 className="text-[16px] font-bold tracking-tight text-ink">
        {titulo}
        {subtitulo && <span className="ml-1.5 text-[13px] font-normal text-ink-muted">— {subtitulo}</span>}
      </h2>
    </div>
  );
}

const ESTATUS_RETO: Record<EstatusReto, { etiqueta: string; icono: string; color: string; bg: string; borde: string }> = {
  cumplido:     { etiqueta: "Cumplido",     icono: "●", color: "#0ca30c", bg: "#e9f7e9", borde: "#bfe6bf" },
  en_progreso:  { etiqueta: "En progreso",  icono: "◐", color: "#8a6100", bg: "#fdf4e0", borde: "#f2dfae" },
  no_alcanzado: { etiqueta: "No alcanzado", icono: "▲", color: "#d03b3b", bg: "#fdecec", borde: "#f3c2c2" },
  sin_dato:     { etiqueta: "Sin dato",     icono: "○", color: "#52514e", bg: "#f2f1ed", borde: "#e1e0d9" },
  pendiente:    { etiqueta: "Pendiente",    icono: "○", color: "#52514e", bg: "#f2f1ed", borde: "#e1e0d9" },
};

function EstatusBadge({ estado }: { estado: EstatusReto }) {
  const s = ESTATUS_RETO[estado];
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

const ETIQUETA_CATEGORIA_COACH: Record<AccionCoach["categoria"], string> = {
  conversion: "Conversión", higiene: "Higiene CRM", velocidad: "Velocidad de cierre", ticket: "Ticket promedio",
};
const COLOR_CATEGORIA_COACH: Record<AccionCoach["categoria"], string> = {
  conversion: "#c0392b", higiene: "#a04a25", velocidad: "#8a6100", ticket: "#2a78d6",
};

const TACTICAS_B2B: Array<{ titulo: string; texto: string }> = [
  { titulo: "Manejo de objeciones: aísla antes de responder", texto: 'Cuando el cliente diga "está caro", no ofrezcas descuento de inmediato. Pregunta: "¿Es el único punto que te detiene, o hay algo más?" Aislar la objeción evita negociar contra un fantasma.' },
  { titulo: "Cierre consultivo: resume y pregunta", texto: 'Antes de pedir la firma, resume en una frase el problema del cliente y cómo tu propuesta lo resuelve, y pregunta directo: "¿Esto cubre lo que necesitas para avanzar?" El resumen hace el cierre casi automático.' },
  { titulo: "Seguimiento de propuestas: fecha y hora, no \"la próxima semana\"", texto: 'Al enviar una cotización, no digas que le das seguimiento después. Agenda el día y la hora exactos frente al cliente, ahí mismo en la llamada.' },
  { titulo: "Manejo de objeciones: precio vs. valor", texto: "Si insisten en precio, regresa a lo que cuesta NO resolver el problema (tiempo perdido, oportunidad, riesgo). Cambia la conversación de costo a inversión." },
  { titulo: "Cierre consultivo: pregunta de compromiso", texto: 'Termina cada llamada de propuesta con una pregunta directa: "¿Qué necesitas de tu lado para poder decidir esta semana?" Expone objeciones ocultas antes de que se conviertan en silencio.' },
];

function tacticaDeLaSemana(): { titulo: string; texto: string } {
  const inicioAnio = new Date(new Date().getFullYear(), 0, 1).getTime();
  const semanaDelAnio = Math.floor((Date.now() - inicioAnio) / (7 * 86_400_000));
  return TACTICAS_B2B[semanaDelAnio % TACTICAS_B2B.length];
}

/** Coach Comercial: diagnóstico y 2-3 micro-acciones del vendedor filtrado, 100% derivadas de la Suite de Analítica ya calculada, más una táctica B2B genérica que rota cada semana. */
function CoachComercial({ acciones }: { acciones: AccionCoach[] }) {
  const tactica = tacticaDeLaSemana();
  const [retoSemana, ...resto] = acciones;
  return (
    <div className="space-y-3">
      {retoSemana ? (
        <div className="rounded-card border px-4 py-3 shadow-sm transition-shadow duration-200 hover:shadow-md" style={{ backgroundColor: "#fab2191a", borderColor: "#fab21940" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a6100]">🔥 Reto de la semana</p>
          <p className="mt-1 text-[13px] font-medium text-ink">{retoSemana.mensaje}</p>
        </div>
      ) : (
        <div className="rounded-card border px-4 py-3" style={{ backgroundColor: "#0ca30c1a", borderColor: "#0ca30c40" }}>
          <p className="text-[13px] text-ink-soft">
            ✅ Sin focos de atención este mes -- ningún indicador crítico, o todavía no hay negocios registrados en el periodo.
          </p>
        </div>
      )}
      {resto.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {resto.slice(0, 2).map((a) => (
            <div
              key={a.categoria}
              className="rounded-card border px-4 py-3 shadow-sm transition-shadow duration-200 hover:shadow-md"
              style={{ backgroundColor: `${COLOR_CATEGORIA_COACH[a.categoria]}14`, borderColor: `${COLOR_CATEGORIA_COACH[a.categoria]}33` }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: COLOR_CATEGORIA_COACH[a.categoria] }}>
                {ETIQUETA_CATEGORIA_COACH[a.categoria]}
              </p>
              <p className="mt-1 text-[12px] text-ink-soft">{a.diagnostico}</p>
              <p className="mt-1.5 text-[13px] text-ink">{a.mensaje}</p>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-card border px-4 py-3 shadow-sm transition-shadow duration-200 hover:shadow-md" style={{ backgroundColor: "#2a78d614", borderColor: "#2a78d640" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2a78d6]">💬 Táctica comercial de la semana</p>
        <p className="mt-1 text-[13px] font-medium text-ink">{tactica.titulo}</p>
        <p className="mt-1 text-[12px] text-ink-soft">{tactica.texto}</p>
      </div>
    </div>
  );
}

/** Disciplina Comercial: retos S1-S4 del calendario real de periodo_semanas, racha y alerta de abandono de CRM. */
function DisciplinaComercial({
  disciplina, tareasAtrasadas,
}: { disciplina: TDisciplinaComercial; tareasAtrasadas?: number }) {
  const { semanas, rachaSemanas, alerta } = disciplina;
  if (semanas.length === 0) {
    return <p className="text-[13px] text-ink-soft">Sin calendario de semanas (S1-S4) configurado para este periodo.</p>;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const etiquetaTemporalDe = (s: RetoSemana): string => (s.esSemanaActual ? "En curso" : s.fin < hoy ? "Pasada" : "Próxima");
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div
          className={`rounded-full border px-3 py-1 text-[12px] font-medium ${rachaSemanas > 0 ? "" : "border-line bg-surface-sunk text-ink"}`}
          style={rachaSemanas > 0 ? { color: "#0ca30c", backgroundColor: "#0ca30c1a", borderColor: "#0ca30c40" } : undefined}
        >
          🔥 Racha de Disciplina: {rachaSemanas} semana{rachaSemanas === 1 ? "" : "s"} consecutiva{rachaSemanas === 1 ? "" : "s"}
        </div>
        {!!tareasAtrasadas && tareasAtrasadas > 0 && (
          <div className="rounded-full border border-[#f4cbb6] bg-[#fdeee7] px-3 py-1 text-[12px] font-medium text-[#a04a25]">
            ⏰ {tareasAtrasadas} tarea{tareasAtrasadas === 1 ? "" : "s"} atrasada{tareasAtrasadas === 1 ? "" : "s"}
          </div>
        )}
        {alerta && (
          <div className="rounded-full border border-[#f3c2c2] bg-[#fdecec] px-3 py-1 text-[12px] font-medium text-[#d03b3b]">
            {alerta}
          </div>
        )}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5 font-medium">Semana</th>
                <th className="px-4 py-2.5 font-medium">Monto vendido</th>
                <th className="px-4 py-2.5 font-medium">Reto de cierre</th>
                <th className="px-4 py-2.5 font-medium">Negocios creados</th>
                <th className="px-4 py-2.5 font-medium">Reto de volumen</th>
                <th className="px-4 py-2.5 font-medium">Tareas (hechas/asignadas)</th>
                <th className="px-4 py-2.5 font-medium">Reto de CRM</th>
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
                  <td className="px-4 py-2.5 tabular text-ink-soft">
                    {dinero(s.montoVendido)}
                    {s.metaCierreSemana != null && (
                      <span className="block text-[11px] text-ink-muted">meta {dinero(s.metaCierreSemana)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5"><EstatusBadge estado={s.estatusCierre} /></td>
                  <td className="px-4 py-2.5 tabular text-ink-soft">
                    {num(s.negociosCreados)}
                    {s.negociosCreadosSemanaAnterior != null && (
                      <span className="block text-[11px] text-ink-muted">semana ant. {s.negociosCreadosSemanaAnterior}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5"><EstatusBadge estado={s.estatusVolumen} /></td>
                  <td className="px-4 py-2.5 tabular text-ink-soft">{s.tareasCompletadas}/{s.tareasAsignadas}</td>
                  <td className="px-4 py-2.5"><EstatusBadge estado={s.estatusCrm} /></td>
                  <td className="px-4 py-2.5"><EstatusBadge estado={s.estatusGeneral} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
