/**
 * Orquestador de ingesta: toma deals crudos, los sanea, los persiste y
 * recalcula los KPIs derivados. Siempre abre y cierra un registro en la tabla
 * `ingestas` para que el Dashboard Maestro pueda auditar qué entró y qué quedó
 * marcado.
 *
 * Usa el cliente service-role, así que solo debe invocarse desde scripts o
 * desde un route handler que ya verificó que quien llama es admin.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  agregarPorVendedor, normalizar, sanearLote,
  type DealCrudo, type Diccionarios, type DealSaneado,
} from "./sanitizar";
import { resolverVendedor } from "./monday";

export async function cargarDiccionarios(db: SupabaseClient): Promise<Diccionarios> {
  const [perfiles, alias, mapaOwners, periodos, catalogo] = await Promise.all([
    db.from("profiles").select("id, hubspot_owner_id, nombre_completo, nombre_corto, email"),
    db.from("profile_alias").select("vendedor_id, alias"),
    db.from("hubspot_owner_map").select("owner_id, vendedor_id, nombre_raw"),
    db.from("periodos").select("id, kpi_inicio, kpi_fin, cal_inicio, cal_fin"),
    db.from("catalogo_perdida").select("categoria").eq("activo", true),
  ]);

  const porOwnerId = new Map<string, string>();
  const porAlias = new Map<string, string>();

  for (const p of perfiles.data ?? []) {
    if (p.hubspot_owner_id) porOwnerId.set(String(p.hubspot_owner_id), p.id);
    [p.nombre_completo, p.nombre_corto, p.email].filter(Boolean)
      .forEach((a: string) => porAlias.set(normalizar(a), p.id));
  }
  for (const a of alias.data ?? []) porAlias.set(normalizar(a.alias), a.vendedor_id);

  // Varias cuentas de HubSpot pueden apuntar a la misma persona (los IDs
  // viejos siguen colgando de los negocios históricos).
  for (const m of mapaOwners.data ?? []) {
    porOwnerId.set(String(m.owner_id), m.vendedor_id);
    if (m.nombre_raw) porAlias.set(normalizar(m.nombre_raw), m.vendedor_id);
  }

  return {
    porOwnerId,
    porAlias,
    periodos: periodos.data ?? [],
    categoriasPerdida: (catalogo.data ?? []).map((c) => c.categoria),
  };
}

export interface ResultadoIngesta {
  ingestaId: number;
  filasLeidas: number;
  filasOk: number;
  filasSanitizadas: number;
  duplicados: number;
  vendedoresActualizados: number;
  sinAsignar: number;
  resumen: Record<string, unknown>;
}

export async function ingestarDeals(
  db: SupabaseClient,
  crudos: DealCrudo[],
  opciones: {
    tipo: "hubspot_api" | "hubspot_cron" | "csv" | "json" | "pdf" | "semaforo_xlsx";
    periodoId?: string;
    archivoNombre?: string;
    ejecutadoPor?: string;
    ventana?: "kpi_4_semanas" | "calendario";
    /** true = solo reporta, no escribe deals ni KPIs */
    simulacion?: boolean;
  },
): Promise<ResultadoIngesta> {
  const ventana = opciones.ventana ?? "kpi_4_semanas";

  const { data: ingesta, error: errIngesta } = await db
    .from("ingestas")
    .insert({
      tipo: opciones.tipo,
      periodo_id: opciones.periodoId ?? null,
      archivo_nombre: opciones.archivoNombre ?? null,
      ejecutado_por: opciones.ejecutadoPor ?? null,
      filas_leidas: crudos.length,
    })
    .select("id")
    .single();
  if (errIngesta) throw new Error(`No se pudo abrir la ingesta: ${errIngesta.message}`);
  const ingestaId = ingesta.id as number;

  try {
    const dic = await cargarDiccionarios(db);
    const { deals, duplicados } = sanearLote(crudos, dic, ventana);

    const marcados = deals.filter((d) => d.flags.length > 0);
    const sinAsignar = deals.filter((d) => d.vendedor_id === null).length;

    if (!opciones.simulacion) {
      await escribirDeals(db, deals, ingestaId);
      await recalcularKpis(db, deals, ingestaId, opciones.periodoId);
    }

    const porBandera: Record<string, number> = {};
    marcados.forEach((d) => d.flags.forEach((f) => { porBandera[f] = (porBandera[f] ?? 0) + 1; }));

    const resumen = {
      ventana,
      simulacion: Boolean(opciones.simulacion),
      duplicados,
      sin_asignar: sinAsignar,
      por_bandera: porBandera,
      periodos_tocados: [...new Set(deals.map((d) => d.periodo_id).filter(Boolean))],
    };

    await db.from("ingestas").update({
      estatus: marcados.length > 0 ? "completada_con_avisos" : "completada",
      terminado_en: new Date().toISOString(),
      filas_ok: deals.length - marcados.length,
      filas_sanitizadas: marcados.length,
      filas_rechazadas: 0,
      resumen,
    }).eq("id", ingestaId);

    return {
      ingestaId,
      filasLeidas: crudos.length,
      filasOk: deals.length - marcados.length,
      filasSanitizadas: marcados.length,
      duplicados,
      sinAsignar,
      vendedoresActualizados: new Set(deals.map((d) => d.vendedor_id).filter(Boolean)).size,
      resumen,
    };
  } catch (e) {
    await db.from("ingestas").update({
      estatus: "error",
      terminado_en: new Date().toISOString(),
      error: e instanceof Error ? e.message : String(e),
    }).eq("id", ingestaId);
    throw e;
  }
}

async function escribirDeals(db: SupabaseClient, deals: DealSaneado[], ingestaId: number) {
  const filas = deals.map((d) => ({
    hubspot_id: d.hubspot_id,
    ingesta_id: ingestaId,
    nombre: d.nombre,
    owner_hubspot_id: d.owner_hubspot_id,
    owner_nombre_raw: d.owner_nombre_raw,
    vendedor_id: d.vendedor_id,
    monto_sin_iva: d.monto_sin_iva,
    etapa: d.etapa,
    cerrado_ganado: d.cerrado_ganado,
    fecha_creacion: d.fecha_creacion,
    fecha_cierre: d.fecha_cierre,
    periodo_id: d.periodo_id,
    tipo_cliente: d.tipo_cliente,
    origen: d.origen,
    atribucion: d.atribucion,
    motivo_perdida: d.motivo_perdida,
    categoria_perdida: d.categoria_perdida,
    fecha_reactivacion: d.fecha_reactivacion,
    clasificacion_raw: d.clasificacion_raw,
    pipeline: d.pipeline,
    es_division: d.es_division,
    flags: d.flags,
    calidad: d.calidad,
    raw: d.raw,
    actualizado_en: new Date().toISOString(),
  }));

  // En lotes de 500 para no exceder el límite del endpoint REST.
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await db
      .from("hubspot_deals")
      .upsert(filas.slice(i, i + 500), { onConflict: "hubspot_id" });
    if (error) throw new Error(`Error al escribir deals: ${error.message}`);
  }
}

/**
 * Actualiza únicamente los campos derivables de HubSpot. Las cifras de venta
 * NO se tocan: el semáforo comercial sigue siendo la fuente autoritativa para
 * el dinero, y HubSpot solo aporta embudo, ticket y ciclo.
 */
async function recalcularKpis(
  db: SupabaseClient, deals: DealSaneado[], ingestaId: number, periodoId?: string,
) {
  const agregados = agregarPorVendedor(deals)
    .filter((a) => !periodoId || a.periodo_id === periodoId);

  for (const a of agregados) {
    const { data: existente } = await db
      .from("kpi_mensual")
      .select("id, venta_total_iva, fuente, notas")
      .eq("vendedor_id", a.vendedor_id)
      .eq("periodo_id", a.periodo_id)
      .eq("ventana", "kpi_4_semanas")
      .maybeSingle();

    const campos = {
      deals_creados: a.deals_creados,
      deals_ganados: a.deals_ganados,
      deals_perdidos: a.deals_perdidos,
      ticket_promedio_sin_iva: a.ticket_promedio_sin_iva,
      ciclo_cierre_dias: a.ciclo_cierre_dias,
      ingesta_id: ingestaId,
    };

    if (existente) {
      await db.from("kpi_mensual").update(campos).eq("id", existente.id);
    } else {
      // Sin fila previa del semáforo: se crea con la venta derivada de HubSpot
      // (convertida a CON IVA) y queda marcada como parcial.
      await db.from("kpi_mensual").insert({
        vendedor_id: a.vendedor_id,
        periodo_id: a.periodo_id,
        ventana: "kpi_4_semanas",
        venta_total_iva: a.ganado_con_iva,
        ...campos,
        fuente: "hubspot_api",
        calidad: "parcial",
        notas: "Venta derivada de HubSpot (sin IVA × 1.16). Sustituir por la cifra del semáforo comercial.",
      });
    }
  }
}

/** Carga del semáforo comercial: esta sí manda sobre las cifras de venta. */
export async function ingestarSemaforo(
  db: SupabaseClient,
  filas: Array<{ vendedor: string; objetivo: number | null; existentes: number | null; nuevos: number | null; total: number | null }>,
  opciones: { periodoId: string; archivoNombre?: string; ejecutadoPor?: string },
): Promise<{ ingestaId: number; aplicadas: number; sinMapear: string[] }> {
  const { data: ingesta } = await db.from("ingestas").insert({
    tipo: "semaforo_xlsx",
    periodo_id: opciones.periodoId,
    archivo_nombre: opciones.archivoNombre ?? null,
    ejecutado_por: opciones.ejecutadoPor ?? null,
    filas_leidas: filas.length,
  }).select("id").single();
  const ingestaId = ingesta!.id as number;

  const dic = await cargarDiccionarios(db);
  const sinMapear: string[] = [];
  let aplicadas = 0;

  for (const f of filas) {
    const vendedorId = dic.porAlias.get(normalizar(f.vendedor));
    if (!vendedorId) { sinMapear.push(f.vendedor); continue; }

    if (f.objetivo != null) {
      await db.from("objetivos").upsert({
        vendedor_id: vendedorId, periodo_id: opciones.periodoId,
        objetivo_total: f.objetivo, confirmado: true,
      }, { onConflict: "vendedor_id,periodo_id" });
    }

    await db.from("kpi_mensual").upsert({
      vendedor_id: vendedorId,
      periodo_id: opciones.periodoId,
      ventana: "kpi_4_semanas",
      venta_existentes_iva: f.existentes,
      venta_nuevos_iva: f.nuevos,
      venta_total_iva: f.total ?? (f.existentes ?? 0) + (f.nuevos ?? 0),
      fuente: "semaforo",
      ingesta_id: ingestaId,
    }, { onConflict: "vendedor_id,periodo_id,ventana" });

    aplicadas += 1;
  }

  await db.from("ingestas").update({
    estatus: sinMapear.length > 0 ? "completada_con_avisos" : "completada",
    terminado_en: new Date().toISOString(),
    filas_ok: aplicadas,
    filas_sanitizadas: sinMapear.length,
    resumen: { sin_mapear: sinMapear },
  }).eq("id", ingestaId);

  return { ingestaId, aplicadas, sinMapear };
}

/**
 * Carga los cierres del tablero de Monday. Cada fila del tablero ya es la
 * porción de UN vendedor (Individual = 100%, Dividido = su % de comisión);
 * `monto_atribuido` lo calcula la base de datos (columna generada), nunca
 * este código. No toca hubspot_deals ni kpi_mensual — la vista
 * v_atribucion_comercial hace el cruce al momento de leer.
 */
export async function ingestarCierresMonday(
  db: SupabaseClient,
  crudos: Array<{
    elemento_id: string;
    hubspot_id_ref: string | null;
    propietario_nombre: string | null;
    estado_proyecto: string | null;
    porcentaje_comision: number | null;
    monto_total: number | null;
    mes_evento: string | null;
    fecha_cierre: string | null;
    raw: unknown;
  }>,
  opciones: { tipo: "monday_api" | "monday_cron" },
): Promise<{ ingestaId: number; filasOk: number; sinAsignar: number }> {
  const { data: ingesta, error: errIngesta } = await db
    .from("ingestas")
    .insert({ tipo: opciones.tipo, filas_leidas: crudos.length })
    .select("id")
    .single();
  if (errIngesta) throw new Error(`No se pudo abrir la ingesta: ${errIngesta.message}`);
  const ingestaId = ingesta.id as number;

  try {
    const dic = await cargarDiccionarios(db);
    let sinAsignar = 0;

    const filas = crudos.map((c) => {
      const vendedorId = resolverVendedor(c.propietario_nombre, dic.porAlias);
      if (!vendedorId) sinAsignar += 1;

      return {
        elemento_id: c.elemento_id,
        hubspot_id_ref: c.hubspot_id_ref,
        vendedor_id: vendedorId,
        estado_proyecto: c.estado_proyecto,
        porcentaje_comision: c.porcentaje_comision,
        monto_total: c.monto_total,
        mes_evento: c.mes_evento,
        fecha_cierre: c.fecha_cierre,
        ingesta_id: ingestaId,
        raw: c.raw,
        actualizado_en: new Date().toISOString(),
      };
    });

    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await db
        .from("monday_cierres")
        .upsert(filas.slice(i, i + 500), { onConflict: "elemento_id" });
      if (error) throw new Error(`Error al escribir cierres de Monday: ${error.message}`);
    }

    await db.from("ingestas").update({
      estatus: sinAsignar > 0 ? "completada_con_avisos" : "completada",
      terminado_en: new Date().toISOString(),
      filas_ok: filas.length - sinAsignar,
      filas_sanitizadas: sinAsignar,
      resumen: { sin_asignar: sinAsignar },
    }).eq("id", ingestaId);

    return { ingestaId, filasOk: filas.length - sinAsignar, sinAsignar };
  } catch (e) {
    await db.from("ingestas").update({
      estatus: "error",
      terminado_en: new Date().toISOString(),
      error: e instanceof Error ? e.message : String(e),
    }).eq("id", ingestaId);
    throw e;
  }
}
