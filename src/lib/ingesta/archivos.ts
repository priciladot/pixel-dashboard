/**
 * Lectura de archivos históricos (Julio / Agosto y lo que venga).
 *
 * Formatos soportados:
 *   .csv / .tsv  exportación de HubSpot o del semáforo
 *   .json        exportación de HubSpot o volcado propio
 *   .xlsx        semáforo comercial
 *   .pdf         reportes de evaluación 1:1 ya generados (extrae las 6 secciones)
 *
 * El mapeo de encabezados es tolerante: acepta el nombre en español o en
 * inglés, con o sin acentos, y en cualquier orden.
 */

import { parse as parseCsv } from "csv-parse/sync";
import { normalizar, aNumero, type DealCrudo } from "./sanitizar";

/* ------------------------------------------------------------------ */
/* Encabezados                                                         */
/* ------------------------------------------------------------------ */

const ALIAS_COLUMNAS: Record<string, string[]> = {
  hubspot_id:       ["record id", "id del registro", "hubspot id", "id", "deal id", "id del negocio"],
  nombre:           ["deal name", "nombre del negocio", "negocio", "nombre"],
  owner_nombre:     ["deal owner", "propietario del negocio", "propietario", "owner", "vendedor", "asesor", "ejecutivo"],
  owner_hubspot_id: ["deal owner id", "owner id", "id del propietario", "hubspot owner id"],
  monto:            ["amount", "importe", "monto", "valor", "monto del negocio", "importe del negocio"],
  etapa:            ["deal stage", "etapa del negocio", "etapa", "stage"],
  fecha_creacion:   ["create date", "fecha de creacion", "fecha de creación", "created", "fecha creacion"],
  fecha_cierre:     ["close date", "fecha de cierre", "fecha cierre", "closed"],
  tipo_cliente:     ["tipo de cliente", "tipo cliente", "cliente", "existente/nuevo", "customer type"],
  origen:           ["origen", "origen del lead", "fuente", "source", "lead source"],
  atribucion:       ["atribucion", "atribución", "atribuido a", "attribution"],
  motivo_perdida:   ["closed lost reason", "motivo de perdida", "motivo de pérdida", "razon de perdida", "motivo"],
  es_division:      ["division", "división", "es division", "es división", "dividido"],
};

/** Construye el índice encabezado-del-archivo -> campo-canónico. */
function mapearEncabezados(cabeceras: string[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const cab of cabeceras) {
    const n = normalizar(cab);
    for (const [campo, alias] of Object.entries(ALIAS_COLUMNAS)) {
      if (alias.some((a) => n === a || n.includes(a))) {
        if (!Object.values(mapa).includes(campo)) mapa[cab] = campo;
        break;
      }
    }
  }
  return mapa;
}

function filaADeal(fila: Record<string, unknown>, mapa: Record<string, string>): DealCrudo | null {
  const d: Record<string, unknown> = {};
  for (const [cab, campo] of Object.entries(mapa)) d[campo] = fila[cab];

  const id = d.hubspot_id ?? d.nombre;
  if (!id) return null;

  const div = normalizar(String(d.es_division ?? ""));
  return {
    hubspot_id: String(id),
    nombre: (d.nombre as string) ?? null,
    owner_hubspot_id: d.owner_hubspot_id ? String(d.owner_hubspot_id) : null,
    owner_nombre: (d.owner_nombre as string) ?? null,
    monto: aNumero(d.monto),
    etapa: (d.etapa as string) ?? null,
    fecha_creacion: (d.fecha_creacion as string) ?? null,
    fecha_cierre: (d.fecha_cierre as string) ?? null,
    tipo_cliente: (d.tipo_cliente as string) ?? null,
    origen: (d.origen as string) ?? null,
    atribucion: (d.atribucion as string) ?? null,
    motivo_perdida: (d.motivo_perdida as string) ?? null,
    es_division: ["si", "sí", "true", "1", "x", "division", "división"].includes(div),
    raw: fila,
  };
}

/* ------------------------------------------------------------------ */
/* CSV / TSV                                                           */
/* ------------------------------------------------------------------ */

export function leerCsv(contenido: string): { deals: DealCrudo[]; filasLeidas: number; sinMapear: string[] } {
  const delimitador = contenido.split("\n")[0]?.includes("\t") ? "\t" : ",";
  const filas = parseCsv(contenido, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    delimiter: delimitador,
    relax_column_count: true,
  }) as Record<string, string>[];

  if (filas.length === 0) return { deals: [], filasLeidas: 0, sinMapear: [] };

  const cabeceras = Object.keys(filas[0]);
  const mapa = mapearEncabezados(cabeceras);
  const sinMapear = cabeceras.filter((c) => !(c in mapa));

  const deals = filas.map((f) => filaADeal(f, mapa)).filter((d): d is DealCrudo => d !== null);
  return { deals, filasLeidas: filas.length, sinMapear };
}

/* ------------------------------------------------------------------ */
/* JSON                                                               */
/* ------------------------------------------------------------------ */

export function leerJson(contenido: string): { deals: DealCrudo[]; filasLeidas: number } {
  const datos = JSON.parse(contenido);
  // Acepta: array plano, { results: [...] } (formato HubSpot) o { deals: [...] }
  const lista: unknown[] = Array.isArray(datos)
    ? datos
    : Array.isArray(datos.results) ? datos.results
    : Array.isArray(datos.deals) ? datos.deals
    : [];

  const deals = lista.map((item): DealCrudo | null => {
    const o = item as Record<string, unknown>;
    // Formato nativo de HubSpot: { id, properties: {...} }
    const p = (o.properties as Record<string, unknown>) ?? o;
    const id = o.id ?? p.hs_object_id ?? p.dealname;
    if (!id) return null;
    return {
      hubspot_id: String(id),
      nombre: (p.dealname ?? p.nombre ?? null) as string | null,
      owner_hubspot_id: (p.hubspot_owner_id ?? null) as string | null,
      owner_nombre: (p.owner_nombre ?? p.deal_owner ?? null) as string | null,
      monto: aNumero(p.amount ?? p.monto),
      etapa: (p.dealstage ?? p.etapa ?? null) as string | null,
      fecha_creacion: (p.createdate ?? p.fecha_creacion ?? null) as string | null,
      fecha_cierre: (p.closedate ?? p.fecha_cierre ?? null) as string | null,
      tipo_cliente: (p.tipo_de_cliente ?? p.tipo_cliente ?? null) as string | null,
      origen: (p.origen_del_lead ?? p.origen ?? null) as string | null,
      atribucion: (p.atribucion ?? null) as string | null,
      motivo_perdida: (p.closed_lost_reason ?? p.motivo_perdida ?? null) as string | null,
      es_division: p.es_division === true || p.es_division === "true",
      raw: item,
    };
  }).filter((d): d is DealCrudo => d !== null);

  return { deals, filasLeidas: lista.length };
}

/* ------------------------------------------------------------------ */
/* XLSX — semáforo comercial                                           */
/* ------------------------------------------------------------------ */

export interface FilaSemaforo {
  vendedor: string;
  objetivo: number | null;
  existentes: number | null;
  nuevos: number | null;
  total: number | null;
}

/**
 * Lee el semáforo comercial. Busca la hoja que contenga columnas de vendedor y
 * de venta; el resto de las hojas se ignora. Las cifras del semáforo son CON
 * IVA y así se guardan.
 */
export async function leerSemaforo(buffer: Buffer): Promise<FilaSemaforo[]> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(buffer, { type: "buffer" });

  const ALIAS = {
    vendedor:   ["vendedor", "asesor", "ejecutivo", "nombre", "propietario"],
    objetivo:   ["objetivo", "meta", "cuota", "presupuesto"],
    existentes: ["existentes", "existente", "cartera", "recurrente"],
    nuevos:     ["nuevos", "nuevo", "nueva"],
    total:      ["total", "venta total", "venta", "facturado", "logrado"],
  };

  for (const nombreHoja of libro.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets[nombreHoja], { defval: null });
    if (filas.length === 0) continue;

    const cabeceras = Object.keys(filas[0]);
    const col = (claves: string[]) =>
      cabeceras.find((c) => claves.some((k) => normalizar(c).includes(k)));

    const cVend = col(ALIAS.vendedor);
    const cTotal = col(ALIAS.total);
    if (!cVend || !cTotal) continue;

    const cObj = col(ALIAS.objetivo);
    const cEx = col(ALIAS.existentes);
    const cNu = col(ALIAS.nuevos);

    return filas
      .filter((f) => f[cVend] != null && String(f[cVend]).trim() !== "")
      .map((f) => ({
        vendedor: String(f[cVend]).trim(),
        objetivo: cObj ? aNumero(f[cObj]) : null,
        existentes: cEx ? aNumero(f[cEx]) : null,
        nuevos: cNu ? aNumero(f[cNu]) : null,
        total: aNumero(f[cTotal]),
      }));
  }

  return [];
}

/* ------------------------------------------------------------------ */
/* PDF — reportes de evaluación 1:1 ya generados                       */
/* ------------------------------------------------------------------ */

export interface EvaluacionExtraida {
  vendedorTexto: string | null;
  diagnostico: string | null;
  brecha: string | null;
  acciones: string[];
  contexto: string | null;
  feedback: string | null;
  textoCompleto: string;
}

const SECCIONES: Array<{ clave: keyof EvaluacionExtraida | "acciones"; patrones: string[] }> = [
  { clave: "diagnostico", patrones: ["diagnostico actual", "diagnóstico actual", "diagnostico", "diagnóstico"] },
  { clave: "brecha",      patrones: ["analisis de brecha", "análisis de brecha", "eficiencia operativa"] },
  { clave: "acciones",    patrones: ["plan de accion", "plan de acción", "acciones pertinentes"] },
  { clave: "contexto",    patrones: ["contexto de mercado"] },
  { clave: "feedback",    patrones: ["feedback", "retroalimentacion", "retroalimentación"] },
  { clave: "textoCompleto", patrones: ["anexos", "anexo"] },
];

/**
 * Extrae las 6 secciones del reporte de evaluación. Es un parser por
 * encabezados: si el PDF no trae los títulos esperados, devuelve el texto
 * completo para captura manual en lugar de inventar contenido.
 */
export async function leerEvaluacionPdf(buffer: Buffer): Promise<EvaluacionExtraida> {
  // Se importa el módulo interno a propósito: el index.js de pdf-parse activa
  // un modo debug que intenta leer un PDF de prueba cuando se carga como
  // dependencia empaquetada.
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdf = ((mod as unknown as { default?: unknown }).default ?? mod) as
    (b: Buffer) => Promise<{ text: string }>;
  const { text } = await pdf(buffer);

  const lineas = text.split("\n").map((l) => l.trim());
  const cortes: Array<{ clave: string; indice: number }> = [];

  lineas.forEach((linea, i) => {
    const n = normalizar(linea);
    if (!n || n.length > 80) return;
    for (const s of SECCIONES) {
      if (s.patrones.some((p) => n.startsWith(p) || n === p)) {
        cortes.push({ clave: String(s.clave), indice: i });
        break;
      }
    }
  });

  const bloque = (clave: string): string | null => {
    const i = cortes.findIndex((c) => c.clave === clave);
    if (i === -1) return null;
    const inicio = cortes[i].indice + 1;
    const fin = cortes[i + 1]?.indice ?? lineas.length;
    const cuerpo = lineas.slice(inicio, fin).filter(Boolean).join("\n").trim();
    return cuerpo || null;
  };

  const bloqueAcciones = bloque("acciones");
  const acciones = bloqueAcciones
    ? bloqueAcciones
        .split("\n")
        .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•·*])\s*/, "").trim())
        .filter((l) => l.length > 3)
    : [];

  const primeraLinea = lineas.find((l) => l.length > 0) ?? null;

  return {
    vendedorTexto: primeraLinea,
    diagnostico: bloque("diagnostico"),
    brecha: bloque("brecha"),
    acciones,
    contexto: bloque("contexto"),
    feedback: bloque("feedback"),
    textoCompleto: text,
  };
}
