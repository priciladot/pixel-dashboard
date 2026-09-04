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

async function api<T>(ruta: string, init?: RequestInit): Promise<T> {
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
    await new Promise((r) => setTimeout(r, 10_000));
    return api<T>(ruta, init);
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
  associations?: { deals?: { results: Array<{ id: string }> } };
}

function aEngagementCrudo(tipo: TipoEngagement, e: EngagementApi): EngagementCrudo {
  const p = e.properties;
  const asunto = p.hs_call_title ?? p.hs_email_subject ?? p.hs_meeting_title ?? p.hs_task_subject ?? p.hs_note_body ?? null;
  const fecha = p.hs_timestamp ?? p.hs_meeting_start_time ?? null;
  return {
    hubspot_id: e.id,
    tipo,
    deal_id_ref: e.associations?.deals?.results?.[0]?.id ?? null,
    owner_hubspot_id: p.hubspot_owner_id ?? null,
    asunto,
    estado: p.hs_task_status ?? null,
    fecha,
    duracion_segundos: p.hs_call_duration ? Math.round(Number(p.hs_call_duration) / 1000) : null,
    raw: e,
  };
}

/**
 * Trae un tipo de actividad/tarea creada en el rango, con su deal asociado.
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
      associations: ["deals"],
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

export interface ResultadoEngagements {
  porTipo: Partial<Record<TipoEngagement, EngagementCrudo[]>>;
  sinPermiso: TipoEngagement[];
}

/** Trae los 5 tipos en paralelo; aísla los que fallen por falta de scope. */
export async function buscarTodosLosEngagements(desde: string, hasta: string): Promise<ResultadoEngagements> {
  const tipos: TipoEngagement[] = ["call", "email", "meeting", "note", "task"];
  const resultado: ResultadoEngagements = { porTipo: {}, sinPermiso: [] };

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

  return resultado;
}

/* ------------------------------------------------------------------ */
/* 3. Leads — objeto nuevo, puede no existir en el portal              */
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
  associations?: { deals?: { results: Array<{ id: string }> } };
}

/**
 * Trae leads creados en el rango. Si el portal no tiene el objeto Leads
 * habilitado, HubSpot regresa 403 (sin el scope) o 404 (objeto no existe) —
 * ambos casos se tratan igual: se reporta "sin permiso / no disponible" en
 * vez de fallar la corrida completa.
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
        associations: ["deals"],
        limit: 100,
        ...(after ? { after } : {}),
      };

      const r = await api<{ results: LeadApi[]; paging?: { next?: { after: string } } }>(
        "/crm/v3/objects/leads/search",
        { method: "POST", body: JSON.stringify(cuerpo) },
      );

      salida.push(...r.results.map((l) => ({
        hubspot_id: l.id,
        deal_id_ref: l.associations?.deals?.results?.[0]?.id ?? null,
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

  return { leads: salida, disponible: true };
}
