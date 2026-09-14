/**
 * Cliente de la API GraphQL de Monday.com (v2), para el tablero
 * "Registro de KPIs - Marketing" (board_id 18421094583 por default,
 * dentro del workspace "KPIs" / carpeta "Gestión de KPIs - Marketing").
 *
 * Requiere el mismo token que ventas: MONDAY_API_TOKEN.
 *
 * Estructura real del tablero (confirmada en la interfaz, no supuesta):
 * cada fila es UNA métrica de UNA persona (o de un par, si el reto es
 * compartido) en UNA semana de UN mes. El nombre del item ya trae los 3
 * datos juntos, ej. "🔴 Leads calificados generados | Alan Morales Vega |
 * Julio - Semana 1" -- pero Meta/Amarillo/Rojo/Resultado/%Cumplimiento/
 * Semáforo ya vienen calculados por Monday en columnas aparte, así que no
 * hace falta parsear el nombre para esos datos, solo para el nombre limpio
 * del KPI.
 *
 * A diferencia del tablero de ventas (donde el "propietario" es texto
 * libre y se resuelve por alias difuso), aquí la columna "Responsables"
 * es una columna de personas real de Monday -- se lee su `value` crudo
 * (JSON) para sacar el ID NUMÉRICO de cada persona, no su nombre, y se
 * resuelve contra profiles.monday_person_id. Evita el mismo tipo de bug
 * de acentos/duplicados que ya salió en el tablero de ventas.
 */

import { normalizar } from "./sanitizar";

const BASE = "https://api.monday.com/v2";
const VERSION = "2024-10";

function token(): string {
  const t = process.env.MONDAY_API_TOKEN;
  if (!t) throw new Error("Falta MONDAY_API_TOKEN en el entorno.");
  return t;
}

function boardId(): string {
  return process.env.MONDAY_MKT_KPIS_BOARD_ID ?? "18421094583";
}

/**
 * Ids de columna del tablero — confirmados el 2026-09-14 contra el tablero
 * real (board_id 18421094583) con get_board_info, no adivinados. Ajustar
 * por entorno solo si el tablero cambia de estructura.
 */
export const COLUMNAS_KPI = {
  unidad:          process.env.MONDAY_MKT_COL_UNIDAD          ?? "dropdown_mm53y50m", // Unidad
  equipo:          process.env.MONDAY_MKT_COL_EQUIPO          ?? "dropdown_mm52s2h1", // Equipo
  responsables:    process.env.MONDAY_MKT_COL_RESPONSABLES    ?? "multiple_person_mm52fa6z", // Responsables
  mes:             process.env.MONDAY_MKT_COL_MES             ?? "dropdown_mm523z0x", // Mes
  semana:          process.env.MONDAY_MKT_COL_SEMANA          ?? "dropdown_mm52h4e9", // Semana
  cronograma:      process.env.MONDAY_MKT_COL_CRONOGRAMA      ?? "timerange_mm52gjp2", // Cronograma
  meta:            process.env.MONDAY_MKT_COL_META            ?? "numeric_mm5287xy",  // 🟢 Meta
  umbralAmarillo:  process.env.MONDAY_MKT_COL_AMARILLO        ?? "numeric_mm523pge",  // 🟡 Amarillo
  umbralRojo:      process.env.MONDAY_MKT_COL_ROJO            ?? "numeric_mm52y3py",  // 🔴 Rojo
  resultado:       process.env.MONDAY_MKT_COL_RESULTADO       ?? "numeric_mm52fhh9",  // Resultado
  pctCumplimiento: process.env.MONDAY_MKT_COL_PCT_CUMPLIMIENTO ?? "formula_mm52p7hc", // % de Cumplimiento (fórmula)
  semaforo:        process.env.MONDAY_MKT_COL_SEMAFORO        ?? "color_mm525k0",     // Semáforo
};

async function api<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      Authorization: token(),
      "Content-Type": "application/json",
      "API-Version": VERSION,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 10_000));
    return api<T>(query, variables);
  }
  if (!res.ok) {
    throw new Error(`Monday ${res.status}: ${await res.text()}`);
  }
  const cuerpo = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (cuerpo.errors?.length) {
    throw new Error(`Monday GraphQL: ${cuerpo.errors.map((e) => e.message).join("; ")}`);
  }
  return cuerpo.data as T;
}

export interface ColumnaTablero {
  id: string;
  title: string;
  type: string;
}

/** Diagnóstico: lista las columnas reales del tablero (id, título, tipo). */
export async function listarColumnasKpi(): Promise<ColumnaTablero[]> {
  const r = await api<{ boards: Array<{ columns: ColumnaTablero[] }> }>(
    `query ($boardId: [ID!]) {
      boards(ids: $boardId) { columns { id title type } }
    }`,
    { boardId: [boardId()] },
  );
  return r.boards[0]?.columns ?? [];
}

interface ColumnValue {
  id: string;
  text: string | null;
  value: string | null;
  display_value?: string | null;
}

interface ItemApi {
  id: string;
  name: string;
  column_values: ColumnValue[];
}

export interface KpiMarketingCrudo {
  elemento_id: string;
  nombre_kpi: string;
  unidad: string | null;
  equipo: string | null;
  /** Ids NUMÉRICOS de persona de Monday -- se resuelven contra profiles.monday_person_id, ver resolverResponsables(). */
  responsable_monday_ids: string[];
  /** Nombres tal como vienen de Monday -- respaldo de despliegue si el mapeo de arriba no encuentra a alguien. */
  responsables_raw: string | null;
  mes: string | null;
  semana: string | null;
  cronograma_inicio: string | null;
  cronograma_fin: string | null;
  meta: number | null;
  umbral_amarillo: number | null;
  umbral_rojo: number | null;
  resultado: number | null;
  pct_cumplimiento: number | null;
  semaforo: "Verde" | "Amarillo" | "Rojo" | null;
  raw: unknown;
}

function num(v: string | null): number | null {
  if (v == null) return null;
  const limpio = v.replace(/[^0-9.-]/g, "");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function texto(v: string | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** `text` viene vacío en la columna fórmula (% de Cumplimiento) -- ahí el valor calculado sale en `display_value`. */
function valor(item: ItemApi, id: string): string | null {
  const cv = item.column_values.find((c) => c.id === id);
  return cv?.display_value ?? cv?.text ?? null;
}

/**
 * Nombre limpio del KPI a partir del nombre del item de Monday --
 * "🔴 Leads calificados generados | Alan Morales Vega | Julio - Semana 1"
 * -> "Leads calificados generados". El emoji de semáforo y el resto de los
 * segmentos (persona, mes/semana) ya viven en columnas aparte, así que
 * solo se necesita el primer segmento sin el prefijo no-alfanumérico.
 */
function nombreKpiDe(nombreItem: string): string {
  const primerSegmento = nombreItem.split("|")[0] ?? nombreItem;
  return primerSegmento.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

/**
 * Ids de persona de una columna "people" de Monday -- se leen del `value`
 * crudo (JSON: `{"personsAndTeams":[{"id":123,"kind":"person"}, ...]}`),
 * no del `text` (que trae nombres, no ids), justo para no depender de
 * coincidencia de nombres/acentos.
 */
function idsPersona(item: ItemApi, columnId: string): string[] {
  const cv = item.column_values.find((c) => c.id === columnId);
  if (!cv?.value) return [];
  try {
    const parsed = JSON.parse(cv.value) as { personsAndTeams?: Array<{ id: number | string; kind?: string }> };
    return (parsed.personsAndTeams ?? [])
      .filter((p) => !p.kind || p.kind === "person")
      .map((p) => String(p.id));
  } catch {
    return [];
  }
}

/** Rango de fechas de una columna "timerange" (Cronograma) -- from/to vienen en el `value` crudo (JSON). */
function rangoFechas(item: ItemApi, columnId: string): { inicio: string | null; fin: string | null } {
  const cv = item.column_values.find((c) => c.id === columnId);
  if (!cv?.value) return { inicio: null, fin: null };
  try {
    const parsed = JSON.parse(cv.value) as { from?: string; to?: string };
    return { inicio: parsed.from ?? null, fin: parsed.to ?? null };
  } catch {
    return { inicio: null, fin: null };
  }
}

function aKpiMarketingCrudo(item: ItemApi): KpiMarketingCrudo {
  const semaforoRaw = texto(valor(item, COLUMNAS_KPI.semaforo));
  const semaforo = semaforoRaw === "Verde" || semaforoRaw === "Amarillo" || semaforoRaw === "Rojo" ? semaforoRaw : null;
  const { inicio, fin } = rangoFechas(item, COLUMNAS_KPI.cronograma);

  return {
    elemento_id: item.id,
    nombre_kpi: nombreKpiDe(item.name),
    unidad: texto(valor(item, COLUMNAS_KPI.unidad)),
    equipo: texto(valor(item, COLUMNAS_KPI.equipo)),
    responsable_monday_ids: idsPersona(item, COLUMNAS_KPI.responsables),
    responsables_raw: texto(valor(item, COLUMNAS_KPI.responsables)),
    mes: texto(valor(item, COLUMNAS_KPI.mes)),
    semana: texto(valor(item, COLUMNAS_KPI.semana)),
    cronograma_inicio: inicio,
    cronograma_fin: fin,
    meta: num(valor(item, COLUMNAS_KPI.meta)),
    umbral_amarillo: num(valor(item, COLUMNAS_KPI.umbralAmarillo)),
    umbral_rojo: num(valor(item, COLUMNAS_KPI.umbralRojo)),
    resultado: num(valor(item, COLUMNAS_KPI.resultado)),
    pct_cumplimiento: num(valor(item, COLUMNAS_KPI.pctCumplimiento)),
    semaforo,
    raw: item,
  };
}

/** Trae todos los elementos del tablero, paginando con el cursor de Monday. */
export async function listarKpisMarketing(): Promise<KpiMarketingCrudo[]> {
  const columnIds = Object.values(COLUMNAS_KPI);
  const salida: KpiMarketingCrudo[] = [];

  const r = await api<{ boards: Array<{ items_page: { cursor: string | null; items: ItemApi[] } }> }>(
    `query ($boardId: [ID!], $columnIds: [String!]) {
      boards(ids: $boardId) {
        items_page(limit: 100) {
          cursor
          items { id name column_values(ids: $columnIds) { id text value ... on FormulaValue { display_value } } }
        }
      }
    }`,
    { boardId: [boardId()], columnIds },
  );
  const pagina = r.boards[0]?.items_page;
  if (!pagina) return [];
  salida.push(...pagina.items.map(aKpiMarketingCrudo));
  let cursor = pagina.cursor;

  while (cursor) {
    const r2 = await api<{ next_items_page: { cursor: string | null; items: ItemApi[] } }>(
      `query ($cursor: String!, $columnIds: [String!]) {
        next_items_page(cursor: $cursor, limit: 100) {
          cursor
          items { id name column_values(ids: $columnIds) { id text value ... on FormulaValue { display_value } } }
        }
      }`,
      { cursor, columnIds },
    );
    salida.push(...r2.next_items_page.items.map(aKpiMarketingCrudo));
    cursor = r2.next_items_page.cursor;
  }

  return salida;
}

/** Resuelve ids de persona de Monday a vendedor_id vía profiles.monday_person_id. */
export function resolverResponsables(idsMonday: string[], porMondayId: Map<string, string>): string[] {
  return idsMonday.map((id) => porMondayId.get(id)).filter((v): v is string => v != null);
}

// Reexportado por si algún consumidor necesita normalizar responsables_raw como respaldo de despliegue.
export { normalizar };
