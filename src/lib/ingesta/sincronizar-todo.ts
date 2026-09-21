/**
 * Corte unificado: Deals + KPIs + contacto_ids/correos de HubSpot,
 * Analítica (historial de etapas, actividades/tareas, leads), Cierres de
 * Monday, y KPIs de Marketing, las 4 en una sola llamada -- compartida por
 * el cron automático (/api/cron/sincronizar-todo, 2 veces al día) y por
 * el botón manual "🔄 Sincronizar HubSpot" en /maestro, para que ambos
 * disparen exactamente el mismo flujo y no se desalineen con el tiempo.
 *
 * Las 4 secciones corren en paralelo (son APIs independientes, ninguna
 * depende del resultado de otra) -- si una falla, las otras igual se
 * guardan; el resultado de cada una se reporta aparte. KPIs de Marketing
 * entra aquí (en vez de tener su propio cron) porque el plan Hobby de
 * Vercel solo permite 2 cron jobs -- ya están ocupados por los 2 cortes
 * diarios de este mismo corte unificado.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buscarDeals, buscarDealsAbiertos, buscarDealsCreados,
  enriquecerConAsociaciones, enriquecerConOwners, listarOwners,
} from "./hubspot";
import { buscarHistorialEtapas, buscarTodosLosEngagements, buscarLeads, refrescarTareasPorId } from "./hubspot-analitica";
import { listarCierres } from "./monday";
import { listarKpisMarketing } from "./monday-marketing";
import { listarMetricasCanal } from "./monday-canales";
import { ingestarAnaliticaHubspot, ingestarCierresMonday, ingestarDeals, ingestarKpisMarketing, ingestarMetricasCanal } from "./cargar";

export interface SeccionResultado {
  ok: boolean;
  error?: string;
  [clave: string]: unknown;
}

export interface ResultadoSincronizacionTodo {
  deals: SeccionResultado;
  analitica: SeccionResultado;
  monday: SeccionResultado;
  marketing: SeccionResultado;
  canalesMarketing: SeccionResultado;
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
  const tipoMarketing = origen === "manual" ? "monday_mkt_api" : "monday_mkt_cron";

  const [deals, analitica, monday, marketing, canalesMarketing] = await Promise.allSettled([
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

      // Reconciliación de tareas reagendadas: buscarTodosLosEngagements()
      // encuentra tareas por su fecha de vencimiento ACTUAL -- si alguien
      // reagenda una tarea que ya teníamos guardada como abierta este
      // periodo hacia un mes futuro, ese filtro ya no la encuentra y se
      // queda huérfana con la fecha vieja. Se refrescan por id, directo,
      // las tareas que a la fecha en nuestra base siguen "abiertas este
      // periodo" pero que la búsqueda de arriba no volvió a traer -- así se
      // corrige (o se completa) su fecha real en la misma corrida.
      const idsYaTraidos = new Set((engagements.porTipo.task ?? []).map((t) => t.hubspot_id));
      const { data: tareasAbiertasGuardadas } = await db
        .from("hubspot_engagements")
        .select("hubspot_id")
        .eq("tipo", "task")
        .neq("estado", "COMPLETED")
        .gte("fecha", `${desde}T00:00:00.000Z`)
        .lte("fecha", `${hasta}T23:59:59.999Z`);
      const idsAReconciliar = ((tareasAbiertasGuardadas as Array<{ hubspot_id: string }>) ?? [])
        .map((t) => t.hubspot_id)
        .filter((id) => !idsYaTraidos.has(id));
      if (idsAReconciliar.length > 0) {
        const refrescadas = await refrescarTareasPorId(idsAReconciliar);
        engagements.porTipo.task = [...(engagements.porTipo.task ?? []), ...refrescadas];
      }

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
    (async () => {
      const crudos = await listarKpisMarketing();
      const r = await ingestarKpisMarketing(db, crudos, { tipo: tipoMarketing });
      return { ingestaId: r.ingestaId, elementosLeidos: crudos.length, filasOk: r.filasOk, sinAsignar: r.sinAsignar };
    })(),
    (async () => {
      const crudos = await listarMetricasCanal();
      const r = await ingestarMetricasCanal(db, crudos, { tipo: tipoMarketing });
      return { ingestaId: r.ingestaId, elementosLeidos: crudos.length, filasOk: r.filasOk, sinAsignar: r.sinAsignar };
    })(),
  ]);

  return {
    deals: aResultado(deals), analitica: aResultado(analitica), monday: aResultado(monday),
    marketing: aResultado(marketing), canalesMarketing: aResultado(canalesMarketing),
  };
}
