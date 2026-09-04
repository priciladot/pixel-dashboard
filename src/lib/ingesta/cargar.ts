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
import { resolverVendedor, type CierreCrudo } from "./monday";
import type { CambioEtapa, EngagementCrudo, LeadCrudo, TipoEngagement } from "./hubspot-analitica";

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
 * este código. Además de la atribución se guarda todo el detalle operativo
 * del tablero (producto, fechas de evento, viáticos, tipo de negocio) sin
 * transformarlo — v_deals_operativo decide qué usar. No toca hubspot_deals
 * ni kpi_mensual.
 */
export async function ingestarCierresMonday(
  db: SupabaseClient,
  crudos: CierreCrudo[],
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
        hubspot_id: c.hubspot_id,
        link_hubspot: c.link_hubspot,
        vendedor_id: vendedorId,
        propietario: c.propietario_nombre,
        estado_proyecto: c.estado_proyecto,
        porcentaje_comision: c.porcentaje_comision,
        monto_total: c.monto_total,
        tipo_negocio: c.tipo_negocio,
        como_llego: c.como_llego,
        herramienta_venta: c.herramienta_venta,
        empresa: c.empresa,
        correo_cliente: c.correo_cliente,
        inicio_evento: c.inicio_evento,
        fin_evento: c.fin_evento,
        mes_evento: c.mes_evento,
        semana: c.semana,
        dias_activacion: c.dias_activacion,
        fecha_cierre: c.fecha_cierre,
        area_pixel_factory: c.area_pixel_factory,
        marca_evento: c.marca_evento,
        productos: c.productos,
        num_productos: c.num_productos,
        num_activaciones: c.num_activaciones,
        viaticos: c.viaticos,
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

/**
 * Carga historial de etapas, actividades/tareas y leads de HubSpot. Cada
 * pieza es independiente: si `engagements.sinPermiso` trae tipos (por
 * scopes faltantes en el Private App) o `leads.disponible` es false (objeto
 * no habilitado en el portal), esas partes simplemente no escriben nada —
 * no tumban el resto de la corrida. El resumen final deja explícito qué
 * faltó, para que quien lo corra sepa qué scope pedir en HubSpot, si acaso.
 */
export async function ingestarAnaliticaHubspot(
  db: SupabaseClient,
  datos: {
    etapas: CambioEtapa[];
    engagements: { porTipo: Partial<Record<TipoEngagement, EngagementCrudo[]>>; sinPermiso: TipoEngagement[] };
    leads: { leads: LeadCrudo[]; disponible: boolean };
  },
  opciones: { periodoId?: string; simulacion?: boolean },
): Promise<{
  ingestaId: number;
  etapas: number;
  engagementsPorTipo: Record<string, number>;
  engagementsSinAsignar: number;
  leads: number;
  sinPermiso: TipoEngagement[];
  leadsDisponible: boolean;
}> {
  const totalLeido =
    datos.etapas.length +
    Object.values(datos.engagements.porTipo).reduce((acc, arr) => acc + (arr?.length ?? 0), 0) +
    datos.leads.leads.length;

  const { data: ingesta, error: errIngesta } = await db
    .from("ingestas")
    .insert({ tipo: "hubspot_analitica", periodo_id: opciones.periodoId ?? null, filas_leidas: totalLeido })
    .select("id")
    .single();
  if (errIngesta) throw new Error(`No se pudo abrir la ingesta: ${errIngesta.message}`);
  const ingestaId = ingesta.id as number;

  try {
    const dic = await cargarDiccionarios(db);
    const engagementsPorTipo: Record<string, number> = {};
    let engagementsSinAsignar = 0;

    if (!opciones.simulacion) {
      // 1. Historial de etapas — sin resolución de vendedor, no aplica.
      if (datos.etapas.length > 0) {
        const filas = datos.etapas.map((c) => ({
          hubspot_id: c.hubspot_id,
          etapa_anterior: c.etapa_anterior,
          etapa_nueva: c.etapa_nueva,
          fecha_cambio: c.fecha_cambio,
          ingesta_id: ingestaId,
          raw: c.raw,
        }));
        for (let i = 0; i < filas.length; i += 500) {
          const { error } = await db.from("hubspot_deal_stages")
            .upsert(filas.slice(i, i + 500), { onConflict: "hubspot_id,etapa_nueva,fecha_cambio" });
          if (error) throw new Error(`Error al escribir historial de etapas: ${error.message}`);
        }
      }

      // 2. Actividades y tareas — resueltas por owner_hubspot_id, igual que hubspot_deals.
      for (const [tipo, lista] of Object.entries(datos.engagements.porTipo)) {
        if (!lista || lista.length === 0) continue;
        const filas = lista.map((e) => {
          const vendedorId = e.owner_hubspot_id ? dic.porOwnerId.get(e.owner_hubspot_id) ?? null : null;
          if (!vendedorId) engagementsSinAsignar += 1;
          return {
            hubspot_id: e.hubspot_id,
            tipo: e.tipo,
            deal_id_ref: e.deal_id_ref,
            vendedor_id: vendedorId,
            owner_hubspot_id: e.owner_hubspot_id,
            asunto: e.asunto,
            estado: e.estado,
            fecha: e.fecha,
            duracion_segundos: e.duracion_segundos,
            ingesta_id: ingestaId,
            raw: e.raw,
            actualizado_en: new Date().toISOString(),
          };
        });
        engagementsPorTipo[tipo] = filas.length;
        for (let i = 0; i < filas.length; i += 500) {
          const { error } = await db.from("hubspot_engagements")
            .upsert(filas.slice(i, i + 500), { onConflict: "tipo,hubspot_id" });
          if (error) throw new Error(`Error al escribir ${tipo}: ${error.message}`);
        }
      }

      // 3. Leads — mismo patrón de resolución.
      if (datos.leads.leads.length > 0) {
        const filas = datos.leads.leads.map((l) => ({
          hubspot_id: l.hubspot_id,
          deal_id_ref: l.deal_id_ref,
          vendedor_id: l.owner_hubspot_id ? dic.porOwnerId.get(l.owner_hubspot_id) ?? null : null,
          etapa: l.etapa,
          fecha_creacion: l.fecha_creacion,
          ingesta_id: ingestaId,
          raw: l.raw,
          actualizado_en: new Date().toISOString(),
        }));
        for (let i = 0; i < filas.length; i += 500) {
          const { error } = await db.from("hubspot_leads")
            .upsert(filas.slice(i, i + 500), { onConflict: "hubspot_id" });
          if (error) throw new Error(`Error al escribir leads: ${error.message}`);
        }
      }
    } else {
      // En simulación se cuenta lo que se habría escrito, sin tocar la base.
      for (const [tipo, lista] of Object.entries(datos.engagements.porTipo)) {
        engagementsPorTipo[tipo] = lista?.length ?? 0;
        engagementsSinAsignar += (lista ?? []).filter(
          (e) => !e.owner_hubspot_id || !dic.porOwnerId.get(e.owner_hubspot_id),
        ).length;
      }
    }

    const resumen = {
      simulacion: Boolean(opciones.simulacion),
      etapas: datos.etapas.length,
      engagements_por_tipo: engagementsPorTipo,
      engagements_sin_asignar: engagementsSinAsignar,
      leads: datos.leads.leads.length,
      leads_disponible: datos.leads.disponible,
      sin_permiso: datos.engagements.sinPermiso,
    };

    await db.from("ingestas").update({
      estatus: datos.engagements.sinPermiso.length > 0 || !datos.leads.disponible ? "completada_con_avisos" : "completada",
      terminado_en: new Date().toISOString(),
      filas_ok: totalLeido - engagementsSinAsignar,
      filas_sanitizadas: engagementsSinAsignar,
      resumen,
    }).eq("id", ingestaId);

    return {
      ingestaId,
      etapas: datos.etapas.length,
      engagementsPorTipo,
      engagementsSinAsignar,
      leads: datos.leads.leads.length,
      sinPermiso: datos.engagements.sinPermiso,
      leadsDisponible: datos.leads.disponible,
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
