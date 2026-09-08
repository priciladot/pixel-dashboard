/**
 * Corte unificado: Deals + KPIs + contacto_ids/correos de HubSpot,
 * Analítica (historial de etapas, actividades/tareas, leads) y Cierres de
 * Monday, las 3 en una sola llamada -- compartida por el cron automático
 * (/api/cron/sincronizar-todo, 2 veces al día) y por el botón manual
 * "🔄 Sincronizar HubSpot" en /maestro, para que ambos disparen exactamente
 * el mismo flujo y no se desalineen con el tiempo.
 *
 * Las 3 secciones corren en paralelo (son APIs independientes, ninguna
 * depende del resultado de otra) -- si una falla, las otras dos igual se
 * guardan; el resultado de cada una se reporta aparte.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buscarDeals, buscarDealsAbiertos, buscarDealsCreados,
  enriquecerConAsociaciones, enriquecerConOwners, listarOwners,
} from "./hubspot";
import { buscarHistorialEtapas, buscarTodosLosEngagements, buscarLeads } from "./hubspot-analitica";
import { listarCierres } from "./monday";
import { ingestarAnaliticaHubspot, ingestarCierresMonday, ingestarDeals } from "./cargar";

export interface SeccionResultado {
  ok: boolean;
  error?: string;
  [clave: string]: unknown;
}

export interface ResultadoSincronizacionTodo {
  deals: SeccionResultado;
  analitica: SeccionResultado;
  monday: SeccionResultado;
}

function aResultado(r: PromiseSettledResult<Record<string, unknown>>): SeccionResultado {
  return r.status === "fulfilled"
    ? { ok: true, ...r.value }
    : { ok: false, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
}

export async function sincronizarTodo(
  db: SupabaseClient,
  opciones: {
    periodoId: string;
    desde: string;
    hasta: string;
    /** Qué columnas de `periodos` corresponden a desde/hasta -- sanearLote() necesita saberlo para asignar periodo_id contra la ventana correcta, no siempre kpi_4_semanas. */
    ventana: "kpi_4_semanas" | "calendario";
    /** "manual" = disparado desde el botón de /maestro; "cron" = disparado por el cron de Vercel. Decide el `tipo` que queda registrado en `ingestas`. */
    origen: "manual" | "cron";
    simulacion?: boolean;
    ejecutadoPor?: string;
  },
): Promise<ResultadoSincronizacionTodo> {
  const { periodoId, desde, hasta, ventana, origen, simulacion = false, ejecutadoPor } = opciones;
  const tipoDeals = origen === "manual" ? "hubspot_api" : "hubspot_cron";
  const tipoMonday = origen === "manual" ? "monday_api" : "monday_cron";

  const [deals, analitica, monday] = await Promise.allSettled([
    (async () => {
      const owners = await listarOwners();
      const [cerrados, creados, abiertos] = await Promise.all([
        buscarDeals(desde, hasta),
        buscarDealsCreados(desde, hasta),
        buscarDealsAbiertos(),
      ]);
      const sinContacto = enriquecerConOwners([...cerrados, ...creados, ...abiertos], owners);
      const crudos = await enriquecerConAsociaciones(sinContacto);
      const conContacto = crudos.filter((d) => (d.contacto_ids?.length ?? 0) > 0).length;
      const r = await ingestarDeals(db, crudos, {
        tipo: tipoDeals, periodoId, ejecutadoPor, ventana, simulacion,
      });
      return {
        ingestaId: r.ingestaId, filasOk: r.filasOk, filasSanitizadas: r.filasSanitizadas,
        negociosTotal: crudos.length, negociosConContactoAsociado: conContacto,
      };
    })(),
    (async () => {
      const [etapas, engagements, leads] = await Promise.all([
        buscarHistorialEtapas(desde, hasta),
        buscarTodosLosEngagements(desde, hasta),
        buscarLeads(desde, hasta),
      ]);
      const r = await ingestarAnaliticaHubspot(db, { etapas, engagements, leads }, { periodoId, simulacion });
      return {
        ingestaId: r.ingestaId, etapas: r.etapas, engagementsPorTipo: r.engagementsPorTipo,
        engagementsSinAsignar: r.engagementsSinAsignar, leads: r.leads, sinPermiso: r.sinPermiso,
      };
    })(),
    (async () => {
      const crudos = await listarCierres();
      const r = await ingestarCierresMonday(db, crudos, { tipo: tipoMonday });
      return { ingestaId: r.ingestaId, elementosLeidos: crudos.length, filasOk: r.filasOk, sinAsignar: r.sinAsignar };
    })(),
  ]);

  return { deals: aResultado(deals), analitica: aResultado(analitica), monday: aResultado(monday) };
}
