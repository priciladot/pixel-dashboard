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
 * título visible). Los defaults de abajo son los ids reales de este
 * tablero, confirmados con `listarColumnas()` el 2026-09-03 — solo hay que
 * tocar las variables MONDAY_COL_* si el tablero cambia de estructura.
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
 * Ids de columna del tablero — confirmados el 2026-09-03 contra el tablero
 * real (board_id 18408527402) con `listarColumnas()`, no adivinados. Ajustar
 * por entorno solo si el tablero cambia de estructura.
 */
export const COLUMNAS = {
  // Cruce con HubSpot
  hubspotId:        process.env.MONDAY_COL_HUBSPOT_ID        ?? "text_mm2cp3rz",   // HubSpot ID
  linkHubspot:      process.env.MONDAY_COL_LINK_HUBSPOT      ?? "link_mm2cfr3g",   // Link HubSpot
  // Atribución
  propietario:      process.env.MONDAY_COL_PROPIETARIO       ?? "text_mm2cp93m",   // Propietario
  estado:           process.env.MONDAY_COL_ESTADO            ?? "color_mm4pd325",  // Estado de Proyecto
  porcentaje:       process.env.MONDAY_COL_PORCENTAJE        ?? "numeric_mm4pzs6", // Porcentaje de comisión
  montoTotal:       process.env.MONDAY_COL_MONTO_TOTAL       ?? "numeric_mm2c3y3r",// Monto
  // Cierre y origen
  tipoNegocio:      process.env.MONDAY_COL_TIPO_NEGOCIO      ?? "text_mm2ch4cn",   // Tipo de Negocio
  comoLlego:        process.env.MONDAY_COL_COMO_LLEGO        ?? "text_mm2cg7h6",   // ¿Cómo llegó?
  herramientaVenta: process.env.MONDAY_COL_HERRAMIENTA_VENTA ?? "dropdown_mm2xre6s", // Herramienta de Venta
  empresa:          process.env.MONDAY_COL_EMPRESA           ?? "text_mm2n5hzp",   // Empresa
  correoCliente:    process.env.MONDAY_COL_CORREO_CLIENTE    ?? "email_mm2m5gyy",  // Correo del cliente
  // Fechas operativas
  inicioEvento:     process.env.MONDAY_COL_INICIO_EVENTO     ?? "date_mm2cgrwm",   // Inicio de Evento
  finEvento:        process.env.MONDAY_COL_FIN_EVENTO        ?? "date_mm2cmpkw",   // Fin de Evento
  mesEvento:        process.env.MONDAY_COL_MES_EVENTO        ?? "text_mm2cmzg5",   // Mes de Evento
  semana:           process.env.MONDAY_COL_SEMANA            ?? "dropdown_mm57897s", // Semana
  diasActivacion:   process.env.MONDAY_COL_DIAS_ACTIVACION   ?? "formula_mm2qq26t", // Días de activación (columna fórmula)
  fechaCierre:      process.env.MONDAY_COL_FECHA_CIERRE      ?? "date_mm2c52f2",   // Fecha de Cierre
  // Detalle comercial / producto
  areaPixelFactory: process.env.MONDAY_COL_AREA_PIXEL_FACTORY ?? "dropdown_mm2c21hj", // Área de Pixel Factory
  marcaEvento:      process.env.MONDAY_COL_MARCA_EVENTO      ?? "text_mm2x9g7a",   // Marca / Evento
  productos:        process.env.MONDAY_COL_PRODUCTOS         ?? "dropdown_mm2xby5y", // Productos
  numProductos:     process.env.MONDAY_COL_NUM_PRODUCTOS     ?? "numeric_mm2x5np7",// # productos
  numActivaciones:  process.env.MONDAY_COL_NUM_ACTIVACIONES  ?? "numeric_mm2fzp0x",// # activaciones
  viaticos:         process.env.MONDAY_COL_VIATICOS          ?? "numeric_mm2x2h6n",// Viáticos
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
  /** Solo columnas tipo fórmula (ej. Días de activación): `text` viene vacío, el valor calculado sale aquí. */
  display_value?: string | null;
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

/**
 * `text` viene vacío en columnas tipo fórmula (ej. Días de activación) —
 * ahí el valor calculado sale en `display_value` (pedido en la query con
 * `... on FormulaValue`). Para el resto de los tipos, `text` es lo normal.
 */
function valor(item: ItemApi, id: string): string | null {
  const cv = item.column_values.find((c) => c.id === id);
  return cv?.display_value ?? cv?.text ?? null;
}

/** El link de HubSpot viene como "Ver en HubSpot - https://...", se extrae solo la URL. */
function soloUrl(v: string | null): string | null {
  const t = texto(v);
  if (!t) return null;
  const m = t.match(/https?:\/\/\S+/);
  return m ? m[0] : t;
}

function aCierreCrudo(item: ItemApi): CierreCrudo {
  const estado = texto(valor(item, COLUMNAS.estado));
  const esIndividual = estado != null && ESTADOS_INDIVIDUAL.includes(normalizar(estado));
  const porcentajeCrudo = num(valor(item, COLUMNAS.porcentaje));

  // Regla de negocio: Individual o 100% => se atribuye el monto completo.
  // Si el tablero no trae el número en una fila Individual, se asume 100 en
  // vez de dejarlo nulo (que produciría monto_atribuido = 0, incorrecto).
  const porcentaje = porcentajeCrudo ?? (esIndividual ? 100 : null);

  const tipoNegocioRaw = valor(item, COLUMNAS.tipoNegocio);

  return {
    elemento_id: item.id,
    hubspot_id: texto(valor(item, COLUMNAS.hubspotId)),
    link_hubspot: soloUrl(valor(item, COLUMNAS.linkHubspot)),
    propietario_nombre: texto(valor(item, COLUMNAS.propietario)),
    estado_proyecto: estado,
    porcentaje_comision: porcentaje,
    monto_total: num(valor(item, COLUMNAS.montoTotal)),
    // Sin dato en Monday se deja null (no "por_revisar") para no pisar lo
    // que ya haya resuelto HubSpot; el coalesce vive en v_deals_operativo.
    tipo_negocio: tipoNegocioRaw ? tipoCliente(tipoNegocioRaw) : null,
    como_llego: texto(valor(item, COLUMNAS.comoLlego)),
    herramienta_venta: texto(valor(item, COLUMNAS.herramientaVenta)),
    empresa: texto(valor(item, COLUMNAS.empresa)),
    correo_cliente: texto(valor(item, COLUMNAS.correoCliente)),
    inicio_evento: texto(valor(item, COLUMNAS.inicioEvento)),
    fin_evento: texto(valor(item, COLUMNAS.finEvento)),
    mes_evento: texto(valor(item, COLUMNAS.mesEvento)),
    semana: texto(valor(item, COLUMNAS.semana)),
    dias_activacion: num(valor(item, COLUMNAS.diasActivacion)),
    fecha_cierre: texto(valor(item, COLUMNAS.fechaCierre)),
    area_pixel_factory: texto(valor(item, COLUMNAS.areaPixelFactory)),
    marca_evento: texto(valor(item, COLUMNAS.marcaEvento)),
    productos: texto(valor(item, COLUMNAS.productos)),
    num_productos: num(valor(item, COLUMNAS.numProductos)),
    num_activaciones: num(valor(item, COLUMNAS.numActivaciones)),
    viaticos: num(valor(item, COLUMNAS.viaticos)),
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
          items { id name column_values(ids: $columnIds) { id text value ... on FormulaValue { display_value } } }
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
          items { id name column_values(ids: $columnIds) { id text value ... on FormulaValue { display_value } } }
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
