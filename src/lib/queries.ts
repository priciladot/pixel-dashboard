import { createClient } from "./supabase/server";
import { etapaInfo } from "./pipeline-etapas";
import type {
  Accion, Benchmark, ContextoMercado, Evaluacion, FilaBrecha,
  KpiVendedor, Perfil, Periodo, ResumenArea, Ventana,
} from "./types";

/**
 * Capa de lectura. Todas las consultas usan el cliente con la sesión del
 * usuario, así que el RLS recorta las filas: si un vendedor pide el KPI de
 * otro, Postgres devuelve cero filas. La UI nunca es la que decide.
 */

export async function periodos(): Promise<Periodo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("periodos")
    .select("*")
    .order("anio", { ascending: false })
    .order("mes", { ascending: false });
  return (data as Periodo[]) ?? [];
}

export async function periodoVigente(): Promise<Periodo | null> {
  const lista = await periodos();
  return lista.find((p) => p.cerrado) ?? lista[0] ?? null;
}

export async function vendedores(): Promise<Perfil[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("activo", true)
    .order("nombre_corto");
  return (data as Perfil[]) ?? [];
}

export async function perfilPorId(id: string): Promise<Perfil | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  return (data as Perfil) ?? null;
}

export async function kpisDelPeriodo(
  periodoId: string,
  ventana: Ventana = "kpi_4_semanas",
): Promise<KpiVendedor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_kpi_vendedor")
    .select("*")
    .eq("periodo_id", periodoId)
    .eq("ventana", ventana)
    .order("venta_total_iva", { ascending: false });
  return (data as KpiVendedor[]) ?? [];
}

export async function kpiDe(
  vendedorId: string,
  periodoId: string,
  ventana: Ventana = "kpi_4_semanas",
): Promise<KpiVendedor | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_kpi_vendedor")
    .select("*")
    .eq("vendedor_id", vendedorId)
    .eq("periodo_id", periodoId)
    .eq("ventana", ventana)
    .maybeSingle();
  return (data as KpiVendedor) ?? null;
}

/** Histórico completo de un vendedor, del mes más reciente al más antiguo. */
export async function historicoDe(
  vendedorId: string,
  ventana: Ventana = "kpi_4_semanas",
): Promise<KpiVendedor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_kpi_vendedor")
    .select("*")
    .eq("vendedor_id", vendedorId)
    .eq("ventana", ventana)
    .order("anio", { ascending: false })
    .order("mes", { ascending: false });
  return (data as KpiVendedor[]) ?? [];
}

export async function resumenArea(periodoId: string): Promise<ResumenArea | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_resumen_area")
    .select("*")
    .eq("periodo_id", periodoId)
    .maybeSingle();
  return (data as ResumenArea) ?? null;
}

export async function benchmarks(): Promise<Record<string, Benchmark>> {
  const supabase = await createClient();
  const { data } = await supabase.from("benchmarks").select("*");
  const mapa: Record<string, Benchmark> = {};
  ((data as Benchmark[]) ?? []).forEach((b) => { mapa[b.indicador] = b; });
  return mapa;
}

export interface EvaluacionCompleta {
  evaluacion: Evaluacion;
  brecha: FilaBrecha[];
  acciones: Accion[];
}

export async function evaluacionDe(
  vendedorId: string,
  periodoId: string,
): Promise<EvaluacionCompleta | null> {
  const supabase = await createClient();
  const { data: ev } = await supabase
    .from("evaluaciones")
    .select("*")
    .eq("vendedor_id", vendedorId)
    .eq("periodo_id", periodoId)
    .maybeSingle();
  if (!ev) return null;

  const [{ data: brecha }, { data: acciones }] = await Promise.all([
    supabase.from("evaluacion_brecha").select("*").eq("evaluacion_id", ev.id).order("orden"),
    supabase.from("acciones").select("*").eq("evaluacion_id", ev.id).order("orden"),
  ]);

  return {
    evaluacion: ev as Evaluacion,
    brecha: (brecha as FilaBrecha[]) ?? [],
    acciones: (acciones as Accion[]) ?? [],
  };
}

export async function contextoMercado(periodoId: string): Promise<ContextoMercado[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contexto_mercado")
    .select("*")
    .or(`periodo_id.eq.${periodoId},periodo_id.is.null`)
    .order("id");
  return (data as ContextoMercado[]) ?? [];
}

export interface DealPorRevisar {
  hubspot_id: string;
  nombre: string | null;
  owner_nombre_raw: string | null;
  vendedor_id: string | null;
  vendedor: string;
  monto_sin_iva: number | null;
  monto_con_iva: number | null;
  etapa: string | null;
  fecha_cierre: string | null;
  periodo_id: string | null;
  flags: string[];
  es_division: boolean;
}

export async function dealsPorRevisar(periodoId?: string, vendedorId?: string): Promise<DealPorRevisar[]> {
  const supabase = await createClient();
  let q = supabase.from("v_deals_por_revisar").select("*").limit(500);
  if (periodoId) q = q.eq("periodo_id", periodoId);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q;
  return (data as DealPorRevisar[]) ?? [];
}

export interface FilaIngesta {
  id: number;
  tipo: string;
  periodo_id: string | null;
  archivo_nombre: string | null;
  estatus: string;
  filas_leidas: number;
  filas_ok: number;
  filas_sanitizadas: number;
  filas_rechazadas: number;
  iniciado_en: string;
  terminado_en: string | null;
  error: string | null;
}

export async function ultimasIngestas(limite = 15): Promise<FilaIngesta[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ingestas")
    .select("*")
    .order("iniciado_en", { ascending: false })
    .limit(limite);
  return (data as FilaIngesta[]) ?? [];
}

/* ------------------------------------------------------------------ */
/* Analítica extendida: tareas, embudo, motivos de pérdida, estancados */
/* ------------------------------------------------------------------ */

export interface TareaAbierta {
  hubspot_id: string;
  asunto: string | null;
  fecha: string | null;
  vendedor_id: string | null;
  atrasada: boolean;
}

/** Tareas de HubSpot sin terminar (NOT_STARTED y cualquier estado que no sea COMPLETED). */
export async function tareasAbiertas(vendedorId?: string): Promise<TareaAbierta[]> {
  const supabase = await createClient();
  let q = supabase
    .from("hubspot_engagements")
    .select("hubspot_id, asunto, fecha, vendedor_id, estado")
    .eq("tipo", "task")
    .or("estado.neq.COMPLETED,estado.is.null");
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.order("fecha", { ascending: true }).limit(1000);

  const hoy = new Date().toISOString();
  return ((data as Array<{ hubspot_id: string; asunto: string | null; fecha: string | null; vendedor_id: string | null }>) ?? [])
    .map((t) => ({ ...t, atrasada: t.fecha != null && t.fecha < hoy }));
}

export interface FilaEtapaActual {
  hubspot_id: string;
  etapa_actual: string;
  fecha_ultimo_cambio: string;
  periodo_id: string | null;
  vendedor_id: string | null;
  nombre: string | null;
  monto_con_iva: number | null;
  cerrado_ganado: boolean | null;
}

/** Etapa vigente de cada deal del periodo (v_deal_etapa_actual, migración 010) — base del embudo y de negocios estancados. */
export async function etapaActualDeals(periodoId: string, vendedorId?: string): Promise<FilaEtapaActual[]> {
  const supabase = await createClient();
  let q = supabase.from("v_deal_etapa_actual").select("*").eq("periodo_id", periodoId);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(2000);
  return (data as FilaEtapaActual[]) ?? [];
}

export interface DealEstancado {
  hubspot_id: string;
  nombre: string | null;
  monto_con_iva: number | null;
  empresa: string | null;
  etapa_actual: string;
  vendedor_id: string | null;
  dias_sin_actividad: number;
}

/**
 * Negocios en una etapa ABIERTA del pipeline (no Ganado/Perdido, decidido
 * por la etapa vigente vía pipeline-etapas.ts) sin actividad real -- nota,
 * correo, llamada, tarea o reunión, lo que sea más reciente -- en
 * `diasUmbral` días o más. Antes filtraba por hubspot_deals.cerrado_ganado,
 * que puede quedar desactualizado si el negocio se reactivó después del
 * último sync de deals; por eso siempre daba 0 resultados.
 */
export async function dealsEstancados(periodoId: string, vendedorId?: string, diasUmbral = 7): Promise<DealEstancado[]> {
  const supabase = await createClient();
  let q = supabase.from("v_deal_actividad").select("*").eq("periodo_id", periodoId);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(2000);

  const ahora = Date.now();
  return ((data as Array<{
    hubspot_id: string; nombre: string | null; monto_con_iva: number | null; empresa: string | null;
    etapa_actual: string; vendedor_id: string | null; fecha_ultima_actividad: string;
  }>) ?? [])
    .filter((f) => etapaInfo(f.etapa_actual)?.resultado === "abierto")
    .map((f) => ({
      hubspot_id: f.hubspot_id,
      nombre: f.nombre,
      monto_con_iva: f.monto_con_iva,
      empresa: f.empresa,
      etapa_actual: f.etapa_actual,
      vendedor_id: f.vendedor_id,
      dias_sin_actividad: Math.floor((ahora - new Date(f.fecha_ultima_actividad).getTime()) / 86_400_000),
    }))
    .filter((f) => f.dias_sin_actividad >= diasUmbral)
    .sort((a, b) => b.dias_sin_actividad - a.dias_sin_actividad);
}

export interface AccionPrioritaria {
  hubspot_id: string;
  asunto: string | null;
  fecha: string | null;
  vendedor_id: string | null;
  deal_nombre: string | null;
  deal_monto_con_iva: number | null;
  empresa: string | null;
  correo_cliente: string | null;
}

/** Top N tareas vencidas, ordenadas por el monto del deal asociado -- no por antigüedad. */
export async function accionesPrioritarias(vendedorId?: string, limite = 5): Promise<AccionPrioritaria[]> {
  const supabase = await createClient();
  let q = supabase
    .from("hubspot_engagements")
    .select("hubspot_id, asunto, fecha, vendedor_id, deal_id_ref")
    .eq("tipo", "task")
    .or("estado.neq.COMPLETED,estado.is.null")
    .not("deal_id_ref", "is", null);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(1000);

  const hoy = new Date().toISOString();
  type FilaTarea = { hubspot_id: string; asunto: string | null; fecha: string | null; vendedor_id: string | null; deal_id_ref: string };
  const vencidas = ((data as FilaTarea[]) ?? []).filter((t) => t.fecha != null && t.fecha < hoy);
  if (vencidas.length === 0) return [];

  const dealIds = [...new Set(vencidas.map((t) => t.deal_id_ref))];
  const [{ data: deals }, { data: mondayRows }] = await Promise.all([
    supabase.from("hubspot_deals").select("hubspot_id, nombre, monto_con_iva").in("hubspot_id", dealIds),
    supabase.from("monday_cierres").select("hubspot_id, empresa, correo_cliente").in("hubspot_id", dealIds),
  ]);
  const mapaDeals = new Map((deals as Array<{ hubspot_id: string; nombre: string | null; monto_con_iva: number | null }> ?? []).map((d) => [d.hubspot_id, d]));
  const mapaMonday = new Map((mondayRows as Array<{ hubspot_id: string; empresa: string | null; correo_cliente: string | null }> ?? []).map((m) => [m.hubspot_id, m]));

  return vencidas
    .map((t) => {
      const deal = mapaDeals.get(t.deal_id_ref);
      const monday = mapaMonday.get(t.deal_id_ref);
      return {
        hubspot_id: t.hubspot_id,
        asunto: t.asunto,
        fecha: t.fecha,
        vendedor_id: t.vendedor_id,
        deal_nombre: deal?.nombre ?? null,
        deal_monto_con_iva: deal?.monto_con_iva ?? null,
        empresa: monday?.empresa ?? null,
        correo_cliente: monday?.correo_cliente ?? null,
      };
    })
    .sort((a, b) => (b.deal_monto_con_iva ?? 0) - (a.deal_monto_con_iva ?? 0))
    .slice(0, limite);
}

export interface VentaProducto {
  hubspot_id: string;
  vendedor_id: string | null;
  empresa: string | null;
  correo_cliente: string | null;
  productos: string | null;
  monto_con_iva: number | null;
}

/** Negocios ganados del periodo con su empresa/producto de Monday, para el desglose por vendedor. */
export async function ventasConProducto(periodoId: string, vendedorId?: string): Promise<VentaProducto[]> {
  const supabase = await createClient();
  let q = supabase
    .from("v_deals_operativo")
    .select("hubspot_id, vendedor_id, empresa, correo_cliente, productos, monto_atribuido_con_iva")
    .eq("periodo_id", periodoId)
    .eq("cerrado_ganado", true);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(1000);

  return ((data as Array<{
    hubspot_id: string; vendedor_id: string | null; empresa: string | null;
    correo_cliente: string | null; productos: string | null; monto_atribuido_con_iva: number | null;
  }>) ?? []).map((r) => ({
    hubspot_id: r.hubspot_id,
    vendedor_id: r.vendedor_id,
    empresa: r.empresa,
    correo_cliente: r.correo_cliente,
    productos: r.productos,
    monto_con_iva: r.monto_atribuido_con_iva,
  }));
}

export interface MotivoPerdida {
  categoria_perdida: string;
  deals: number;
  monto_sin_iva: number;
}

/** Desglose de motivos de pérdida (catálogo real de hubspot_deals.categoria_perdida, no inventado). */
export async function motivosPerdida(periodoId: string, vendedorId?: string): Promise<MotivoPerdida[]> {
  const supabase = await createClient();
  let q = supabase
    .from("hubspot_deals")
    .select("categoria_perdida, monto_sin_iva")
    .eq("periodo_id", periodoId)
    .eq("cerrado_ganado", false)
    .not("categoria_perdida", "is", null);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(2000);

  const mapa = new Map<string, { deals: number; monto: number }>();
  for (const r of (data as Array<{ categoria_perdida: string; monto_sin_iva: number | null }>) ?? []) {
    const cur = mapa.get(r.categoria_perdida) ?? { deals: 0, monto: 0 };
    cur.deals += 1;
    cur.monto += r.monto_sin_iva ?? 0;
    mapa.set(r.categoria_perdida, cur);
  }
  return [...mapa.entries()]
    .map(([categoria_perdida, v]) => ({ categoria_perdida, deals: v.deals, monto_sin_iva: v.monto }))
    .sort((a, b) => b.deals - a.deals);
}

export interface ResumenOperativoMonday {
  porTipoNegocio: Array<{ tipo: string; deals: number; monto_con_iva: number }>;
  porCanal: Array<{ canal: string; deals: number; monto_con_iva: number }>;
}

/**
 * Tipo de negocio (existente/nuevo, respaldado por Monday cuando HubSpot no
 * lo trae) y canal de origen (como_llego), ambos desde v_deals_operativo.
 * OJO: en la vista grupal (sin vendedor), un deal dividido entre dos
 * personas aporta 2 filas — el monto suma correcto (ya viene repartido),
 * pero el conteo de "deals" para esos casos cuenta la operación dos veces.
 */
export async function resumenOperativoMonday(periodoId: string, vendedorId?: string): Promise<ResumenOperativoMonday> {
  const supabase = await createClient();
  let q = supabase
    .from("v_deals_operativo")
    .select("tipo_negocio, como_llego, monto_atribuido_con_iva")
    .eq("periodo_id", periodoId);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(2000);

  const porTipoMapa = new Map<string, { deals: number; monto: number }>();
  const porCanalMapa = new Map<string, { deals: number; monto: number }>();

  for (const r of (data as Array<{ tipo_negocio: string | null; como_llego: string | null; monto_atribuido_con_iva: number | null }>) ?? []) {
    const tipo = r.tipo_negocio ?? "por_revisar";
    const t = porTipoMapa.get(tipo) ?? { deals: 0, monto: 0 };
    t.deals += 1;
    t.monto += r.monto_atribuido_con_iva ?? 0;
    porTipoMapa.set(tipo, t);

    if (r.como_llego) {
      const c = porCanalMapa.get(r.como_llego) ?? { deals: 0, monto: 0 };
      c.deals += 1;
      c.monto += r.monto_atribuido_con_iva ?? 0;
      porCanalMapa.set(r.como_llego, c);
    }
  }

  return {
    porTipoNegocio: [...porTipoMapa.entries()].map(([tipo, v]) => ({ tipo, deals: v.deals, monto_con_iva: v.monto })),
    porCanal: [...porCanalMapa.entries()]
      .map(([canal, v]) => ({ canal, deals: v.deals, monto_con_iva: v.monto }))
      .sort((a, b) => b.monto_con_iva - a.monto_con_iva),
  };
}
