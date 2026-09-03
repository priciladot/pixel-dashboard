/**
 * Cliente de la API GraphQL de Monday.com (v2), para el tablero
 * "Deals Ganados 2026 - HubSpot" (board_id 18408527402 por default).
 *
 * Requiere un token personal o de app con acceso de lectura al tablero:
 *   MONDAY_API_TOKEN
 *
 * Monday es la fuente de la división de montos cuando dos vendedores
 * colaboran en un mismo evento — algo que HubSpot no modela (un deal, un
 * solo owner). El resto de la información del deal (monto base, etapa,
 * fechas) sigue viniendo de HubSpot; este conector solo aporta la división.
 *
 * IDs de columna: Monday identifica cada columna del tablero con un id
 * interno (no el título visible), y cambia entre tableros. Los defaults de
 * abajo son un punto de partida razonable, NO los ids reales de este
 * tablero — hay que confirmarlos corriendo `listarColumnas()` una vez que
 * exista el token, y ajustar las variables de entorno si no coinciden.
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
  return process.env.MONDAY_BOARD_ID ?? "18408527402";
}

/**
 * Ids de columna del tablero. AJUSTAR por entorno si no coinciden — llamar
 * a `listarColumnas()` para ver los ids y títulos reales.
 */
export const COLUMNAS = {
  hubspotId:           process.env.MONDAY_COL_HUBSPOT_ID          ?? "text_hubspot_id",
  vendedorPrincipal:    process.env.MONDAY_COL_VENDEDOR_PRINCIPAL   ?? "person",
  covendedor:           process.env.MONDAY_COL_COVENDEDOR           ?? "co_vendedor",
  montoTotal:           process.env.MONDAY_COL_MONTO_TOTAL          ?? "monto_total",
  porcentajeDivision:   process.env.MONDAY_COL_PORCENTAJE_DIVISION  ?? "porcentaje_division",
  montoVendedor:        process.env.MONDAY_COL_MONTO_VENDEDOR       ?? "monto_vendedor",
  montoCovendedor:      process.env.MONDAY_COL_MONTO_COVENDEDOR     ?? "monto_covendedor",
  estado:               process.env.MONDAY_COL_ESTADO               ?? "status",
  mesEvento:            process.env.MONDAY_COL_MES_EVENTO           ?? "mes_evento",
  fechaCierre:          process.env.MONDAY_COL_FECHA_CIERRE         ?? "date",
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
    // Límite de complejidad de Monday: reintenta pasado un momento.
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
export async function listarColumnas(): Promise<ColumnaTablero[]> {
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
}

interface ItemApi {
  id: string;
  name: string;
  column_values: ColumnValue[];
}

export interface CierreCrudo {
  elemento_id: string;
  hubspot_id_ref: string | null;
  vendedor_principal_nombre: string | null;
  covendedor_nombre: string | null;
  monto_total: number | null;
  porcentaje_division: number | null;
  monto_vendedor: number | null;
  monto_covendedor: number | null;
  estado_proyecto: string | null;
  mes_evento: string | null;
  fecha_cierre: string | null;
  raw: unknown;
}

function num(v: string | null): number | null {
  if (v == null) return null;
  const limpio = v.replace(/[^0-9.-]/g, "");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function col(item: ItemApi, id: string): ColumnValue | undefined {
  return item.column_values.find((c) => c.id === id);
}

function aCierreCrudo(item: ItemApi): CierreCrudo {
  const covendedorTexto = col(item, COLUMNAS.covendedor)?.text ?? null;
  return {
    elemento_id: item.id,
    hubspot_id_ref: col(item, COLUMNAS.hubspotId)?.text ?? null,
    vendedor_principal_nombre: col(item, COLUMNAS.vendedorPrincipal)?.text ?? null,
    // Columna de personas vacía en Monday suele regresar "" en vez de null.
    covendedor_nombre: covendedorTexto && covendedorTexto.trim() !== "" ? covendedorTexto : null,
    monto_total: num(col(item, COLUMNAS.montoTotal)?.text ?? null),
    porcentaje_division: num(col(item, COLUMNAS.porcentajeDivision)?.text ?? null),
    monto_vendedor: num(col(item, COLUMNAS.montoVendedor)?.text ?? null),
    monto_covendedor: num(col(item, COLUMNAS.montoCovendedor)?.text ?? null),
    estado_proyecto: col(item, COLUMNAS.estado)?.text ?? null,
    mes_evento: col(item, COLUMNAS.mesEvento)?.text ?? null,
    fecha_cierre: col(item, COLUMNAS.fechaCierre)?.text ?? null,
    raw: item,
  };
}

/** Trae todos los elementos del tablero, paginando con el cursor de Monday. */
export async function listarCierres(): Promise<CierreCrudo[]> {
  const columnIds = Object.values(COLUMNAS);
  const salida: CierreCrudo[] = [];

  const r = await api<{ boards: Array<{ items_page: { cursor: string | null; items: ItemApi[] } }> }>(
    `query ($boardId: [ID!], $columnIds: [String!]) {
      boards(ids: $boardId) {
        items_page(limit: 100) {
          cursor
          items { id name column_values(ids: $columnIds) { id text value } }
        }
      }
    }`,
    { boardId: [boardId()], columnIds },
  );
  let pagina = r.boards[0]?.items_page;
  if (!pagina) return [];
  salida.push(...pagina.items.map(aCierreCrudo));
  let cursor = pagina.cursor;

  while (cursor) {
    const r2 = await api<{ next_items_page: { cursor: string | null; items: ItemApi[] } }>(
      `query ($cursor: String!, $columnIds: [String!]) {
        next_items_page(cursor: $cursor, limit: 100) {
          cursor
          items { id name column_values(ids: $columnIds) { id text value } }
        }
      }`,
      { cursor, columnIds },
    );
    salida.push(...r2.next_items_page.items.map(aCierreCrudo));
    cursor = r2.next_items_page.cursor;
  }

  return salida;
}

/** Resuelve nombres de Monday (texto libre) a vendedor_id vía el mismo alias que usa el resto de la ingesta. */
export function resolverVendedor(
  nombre: string | null,
  porAlias: Map<string, string>,
): string | null {
  if (!nombre) return null;
  return porAlias.get(normalizar(nombre)) ?? null;
}
