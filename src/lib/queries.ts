import { createClient } from "./supabase/server";
import { etapaInfo, nombreEtapa, ETAPAS_PIPELINE } from "./pipeline-etapas";
import { dinero, pct } from "./format";
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
  /** Empresa/correo/producto/canal -- capturados en Monday, casi siempre vacíos si el negocio marcado sigue abierto (Monday solo registra tratos GANADOS). */
  empresa: string | null;
  correo_cliente: string | null;
  productos: string | null;
  canal: string | null;
}

/**
 * Acumulativo a propósito -- NO se filtra por periodo_id: un negocio con
 * datos incompletos capturado en un mes anterior sigue pendiente de
 * corregir hoy, sin importar en qué mes se creó.
 */
export async function dealsPorRevisar(vendedorId?: string): Promise<DealPorRevisar[]> {
  const supabase = await createClient();
  let q = supabase.from("v_deals_por_revisar").select("*").limit(500);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q;
  const filas = (data as Array<Omit<DealPorRevisar, "empresa" | "correo_cliente" | "productos" | "canal">>) ?? [];
  if (filas.length === 0) return [];

  const [{ data: mondayRows }, mapaCorreoContacto] = await Promise.all([
    supabase.from("monday_cierres").select("hubspot_id, empresa, correo_cliente, productos, como_llego")
      .in("hubspot_id", filas.map((f) => f.hubspot_id)),
    correoDeContactoPorDeal(supabase, filas.map((f) => f.hubspot_id)),
  ]);
  const mapaMonday = new Map((
    (mondayRows as Array<{ hubspot_id: string; empresa: string | null; correo_cliente: string | null; productos: string | null; como_llego: string | null }>) ?? []
  ).map((m) => [m.hubspot_id, m]));

  return filas.map((f) => {
    const monday = mapaMonday.get(f.hubspot_id);
    return {
      ...f,
      empresa: monday?.empresa ?? null,
      correo_cliente: mapaCorreoContacto.get(f.hubspot_id) ?? monday?.correo_cliente ?? null,
      productos: monday?.productos ?? null,
      canal: monday?.como_llego ?? null,
    };
  });
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

/**
 * Email del PRIMER contacto asociado a cada negocio
 * (hubspot_deals.contacto_ids), resuelto contra hubspot_contacts --
 * HubSpot no expone el correo como propiedad del Deal, solo como
 * asociación a Contacto (ingestado aparte, ver escribirContactos() en
 * cargar.ts). Devuelve un mapa hubspot_id -> email; los negocios sin
 * ningún contacto asociado, o cuyo contacto no tiene email capturado,
 * simplemente no aparecen en el mapa.
 */
async function correoDeContactoPorDeal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hubspotIds: string[],
): Promise<Map<string, string | null>> {
  if (hubspotIds.length === 0) return new Map();

  const { data: dealsConContacto } = await supabase
    .from("hubspot_deals").select("hubspot_id, contacto_ids").in("hubspot_id", hubspotIds);
  const filas = (dealsConContacto as Array<{ hubspot_id: string; contacto_ids: string[] }>) ?? [];

  const idsContacto = [...new Set(filas.flatMap((f) => f.contacto_ids ?? []))];
  if (idsContacto.length === 0) return new Map();

  const { data: contactos } = await supabase.from("hubspot_contacts").select("hubspot_id, email").in("hubspot_id", idsContacto);
  const mapaEmail = new Map(((contactos as Array<{ hubspot_id: string; email: string | null }>) ?? []).map((c) => [c.hubspot_id, c.email]));

  const porDeal = new Map<string, string | null>();
  for (const f of filas) {
    const primerContacto = (f.contacto_ids ?? [])[0];
    if (primerContacto) porDeal.set(f.hubspot_id, mapaEmail.get(primerContacto) ?? null);
  }
  return porDeal;
}

export interface DealEstancado {
  hubspot_id: string;
  nombre: string | null;
  monto_con_iva: number | null;
  empresa: string | null;
  correo_cliente: string | null;
  productos: string | null;
  canal: string | null;
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
 *
 * Acumulativo a propósito -- NO se filtra por periodo_id: un negocio abierto
 * que viene arrastrándose desde un mes anterior sigue siendo un foco rojo
 * hoy, sin importar en qué mes se creó.
 */
export async function dealsEstancados(vendedorId?: string, diasUmbral = 7): Promise<DealEstancado[]> {
  const supabase = await createClient();
  let q = supabase.from("v_deal_actividad").select("*");
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(2000);

  const ahora = Date.now();
  const candidatos = ((data as Array<{
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

  if (candidatos.length === 0) return [];

  // Producto/canal solo existen en Monday (casi nunca tiene fila para un
  // negocio TODAVÍA abierto, pero se cruza por si acaso). El correo
  // prioriza el Contacto real de HubSpot -- Monday es el respaldo.
  const [{ data: mondayRows }, mapaCorreoContacto] = await Promise.all([
    supabase.from("monday_cierres").select("hubspot_id, correo_cliente, productos, como_llego")
      .in("hubspot_id", candidatos.map((f) => f.hubspot_id)),
    correoDeContactoPorDeal(supabase, candidatos.map((f) => f.hubspot_id)),
  ]);
  const mapaMonday = new Map((
    (mondayRows as Array<{ hubspot_id: string; correo_cliente: string | null; productos: string | null; como_llego: string | null }>) ?? []
  ).map((m) => [m.hubspot_id, m]));

  return candidatos.map((f) => {
    const monday = mapaMonday.get(f.hubspot_id);
    return {
      ...f,
      correo_cliente: mapaCorreoContacto.get(f.hubspot_id) ?? monday?.correo_cliente ?? null,
      productos: monday?.productos ?? null,
      canal: monday?.como_llego ?? null,
    };
  });
}

export interface AccionPrioritaria {
  tipo: "tarea_vencida" | "negocio_estancado";
  hubspot_id: string;
  asunto: string | null;
  fecha: string | null;
  vendedor_id: string | null;
  deal_nombre: string | null;
  deal_monto_con_iva: number | null;
  /** Enriquecimiento opcional de Monday -- nunca la fuente de la acción en sí, eso siempre sale de HubSpot. */
  empresa: string | null;
  correo_cliente: string | null;
}

/**
 * Top N acciones del día, 100% derivadas de HubSpot (tareas de
 * hubspot_engagements + negocios estancados de v_deal_actividad) — Monday
 * solo enriquece con empresa/correo cuando hay match, nunca es la fuente.
 * Se combinan dos tipos de acción y se ordenan juntas por el monto del
 * negocio en riesgo:
 *   - tarea_vencida: tareas de HubSpot sin completar, ya vencidas.
 *   - negocio_estancado: negocios en etapa activa sin actividad real hace
 *     30+ días (umbral más estricto que el de "Focos rojos", pensado para
 *     esta lista corta de prioridades).
 */
export async function accionesPrioritarias(vendedorId?: string, limite = 4): Promise<AccionPrioritaria[]> {
  const supabase = await createClient();

  let qTareas = supabase
    .from("hubspot_engagements")
    .select("hubspot_id, asunto, fecha, vendedor_id, deal_id_ref")
    .eq("tipo", "task")
    .or("estado.neq.COMPLETED,estado.is.null")
    .not("deal_id_ref", "is", null);
  if (vendedorId) qTareas = qTareas.eq("vendedor_id", vendedorId);

  const [{ data: tareasData }, estancados] = await Promise.all([
    qTareas.limit(1000),
    dealsEstancados(vendedorId, 30),
  ]);

  const hoy = new Date().toISOString();
  type FilaTarea = { hubspot_id: string; asunto: string | null; fecha: string | null; vendedor_id: string | null; deal_id_ref: string };
  const vencidas = ((tareasData as FilaTarea[]) ?? []).filter((t) => t.fecha != null && t.fecha < hoy);

  const dealIds = [...new Set(vencidas.map((t) => t.deal_id_ref))];
  const [{ data: deals }, { data: mondayRows }, mapaCorreoContacto] = dealIds.length > 0
    ? await Promise.all([
        supabase.from("hubspot_deals").select("hubspot_id, nombre, monto_con_iva").in("hubspot_id", dealIds),
        supabase.from("monday_cierres").select("hubspot_id, empresa, correo_cliente").in("hubspot_id", dealIds),
        correoDeContactoPorDeal(supabase, dealIds),
      ])
    : [{ data: [] }, { data: [] }, new Map<string, string | null>()];
  const mapaDeals = new Map((deals as Array<{ hubspot_id: string; nombre: string | null; monto_con_iva: number | null }> ?? []).map((d) => [d.hubspot_id, d]));
  const mapaMonday = new Map((mondayRows as Array<{ hubspot_id: string; empresa: string | null; correo_cliente: string | null }> ?? []).map((m) => [m.hubspot_id, m]));

  const accionesTareas: AccionPrioritaria[] = vencidas.map((t) => {
    const deal = mapaDeals.get(t.deal_id_ref);
    const monday = mapaMonday.get(t.deal_id_ref);
    return {
      tipo: "tarea_vencida",
      hubspot_id: t.hubspot_id,
      asunto: t.asunto,
      fecha: t.fecha,
      vendedor_id: t.vendedor_id,
      deal_nombre: deal?.nombre ?? null,
      deal_monto_con_iva: deal?.monto_con_iva ?? null,
      empresa: monday?.empresa ?? null,
      correo_cliente: mapaCorreoContacto.get(t.deal_id_ref) ?? monday?.correo_cliente ?? null,
    };
  });

  // dealsEstancados() ya resuelve correo_cliente con la misma cascada
  // (Contacto de HubSpot -> Monday) -- no había razón para descartarlo aquí.
  const accionesEstancados: AccionPrioritaria[] = estancados.map((e) => ({
    tipo: "negocio_estancado",
    hubspot_id: e.hubspot_id,
    asunto: `${e.dias_sin_actividad} días sin actividad en "${nombreEtapa(e.etapa_actual)}"`,
    fecha: null,
    vendedor_id: e.vendedor_id,
    deal_nombre: e.nombre,
    deal_monto_con_iva: e.monto_con_iva,
    empresa: e.empresa,
    correo_cliente: e.correo_cliente,
  }));

  return [...accionesTareas, ...accionesEstancados]
    .sort((a, b) => (b.deal_monto_con_iva ?? 0) - (a.deal_monto_con_iva ?? 0))
    .slice(0, limite);
}

export interface VentaProducto {
  hubspot_id: string;
  vendedor_id: string | null;
  nombre_deal: string | null;
  empresa: string | null;
  correo_cliente: string | null;
  productos: string | null;
  canal: string | null;
  monto_sin_iva: number | null;
  monto_con_iva: number | null;
}

/**
 * Negocios ganados del periodo con empresa/producto/canal de Monday, para
 * el desglose por vendedor. Incluye el nombre del deal (HubSpot) como
 * respaldo de despliegue: si `empresa` viene vacía en Monday, la UI NUNCA
 * debe caer al nombre de un vendedor -- usa el nombre del deal en su lugar.
 *
 * El monto que captura Monday (`monto_atribuido_con_iva` en la vista, pese
 * al nombre de la columna) es SIN IVA -- confirmado contra el tablero real
 * (Mar: $241,460 capturado en Monday vs. $280,094 con IVA). Aquí se
 * exponen ambos valores por separado en vez de mostrar uno solo con una
 * etiqueta que no le corresponde.
 *
 * Blindaje de aislamiento: además del filtro por periodo_id, se cruza
 * contra hubspot_deals.fecha_cierre real y se descarta cualquier fila cuya
 * fecha caiga fuera del mes calendario del periodo -- red de seguridad por
 * si periodo_id llegara a desalinearse otra vez (como pasó con la ventana
 * KPI vieja). No se hardcodea ningún mes: usa el rango real del periodoId
 * que se pida, así que funciona igual para julio, agosto o septiembre.
 */
export async function ventasConProducto(periodoId: string, vendedorId?: string): Promise<VentaProducto[]> {
  const supabase = await createClient();
  let q = supabase
    .from("v_deals_operativo")
    .select("hubspot_id, vendedor_id, empresa, correo_cliente, productos, como_llego, monto_atribuido_con_iva")
    .eq("periodo_id", periodoId)
    .eq("cerrado_ganado", true);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(1000);
  let filas = (data as Array<{
    hubspot_id: string; vendedor_id: string | null; empresa: string | null; correo_cliente: string | null;
    productos: string | null; como_llego: string | null; monto_atribuido_con_iva: number | null;
  }>) ?? [];
  if (filas.length === 0) return [];

  const idGanado = ETAPAS_PIPELINE.find((e) => e.resultado === "ganado")?.id ?? null;
  const { data: periodoRow } = await supabase.from("periodos").select("cal_inicio, cal_fin").eq("id", periodoId).maybeSingle();
  if (periodoRow) {
    const { data: fechas } = await supabase
      .from("hubspot_deals").select("hubspot_id, fecha_cierre, etapa").in("hubspot_id", filas.map((f) => f.hubspot_id));
    const mapaDeal = new Map(((fechas as Array<{ hubspot_id: string; fecha_cierre: string | null; etapa: string | null }>) ?? []).map((f) => [f.hubspot_id, f]));
    filas = filas.filter((f) => {
      const d = mapaDeal.get(f.hubspot_id);
      if (!d?.fecha_cierre) return false;
      if (idGanado && d.etapa !== idGanado) return false;
      const soloFecha = d.fecha_cierre.slice(0, 10);
      return soloFecha >= periodoRow.cal_inicio && soloFecha <= periodoRow.cal_fin;
    });
  }
  if (filas.length === 0) return [];

  // Con un vendedor filtrado, el mismo hubspot_id no debería repetirse --
  // una venta dividida real usa un vendedor_id DISTINTO por fila (eso ya lo
  // descarta el filtro de arriba). Si el mismo trato aparece dos veces bajo
  // el MISMO vendedor, es una fila de Monday duplicada (error de captura),
  // no una división -- se queda con la de mayor monto.
  if (vendedorId) {
    const porDeal = new Map<string, (typeof filas)[number]>();
    for (const f of filas) {
      const actual = porDeal.get(f.hubspot_id);
      if (!actual || (f.monto_atribuido_con_iva ?? 0) > (actual.monto_atribuido_con_iva ?? 0)) {
        porDeal.set(f.hubspot_id, f);
      }
    }
    filas = [...porDeal.values()];
  }

  const nombres = await porLotes([...new Set(filas.map((f) => f.hubspot_id))], 200, async (lote) => {
    const { data } = await supabase.from("hubspot_deals").select("hubspot_id, nombre").in("hubspot_id", lote);
    return (data as Array<{ hubspot_id: string; nombre: string | null }>) ?? [];
  });
  const mapaNombres = new Map(nombres.map((n) => [n.hubspot_id, n.nombre]));

  return filas.map((r) => ({
    hubspot_id: r.hubspot_id,
    vendedor_id: r.vendedor_id,
    nombre_deal: mapaNombres.get(r.hubspot_id) ?? null,
    empresa: r.empresa,
    correo_cliente: r.correo_cliente,
    productos: r.productos,
    canal: r.como_llego,
    monto_sin_iva: r.monto_atribuido_con_iva,
    monto_con_iva: r.monto_atribuido_con_iva == null ? null : Math.round(r.monto_atribuido_con_iva * 1.16 * 100) / 100,
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
  /** Cuántos negocios GANADOS del periodo no tienen NINGUNA fila en Monday (para contexto, no para el desglose en sí). */
  sinRegistroMonday: number;
  totalDeals: number;
}

const CANALES_CARTERA_EXISTENTE = new Set(["contacto existente", "remarketing"]);

/**
 * Tipo de negocio y canal de origen, **solo de los negocios que sí están
 * registrados en Monday** — esta tarjeta responde "¿cómo se clasifican los
 * negocios que Monday capturó?", no "¿qué % de todo el pipeline de HubSpot
 * tiene Monday?" (esa segunda pregunta la responde la alerta de auditoría
 * "ganado_sin_monday"). Por diseño de Monday (solo trackea ganados), el
 * universo aquí es angosto -- eso es correcto, no un defecto de esta tarjeta.
 *
 * Regla de clasificación (confirmada 2026-09-06 contra capturas reales del
 * tablero): "Contacto existente" y "Remarketing" = cartera existente;
 * cualquier otro canal capturado (WhatsApp, Instagram, Recomendación,
 * Photo AI, Llamada, Equipo comercial, Ads...) = cliente nuevo. Las pocas
 * filas de Monday sin canal capturado (ver alerta "monday_sin_canal") caen
 * en "sin_canal" -- no se inventa existente/nuevo para ellas.
 *
 * OJO: en la vista grupal (sin vendedor), un deal dividido entre dos
 * personas aporta 2 filas — el monto suma correcto (ya viene repartido),
 * pero el conteo de "deals" para esos casos cuenta la operación dos veces.
 */
export async function resumenOperativoMonday(periodoId: string, vendedorId?: string): Promise<ResumenOperativoMonday> {
  const supabase = await createClient();
  let q = supabase
    .from("v_deals_operativo")
    .select("como_llego, monto_atribuido_con_iva, monday_elemento_id, cerrado_ganado")
    .eq("periodo_id", periodoId);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(2000);

  const todas = (data as Array<{
    como_llego: string | null; monto_atribuido_con_iva: number | null;
    monday_elemento_id: string | null; cerrado_ganado: boolean | null;
  }>) ?? [];

  const sinRegistroMonday = todas.filter((r) => r.cerrado_ganado && !r.monday_elemento_id).length;
  const filas = todas.filter((r) => r.monday_elemento_id);

  const porTipoMapa = new Map<string, { deals: number; monto: number }>();
  const porCanalMapa = new Map<string, { deals: number; monto: number }>();

  for (const r of filas) {
    const tipo = r.como_llego
      ? (CANALES_CARTERA_EXISTENTE.has(r.como_llego.trim().toLowerCase()) ? "existente" : "nuevo")
      : "sin_canal";
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
    sinRegistroMonday,
    totalDeals: filas.length,
  };
}

/* ------------------------------------------------------------------ */
/* Alertas de higiene y auditoría comercial (HubSpot vs. Monday)        */
/* ------------------------------------------------------------------ */

export interface AlertaAuditoria {
  tipo: "ganado_sin_monday" | "monday_sin_canal" | "sin_atencion";
  hubspot_id: string;
  vendedor_id: string | null;
  nombre: string | null;
  monto_con_iva: number | null;
  mensaje: string;
  /** Empresa/correo/producto/canal -- capturados en Monday, casi siempre vacíos para negocios abiertos (Monday solo registra tratos GANADOS). */
  empresa: string | null;
  correo_cliente: string | null;
  productos: string | null;
  canal: string | null;
}

/** Negocios ganados en HubSpot que nunca se registraron en el tablero de Monday. */
async function ganadosSinMonday(
  supabase: Awaited<ReturnType<typeof createClient>>, periodoId: string, vendedorId: string | undefined,
  mapaVendedores: Map<string, string>,
): Promise<AlertaAuditoria[]> {
  let q = supabase.from("hubspot_deals")
    .select("hubspot_id, nombre, monto_con_iva, vendedor_id")
    .eq("periodo_id", periodoId)
    .eq("cerrado_ganado", true);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data: ganados } = await q.limit(1000);
  const filas = (ganados as Array<{ hubspot_id: string; nombre: string | null; monto_con_iva: number | null; vendedor_id: string | null }>) ?? [];
  if (filas.length === 0) return [];

  const ids = filas.map((d) => d.hubspot_id);
  const { data: enMonday } = await supabase.from("monday_cierres").select("hubspot_id").in("hubspot_id", ids);
  const registrados = new Set(((enMonday as Array<{ hubspot_id: string }>) ?? []).map((m) => m.hubspot_id));

  return filas
    .filter((d) => !registrados.has(d.hubspot_id))
    .map((d) => {
      const vendedor = d.vendedor_id ? mapaVendedores.get(d.vendedor_id) ?? "Sin asignar" : "Sin asignar";
      const negocio = d.nombre ?? `#${d.hubspot_id}`;
      return {
        tipo: "ganado_sin_monday" as const,
        hubspot_id: d.hubspot_id,
        vendedor_id: d.vendedor_id,
        nombre: d.nombre,
        monto_con_iva: d.monto_con_iva,
        mensaje: `${vendedor}: el trato "${negocio}" por ${dinero(d.monto_con_iva)} no ha sido cargado a Monday.`,
        // Sin fila en Monday todavía -- por eso está en esta alerta. No hay empresa/correo/producto/canal que mostrar hasta que se capture.
        empresa: null,
        correo_cliente: null,
        productos: null,
        canal: null,
      };
    });
}

/** Negocios que sí están en Monday pero sin la columna "¿Cómo llegó?" capturada. */
async function mondaySinCanal(
  supabase: Awaited<ReturnType<typeof createClient>>, periodoId: string, vendedorId: string | undefined,
  mapaVendedores: Map<string, string>,
): Promise<AlertaAuditoria[]> {
  let q = supabase.from("v_deals_operativo")
    .select("hubspot_id, vendedor_id, empresa, correo_cliente, productos, monto_atribuido_con_iva, monday_elemento_id, como_llego")
    .eq("periodo_id", periodoId)
    .not("monday_elemento_id", "is", null)
    .is("como_llego", null);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(1000);

  return ((data as Array<{
    hubspot_id: string; vendedor_id: string | null; empresa: string | null; correo_cliente: string | null;
    productos: string | null; monto_atribuido_con_iva: number | null;
  }>) ?? []).map((r) => {
    const vendedor = r.vendedor_id ? mapaVendedores.get(r.vendedor_id) ?? "Sin asignar" : "Sin asignar";
    const empresa = r.empresa ?? `#${r.hubspot_id}`;
    return {
      tipo: "monday_sin_canal" as const,
      hubspot_id: r.hubspot_id,
      vendedor_id: r.vendedor_id,
      nombre: r.empresa,
      monto_con_iva: r.monto_atribuido_con_iva,
      mensaje: `${vendedor}: el registro de "${empresa}" en Monday no tiene definido el canal ("¿Cómo llegó?").`,
      empresa: r.empresa,
      correo_cliente: r.correo_cliente,
      productos: r.productos,
      // Justo lo que falta -- por diseño null en esta alerta específica.
      canal: null,
    };
  });
}

/**
 * Negocios abiertos en etapa activa sin NINGUNA nota/llamada/tarea/reunión
 * real en `diasUmbral` días -- un cambio de etapa no cuenta como atención.
 * Acumulativo a propósito -- NO se filtra por periodo_id: un negocio
 * abandonado desde un mes anterior sigue siendo urgente hoy.
 */
async function sinAtencion(
  supabase: Awaited<ReturnType<typeof createClient>>, vendedorId: string | undefined,
  mapaVendedores: Map<string, string>, diasUmbral: number,
): Promise<AlertaAuditoria[]> {
  let q = supabase.from("v_deal_actividad").select("*");
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(2000);

  const filasBase = (data as Array<{
    hubspot_id: string; nombre: string | null; monto_con_iva: number | null; empresa: string | null;
    etapa_actual: string; vendedor_id: string | null; ultima_actividad_engagement: string | null;
  }>) ?? [];

  const ahora = Date.now();
  const candidatos = filasBase
    .filter((f) => etapaInfo(f.etapa_actual)?.resultado === "abierto")
    .map((f) => {
      // Sin ninguna actividad jamás: se ordena como "el más urgente de todos", pero como un
      // número finito, no Infinity -- restar dos Infinity da NaN y descompone el sort.
      const dias = f.ultima_actividad_engagement == null
        ? Number.MAX_SAFE_INTEGER
        : Math.floor((ahora - new Date(f.ultima_actividad_engagement).getTime()) / 86_400_000);
      return { ...f, dias };
    })
    .filter((f) => f.dias >= diasUmbral)
    .sort((a, b) => b.dias - a.dias);

  if (candidatos.length === 0) return [];

  // Producto/canal solo existen en Monday (casi nunca tiene fila para un
  // negocio TODAVÍA abierto, pero se cruza por si acaso). El correo
  // prioriza el Contacto real de HubSpot -- Monday es el respaldo.
  const [{ data: mondayRows }, mapaCorreoContacto] = await Promise.all([
    supabase.from("monday_cierres").select("hubspot_id, correo_cliente, productos, como_llego")
      .in("hubspot_id", candidatos.map((f) => f.hubspot_id)),
    correoDeContactoPorDeal(supabase, candidatos.map((f) => f.hubspot_id)),
  ]);
  const mapaMonday = new Map((
    (mondayRows as Array<{ hubspot_id: string; correo_cliente: string | null; productos: string | null; como_llego: string | null }>) ?? []
  ).map((m) => [m.hubspot_id, m]));

  return candidatos.map((f) => {
    const vendedor = f.vendedor_id ? mapaVendedores.get(f.vendedor_id) ?? "Sin asignar" : "Sin asignar";
    const negocio = f.nombre ?? `#${f.hubspot_id}`;
    const diasTexto = f.dias === Number.MAX_SAFE_INTEGER ? "nunca ha tenido" : `lleva ${f.dias} días sin`;
    const monday = mapaMonday.get(f.hubspot_id);
    return {
      tipo: "sin_atencion" as const,
      hubspot_id: f.hubspot_id,
      vendedor_id: f.vendedor_id,
      nombre: f.nombre,
      monto_con_iva: f.monto_con_iva,
      mensaje: `${vendedor}: "${negocio}" ${diasTexto} ningún seguimiento o nota de atención registrada.`,
      empresa: f.empresa,
      correo_cliente: mapaCorreoContacto.get(f.hubspot_id) ?? monday?.correo_cliente ?? null,
      productos: monday?.productos ?? null,
      canal: monday?.como_llego ?? null,
    };
  });
}

/**
 * Alertas de higiene y auditoría comercial: cruza HubSpot contra Monday y
 * la actividad real registrada, para convertir huecos de captura en
 * pendientes concretos en vez de dejarlos como una métrica pasiva.
 */
export async function alertasHigiene(periodoId: string, vendedorId?: string, diasSinAtencion = 5): Promise<AlertaAuditoria[]> {
  const supabase = await createClient();
  const personas = await vendedores();
  const mapaVendedores = new Map(personas.map((p) => [p.id, p.nombre_corto]));

  const [ganados, sinCanal, abandonados] = await Promise.all([
    ganadosSinMonday(supabase, periodoId, vendedorId, mapaVendedores),
    mondaySinCanal(supabase, periodoId, vendedorId, mapaVendedores),
    sinAtencion(supabase, vendedorId, mapaVendedores, diasSinAtencion),
  ]);

  return [...ganados, ...sinCanal, ...abandonados]
    .sort((a, b) => (b.monto_con_iva ?? 0) - (a.monto_con_iva ?? 0));
}

/* ------------------------------------------------------------------ */
/* Semana pasada / próxima semana (calendario S1-S4 real, no cortes de  */
/* fecha inventados)                                                    */
/* ------------------------------------------------------------------ */

export interface RangoSemana { periodo_id: string; semana: number; inicio: string; fin: string }

/** Semana que contiene hoy, y sus vecinas -- cruza de un periodo a otro sin problema porque se ordena por fecha, no por periodo_id. */
async function semanaActualYVecinas(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ pasada: RangoSemana | null; siguiente: RangoSemana | null }> {
  const { data } = await supabase.from("periodo_semanas").select("periodo_id, semana, inicio, fin").order("inicio", { ascending: true });
  const filas = (data as RangoSemana[]) ?? [];
  const hoy = new Date().toISOString().slice(0, 10);
  const idx = filas.findIndex((f) => f.inicio <= hoy && hoy <= f.fin);
  if (idx === -1) return { pasada: null, siguiente: null };
  return { pasada: filas[idx - 1] ?? null, siguiente: filas[idx + 1] ?? null };
}

export interface ProductoSemana {
  producto: string;
  deals: number;
  monto_con_iva: number;
}

/** Productos/servicios ganados la semana pasada (fecha_cierre real de HubSpot), cruzados con el producto de Monday. */
export async function productosSemanaPasada(vendedorId?: string): Promise<{ rango: RangoSemana | null; filas: ProductoSemana[] }> {
  const supabase = await createClient();
  const { pasada } = await semanaActualYVecinas(supabase);
  if (!pasada) return { rango: null, filas: [] };

  let q = supabase.from("hubspot_deals")
    .select("hubspot_id, monto_con_iva")
    .eq("cerrado_ganado", true)
    .gte("fecha_cierre", pasada.inicio)
    .lte("fecha_cierre", `${pasada.fin}T23:59:59`);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data: deals } = await q.limit(1000);
  const filas = (deals as Array<{ hubspot_id: string; monto_con_iva: number | null }>) ?? [];
  if (filas.length === 0) return { rango: pasada, filas: [] };

  const { data: mondayRows } = await supabase.from("monday_cierres").select("hubspot_id, productos").in("hubspot_id", filas.map((d) => d.hubspot_id));
  const mapaProductos = new Map(((mondayRows as Array<{ hubspot_id: string; productos: string | null }>) ?? []).map((m) => [m.hubspot_id, m.productos]));

  const mapa = new Map<string, { deals: number; monto: number }>();
  for (const d of filas) {
    const producto = mapaProductos.get(d.hubspot_id) ?? "Sin producto capturado en Monday";
    const cur = mapa.get(producto) ?? { deals: 0, monto: 0 };
    cur.deals += 1;
    cur.monto += d.monto_con_iva ?? 0;
    mapa.set(producto, cur);
  }

  return {
    rango: pasada,
    filas: [...mapa.entries()]
      .map(([producto, v]) => ({ producto, deals: v.deals, monto_con_iva: v.monto }))
      .sort((a, b) => b.monto_con_iva - a.monto_con_iva),
  };
}

export interface DealProyectado {
  hubspot_id: string;
  nombre: string | null;
  monto_con_iva: number | null;
  vendedor_id: string | null;
  etapa_actual: string;
  fecha_cierre: string | null;
}

/** Negocios abiertos en Cotización/Seguimiento 3/4 (etapa VIGENTE, no la de hubspot_deals) con fecha de cierre estimada la próxima semana. */
export async function proyeccionProximaSemana(vendedorId?: string): Promise<{ rango: RangoSemana | null; filas: DealProyectado[] }> {
  const supabase = await createClient();
  const { siguiente } = await semanaActualYVecinas(supabase);
  if (!siguiente) return { rango: null, filas: [] };

  const ETAPAS_PROYECTABLES = ["45202792", "1310311997", "1310311998"]; // Cotización, Seguimiento 3, Seguimiento 4
  let q = supabase.from("v_deal_etapa_actual")
    .select("hubspot_id, vendedor_id, nombre, monto_con_iva, etapa_actual")
    .in("etapa_actual", ETAPAS_PROYECTABLES);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data: abiertos } = await q.limit(1000);
  const candidatos = (abiertos as Omit<DealProyectado, "fecha_cierre">[]) ?? [];
  if (candidatos.length === 0) return { rango: siguiente, filas: [] };

  const { data: deals } = await supabase.from("hubspot_deals").select("hubspot_id, fecha_cierre")
    .in("hubspot_id", candidatos.map((d) => d.hubspot_id))
    .gte("fecha_cierre", siguiente.inicio)
    .lte("fecha_cierre", `${siguiente.fin}T23:59:59`);
  const fechaPorId = new Map(((deals as Array<{ hubspot_id: string; fecha_cierre: string | null }>) ?? []).map((d) => [d.hubspot_id, d.fecha_cierre]));

  return {
    rango: siguiente,
    filas: candidatos
      .filter((d) => fechaPorId.has(d.hubspot_id))
      .map((d) => ({ ...d, fecha_cierre: fechaPorId.get(d.hubspot_id) ?? null }))
      .sort((a, b) => (b.monto_con_iva ?? 0) - (a.monto_con_iva ?? 0)),
  };
}

/* ------------------------------------------------------------------ */
/* Suite de analítica de ventas -- Mensual vs. Trimestral               */
/* ------------------------------------------------------------------ */

export type VistaTiempo = "mensual" | "trimestral";

/**
 * PostgREST manda los filtros .in(...) en el query string de un GET -- con
 * un trimestre completo (mil y pico deals) esa lista puede pasarse de largo
 * y fallar con una URL demasiado larga. Se parte en lotes chicos y se junta
 * el resultado, en vez de mandar un solo .in() con todo.
 */
async function porLotes<R>(ids: string[], tamano: number, fn: (lote: string[]) => Promise<R[]>): Promise<R[]> {
  const resultados: R[] = [];
  for (let i = 0; i < ids.length; i += tamano) {
    resultados.push(...(await fn(ids.slice(i, i + tamano))));
  }
  return resultados;
}

/**
 * Un mes -> [ese periodo]. Un trimestre -> los 3 periodos del mismo año y
 * trimestre calendario (jul-ago-sep, etc.), sin importar si el periodo
 * elegido es el primero, segundo o tercer mes de ese trimestre.
 */
async function resolverPeriodoIds(
  supabase: Awaited<ReturnType<typeof createClient>>, periodoId: string, vista: VistaTiempo,
): Promise<string[]> {
  if (vista === "mensual") return [periodoId];

  const { data: base } = await supabase.from("periodos").select("anio, mes").eq("id", periodoId).maybeSingle();
  if (!base) return [periodoId];

  const trimestre = Math.ceil(base.mes / 3);
  const mesInicio = (trimestre - 1) * 3 + 1;
  const { data } = await supabase.from("periodos").select("id")
    .eq("anio", base.anio).gte("mes", mesInicio).lte("mes", mesInicio + 2);
  const ids = ((data as Array<{ id: string }>) ?? []).map((p) => p.id);
  return ids.length > 0 ? ids : [periodoId];
}

/**
 * Traduce periodoIds (1 mes o los 3 de un trimestre) a un rango de fechas
 * real, usando la ventana kpi_4_semanas -- la misma que usa periodo_de() al
 * asignarle periodo_id a un deal en la ingesta, para que "estar en el
 * periodo" signifique lo mismo para deals que para engagements.
 */
async function resolverRangoFechas(
  supabase: Awaited<ReturnType<typeof createClient>>, periodoIds: string[],
): Promise<{ inicio: string; fin: string } | null> {
  const { data } = await supabase.from("periodos").select("kpi_inicio, kpi_fin").in("id", periodoIds);
  const filas = (data as Array<{ kpi_inicio: string; kpi_fin: string }>) ?? [];
  if (filas.length === 0) return null;
  return {
    inicio: filas.reduce((min, f) => (f.kpi_inicio < min ? f.kpi_inicio : min), filas[0].kpi_inicio),
    fin: filas.reduce((max, f) => (f.kpi_fin > max ? f.kpi_fin : max), filas[0].kpi_fin),
  };
}

export interface ActividadPorTipo { tipo: string; total: number }

/**
 * Actividades de HubSpot por tipo, del/los periodo(s) elegido(s).
 * Filtra `hubspot_engagements` directo por vendedor_id (el owner real de la
 * actividad) y por fecha -- NO por deal_id_ref. Filtrar solo por deal
 * descartaba toda actividad registrada a nivel de contacto o empresa en
 * HubSpot, que nunca llega a tener deal_id_ref: por eso vendedores con
 * cientos de interacciones reales mostraban 0 aquí.
 */
export async function actividadesPorTipo(periodoId: string, vista: VistaTiempo, vendedorId?: string): Promise<ActividadPorTipo[]> {
  const supabase = await createClient();
  const periodoIds = await resolverPeriodoIds(supabase, periodoId, vista);
  const rango = await resolverRangoFechas(supabase, periodoIds);
  if (!rango) return [];

  let q = supabase.from("hubspot_engagements").select("tipo")
    .gte("fecha", `${rango.inicio}T00:00:00`).lte("fecha", `${rango.fin}T23:59:59`);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(20_000);
  const filas = (data as Array<{ tipo: string }>) ?? [];

  const conteo = new Map<string, number>();
  for (const r of filas) conteo.set(r.tipo, (conteo.get(r.tipo) ?? 0) + 1);

  // Los tipos se guardan en minúscula en hubspot_engagements.tipo (check
  // constraint de la migración 008/009) -- HubSpot los expone en mayúscula
  // (NOTE/CALL/TASK/MEETING/EMAIL) pero la ingesta ya los normaliza.
  const ETIQUETA: Record<string, string> = { call: "Llamada", email: "Correo enviado", meeting: "Reunión", note: "Nota", task: "Tarea" };
  return Object.entries(ETIQUETA)
    .map(([tipo, etiqueta]) => ({ tipo: etiqueta, total: conteo.get(tipo) ?? 0 }))
    .sort((a, b) => b.total - a.total);
}

export interface TareasPorEstado {
  vendedor_id: string | null;
  completadas: number;
  sin_iniciar: number;
}

/** Tareas de HubSpot terminadas vs. sin iniciar, por vendedor, del/los periodo(s). Mismo fix que actividadesPorTipo: por vendedor_id + fecha, no por deal_id_ref. */
export async function tareasPorEstado(periodoId: string, vista: VistaTiempo, vendedorId?: string): Promise<TareasPorEstado[]> {
  const supabase = await createClient();
  const periodoIds = await resolverPeriodoIds(supabase, periodoId, vista);
  const rango = await resolverRangoFechas(supabase, periodoIds);
  if (!rango) return [];

  let q = supabase.from("hubspot_engagements").select("vendedor_id, estado").eq("tipo", "task")
    .gte("fecha", `${rango.inicio}T00:00:00`).lte("fecha", `${rango.fin}T23:59:59`);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(20_000);
  const filas = (data as Array<{ vendedor_id: string | null; estado: string | null }>) ?? [];

  const mapa = new Map<string | null, { completadas: number; sin_iniciar: number }>();
  for (const r of filas) {
    const cur = mapa.get(r.vendedor_id) ?? { completadas: 0, sin_iniciar: 0 };
    if (r.estado === "COMPLETED") cur.completadas += 1; else cur.sin_iniciar += 1;
    mapa.set(r.vendedor_id, cur);
  }
  return [...mapa.entries()]
    .map(([vendedor_id, v]) => ({ vendedor_id, completadas: v.completadas, sin_iniciar: v.sin_iniciar }))
    .sort((a, b) => (b.completadas + b.sin_iniciar) - (a.completadas + a.sin_iniciar));
}

export interface TamanoNegocio {
  vendedor_id: string | null;
  deals: number;
  ticket_promedio_con_iva: number;
}

/** Ticket promedio (monto con IVA / conteo), general y por vendedor, de deals ganados del/los periodo(s). */
export async function tamanoPromedioNegocio(periodoId: string, vista: VistaTiempo, vendedorId?: string): Promise<TamanoNegocio[]> {
  const supabase = await createClient();
  const periodoIds = await resolverPeriodoIds(supabase, periodoId, vista);

  let q = supabase.from("hubspot_deals").select("vendedor_id, monto_con_iva")
    .in("periodo_id", periodoIds).eq("cerrado_ganado", true);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(2000);

  const mapa = new Map<string | null, { deals: number; monto: number }>();
  for (const r of (data as Array<{ vendedor_id: string | null; monto_con_iva: number | null }>) ?? []) {
    const cur = mapa.get(r.vendedor_id) ?? { deals: 0, monto: 0 };
    cur.deals += 1;
    cur.monto += r.monto_con_iva ?? 0;
    mapa.set(r.vendedor_id, cur);
  }
  return [...mapa.entries()]
    .map(([vendedor_id, v]) => ({ vendedor_id, deals: v.deals, ticket_promedio_con_iva: v.deals > 0 ? v.monto / v.deals : 0 }))
    .sort((a, b) => b.ticket_promedio_con_iva - a.ticket_promedio_con_iva);
}

export interface HistorialCambios {
  nuevo: number;
  avanzo: number;
  retrocedio: number;
}

/**
 * Clasifica cada transición real de hubspot_deal_stages en Nuevo (primer
 * registro del deal) / Etapa avanzó / Etapa retrocedió, comparando el orden
 * de las etapas (pipeline-etapas.ts). NO incluye "fecha de cierre adelantó/
 * pospuso" -- eso requiere historial de closedate, que no se captura hoy.
 */
export async function historialCambiosNegocio(periodoId: string, vista: VistaTiempo, vendedorId?: string): Promise<HistorialCambios> {
  const supabase = await createClient();
  const periodoIds = await resolverPeriodoIds(supabase, periodoId, vista);

  let qDeals = supabase.from("hubspot_deals").select("hubspot_id").in("periodo_id", periodoIds);
  if (vendedorId) qDeals = qDeals.eq("vendedor_id", vendedorId);
  const { data: deals } = await qDeals.limit(2000);
  const dealIds = ((deals as Array<{ hubspot_id: string }>) ?? []).map((d) => d.hubspot_id);
  if (dealIds.length === 0) return { nuevo: 0, avanzo: 0, retrocedio: 0 };

  const filas = await porLotes(dealIds, 200, async (lote) => {
    const { data } = await supabase.from("hubspot_deal_stages")
      .select("etapa_anterior, etapa_nueva").in("hubspot_id", lote).limit(10_000);
    return (data as Array<{ etapa_anterior: string | null; etapa_nueva: string }>) ?? [];
  });

  let nuevo = 0, avanzo = 0, retrocedio = 0;
  for (const r of filas) {
    if (!r.etapa_anterior) { nuevo += 1; continue; }
    const anterior = etapaInfo(r.etapa_anterior)?.orden;
    const nueva = etapaInfo(r.etapa_nueva)?.orden;
    if (anterior == null || nueva == null) continue;
    if (nueva > anterior) avanzo += 1; else if (nueva < anterior) retrocedio += 1;
  }
  return { nuevo, avanzo, retrocedio };
}

export interface PasoEmbudo {
  etapa: string;
  label: string;
  deals: number;
  pctConversionAcumulada: number;
  diasPromedioDesdeAnterior: number | null;
}

/**
 * Embudo con % de conversión acumulada (respecto al primer paso) y días
 * promedio entre el paso anterior y este, calculado con hubspot_deal_stages
 * -- no con fecha_creacion/fecha_cierre, que no distingue etapas.
 */
export async function embudoConConversion(periodoId: string, vista: VistaTiempo, vendedorId?: string): Promise<PasoEmbudo[]> {
  const supabase = await createClient();
  const periodoIds = await resolverPeriodoIds(supabase, periodoId, vista);

  let qDeals = supabase.from("hubspot_deals").select("hubspot_id").in("periodo_id", periodoIds);
  if (vendedorId) qDeals = qDeals.eq("vendedor_id", vendedorId);
  const { data: deals } = await qDeals.limit(2000);
  const dealIds = ((deals as Array<{ hubspot_id: string }>) ?? []).map((d) => d.hubspot_id);
  if (dealIds.length === 0) return [];

  // Cada deal cae entero en un solo lote (se parte por lista de ids, no por
  // fila), así que el orden cronológico POR DEAL se conserva aunque los
  // lotes se junten sin volver a ordenar entre sí -- es lo único que le
  // importa a "primera vez que tocó cada etapa" más abajo.
  const historial = await porLotes(dealIds, 200, async (lote) => {
    const { data } = await supabase.from("hubspot_deal_stages")
      .select("hubspot_id, etapa_nueva, fecha_cambio").in("hubspot_id", lote).order("fecha_cambio", { ascending: true }).limit(10_000);
    return (data as Array<{ hubspot_id: string; etapa_nueva: string; fecha_cambio: string }>) ?? [];
  });

  // Primera vez que cada deal tocó cada etapa -- así "días desde el paso anterior" no se ensucia con idas y vueltas.
  const primeraVezPorDeal = new Map<string, Map<string, string>>();
  for (const h of historial) {
    const porEtapa = primeraVezPorDeal.get(h.hubspot_id) ?? new Map<string, string>();
    if (!porEtapa.has(h.etapa_nueva)) porEtapa.set(h.etapa_nueva, h.fecha_cambio);
    primeraVezPorDeal.set(h.hubspot_id, porEtapa);
  }

  const conteoPorEtapa = new Map<string, number>();
  const diasPorEtapa = new Map<string, number[]>();
  for (const porEtapa of primeraVezPorDeal.values()) {
    for (const [etapa, fecha] of porEtapa.entries()) {
      conteoPorEtapa.set(etapa, (conteoPorEtapa.get(etapa) ?? 0) + 1);
      const info = etapaInfo(etapa);
      if (!info || info.orden === 0) continue;
      const anteriorId = ETAPAS_PIPELINE.find((e) => e.orden === info.orden - 1)?.id;
      const fechaAnterior = anteriorId ? porEtapa.get(anteriorId) : undefined;
      if (fechaAnterior) {
        const dias = (new Date(fecha).getTime() - new Date(fechaAnterior).getTime()) / 86_400_000;
        if (dias >= 0) diasPorEtapa.set(etapa, [...(diasPorEtapa.get(etapa) ?? []), dias]);
      }
    }
  }

  const base = conteoPorEtapa.get(ETAPAS_PIPELINE[0].id) ?? 0;
  return ETAPAS_PIPELINE.map((e) => {
    const deals = conteoPorEtapa.get(e.id) ?? 0;
    const dias = diasPorEtapa.get(e.id);
    return {
      etapa: e.id,
      label: e.label,
      deals,
      pctConversionAcumulada: base > 0 ? (deals / base) * 100 : 0,
      diasPromedioDesdeAnterior: dias && dias.length > 0 ? dias.reduce((a, b) => a + b, 0) / dias.length : null,
    };
  });
}

export interface VelocidadNegocio {
  vendedor_id: string | null;
  deals: number;
  dias_promedio_cierre: number;
}

/** Días reales desde la primera etapa del deal hasta que llegó a Ganado/Perdido -- no fecha_creacion/fecha_cierre en bruto. */
export async function velocidadNegocios(periodoId: string, vista: VistaTiempo, vendedorId?: string): Promise<VelocidadNegocio[]> {
  const supabase = await createClient();
  const periodoIds = await resolverPeriodoIds(supabase, periodoId, vista);

  let qDeals = supabase.from("hubspot_deals").select("hubspot_id, vendedor_id, cerrado_ganado").in("periodo_id", periodoIds);
  if (vendedorId) qDeals = qDeals.eq("vendedor_id", vendedorId);
  const { data: deals } = await qDeals.limit(2000);
  const cerrados = ((deals as Array<{ hubspot_id: string; vendedor_id: string | null; cerrado_ganado: boolean | null }>) ?? [])
    .filter((d) => d.cerrado_ganado !== null);
  if (cerrados.length === 0) return [];

  const historialCierre = await porLotes(cerrados.map((d) => d.hubspot_id), 200, async (lote) => {
    const { data } = await supabase.from("hubspot_deal_stages")
      .select("hubspot_id, fecha_cambio").in("hubspot_id", lote)
      .order("fecha_cambio", { ascending: true }).limit(10_000);
    return (data as Array<{ hubspot_id: string; fecha_cambio: string }>) ?? [];
  });

  const rango = new Map<string, { primera: string; ultima: string }>();
  for (const r of historialCierre) {
    const cur = rango.get(r.hubspot_id);
    if (!cur) rango.set(r.hubspot_id, { primera: r.fecha_cambio, ultima: r.fecha_cambio });
    else cur.ultima = r.fecha_cambio;
  }

  const mapa = new Map<string | null, { deals: number; dias: number }>();
  for (const d of cerrados) {
    const r = rango.get(d.hubspot_id);
    if (!r) continue;
    const dias = (new Date(r.ultima).getTime() - new Date(r.primera).getTime()) / 86_400_000;
    const cur = mapa.get(d.vendedor_id) ?? { deals: 0, dias: 0 };
    cur.deals += 1;
    cur.dias += dias;
    mapa.set(d.vendedor_id, cur);
  }
  return [...mapa.entries()]
    .map(([vendedor_id, v]) => ({ vendedor_id, deals: v.deals, dias_promedio_cierre: v.deals > 0 ? v.dias / v.deals : 0 }))
    .sort((a, b) => a.dias_promedio_cierre - b.dias_promedio_cierre);
}

export interface GanadosPerdidos {
  ganados: number;
  perdidos: number;
  tasaGanadosPct: number;
}

/** Recuento de cierres ganados vs. perdidos y % de tasa de ganados, del/los periodo(s) elegido(s). */
export async function ganadosPerdidos(periodoId: string, vista: VistaTiempo, vendedorId?: string): Promise<GanadosPerdidos> {
  const supabase = await createClient();
  const periodoIds = await resolverPeriodoIds(supabase, periodoId, vista);

  let q = supabase.from("hubspot_deals").select("cerrado_ganado").in("periodo_id", periodoIds).not("cerrado_ganado", "is", null);
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data } = await q.limit(2000);

  const filas = (data as Array<{ cerrado_ganado: boolean }>) ?? [];
  const ganados = filas.filter((d) => d.cerrado_ganado).length;
  const perdidos = filas.length - ganados;
  return { ganados, perdidos, tasaGanadosPct: filas.length > 0 ? (ganados / filas.length) * 100 : 0 };
}

/* ------------------------------------------------------------------ */
/* Coach Comercial -- diagnóstico táctico del vendedor seleccionado     */
/* ------------------------------------------------------------------ */

export type CategoriaCoach = "conversion" | "higiene" | "velocidad" | "ticket";

export interface AccionCoach {
  categoria: CategoriaCoach;
  diagnostico: string;
  mensaje: string;
}

async function dealsDelVendedorEnPeriodo(periodoId: string, vendedorId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("hubspot_deals")
    .select("hubspot_id", { count: "exact", head: true })
    .eq("periodo_id", periodoId)
    .eq("vendedor_id", vendedorId);
  return count ?? 0;
}

/**
 * Diagnóstico del mes en curso para UN vendedor (no trimestral -- el coach
 * habla de "este mes"), armado 100% con datos ya calculados para la Suite de
 * Analítica (ganadosPerdidos, actividadesPorTipo, velocidadNegocios,
 * tamanoPromedioNegocio). No dispara ninguna regla si el vendedor no tiene
 * negocios en el periodo -- un "0 actividades" sin negocios no es una alerta
 * real, es que no hubo nada que registrar.
 *
 * El "Ticket Promedio está por debajo del Objetivo" del pedido original se
 * lee contra el promedio del EQUIPO, no contra una meta de ticket -- esa
 * meta no existe en el esquema (objetivos solo guarda montos totales, no
 * ticket esperado), así que inventar un umbral sería la misma falla de
 * "patrones falsos con muestra chica" que ya se descartó para el motor de
 * éxito. El mensaje lo deja explícito.
 */
export async function diagnosticoCoach(periodoId: string, vendedorId: string): Promise<AccionCoach[]> {
  const totalDeals = await dealsDelVendedorEnPeriodo(periodoId, vendedorId);
  if (totalDeals === 0) return [];

  const [gp, actividades, velocidad, tamanoVendedor, tamanoEquipo] = await Promise.all([
    ganadosPerdidos(periodoId, "mensual", vendedorId),
    actividadesPorTipo(periodoId, "mensual", vendedorId),
    velocidadNegocios(periodoId, "mensual", vendedorId),
    tamanoPromedioNegocio(periodoId, "mensual", vendedorId),
    tamanoPromedioNegocio(periodoId, "mensual"),
  ]);

  const acciones: AccionCoach[] = [];

  const cierres = gp.ganados + gp.perdidos;
  if (cierres > 0 && gp.tasaGanadosPct < 25) {
    acciones.push({
      categoria: "conversion",
      diagnostico: "Baja conversión / pérdida alta de tratos",
      mensaje: `Foco en Calificación Temprana: perdiste ${gp.perdidos} de ${cierres} negocios cerrados este mes (${pct(gp.tasaGanadosPct)} de conversión). No cotices sin antes validar presupuesto y decisión. Objetivo: elevar la conversión a 30%.`,
    });
  }

  const totalActividades = actividades.reduce((acc, a) => acc + a.total, 0);
  if (totalActividades === 0) {
    acciones.push({
      categoria: "higiene",
      diagnostico: "Falla de registro e higiene en HubSpot",
      mensaje: "Punto Ciego de Seguimiento: tienes 0 actividades registradas este mes. Registra hoy al menos 1 nota o llamada por trato activo para no perder visibilidad del pipeline.",
    });
  }

  const velocidadVendedor = velocidad.find((v) => v.vendedor_id === vendedorId);
  if (velocidadVendedor && velocidadVendedor.deals > 0 && velocidadVendedor.dias_promedio_cierre > 18) {
    acciones.push({
      categoria: "velocidad",
      diagnostico: "Ciclo de venta extendido",
      mensaje: `Aceleración de Cierre: tu ciclo promedio es de ${velocidadVendedor.dias_promedio_cierre.toFixed(1)} días. Aplica la técnica de "Acuerdo de Siguiente Paso": agenda fecha y hora exacta de revisión antes de colgar la llamada.`,
    });
  }

  const ticketVendedor = tamanoVendedor.find((t) => t.vendedor_id === vendedorId);
  const dealsEquipo = tamanoEquipo.reduce((acc, t) => acc + t.deals, 0);
  const ticketEquipoPromedio = dealsEquipo > 0
    ? tamanoEquipo.reduce((acc, t) => acc + t.ticket_promedio_con_iva * t.deals, 0) / dealsEquipo
    : 0;
  if (ticketVendedor && ticketVendedor.deals > 0 && ticketEquipoPromedio > 0 && ticketVendedor.ticket_promedio_con_iva < ticketEquipoPromedio) {
    acciones.push({
      categoria: "ticket",
      diagnostico: "Oportunidad de cross-selling / upselling",
      mensaje: `Incremento de Ticket: tu ticket promedio es de ${dinero(ticketVendedor.ticket_promedio_con_iva)}, por debajo del promedio del equipo (${dinero(ticketEquipoPromedio)} -- no hay una meta de ticket capturada, se compara contra el equipo). Incluye un módulo de valor añadido en tus próximas propuestas.`,
    });
  }

  return acciones;
}

/* ------------------------------------------------------------------ */
/* Disciplina Comercial -- retos semanales S1-S4, del calendario real   */
/* ------------------------------------------------------------------ */

export type EstatusReto = "cumplido" | "en_progreso" | "no_alcanzado" | "sin_dato" | "pendiente";

export interface RetoSemana {
  semana: number;
  etiqueta: string;
  inicio: string;
  fin: string;
  esSemanaActual: boolean;
  montoVendido: number;
  metaCierreSemana: number | null;
  estatusCierre: EstatusReto;
  negociosCreados: number;
  negociosCreadosSemanaAnterior: number | null;
  estatusVolumen: EstatusReto;
  tareasAsignadas: number;
  tareasCompletadas: number;
  estatusCrm: EstatusReto;
  notas: number;
  estatusGeneral: EstatusReto;
}

export interface DisciplinaComercial {
  semanas: RetoSemana[];
  rachaSemanas: number;
  alerta: string | null;
  estancadosSemanaActual: number | null;
}

function estatusGeneralDe(estados: EstatusReto[]): EstatusReto {
  const evaluables = estados.filter((e) => e !== "sin_dato");
  if (evaluables.length === 0) return "sin_dato";
  if (evaluables.includes("no_alcanzado")) return "no_alcanzado";
  if (evaluables.includes("en_progreso")) return "en_progreso";
  return "cumplido";
}

/**
 * Retos semanales S1-S4 con datos reales del calendario `periodo_semanas`.
 * Reglas, todas trazables a un dato real (nada de metas inventadas):
 *  - Reto de Cierre: la meta semanal es el objetivo mensual del vendedor / 4
 *    -- el ritmo real necesario para llegar a SU meta ya capturada, no un
 *    número aparte.
 *  - Reto de Volumen: no hay una meta de "negocios por semana" en el
 *    esquema, así que se compara contra la semana anterior del mismo
 *    periodo (S1 queda "sin_dato": no hay semana previa contra qué medir).
 *  - Reto de CRM: 100% de tareas con vencimiento esa semana completadas.
 *    El sub-criterio "0 negocios con 5+ días sin atención" del pedido
 *    original SOLO se puede evaluar en tiempo real (v_deal_actividad guarda
 *    el estado actual, no una foto histórica por semana) -- por eso se
 *    reporta aparte, únicamente para la semana en curso.
 */
export async function disciplinaComercial(periodoId: string, vendedorId: string): Promise<DisciplinaComercial> {
  const supabase = await createClient();

  const [{ data: semanasRaw }, { data: objetivoRow }] = await Promise.all([
    supabase.from("periodo_semanas").select("semana, inicio, fin").eq("periodo_id", periodoId).order("semana", { ascending: true }),
    supabase.from("objetivos").select("objetivo_total").eq("periodo_id", periodoId).eq("vendedor_id", vendedorId).maybeSingle(),
  ]);

  const semanas = (semanasRaw as Array<{ semana: number; inicio: string; fin: string }>) ?? [];
  if (semanas.length === 0) return { semanas: [], rachaSemanas: 0, alerta: null, estancadosSemanaActual: null };

  const metaCierreSemana = objetivoRow?.objetivo_total ? objetivoRow.objetivo_total / 4 : null;
  const hoy = new Date().toISOString().slice(0, 10);

  const base = await Promise.all(semanas.map(async (s) => {
    const inicioTs = `${s.inicio}T00:00:00`;
    const finTs = `${s.fin}T23:59:59`;

    const [ganados, creados, tareas, notasSemana] = await Promise.all([
      (async () => {
        const { data } = await supabase.from("hubspot_deals").select("monto_con_iva")
          .eq("vendedor_id", vendedorId).eq("cerrado_ganado", true)
          .gte("fecha_cierre", inicioTs).lte("fecha_cierre", finTs);
        return (data as Array<{ monto_con_iva: number | null }>) ?? [];
      })(),
      (async () => {
        const { data } = await supabase.from("hubspot_deals").select("hubspot_id")
          .eq("vendedor_id", vendedorId)
          .gte("fecha_creacion", inicioTs).lte("fecha_creacion", finTs);
        return (data as Array<{ hubspot_id: string }>) ?? [];
      })(),
      (async () => {
        const { data } = await supabase.from("hubspot_engagements").select("estado")
          .eq("vendedor_id", vendedorId).eq("tipo", "task")
          .gte("fecha", inicioTs).lte("fecha", finTs);
        return (data as Array<{ estado: string | null }>) ?? [];
      })(),
      (async () => {
        const { data } = await supabase.from("hubspot_engagements").select("hubspot_id")
          .eq("vendedor_id", vendedorId).eq("tipo", "note")
          .gte("fecha", inicioTs).lte("fecha", finTs);
        return (data as Array<{ hubspot_id: string }>) ?? [];
      })(),
    ]);

    const montoVendido = ganados.reduce((acc, d) => acc + (d.monto_con_iva ?? 0), 0);
    const estatusCierre: EstatusReto =
      metaCierreSemana == null ? "sin_dato" :
      montoVendido >= metaCierreSemana ? "cumplido" :
      montoVendido >= metaCierreSemana * 0.7 ? "en_progreso" : "no_alcanzado";

    const tareasAsignadas = tareas.length;
    const tareasCompletadas = tareas.filter((t) => t.estado === "COMPLETED").length;
    const estatusCrm: EstatusReto =
      tareasAsignadas === 0 ? "sin_dato" :
      tareasCompletadas === tareasAsignadas ? "cumplido" :
      tareasCompletadas / tareasAsignadas >= 0.5 ? "en_progreso" : "no_alcanzado";

    return {
      semana: s.semana,
      etiqueta: `S${s.semana}`,
      inicio: s.inicio,
      fin: s.fin,
      esSemanaActual: hoy >= s.inicio && hoy <= s.fin,
      montoVendido,
      metaCierreSemana,
      estatusCierre,
      negociosCreados: creados.length,
      tareasAsignadas,
      tareasCompletadas,
      estatusCrm,
      notas: notasSemana.length,
    };
  }));

  const semanasFinal: RetoSemana[] = base.map((f, idx) => {
    const anterior = idx > 0 ? base[idx - 1] : null;
    const esFutura = f.inicio > hoy;

    // Una semana que todavía no empieza no tiene nada que evaluar -- 0
    // negocios/0 monto ahí no significa "no alcanzado" (fracasó) ni
    // "cumplido" (comparar 0 contra 0 de la semana anterior, también
    // futura, daba falso positivo en verde). Es "pendiente": aún no pasa.
    if (esFutura) {
      return {
        ...f,
        estatusCierre: "pendiente",
        estatusCrm: "pendiente",
        negociosCreadosSemanaAnterior: anterior?.negociosCreados ?? null,
        estatusVolumen: "pendiente",
        estatusGeneral: "pendiente",
      };
    }

    const estatusVolumen: EstatusReto =
      anterior == null ? "sin_dato" :
      f.negociosCreados >= anterior.negociosCreados ? "cumplido" :
      f.negociosCreados >= anterior.negociosCreados * 0.7 ? "en_progreso" : "no_alcanzado";
    return {
      ...f,
      negociosCreadosSemanaAnterior: anterior?.negociosCreados ?? null,
      estatusVolumen,
      estatusGeneral: estatusGeneralDe([f.estatusCierre, f.estatusCrm, estatusVolumen]),
    };
  });

  const evaluables = semanasFinal.filter((f) => f.fin <= hoy);
  let rachaSemanas = 0;
  for (let i = evaluables.length - 1; i >= 0; i--) {
    if (evaluables[i].estatusGeneral === "cumplido") rachaSemanas++; else break;
  }

  const semanaActual = semanasFinal.find((f) => f.esSemanaActual) ?? null;
  const semanaAnteriorAActual = semanaActual ? semanasFinal.find((f) => f.semana === semanaActual.semana - 1) ?? null : null;
  let alerta: string | null = null;
  if (semanaActual) {
    if (semanaActual.notas === 0) {
      alerta = "Alerta de Disciplina: 0 notas registradas esta semana en HubSpot.";
    } else if (semanaAnteriorAActual && semanaActual.notas < semanaAnteriorAActual.notas) {
      alerta = "Alerta de Disciplina: bajó tu registro de CRM (notas) respecto a la semana pasada.";
    }
  }

  const estancadosSemanaActual = semanaActual
    ? (await dealsEstancados(vendedorId, 5)).length
    : null;
  if (estancadosSemanaActual && estancadosSemanaActual > 0 && !alerta) {
    alerta = `Alerta de Disciplina: ${estancadosSemanaActual} negocio(s) con 5+ días sin atención.`;
  }

  return { semanas: semanasFinal, rachaSemanas, alerta, estancadosSemanaActual };
}

/* ------------------------------------------------------------------ */
/* Proyección de pipeline -- forecast por fecha de cierre estimada      */
/* ------------------------------------------------------------------ */

export interface DealPipelineProyectado {
  hubspot_id: string;
  nombre: string | null;
  empresa: string | null;
  correo_cliente: string | null;
  productos: string | null;
  canal: string | null;
  monto_con_iva: number | null;
  etapa_actual: string;
  etapa_label: string;
  fecha_cierre: string | null;
  probabilidad_pct: number | null;
}

export type ClaveGrupoPipeline = "mes_activo" | "proximo_mes" | "por_definir";

export interface GrupoPipelineProyectado {
  clave: ClaveGrupoPipeline;
  etiqueta: string;
  montoAbierto: number;
  montoPonderado: number;
  deals: DealPipelineProyectado[];
}

export interface ProyeccionPipeline {
  probabilidadDisponible: boolean;
  grupos: GrupoPipelineProyectado[];
}

/**
 * % de negocios que, habiendo tocado esta etapa alguna vez, terminó
 * ganado -- calculado de TODOS los cierres históricos del equipo (no del
 * vendedor filtrado: el volumen de cierres de una sola persona por etapa
 * es demasiado chico para ser confiable, el mismo criterio con el que se
 * descartó el "motor de patrones de éxito" antes en este proyecto).
 *
 * HubSpot no trae un score de probabilidad propio en este portal
 * (hs_deal_stage_probability nunca se pidió a la API, no está en
 * PROPIEDADES_BASE de la ingesta) -- esto es la aproximación real más
 * cercana que hay con los datos que sí existen. Etapas con menos de 5
 * cierres históricos se quedan sin probabilidad (null) en vez de mostrar
 * un % basado en una muestra que no significa nada.
 */
async function probabilidadPorEtapa(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, number>> {
  const { data: cerrados } = await supabase.from("hubspot_deals")
    .select("hubspot_id, cerrado_ganado").not("cerrado_ganado", "is", null).limit(3000);
  const filas = (cerrados as Array<{ hubspot_id: string; cerrado_ganado: boolean }>) ?? [];
  if (filas.length === 0) return new Map();
  const resultadoPorDeal = new Map(filas.map((f) => [f.hubspot_id, f.cerrado_ganado]));

  const etapas = await porLotes(filas.map((f) => f.hubspot_id), 200, async (lote) => {
    const { data } = await supabase.from("hubspot_deal_stages").select("hubspot_id, etapa_nueva").in("hubspot_id", lote).limit(10_000);
    return (data as Array<{ hubspot_id: string; etapa_nueva: string }>) ?? [];
  });

  const vistoPorEtapa = new Map<string, Set<string>>();
  for (const e of etapas) {
    const set = vistoPorEtapa.get(e.etapa_nueva) ?? new Set<string>();
    set.add(e.hubspot_id);
    vistoPorEtapa.set(e.etapa_nueva, set);
  }

  const probabilidad = new Map<string, number>();
  for (const [etapa, idsDeal] of vistoPorEtapa.entries()) {
    if (idsDeal.size < 5) continue;
    let ganados = 0;
    for (const id of idsDeal) if (resultadoPorDeal.get(id)) ganados += 1;
    probabilidad.set(etapa, (ganados / idsDeal.size) * 100);
  }
  return probabilidad;
}

/**
 * Negocios ABIERTOS del vendedor, agrupados por su fecha de cierre
 * estimada: mes activo (el del periodo seleccionado), próximo mes, o
 * "por definir" (sin fecha, o fuera de esos dos meses -- incluye
 * estimados vencidos que quedaron sin actualizar).
 *
 * Consulta hubspot_deals DIRECTO -- no v_deal_etapa_actual. Esa vista sale
 * de un JOIN que arranca desde hubspot_deal_stages, tabla que solo se
 * llena para negocios con closedate (buscarHistorialEtapas filtra por
 * fecha de cierre) -- un negocio genuinamente abierto que nunca se ha
 * cerrado no tiene ahí ninguna fila y desaparecía por completo de esta
 * proyección. hubspot_deals.etapa es el mismo dealstage crudo de HubSpot
 * (id numérico, ej. "45202791"), así que "abierto" se resuelve con la
 * misma lista de ids de ETAPAS_PIPELINE que usa etapaInfo() en el resto
 * del código -- nunca contra strings como "closedwon" que este portal no
 * guarda.
 *
 * "Empresa" casi siempre sale vacía para negocios abiertos -- Monday solo
 * registra tratos GANADOS, por diseño.
 */
export async function proyeccionPipeline(periodoId: string, vendedorId: string): Promise<ProyeccionPipeline> {
  const supabase = await createClient();

  const { data: periodoRow } = await supabase.from("periodos").select("anio, mes").eq("id", periodoId).maybeSingle();
  const hoy = new Date();
  const anio = periodoRow?.anio ?? hoy.getFullYear();
  const mesActivo = periodoRow?.mes ?? hoy.getMonth() + 1;
  const [anioProx, mesProx] = mesActivo === 12 ? [anio + 1, 1] : [anio, mesActivo + 1];

  const rangoDe = (a: number, m: number) => {
    const ultimoDia = new Date(a, m, 0).getDate();
    return {
      inicio: `${a}-${String(m).padStart(2, "0")}-01T00:00:00`,
      fin: `${a}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}T23:59:59`,
    };
  };
  const rangoActivo = rangoDe(anio, mesActivo);
  const rangoProximo = rangoDe(anioProx, mesProx);

  const idsAbiertos = ETAPAS_PIPELINE.filter((e) => e.resultado === "abierto").map((e) => e.id);

  const [{ data: dealsAbiertos }, probabilidad] = await Promise.all([
    supabase.from("hubspot_deals")
      .select("hubspot_id, nombre, monto_con_iva, etapa, fecha_cierre")
      .eq("vendedor_id", vendedorId)
      .in("etapa", idsAbiertos),
    probabilidadPorEtapa(supabase),
  ]);

  const abiertos = (dealsAbiertos as Array<{
    hubspot_id: string; nombre: string | null; monto_con_iva: number | null; etapa: string; fecha_cierre: string | null;
  }>) ?? [];

  if (abiertos.length === 0) {
    return { probabilidadDisponible: probabilidad.size > 0, grupos: [] };
  }

  const [{ data: mondayRows }, mapaCorreoContacto] = await Promise.all([
    supabase.from("monday_cierres").select("hubspot_id, empresa, correo_cliente, productos, como_llego")
      .in("hubspot_id", abiertos.map((d) => d.hubspot_id)),
    correoDeContactoPorDeal(supabase, abiertos.map((d) => d.hubspot_id)),
  ]);
  const mapaMonday = new Map((
    (mondayRows as Array<{ hubspot_id: string; empresa: string | null; correo_cliente: string | null; productos: string | null; como_llego: string | null }>) ?? []
  ).map((m) => [m.hubspot_id, m]));

  // Un negocio abierto con fecha de cierre ANTERIOR al mes activo está
  // atrasado, no "por definir" -- sigue siendo trabajo pendiente de este
  // mes, así que cae en el mismo cajón que los cierres del mes activo.
  const clasificar = (fecha: string | null): ClaveGrupoPipeline => {
    if (!fecha) return "por_definir";
    if (fecha <= rangoActivo.fin) return "mes_activo";
    if (fecha >= rangoProximo.inicio && fecha <= rangoProximo.fin) return "proximo_mes";
    return "por_definir";
  };

  const gruposMapa = new Map<ClaveGrupoPipeline, DealPipelineProyectado[]>();
  for (const d of abiertos) {
    const clave = clasificar(d.fecha_cierre);
    const lista = gruposMapa.get(clave) ?? [];
    const monday = mapaMonday.get(d.hubspot_id);
    lista.push({
      hubspot_id: d.hubspot_id,
      nombre: d.nombre,
      empresa: monday?.empresa ?? null,
      correo_cliente: mapaCorreoContacto.get(d.hubspot_id) ?? monday?.correo_cliente ?? null,
      productos: monday?.productos ?? null,
      canal: monday?.como_llego ?? null,
      monto_con_iva: d.monto_con_iva,
      etapa_actual: d.etapa,
      etapa_label: nombreEtapa(d.etapa),
      fecha_cierre: d.fecha_cierre,
      probabilidad_pct: probabilidad.get(d.etapa) ?? null,
    });
    gruposMapa.set(clave, lista);
  }

  const ETIQUETAS: Record<ClaveGrupoPipeline, string> = {
    mes_activo: "Cierres del mes / atrasados",
    proximo_mes: "Próximo mes",
    por_definir: "Por definir / futuros",
  };

  const grupos = (["mes_activo", "proximo_mes", "por_definir"] as const).map((clave) => {
    const deals = (gruposMapa.get(clave) ?? []).sort((a, b) => (b.monto_con_iva ?? 0) - (a.monto_con_iva ?? 0));
    const montoAbierto = deals.reduce((acc, d) => acc + (d.monto_con_iva ?? 0), 0);
    const montoPonderado = deals.reduce((acc, d) => acc + (d.monto_con_iva ?? 0) * ((d.probabilidad_pct ?? 0) / 100), 0);
    return { clave, etiqueta: ETIQUETAS[clave], montoAbierto, montoPonderado, deals };
  });

  return { probabilidadDisponible: probabilidad.size > 0, grupos };
}
