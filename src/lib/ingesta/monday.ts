/**
 * Cliente de la API GraphQL de Monday.com (v2), para el tablero
 * "Deals Ganados 2026 - HubSpot" (board_id 18408527402 por default).
 *
 * Requiere un token personal o de app con acceso de lectura al tablero:
 *   MONDAY_API_TOKEN
 *
 * Estructura real del tablero (confirmada en la interfaz, no supuesta):
 * cada fila es la porción de UN vendedor sobre un negocio —
 *   Estado de Proyecto      'Individual' | 'Compartida/Dividida'
 *   Porcentaje de comisión  % de ese vendedor sobre el monto total
 *   Propietario             el ejecutivo dueño de esa porción
 * Un negocio dividido entre dos personas son DOS filas en Monday, no una
 * fila con dos columnas de persona.
 *
 * Además de la atribución, el tablero trae información operativa/comercial
 * que HubSpot no modela (tipo de negocio, producto, fechas de evento,
 * viáticos) — se lee completa para no perderla, aunque hoy solo
 * `tipo_negocio` se use para tapar un vacío de HubSpot.
 *
 * IDs de columna: Monday identifica cada columna con un id interno (no el
 * título visible), y cambia entre tableros. Los defaults de abajo son un
 * punto de partida razonable — confírmalos con `listarColumnas()`.
 */

import { normalizar, tipoCliente } from "./sanitizar";

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
  // Cruce con HubSpot
  hubspotId:        process.env.MONDAY_COL_HUBSPOT_ID        ?? "text_hubspot_id",
  linkHubspot:      process.env.MONDAY_COL_LINK_HUBSPOT      ?? "link_hubspot",
  // Atribución
  propietario:      process.env.MONDAY_COL_PROPIETARIO       ?? "person",
  estado:           process.env.MONDAY_COL_ESTADO            ?? "status",
  porcentaje:       process.env.MONDAY_COL_PORCENTAJE        ?? "porcentaje_comision",
  montoTotal:       process.env.MONDAY_COL_MONTO_TOTAL       ?? "monto_total",
  // Cierre y origen
  tipoNegocio:      process.env.MONDAY_COL_TIPO_NEGOCIO      ?? "tipo_negocio",
  comoLlego:        process.env.MONDAY_COL_COMO_LLEGO        ?? "como_llego",
  herramientaVenta: process.env.MONDAY_COL_HERRAMIENTA_VENTA ?? "herramienta_venta",
  empresa:          process.env.MONDAY_COL_EMPRESA           ?? "empresa",
  correoCliente:    process.env.MONDAY_COL_CORREO_CLIENTE    ?? "correo_cliente",
  // Fechas operativas
  inicioEvento:     process.env.MONDAY_COL_INICIO_EVENTO     ?? "inicio_evento",
  finEvento:        process.env.MONDAY_COL_FIN_EVENTO        ?? "fin_evento",
  mesEvento:        process.env.MONDAY_COL_MES_EVENTO        ?? "mes_evento",
  semana:           process.env.MONDAY_COL_SEMANA            ?? "semana",
  diasActivacion:   process.env.MONDAY_COL_DIAS_ACTIVACION   ?? "dias_activacion",
  fechaCierre:      process.env.MONDAY_COL_FECHA_CIERRE      ?? "date",
  // Detalle comercial / producto
  areaPixelFactory: process.env.MONDAY_COL_AREA_PIXEL_FACTORY ?? "area_pixel_factory",
  marcaEvento:      process.env.MONDAY_COL_MARCA_EVENTO      ?? "marca_evento",
  productos:        process.env.MONDAY_COL_PRODUCTOS         ?? "productos",
  numProductos:     process.env.MONDAY_COL_NUM_PRODUCTOS     ?? "num_productos",
  numActivaciones:  process.env.MONDAY_COL_NUM_ACTIVACIONES  ?? "num_activaciones",
  viaticos:         process.env.MONDAY_COL_VIATICOS          ?? "viaticos",
};

/** Valores de "Estado de Proyecto" que cuentan como venta sin dividir. */
const ESTADOS_INDIVIDUAL = ["individual"];

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
  hubspot_id: string | null;
  link_hubspot: string | null;
  propietario_nombre: string | null;
  estado_proyecto: string | null;
  /** Ya normalizado: 100 cuando Estado de Proyecto es Individual y el tablero no trae número. */
  porcentaje_comision: number | null;
  monto_total: number | null;
  /** Reducido a existente/nuevo/por_revisar, misma dicotomía que hubspot_deals.tipo_cliente. */
  tipo_negocio: "existente" | "nuevo" | "por_revisar" | null;
  como_llego: string | null;
  herramienta_venta: string | null;
  empresa: string | null;
  correo_cliente: string | null;
  inicio_evento: string | null;
  fin_evento: string | null;
  mes_evento: string | null;
  semana: string | null;
  dias_activacion: number | null;
  fecha_cierre: string | null;
  area_pixel_factory: string | null;
  marca_evento: string | null;
  productos: string | null;
  num_productos: number | null;
  num_activaciones: number | null;
  viaticos: number | null;
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

function col(item: ItemApi, id: string): ColumnValue | undefined {
  return item.column_values.find((c) => c.id === id);
}

function aCierreCrudo(item: ItemApi): CierreCrudo {
  const estado = texto(col(item, COLUMNAS.estado)?.text ?? null);
  const esIndividual = estado != null && ESTADOS_INDIVIDUAL.includes(normalizar(estado));
  const porcentajeCrudo = num(col(item, COLUMNAS.porcentaje)?.text ?? null);

  // Regla de negocio: Individual o 100% => se atribuye el monto completo.
  // Si el tablero no trae el número en una fila Individual, se asume 100 en
  // vez de dejarlo nulo (que produciría monto_atribuido = 0, incorrecto).
  const porcentaje = porcentajeCrudo ?? (esIndividual ? 100 : null);

  const tipoNegocioRaw = col(item, COLUMNAS.tipoNegocio)?.text ?? null;

  return {
    elemento_id: item.id,
    hubspot_id: texto(col(item, COLUMNAS.hubspotId)?.text ?? null),
    link_hubspot: texto(col(item, COLUMNAS.linkHubspot)?.text ?? null),
    propietario_nombre: texto(col(item, COLUMNAS.propietario)?.text ?? null),
    estado_proyecto: estado,
    porcentaje_comision: porcentaje,
    monto_total: num(col(item, COLUMNAS.montoTotal)?.text ?? null),
    // Sin dato en Monday se deja null (no "por_revisar") para no pisar lo
    // que ya haya resuelto HubSpot; el coalesce vive en v_deals_operativo.
    tipo_negocio: tipoNegocioRaw ? tipoCliente(tipoNegocioRaw) : null,
    como_llego: texto(col(item, COLUMNAS.comoLlego)?.text ?? null),
    herramienta_venta: texto(col(item, COLUMNAS.herramientaVenta)?.text ?? null),
    empresa: texto(col(item, COLUMNAS.empresa)?.text ?? null),
    correo_cliente: texto(col(item, COLUMNAS.correoCliente)?.text ?? null),
    inicio_evento: texto(col(item, COLUMNAS.inicioEvento)?.text ?? null),
    fin_evento: texto(col(item, COLUMNAS.finEvento)?.text ?? null),
    mes_evento: texto(col(item, COLUMNAS.mesEvento)?.text ?? null),
    semana: texto(col(item, COLUMNAS.semana)?.text ?? null),
    dias_activacion: num(col(item, COLUMNAS.diasActivacion)?.text ?? null),
    fecha_cierre: texto(col(item, COLUMNAS.fechaCierre)?.text ?? null),
    area_pixel_factory: texto(col(item, COLUMNAS.areaPixelFactory)?.text ?? null),
    marca_evento: texto(col(item, COLUMNAS.marcaEvento)?.text ?? null),
    productos: texto(col(item, COLUMNAS.productos)?.text ?? null),
    num_productos: num(col(item, COLUMNAS.numProductos)?.text ?? null),
    num_activaciones: num(col(item, COLUMNAS.numActivaciones)?.text ?? null),
    viaticos: num(col(item, COLUMNAS.viaticos)?.text ?? null),
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
  const pagina = r.boards[0]?.items_page;
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
