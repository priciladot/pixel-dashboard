import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarHistorialEtapas, buscarTodosLosEngagements, buscarLeads, idsDealsCerrados } from "@/lib/ingesta/hubspot-analitica";
import { ingestarAnaliticaHubspot } from "@/lib/ingesta/cargar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/sincronizar-analitica
 *
 * Historial de etapas, actividades/tareas y leads de HubSpot. A propósito
 * NO está en vercel.json: el plan Hobby solo permite 2 cron jobs y ya están
 * ocupados por /sincronizar y /sincronizar-monday. Esta ruta se dispara a
 * mano (o desde /ingesta más adelante), no automáticamente todavía.
 *
 * Autenticación: `Authorization: Bearer $CRON_SECRET` o `?secret=...`.
 *
 * Parámetros opcionales:
 *   ?periodo=2026-08   fuerza un periodo en lugar del vigente
 *   ?simulacion=1      solo reporta, no escribe — úsalo primero para ver
 *                      qué trae `sinPermiso` antes de escribir nada
 *
 * Prueba manual:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     ".../api/cron/sincronizar-analitica?simulacion=1"
 */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado. Sin él la ruta queda abierta y no se ejecuta." },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const autorizado =
    req.headers.get("authorization") === `Bearer ${secreto}` ||
    url.searchParams.get("secret") === secreto;
  if (!autorizado) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const forzado = url.searchParams.get("periodo");
  const simulacion = url.searchParams.get("simulacion") === "1";

  const db = createAdminClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: periodos } = await db
    .from("periodos")
    .select("id, etiqueta, kpi_inicio, kpi_fin")
    .order("kpi_inicio", { ascending: false });

  if (!periodos || periodos.length === 0) {
    return NextResponse.json({ error: "No hay periodos configurados." }, { status: 404 });
  }

  const objetivo = forzado
    ? periodos.find((p) => p.id === forzado)
    : periodos.find((p) => hoy >= p.kpi_inicio && hoy <= p.kpi_fin)
      ?? periodos.find((p) => p.kpi_inicio <= hoy)
      ?? periodos[0];

  if (!objetivo) {
    return NextResponse.json({ error: "No se encontró un periodo para sincronizar." }, { status: 404 });
  }

  try {
    // Diagnóstico temporal: cuántos ids de deal cerrados encuentra el primer
    // paso, para aislar si un "etapas: 0" es porque no hay ids o porque el
    // batch/read no trae historial para esos ids.
    const idsDiagnostico = url.searchParams.get("diagnostico") === "1"
      ? await idsDealsCerrados(objetivo.kpi_inicio, objetivo.kpi_fin)
      : null;

    const [etapas, engagements, leads] = await Promise.all([
      buscarHistorialEtapas(objetivo.kpi_inicio, objetivo.kpi_fin),
      buscarTodosLosEngagements(objetivo.kpi_inicio, objetivo.kpi_fin),
      buscarLeads(objetivo.kpi_inicio, objetivo.kpi_fin),
    ]);

    const r = await ingestarAnaliticaHubspot(
      db,
      { etapas, engagements, leads },
      { periodoId: objetivo.id, simulacion },
    );

    return NextResponse.json({
      ok: true,
      simulacion,
      ejecutado: hoy,
      periodo: objetivo.id,
      etiqueta: objetivo.etiqueta,
      rango: { desde: objetivo.kpi_inicio, hasta: objetivo.kpi_fin },
      ingestaId: r.ingestaId,
      etapas: r.etapas,
      ...(idsDiagnostico ? { idsDealsCerradosEncontrados: idsDiagnostico.length } : {}),
      engagementsPorTipo: r.engagementsPorTipo,
      engagementsSinAsignar: r.engagementsSinAsignar,
      leads: r.leads,
      leadsDisponible: r.leadsDisponible,
      sinPermiso: r.sinPermiso,
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 });
  }
}
