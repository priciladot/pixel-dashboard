/**
 * Capa de sanitización.
 *
 * Principio: ninguna fila se descarta. Una fila con problemas se marca, se
 * asigna a "Sin asignar / Por revisar" y sale de los agregados maestros por la
 * puerta de la calidad, no por la del borrado. Así el total del área nunca se
 * rompe por un registro incompleto de HubSpot.
 */

export const SIN_ASIGNAR = "Sin asignar / Por revisar";
export const IVA = 1.16;

export type Flag =
  | "owner_sin_mapear"
  | "owner_vacio"
  | "monto_faltante"
  | "monto_invalido"
  | "fecha_faltante"
  | "fuera_de_periodo"
  | "etapa_desconocida"
  | "duplicado"
  | "division_doble_conteo"
  | "motivo_perdida_fuera_de_catalogo"
  | "diferido_sin_fecha_reactivacion"
  | "posible_doble_conteo";

export interface DealCrudo {
  hubspot_id: string;
  nombre?: string | null;
  owner_hubspot_id?: string | null;
  owner_nombre?: string | null;
  monto?: number | string | null;      // sin IVA
  etapa?: string | null;
  cerrado_ganado?: boolean | null;
  fecha_creacion?: string | null;
  fecha_cierre?: string | null;
  tipo_cliente?: string | null;
  origen?: string | null;
  atribucion?: string | null;
  categoria_cierre?: string | null;
  motivo_perdida?: string | null;
  fecha_reactivacion?: string | null;
  clasificacion_raw?: string | null;
  pipeline?: string | null;
  es_division?: boolean | null;
  raw?: unknown;
}

export interface DealSaneado {
  hubspot_id: string;
  nombre: string | null;
  owner_hubspot_id: string | null;
  owner_nombre_raw: string | null;
  vendedor_id: string | null;
  monto_sin_iva: number | null;
  etapa: string | null;
  cerrado_ganado: boolean;
  fecha_creacion: string | null;
  fecha_cierre: string | null;
  periodo_id: string | null;
  tipo_cliente: "existente" | "nuevo" | "por_revisar";
  origen: string | null;
  atribucion: string | null;
  motivo_perdida: string | null;
  categoria_perdida: string | null;
  fecha_reactivacion: string | null;
  clasificacion_raw: string | null;
  pipeline: string | null;
  es_division: boolean;
  flags: Flag[];
  calidad: "ok" | "parcial" | "por_revisar";
  raw: unknown;
}

export interface Diccionarios {
  /** hubspot_owner_id -> profiles.id */
  porOwnerId: Map<string, string>;
  /** alias normalizado -> profiles.id */
  porAlias: Map<string, string>;
  /** periodos con sus ventanas de KPI */
  periodos: Array<{ id: string; kpi_inicio: string; kpi_fin: string; cal_inicio: string; cal_fin: string }>;
  /** categorías válidas del catálogo de pérdida */
  categoriasPerdida: string[];
}

/** Quita acentos, colapsa espacios y baja a minúsculas. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "$1,234.56", "1234,56", 1234.56 -> 1234.56 | null */
export function aNumero(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const limpio = String(v).replace(/[^\d.,-]/g, "");
  if (!limpio) return null;
  // Si hay coma y punto, la coma es separador de miles.
  const normal = limpio.includes(",") && limpio.includes(".")
    ? limpio.replace(/,/g, "")
    : limpio.replace(",", ".");
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export function aFechaISO(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Resuelve el vendedor por owner_id y, si no, por alias de nombre o correo. */
export function resolverVendedor(
  d: DealCrudo, dic: Diccionarios,
): { vendedor_id: string | null; flag: Flag | null } {
  if (d.owner_hubspot_id) {
    const id = dic.porOwnerId.get(String(d.owner_hubspot_id));
    if (id) return { vendedor_id: id, flag: null };
  }
  if (d.owner_nombre) {
    const id = dic.porAlias.get(normalizar(d.owner_nombre));
    if (id) return { vendedor_id: id, flag: null };
    return { vendedor_id: null, flag: "owner_sin_mapear" };
  }
  return { vendedor_id: null, flag: "owner_vacio" };
}

/** Periodo al que cae una fecha, según la ventana de KPI de 4 semanas. */
export function periodoDe(
  fechaISO: string | null,
  dic: Diccionarios,
  ventana: "kpi_4_semanas" | "calendario" = "kpi_4_semanas",
): string | null {
  if (!fechaISO) return null;
  const f = fechaISO.slice(0, 10);
  const p = dic.periodos.find((p) =>
    ventana === "kpi_4_semanas" ? f >= p.kpi_inicio && f <= p.kpi_fin : f >= p.cal_inicio && f <= p.cal_fin,
  );
  return p?.id ?? null;
}

const ETAPAS_GANADAS = ["closedwon", "cerrado ganado", "ganado", "won"];
const ETAPAS_PERDIDAS = ["closedlost", "cerrado perdido", "perdido", "lost"];

export function esGanado(d: DealCrudo): boolean {
  if (typeof d.cerrado_ganado === "boolean") return d.cerrado_ganado;
  const e = normalizar(String(d.etapa ?? ""));
  return ETAPAS_GANADAS.some((k) => e.includes(k));
}

/**
 * Reduce la clasificación del portal a la dicotomía del semáforo.
 * Valores reales de clasificacion_de_lead_cliente__prueba_gab_:
 *   Cliente Existente · Remarketing Existente  -> existente
 *   Lead Nuevo · Remarketing Nuevo             -> nuevo
 * Ojo con el orden: "Remarketing Existente" contiene ambas palabras, así que
 * "existente" se evalúa primero.
 */
function tipoCliente(v: unknown): "existente" | "nuevo" | "por_revisar" {
  const t = normalizar(String(v ?? ""));
  if (!t) return "por_revisar";
  if (t.includes("existente") || t.includes("cartera") || t.includes("desfasado")) return "existente";
  if (t.includes("nuevo") || t.includes("nueva") || t.includes("new")) return "nuevo";
  return "por_revisar";
}

/**
 * Sanea un lote completo. Aplica dedupe por hubspot_id y marca las filas
 * "División" que registran el monto completo en ambas partes (doble conteo).
 */
export function sanearLote(
  crudos: DealCrudo[],
  dic: Diccionarios,
  ventana: "kpi_4_semanas" | "calendario" = "kpi_4_semanas",
): { deals: DealSaneado[]; duplicados: number } {
  const vistos = new Map<string, DealSaneado>();
  let duplicados = 0;

  // Detección de doble conteo: mismo nombre de negocio + mismo monto marcado
  // como División ⇒ la segunda ocurrencia se marca, no se suma dos veces.
  const firmaDivision = new Map<string, number>();

  for (const c of crudos) {
    const flags: Flag[] = [];

    const { vendedor_id, flag } = resolverVendedor(c, dic);
    if (flag) flags.push(flag);

    const monto = aNumero(c.monto);
    if (monto == null) flags.push("monto_faltante");
    else if (monto < 0) flags.push("monto_invalido");

    const creacion = aFechaISO(c.fecha_creacion);
    const cierre = aFechaISO(c.fecha_cierre);
    if (!cierre && !creacion) flags.push("fecha_faltante");

    const periodo_id = periodoDe(cierre ?? creacion, dic, ventana);
    if (!periodo_id) flags.push("fuera_de_periodo");

    if (!c.etapa) flags.push("etapa_desconocida");

    // El portal ya trae la categoría del catálogo en su propia propiedad; el
    // motivo detallado va aparte. Si solo llega el motivo (archivos viejos),
    // se intenta contra el catálogo.
    let categoria_perdida: string | null = null;
    const categoriaEntrante = c.categoria_cierre ?? c.motivo_perdida;
    if (categoriaEntrante) {
      const hallada = dic.categoriasPerdida.find(
        (cat) => normalizar(cat) === normalizar(String(categoriaEntrante)),
      );
      if (hallada) categoria_perdida = hallada;
      else if (c.categoria_cierre) flags.push("motivo_perdida_fuera_de_catalogo");
    }

    // Regla del catálogo: "Diferido" no cierra como perdido y exige fecha de
    // reactivación. Sin ella, el negocio queda en el limbo.
    const fecha_reactivacion = c.fecha_reactivacion
      ? (aFechaISO(c.fecha_reactivacion)?.slice(0, 10) ?? null)
      : null;
    if (categoria_perdida === "Diferido" && !fecha_reactivacion) {
      flags.push("diferido_sin_fecha_reactivacion");
    }

    // Doble conteo. El portal no marca las divisiones con una propiedad, así
    // que se detectan por firma: mismo nombre de negocio y mismo monto.
    //   - Si la fuente SÍ marcó la fila como División (CSV del semáforo), la
    //     repetición es un error confirmado y sale de los agregados.
    //   - Si solo coincide la firma, se avisa pero NO se descarta: dos eventos
    //     iguales al mismo precio son posibles y es la dirección quien juzga.
    const es_division = Boolean(c.es_division);
    if (monto != null && monto > 0 && c.nombre) {
      const firma = `${normalizar(String(c.nombre))}|${monto}`;
      const n = (firmaDivision.get(firma) ?? 0) + 1;
      firmaDivision.set(firma, n);
      if (n > 1) flags.push(es_division ? "division_doble_conteo" : "posible_doble_conteo");
    }

    const critico = flags.some((f) =>
      ["owner_sin_mapear", "owner_vacio", "monto_faltante", "monto_invalido",
       "fuera_de_periodo", "division_doble_conteo"].includes(f),
    );

    const saneado: DealSaneado = {
      hubspot_id: String(c.hubspot_id),
      nombre: c.nombre ?? null,
      owner_hubspot_id: c.owner_hubspot_id ? String(c.owner_hubspot_id) : null,
      owner_nombre_raw: c.owner_nombre ?? null,
      vendedor_id,
      monto_sin_iva: monto,
      etapa: c.etapa ?? null,
      cerrado_ganado: esGanado(c),
      fecha_creacion: creacion,
      fecha_cierre: cierre,
      periodo_id,
      tipo_cliente: tipoCliente(c.tipo_cliente),
      origen: c.origen ?? null,
      atribucion: c.atribucion ?? null,
      motivo_perdida: c.motivo_perdida ?? null,
      categoria_perdida,
      fecha_reactivacion,
      clasificacion_raw: c.clasificacion_raw ?? null,
      pipeline: c.pipeline ?? null,
      es_division,
      flags,
      calidad: critico ? "por_revisar" : flags.length > 0 ? "parcial" : "ok",
      raw: c.raw ?? c,
    };

    const previo = vistos.get(saneado.hubspot_id);
    if (previo) {
      duplicados += 1;
      // Se conserva la versión con menos banderas.
      if (saneado.flags.length < previo.flags.length) {
        saneado.flags = [...new Set([...saneado.flags, "duplicado" as Flag])];
        vistos.set(saneado.hubspot_id, saneado);
      } else {
        previo.flags = [...new Set([...previo.flags, "duplicado" as Flag])];
      }
    } else {
      vistos.set(saneado.hubspot_id, saneado);
    }
  }

  return { deals: [...vistos.values()], duplicados };
}

/**
 * Agregados por vendedor a partir de los deals saneados.
 * Solo entran las filas con calidad distinta de "por_revisar": un registro
 * marcado no contamina las métricas maestras.
 */
export interface AgregadoVendedor {
  vendedor_id: string;
  periodo_id: string;
  deals_creados: number;
  deals_ganados: number;
  deals_perdidos: number;
  ganado_sin_iva: number;
  ganado_con_iva: number;
  ticket_promedio_sin_iva: number | null;
  ciclo_cierre_dias: number | null;
}

export function agregarPorVendedor(deals: DealSaneado[]): AgregadoVendedor[] {
  const mapa = new Map<string, AgregadoVendedor & { _ciclos: number[]; _montos: number[] }>();

  for (const d of deals) {
    if (d.calidad === "por_revisar") continue;
    if (!d.vendedor_id || !d.periodo_id) continue;

    const clave = `${d.vendedor_id}|${d.periodo_id}`;
    let a = mapa.get(clave);
    if (!a) {
      a = {
        vendedor_id: d.vendedor_id, periodo_id: d.periodo_id,
        deals_creados: 0, deals_ganados: 0, deals_perdidos: 0,
        ganado_sin_iva: 0, ganado_con_iva: 0,
        ticket_promedio_sin_iva: null, ciclo_cierre_dias: null,
        _ciclos: [], _montos: [],
      };
      mapa.set(clave, a);
    }

    a.deals_creados += 1;
    if (d.cerrado_ganado) {
      a.deals_ganados += 1;
      if (d.monto_sin_iva != null) {
        a.ganado_sin_iva += d.monto_sin_iva;
        a._montos.push(d.monto_sin_iva);
      }
      if (d.fecha_creacion && d.fecha_cierre) {
        const dias = (new Date(d.fecha_cierre).getTime() - new Date(d.fecha_creacion).getTime()) / 86_400_000;
        if (dias >= 0) a._ciclos.push(dias);
      }
    } else if (d.motivo_perdida || normalizar(String(d.etapa ?? "")).includes("perdid")) {
      a.deals_perdidos += 1;
    }
  }

  return [...mapa.values()].map(({ _ciclos, _montos, ...a }) => ({
    ...a,
    ganado_sin_iva: Math.round(a.ganado_sin_iva * 100) / 100,
    ganado_con_iva: Math.round(a.ganado_sin_iva * IVA * 100) / 100,
    ticket_promedio_sin_iva: _montos.length
      ? Math.round((_montos.reduce((s, n) => s + n, 0) / _montos.length) * 100) / 100
      : null,
    ciclo_cierre_dias: _ciclos.length
      ? Math.round((_ciclos.reduce((s, n) => s + n, 0) / _ciclos.length) * 10) / 10
      : null,
  }));
}

export { ETAPAS_PERDIDAS };
