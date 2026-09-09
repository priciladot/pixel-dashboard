/**
 * Analítica extendida de HubSpot: historial de etapas, actividades, tareas
 * y leads. Complementa a hubspot.ts (que trae los deals) — no lo reemplaza.
 *
 * Historial de etapas usa el mismo endpoint de deals con
 * `propertiesWithHistory`, así que solo necesita crm.objects.deals.read (ya
 * activo). Actividades/tareas SÍ son objetos CRM separados, cada uno con su
 * propio scope (crm.objects.calls.read, .emails.read, .meetings.read,
 * .notes.read, .tasks.read) — si el Private App no los tiene, HubSpot
 * regresa 403 para ESE tipo únicamente. Por eso cada tipo se trae por
 * separado y un 403 en uno no tumba a los demás: queda registrado en
 * `sinPermiso` para que la corrida lo reporte en vez de fallar entera.
 */

import { conLimiteDeConcurrencia } from "./concurrencia";

const BASE = "https://api.hubapi.com";

function token(): string {
  const t = process.env.HUBSPOT_TOKEN;
  if (!t) throw new Error("Falta HUBSPOT_TOKEN en el entorno.");
  return t;
}

class SinPermisoError extends Error {
  constructor(public tipo: string, mensaje: string) {
    super(mensaje);
  }
}

async function api<T>(ruta: string, init?: RequestInit, intento = 0): Promise<T> {
  const res = await fetch(`${BASE}${ruta}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (res.status === 429) {
    // Tope de reintentos + jitter -- sin esto, un lote grande dispara muchas
    // peticiones a la vez, todas chocan con el límite de HubSpot, todas
    // esperan el mismo tiempo fijo y vuelven a chocar juntas (manada
    // estampida). Ver conLimiteDeConcurrencia() para la otra mitad del fix:
    // no dejar que se disparen tantas de golpe en primer lugar.
    if (intento >= 4) throw new Error(`HubSpot 429 persistente en ${ruta} tras ${intento} reintentos.`);
    const espera = 5000 * (intento + 1) + Math.random() * 3000;
    await new Promise((r) => setTimeout(r, espera));
    return api<T>(ruta, init, intento + 1);
  }
  if (res.status === 403) {
    throw new SinPermisoError(ruta, `HubSpot 403 en ${ruta}: falta el scope de lectura para este objeto.`);
  }
  if (!res.ok) {
    throw new Error(`HubSpot ${res.status} en ${ruta}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/* 1. Historial de etapas — mismo scope que deals, siempre debería andar */
/* ------------------------------------------------------------------ */

export interface CambioEtapa {
  hubspot_id: string;
  etapa_anterior: string | null;
  etapa_nueva: string;
  fecha_cambio: string;
  raw: unknown;
}

interface DealConHistoria {
  id: string;
  propertiesWithHistory?: {
    dealstage?: Array<{ value: string; timestamp: string }>;
  };
}

/**
 * Ids de los deals cerrados en el rango. El endpoint de búsqueda no acepta
 * `propertiesWithHistory` (HubSpot lo ignora en silencio ahí, no da error)
 * — por eso el historial se trae aparte, en un segundo paso con batch/read.
 */
export async function idsDealsCerrados(desde: string, hasta: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;

  do {
    const cuerpo = {
      filterGroups: [{
        filters: [
          { propertyName: "closedate", operator: "GTE", value: `${desde}T00:00:00.000Z` },
          { propertyName: "closedate", operator: "LTE", value: `${hasta}T23:59:59.999Z` },
        ],
      }],
      properties: [],
      limit: 100,
      ...(after ? { after } : {}),
    };

    const r = await api<{ results: Array<{ id: string }>; paging?: { next?: { after: string } } }>(
      "/crm/v3/objects/deals/search",
      { method: "POST", body: JSON.stringify(cuerpo) },
    );

    ids.push(...r.results.map((d) => d.id));
    after = r.paging?.next?.after;
  } while (after);

  return ids;
}

/**
 * Trae el historial de dealstage para los deals cerrados en el rango. Dos
 * pasos porque la API de HubSpot lo exige así: 1) buscar los ids en el
 * rango (closedate, igual que buscarDeals() en hubspot.ts), 2) pedir su
 * historial vía `POST /deals/batch/read` con `propertiesWithHistory` — el
 * único endpoint que de verdad lo devuelve. Ese endpoint acepta lotes de
 * 100 ids normalmente, pero HubSpot limita a 50 cuando la petición lleva
 * `propertiesWithHistory` (lo confirma el propio error de la API, no es un
 * límite documentado de antemano) — de ahí el paso de 50, no de 100.
 */
export async function buscarHistorialEtapas(desde: string, hasta: string): Promise<CambioEtapa[]> {
  const ids = await idsDealsCerrados(desde, hasta);

  // Los lotes de batch/read son búsquedas independientes entre sí (no hay
  // cursor de paginación como en /search) — se piden todos en paralelo en
  // vez de uno por uno. Con ~500 deals eso es ~10 lotes de golpe en vez de
  // 10 vueltas secuenciales; dentro del límite de 100 req/10s de HubSpot.
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) lotes.push(ids.slice(i, i + 50));

  const resultados = await Promise.all(lotes.map((lote) =>
    api<{ results: DealConHistoria[] }>("/crm/v3/objects/deals/batch/read", {
      method: "POST",
      body: JSON.stringify({
        properties: [],
        propertiesWithHistory: ["dealstage"],
        inputs: lote.map((id) => ({ id })),
      }),
    }),
  ));

  const salida: CambioEtapa[] = [];
  for (const r of resultados) {
    for (const d of r.results) {
      const historia = d.propertiesWithHistory?.dealstage ?? [];
      // HubSpot regresa el historial más reciente primero.
      const cronologico = [...historia].reverse();
      cronologico.forEach((h, idx) => {
        salida.push({
          hubspot_id: d.id,
          etapa_anterior: idx > 0 ? cronologico[idx - 1].value : null,
          etapa_nueva: h.value,
          fecha_cambio: h.timestamp,
          raw: h,
        });
      });
    }
  }

  return salida;
}

/* ------------------------------------------------------------------ */
/* 2. Actividades y tareas — un objeto CRM por tipo, un scope por tipo */
/* ------------------------------------------------------------------ */

export interface EtapaPipeline {
  id: string;
  label: string;
  orden: number;
}

/**
 * Nombres reales de las etapas del pipeline (dealstage guarda solo el id
 * numérico, ej. "45202797" — sin esto no hay forma de mostrar un embudo
 * legible). Se pide el pipeline configurado en HUBSPOT_PIPELINE_ID; si no
 * está definido o es "default", se trae el pipeline por default de HubSpot.
 */
export async function listarEtapasPipeline(): Promise<EtapaPipeline[]> {
  const pipelineId = process.env.HUBSPOT_PIPELINE_ID;
  const ruta = pipelineId && pipelineId !== "default"
    ? `/crm/v3/pipelines/deals/${pipelineId}`
    : `/crm/v3/pipelines/deals/default`;

  const r = await api<{ stages: Array<{ id: string; label: string; displayOrder: number }> }>(ruta);
  return r.stages
    .map((s) => ({ id: s.id, label: s.label, orden: s.displayOrder }))
    .sort((a, b) => a.orden - b.orden);
}

export type TipoEngagement = "call" | "email" | "meeting" | "note" | "task";

const ENDPOINT_POR_TIPO: Record<TipoEngagement, string> = {
  call: "calls",
  email: "emails",
  meeting: "meetings",
  note: "notes",
  task: "tasks",
};

/** Propiedades que existen en HubSpot para cada tipo de objeto (varían entre ellos). */
const PROPIEDADES_POR_TIPO: Record<TipoEngagement, string[]> = {
  call: ["hs_timestamp", "hs_call_duration", "hs_call_title", "hubspot_owner_id"],
  email: ["hs_timestamp", "hs_email_subject", "hubspot_owner_id"],
  meeting: ["hs_meeting_start_time", "hs_meeting_end_time", "hs_meeting_title", "hubspot_owner_id"],
  note: ["hs_timestamp", "hs_note_body", "hubspot_owner_id"],
  task: ["hs_timestamp", "hs_task_subject", "hs_task_status", "hubspot_owner_id"],
};

export interface EngagementCrudo {
  hubspot_id: string;
  tipo: TipoEngagement;
  deal_id_ref: string | null;
  /** Contacto asociado directamente a la actividad en HubSpot (no al negocio) — liga actividad de contacto al negocio vía v_deal_actividad. */
  contact_id_ref: string | null;
  /** Empresa asociada directamente a la actividad en HubSpot. */
  company_id_ref: string | null;
  owner_hubspot_id: string | null;
  asunto: string | null;
  estado: string | null;
  fecha: string | null;
  duracion_segundos: number | null;
  raw: unknown;
}

interface EngagementApi {
  id: string;
  properties: Record<string, string | null>;
}

function aEngagementCrudo(tipo: TipoEngagement, e: EngagementApi): EngagementCrudo {
  const p = e.properties;
  const asunto = p.hs_call_title ?? p.hs_email_subject ?? p.hs_meeting_title ?? p.hs_task_subject ?? p.hs_note_body ?? null;
  const fecha = p.hs_timestamp ?? p.hs_meeting_start_time ?? null;
  return {
    hubspot_id: e.id,
    tipo,
    // deal_id_ref/contact_id_ref/company_id_ref se rellenan aparte -- ver enriquecerEngagementsConAsociaciones().
    deal_id_ref: null,
    contact_id_ref: null,
    company_id_ref: null,
    owner_hubspot_id: p.hubspot_owner_id ?? null,
    asunto,
    estado: p.hs_task_status ?? null,
    fecha,
    duracion_segundos: p.hs_call_duration ? Math.round(Number(p.hs_call_duration) / 1000) : null,
    raw: e,
  };
}

/**
 * Trae un tipo de actividad/tarea creada en el rango. Solo ids y
 * propiedades -- las asociaciones a deal/contacto/empresa se resuelven
 * aparte, ver enriquecerEngagementsConAsociaciones().
 * Si el token no tiene el scope de este tipo, HubSpot regresa 403 — se
 * relanza como SinPermisoError para que el orquestador lo aísle.
 */
export async function buscarEngagements(
  tipo: TipoEngagement, desde: string, hasta: string,
): Promise<EngagementCrudo[]> {
  const propiedades = PROPIEDADES_POR_TIPO[tipo];
  const endpoint = ENDPOINT_POR_TIPO[tipo];
  const salida: EngagementCrudo[] = [];
  let after: string | undefined;

  do {
    const cuerpo = {
      filterGroups: [{
        filters: [
          { propertyName: "hs_timestamp", operator: "GTE", value: `${desde}T00:00:00.000Z` },
          { propertyName: "hs_timestamp", operator: "LTE", value: `${hasta}T23:59:59.999Z` },
        ],
      }],
      properties: propiedades,
      limit: 100,
      ...(after ? { after } : {}),
    };

    const r = await api<{ results: EngagementApi[]; paging?: { next?: { after: string } } }>(
      `/crm/v3/objects/${endpoint}/search`,
      { method: "POST", body: JSON.stringify(cuerpo) },
    );

    salida.push(...r.results.map((e) => aEngagementCrudo(tipo, e)));
    after = r.paging?.next?.after;
  } while (after);

  return salida;
}

interface AsociacionV4Api {
  from: { id: string };
  to: Array<{ toObjectId: string }>;
}

/**
 * Trae, en bloque, el primer id asociado de un tipo de objeto (deals,
 * contacts o companies) para una lista de actividades del mismo tipo --
 * vía el API DEDICADO de Asociaciones v4
 * (/crm/v4/associations/{from}/{to}/batch/read). Igual que con los deals
 * (ver enriquecerConAsociaciones() en hubspot.ts): "associations" como
 * parámetro lateral de /search se ignora en silencio, este es el mecanismo
 * que sí funciona.
 */
async function asociacionesV4(fromTipo: string, hacia: "deals" | "contacts" | "companies", ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;

  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) lotes.push(ids.slice(i, i + 100));

  const resultados = await conLimiteDeConcurrencia(lotes, 5, (lote) =>
    api<{ results: AsociacionV4Api[] }>(`/crm/v4/associations/${fromTipo}/${hacia}/batch/read`, {
      method: "POST",
      body: JSON.stringify({ inputs: lote.map((id) => ({ id })) }),
    }),
  );

  for (const r of resultados) {
    for (const item of r.results) {
      if (item.to?.[0]) mapa.set(item.from.id, item.to[0].toObjectId);
    }
  }
  return mapa;
}

type HaciaEngagement = "deals" | "contacts" | "companies";
const TODAS_LAS_HACIA: HaciaEngagement[] = ["deals", "contacts", "companies"];

/**
 * Segundo paso OBLIGATORIO para deal_id_ref/contact_id_ref/company_id_ref
 * de actividades -- sin esto, una nota o tarea registrada en el Contacto
 * (no directamente en la tarjeta del Deal) nunca se ligaba a ningún
 * negocio, y v_deal_actividad la trataba como si nunca hubiera existido
 * (de ahí negocios marcados con "días sin actividad" que en realidad
 * tenían una nota reciente, capturada en el Contacto).
 *
 * Con miles de actividades (notas + tareas fácilmente pasan de 5,000),
 * cada una necesitando 3 tipos de asociación, salen cientos de lotes de
 * 100 -- si cada tipo de actividad y cada tipo de asociación dispara su
 * propio Promise.all por separado, los límites de concurrencia se apilan
 * (5 tipos × 3 asociaciones × N lotes en paralelo) y se sigue chocando con
 * el límite real de HubSpot, que es GLOBAL para todo el Private App, no
 * por endpoint. Por eso aquí se arma una sola cola con TODOS los lotes de
 * TODOS los tipos y las 3 asociaciones, y se procesa con un único límite
 * de concurrencia compartido.
 */
export interface DiagnosticoAsociaciones {
  totalActividadesEntrada: number;
  totalRespuestasConAlMenosUnaAsociacion: number;
  totalRespuestasVacias: number;
  /** Una respuesta cruda de ejemplo (la primera con datos, si hay) -- para inspeccionar el shape real de HubSpot sin adivinar. */
  ejemploCrudo: unknown;
}

export async function enriquecerEngagementsConAsociaciones(
  porTipo: Partial<Record<TipoEngagement, EngagementCrudo[]>>,
): Promise<{ porTipo: Partial<Record<TipoEngagement, EngagementCrudo[]>>; diagnostico: DiagnosticoAsociaciones }> {
  interface Trabajo { tipo: TipoEngagement; hacia: HaciaEngagement; lote: string[] }
  const trabajos: Trabajo[] = [];

  for (const [tipo, lista] of Object.entries(porTipo) as Array<[TipoEngagement, EngagementCrudo[] | undefined]>) {
    if (!lista || lista.length === 0) continue;
    const ids = lista.map((e) => e.hubspot_id);
    for (const hacia of TODAS_LAS_HACIA) {
      for (let i = 0; i < ids.length; i += 100) trabajos.push({ tipo, hacia, lote: ids.slice(i, i + 100) });
    }
  }

  type MapasPorHacia = Record<HaciaEngagement, Map<string, string>>;
  const mapasPorTipo = new Map<TipoEngagement, MapasPorHacia>();
  const mapasDe = (tipo: TipoEngagement): MapasPorHacia => {
    let m = mapasPorTipo.get(tipo);
    if (!m) { m = { deals: new Map(), contacts: new Map(), companies: new Map() }; mapasPorTipo.set(tipo, m); }
    return m;
  };

  const resultados = await conLimiteDeConcurrencia(trabajos, 5, async (trabajo) => {
    const fromTipo = ENDPOINT_POR_TIPO[trabajo.tipo];
    const r = await api<{ results: AsociacionV4Api[] }>(`/crm/v4/associations/${fromTipo}/${trabajo.hacia}/batch/read`, {
      method: "POST",
      body: JSON.stringify({ inputs: trabajo.lote.map((id) => ({ id })) }),
    });
    return { tipo: trabajo.tipo, hacia: trabajo.hacia, items: r.results };
  });

  let conAsociacion = 0;
  let sinAsociacion = 0;
  let ejemploCrudo: unknown = null;
  for (const r of resultados) {
    const mapa = mapasDe(r.tipo)[r.hacia];
    for (const item of r.items) {
      if (item.to?.[0]) {
        mapa.set(item.from.id, item.to[0].toObjectId);
        conAsociacion += 1;
        if (!ejemploCrudo) ejemploCrudo = item;
      } else {
        sinAsociacion += 1;
      }
    }
  }

  const salida: Partial<Record<TipoEngagement, EngagementCrudo[]>> = {};
  let totalActividadesEntrada = 0;
  for (const [tipo, lista] of Object.entries(porTipo) as Array<[TipoEngagement, EngagementCrudo[] | undefined]>) {
    if (!lista || lista.length === 0) { salida[tipo] = lista; continue; }
    totalActividadesEntrada += lista.length;
    const mapas = mapasPorTipo.get(tipo);
    salida[tipo] = lista.map((e) => ({
      ...e,
      deal_id_ref: mapas?.deals.get(e.hubspot_id) ?? null,
      contact_id_ref: mapas?.contacts.get(e.hubspot_id) ?? null,
      company_id_ref: mapas?.companies.get(e.hubspot_id) ?? null,
    }));
  }

  const diagnostico: DiagnosticoAsociaciones = {
    totalActividadesEntrada,
    totalRespuestasConAlMenosUnaAsociacion: conAsociacion,
    totalRespuestasVacias: sinAsociacion,
    ejemploCrudo,
  };
  return { porTipo: salida, diagnostico };
}

export interface ResultadoEngagements {
  porTipo: Partial<Record<TipoEngagement, EngagementCrudo[]>>;
  sinPermiso: TipoEngagement[];
  diagnosticoAsociaciones: DiagnosticoAsociaciones | null;
}

/** Trae los 5 tipos en paralelo; aísla los que fallen por falta de scope; luego resuelve sus asociaciones reales. */
export async function buscarTodosLosEngagements(desde: string, hasta: string): Promise<ResultadoEngagements> {
  const tipos: TipoEngagement[] = ["call", "email", "meeting", "note", "task"];
  const resultado: ResultadoEngagements = { porTipo: {}, sinPermiso: [], diagnosticoAsociaciones: null };

  await Promise.all(tipos.map(async (tipo) => {
    try {
      resultado.porTipo[tipo] = await buscarEngagements(tipo, desde, hasta);
    } catch (e) {
      if (e instanceof SinPermisoError) {
        resultado.sinPermiso.push(tipo);
      } else {
        throw e;
      }
    }
  }));

  const enriquecido = await enriquecerEngagementsConAsociaciones(resultado.porTipo);
  resultado.porTipo = enriquecido.porTipo;
  resultado.diagnosticoAsociaciones = enriquecido.diagnostico;
  return resultado;
}

/* ------------------------------------------------------------------ */
/* 3. Contactos — solo el email, para completar Foco Rojos/Pipeline    */
/*    cuando el negocio no tiene nada capturado todavía en Monday.     */
/* ------------------------------------------------------------------ */

export interface ContactoCrudo {
  hubspot_id: string;
  email: string | null;
  raw: unknown;
}

interface ContactoApi {
  id: string;
  properties: Record<string, string | null>;
}

/**
 * Trae el email de contactos por id, en lotes de 100 (límite real de
 * batch/read). HubSpot no expone el email como propiedad del Deal, solo
 * como asociación a Contacto -- de ahí que haga falta este segundo objeto.
 * Si el token no tiene crm.objects.contacts.read, se aísla igual que los
 * demás tipos (no tumba el resto de la ingesta de deals).
 */
export async function buscarContactosPorId(ids: string[]): Promise<{ contactos: ContactoCrudo[]; sinPermiso: boolean }> {
  const unicos = [...new Set(ids)].filter(Boolean);
  if (unicos.length === 0) return { contactos: [], sinPermiso: false };

  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += 100) lotes.push(unicos.slice(i, i + 100));

  try {
    const resultados = await Promise.all(lotes.map((lote) =>
      api<{ results: ContactoApi[] }>("/crm/v3/objects/contacts/batch/read", {
        method: "POST",
        body: JSON.stringify({ properties: ["email"], inputs: lote.map((id) => ({ id })) }),
      }),
    ));
    const contactos = resultados.flatMap((r) => r.results.map((c) => ({
      hubspot_id: c.id,
      email: c.properties.email ?? null,
      raw: c,
    })));
    return { contactos, sinPermiso: false };
  } catch (e) {
    if (e instanceof SinPermisoError) return { contactos: [], sinPermiso: true };
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* 4. Leads — objeto nuevo, puede no existir en el portal              */
/* ------------------------------------------------------------------ */

export interface LeadCrudo {
  hubspot_id: string;
  deal_id_ref: string | null;
  owner_hubspot_id: string | null;
  etapa: string | null;
  fecha_creacion: string | null;
  raw: unknown;
}

interface LeadApi {
  id: string;
  properties: Record<string, string | null>;
}

/**
 * Trae leads creados en el rango. Si el portal no tiene el objeto Leads
 * habilitado, HubSpot regresa 403 (sin el scope) o 404 (objeto no existe) —
 * ambos casos se tratan igual: se reporta "sin permiso / no disponible" en
 * vez de fallar la corrida completa. deal_id_ref se resuelve aparte contra
 * el API de Asociaciones v4 -- "associations" en /search se ignora en
 * silencio, igual que con deals y engagements.
 */
export async function buscarLeads(desde: string, hasta: string): Promise<{ leads: LeadCrudo[]; disponible: boolean }> {
  const salida: LeadCrudo[] = [];
  let after: string | undefined;

  try {
    do {
      const cuerpo = {
        filterGroups: [{
          filters: [
            { propertyName: "hs_createdate", operator: "GTE", value: `${desde}T00:00:00.000Z` },
            { propertyName: "hs_createdate", operator: "LTE", value: `${hasta}T23:59:59.999Z` },
          ],
        }],
        properties: ["hs_lead_name", "hs_pipeline_stage", "hs_createdate", "hubspot_owner_id"],
        limit: 100,
        ...(after ? { after } : {}),
      };

      const r = await api<{ results: LeadApi[]; paging?: { next?: { after: string } } }>(
        "/crm/v3/objects/leads/search",
        { method: "POST", body: JSON.stringify(cuerpo) },
      );

      salida.push(...r.results.map((l) => ({
        hubspot_id: l.id,
        deal_id_ref: null,
        owner_hubspot_id: l.properties.hubspot_owner_id ?? null,
        etapa: l.properties.hs_pipeline_stage ?? null,
        fecha_creacion: l.properties.hs_createdate ?? null,
        raw: l,
      })));
      after = r.paging?.next?.after;
    } while (after);
  } catch (e) {
    if (e instanceof SinPermisoError || (e instanceof Error && e.message.includes("404"))) {
      return { leads: [], disponible: false };
    }
    throw e;
  }

  if (salida.length > 0) {
    const mapaDeals = await asociacionesV4("leads", "deals", salida.map((l) => l.hubspot_id));
    return { leads: salida.map((l) => ({ ...l, deal_id_ref: mapaDeals.get(l.hubspot_id) ?? null })), disponible: true };
  }

  return { leads: salida, disponible: true };
}
