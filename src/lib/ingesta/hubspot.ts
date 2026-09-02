/**
 * Cliente de la API de HubSpot (CRM v3).
 *
 * Requiere un token de Private App con los scopes:
 *   crm.objects.deals.read, crm.objects.owners.read, crm.schemas.deals.read
 *
 * El token vive solo del lado servidor: nunca se importa desde un componente
 * de cliente.
 */

import type { DealCrudo } from "./sanitizar";

const BASE = "https://api.hubapi.com";

function token(): string {
  const t = process.env.HUBSPOT_TOKEN;
  if (!t) throw new Error("Falta HUBSPOT_TOKEN en el entorno.");
  return t;
}

/**
 * Propiedades personalizadas TAL COMO EXISTEN en el portal de PIXEL.play
 * (leídas del CRM, no supuestas). Se pueden sobrescribir por entorno si en
 * algún momento se renombran.
 *
 *   clasificacion_de_lead_cliente__prueba_gab_
 *       Lead Nuevo · Remarketing Nuevo · Remarketing Existente · Cliente Existente
 *   categoria_de_cierre
 *       Las 5 categorías del catálogo + "No es pérdida — reclasificar"
 *       + "Criterio anterior / Sin categorizar"
 *   motivo_de_perdida_o_diferimiento__clonada_
 *       El motivo detallado (18 opciones)
 *   fecha_de_reactivacion
 *       Obligatoria cuando la categoría de cierre es "Diferido"
 */
export const PROPS = {
  clasificacion:     process.env.HUBSPOT_PROP_CLASIFICACION      ?? "clasificacion_de_lead_cliente__prueba_gab_",
  origen:            process.env.HUBSPOT_PROP_ORIGEN             ?? "origen_del_lead",
  categoriaCierre:   process.env.HUBSPOT_PROP_CATEGORIA_CIERRE   ?? "categoria_de_cierre",
  motivoPerdida:     process.env.HUBSPOT_PROP_MOTIVO_PERDIDA     ?? "motivo_de_perdida_o_diferimiento__clonada_",
  fechaReactivacion: process.env.HUBSPOT_PROP_FECHA_REACTIVACION ?? "fecha_de_reactivacion",
  tipoNegocio:       process.env.HUBSPOT_PROP_TIPO_NEGOCIO       ?? "tipo_de_negocio__prueba_gab_",
  fechaEvento:       process.env.HUBSPOT_PROP_FECHA_EVENTO       ?? "fecha_de_inicio_del_evento",
};

const PROPIEDADES_BASE = [
  "dealname", "amount", "dealstage", "pipeline", "hubspot_owner_id",
  "createdate", "closedate", "hs_is_closed_won", "hs_is_closed",
];

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
    // HubSpot limita a 100 req / 10 s en Private Apps.
    await new Promise((r) => setTimeout(r, 10_000));
    return api<T>(ruta, init);
  }
  if (!res.ok) {
    throw new Error(`HubSpot ${res.status} en ${ruta}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export interface Owner {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export async function listarOwners(): Promise<Owner[]> {
  const salida: Owner[] = [];
  let after: string | undefined;
  do {
    const q = new URLSearchParams({ limit: "100", ...(after ? { after } : {}) });
    const r = await api<{ results: Owner[]; paging?: { next?: { after: string } } }>(
      `/crm/v3/owners/?${q}`,
    );
    salida.push(...r.results);
    after = r.paging?.next?.after;
  } while (after);
  return salida;
}

interface DealApi {
  id: string;
  properties: Record<string, string | null>;
}

/**
 * Trae los negocios cuya fecha de cierre cae en el rango, usando el endpoint
 * de búsqueda para no paginar el portal completo.
 *
 * El rango debe ser el de la VENTANA DE KPI del mes (bloque de 4 semanas),
 * no el mes calendario: quien llama decide y lo declara.
 */
export async function buscarDeals(desde: string, hasta: string): Promise<DealCrudo[]> {
  const propiedades = [...PROPIEDADES_BASE, ...Object.values(PROPS)];
  const salida: DealCrudo[] = [];
  let after: string | undefined;

  do {
    const cuerpo = {
      filterGroups: [{
        filters: [
          { propertyName: "closedate", operator: "GTE", value: `${desde}T00:00:00.000Z` },
          { propertyName: "closedate", operator: "LTE", value: `${hasta}T23:59:59.999Z` },
          ...(process.env.HUBSPOT_PIPELINE_ID && process.env.HUBSPOT_PIPELINE_ID !== "default"
            ? [{ propertyName: "pipeline", operator: "EQ", value: process.env.HUBSPOT_PIPELINE_ID }]
            : []),
        ],
      }],
      properties: propiedades,
      limit: 100,
      ...(after ? { after } : {}),
    };

    const r = await api<{ results: DealApi[]; paging?: { next?: { after: string } } }>(
      "/crm/v3/objects/deals/search",
      { method: "POST", body: JSON.stringify(cuerpo) },
    );

    salida.push(...r.results.map(aDealCrudo));
    after = r.paging?.next?.after;
  } while (after);

  return salida;
}

/** También trae los negocios CREADOS en el rango (embudo, no solo cierres). */
export async function buscarDealsCreados(desde: string, hasta: string): Promise<DealCrudo[]> {
  const propiedades = [...PROPIEDADES_BASE, ...Object.values(PROPS)];
  const salida: DealCrudo[] = [];
  let after: string | undefined;

  do {
    const cuerpo = {
      filterGroups: [{
        filters: [
          { propertyName: "createdate", operator: "GTE", value: `${desde}T00:00:00.000Z` },
          { propertyName: "createdate", operator: "LTE", value: `${hasta}T23:59:59.999Z` },
        ],
      }],
      properties: propiedades,
      limit: 100,
      ...(after ? { after } : {}),
    };
    const r = await api<{ results: DealApi[]; paging?: { next?: { after: string } } }>(
      "/crm/v3/objects/deals/search",
      { method: "POST", body: JSON.stringify(cuerpo) },
    );
    salida.push(...r.results.map(aDealCrudo));
    after = r.paging?.next?.after;
  } while (after);

  return salida;
}

function aDealCrudo(d: DealApi): DealCrudo {
  const p = d.properties;
  return {
    hubspot_id: d.id,
    nombre: p.dealname,
    owner_hubspot_id: p.hubspot_owner_id,
    owner_nombre: null,               // se resuelve con listarOwners()
    monto: p.amount,                  // HubSpot guarda SIN IVA
    etapa: p.dealstage,
    pipeline: p.pipeline,
    cerrado_ganado: p.hs_is_closed_won === "true" ? true : p.hs_is_closed === "true" ? false : null,
    fecha_creacion: p.createdate,
    fecha_cierre: p.closedate,
    tipo_cliente: p[PROPS.clasificacion],
    clasificacion_raw: p[PROPS.clasificacion],
    origen: p[PROPS.origen],
    atribucion: null,                 // el portal no tiene propiedad de atribución
    categoria_cierre: p[PROPS.categoriaCierre],
    motivo_perdida: p[PROPS.motivoPerdida],
    fecha_reactivacion: p[PROPS.fechaReactivacion],
    // El portal no marca las divisiones con una propiedad: se detectan por
    // firma (mismo nombre de negocio + mismo monto) en la capa de saneo.
    es_division: false,
    raw: d,
  };
}

/** Rellena owner_nombre para que la sanitización pueda mapear por alias. */
export function enriquecerConOwners(deals: DealCrudo[], owners: Owner[]): DealCrudo[] {
  const porId = new Map(owners.map((o) => [
    o.id,
    [o.firstName, o.lastName].filter(Boolean).join(" ").trim() || o.email || "",
  ]));
  return deals.map((d) => ({
    ...d,
    owner_nombre: d.owner_hubspot_id ? porId.get(String(d.owner_hubspot_id)) ?? null : null,
  }));
}
