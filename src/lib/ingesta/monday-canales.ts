/**
 * Cliente de la API GraphQL de Monday.com para los tableros de MÉTRICAS
 * POR CANAL de Marketing que sí tienen una columna de persona real
 * (a diferencia de ADS/Pinterest/Engagement Cuenta/CTR META/Soporte
 * operativo, donde la atribución no vive en Monday -- ver investigación
 * del 2026-09-14). Confirmados contra la API real, no adivinados:
 *
 *   Individual Engagement | KPIS (18425462511)
 *     Responsable: multiple_person_mm5zya0w
 *     Semana:      dropdown_mm5z76dk
 *     Métricas:    Alcance (text_mm5b2zkh), Interacción (text_mm5b4jna)
 *     -- guardadas como columna `text` aunque el valor es numérico.
 *
 *   CTR Individual| KPIS (18429615591)
 *     Responsable:     multiple_person_mm6v5hj
 *     Semana:          dropdown_mm6v164z
 *     Métricas:        Visualizaciones (numeric_mm6vdyy7), Clics (numeric_mm6ve7dk)
 *     CTR (formula_mm6vwmr6) siempre regresa vacío por la API -- se
 *     calcula aquí mismo (Clics / Visualizaciones) en vez de leerlo.
 *
 * Mismo patrón de cliente/paginación que monday-marketing.ts.
 */

const BASE = "https://api.monday.com/v2";
const VERSION = "2024-10";

function token(): string {
  const t = process.env.MONDAY_API_TOKEN;
  if (!t) throw new Error("Falta MONDAY_API_TOKEN en el entorno.");
  return t;
}

async function api<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { Authorization: token(), "Content-Type": "application/json", "API-Version": VERSION },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 10_000));
    return api<T>(query, variables);
  }
  if (!res.ok) throw new Error(`Monday ${res.status}: ${await res.text()}`);
  const cuerpo = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (cuerpo.errors?.length) throw new Error(`Monday GraphQL: ${cuerpo.errors.map((e) => e.message).join("; ")}`);
  return cuerpo.data as T;
}

interface ColumnValue { id: string; text: string | null; value: string | null }
interface ItemApi { id: string; name: string; column_values: ColumnValue[] }

export interface MetricaCanalCrudo {
  tablero: string;
  elemento_id: string;
  nombre_metrica: string;
  valor: number | null;
  responsable_monday_ids: string[];
  responsables_raw: string | null;
  semana: string | null;
  raw: unknown;
}

interface DefinicionTablero {
  clave: string;
  boardId: string;
  colResponsables: string;
  colSemana: string;
  metricas: Array<{ col: string; nombre: string }>;
  /** Métricas derivadas que Monday no expone bien por la API (ej. una fórmula que sale vacía). */
  derivadas?: (valores: Record<string, number | null>) => Array<{ nombre: string; valor: number | null }>;
}

const TABLEROS: DefinicionTablero[] = [
  {
    clave: "individual_engagement",
    boardId: "18425462511",
    colResponsables: "multiple_person_mm5zya0w",
    colSemana: "dropdown_mm5z76dk",
    metricas: [
      { col: "text_mm5b2zkh", nombre: "Alcance" },
      { col: "text_mm5b4jna", nombre: "Interacción" },
    ],
  },
  {
    clave: "ctr_individual",
    boardId: "18429615591",
    colResponsables: "multiple_person_mm6v5hj",
    colSemana: "dropdown_mm6v164z",
    metricas: [
      { col: "numeric_mm6vdyy7", nombre: "Visualizaciones" },
      { col: "numeric_mm6ve7dk", nombre: "Clics" },
    ],
    derivadas: (v) => {
      const vis = v["Visualizaciones"];
      const clics = v["Clics"];
      const ctr = vis && vis > 0 && clics != null ? clics / vis : null;
      return [{ nombre: "CTR", valor: ctr }];
    },
  },
];

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

function idsPersona(item: ItemApi, columnId: string): string[] {
  const cv = item.column_values.find((c) => c.id === columnId);
  if (!cv?.value) return [];
  try {
    const parsed = JSON.parse(cv.value) as { personsAndTeams?: Array<{ id: number | string; kind?: string }> };
    return (parsed.personsAndTeams ?? []).filter((p) => !p.kind || p.kind === "person").map((p) => String(p.id));
  } catch {
    return [];
  }
}

function filasDeItem(tablero: DefinicionTablero, item: ItemApi): MetricaCanalCrudo[] {
  const responsable_monday_ids = idsPersona(item, tablero.colResponsables);
  const responsables_raw = texto(item.column_values.find((c) => c.id === tablero.colResponsables)?.text ?? null);
  const semana = texto(item.column_values.find((c) => c.id === tablero.colSemana)?.text ?? null);

  const valores: Record<string, number | null> = {};
  const filas: MetricaCanalCrudo[] = tablero.metricas.map((m) => {
    const v = num(item.column_values.find((c) => c.id === m.col)?.text ?? null);
    valores[m.nombre] = v;
    return {
      tablero: tablero.clave,
      elemento_id: `${item.id}:${m.nombre}`,
      nombre_metrica: m.nombre,
      valor: v,
      responsable_monday_ids,
      responsables_raw,
      semana,
      raw: item,
    };
  });

  if (tablero.derivadas) {
    for (const d of tablero.derivadas(valores)) {
      filas.push({
        tablero: tablero.clave,
        elemento_id: `${item.id}:${d.nombre}`,
        nombre_metrica: d.nombre,
        valor: d.valor,
        responsable_monday_ids,
        responsables_raw,
        semana,
        raw: item,
      });
    }
  }

  return filas;
}

async function listarItemsDe(tablero: DefinicionTablero): Promise<ItemApi[]> {
  const columnIds = [tablero.colResponsables, tablero.colSemana, ...tablero.metricas.map((m) => m.col)];
  const salida: ItemApi[] = [];

  const r = await api<{ boards: Array<{ items_page: { cursor: string | null; items: ItemApi[] } }> }>(
    `query ($boardId: [ID!], $columnIds: [String!]) {
      boards(ids: $boardId) {
        items_page(limit: 100) { cursor items { id name column_values(ids: $columnIds) { id text value } } }
      }
    }`,
    { boardId: [tablero.boardId], columnIds },
  );
  const pagina = r.boards[0]?.items_page;
  if (!pagina) return [];
  salida.push(...pagina.items);
  let cursor = pagina.cursor;

  while (cursor) {
    const r2 = await api<{ next_items_page: { cursor: string | null; items: ItemApi[] } }>(
      `query ($cursor: String!, $columnIds: [String!]) {
        next_items_page(cursor: $cursor, limit: 100) { cursor items { id name column_values(ids: $columnIds) { id text value } } }
      }`,
      { cursor, columnIds },
    );
    salida.push(...r2.next_items_page.items);
    cursor = r2.next_items_page.cursor;
  }

  return salida;
}

/** Trae los dos tableros de canal (Individual Engagement, CTR Individual) -- una fila por métrica por elemento. */
export async function listarMetricasCanal(): Promise<MetricaCanalCrudo[]> {
  const salida: MetricaCanalCrudo[] = [];
  for (const tablero of TABLEROS) {
    const items = await listarItemsDe(tablero);
    salida.push(...items.flatMap((item) => filasDeItem(tablero, item)));
  }
  return salida;
}

export function resolverResponsablesCanal(idsMonday: string[], porMondayId: Map<string, string>): string[] {
  return idsMonday.map((id) => porMondayId.get(id)).filter((v): v is string => v != null);
}
