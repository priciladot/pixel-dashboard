import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarTodo } from "@/lib/ingesta/sincronizar-todo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;   // Límite real del plan Hobby es 60s -- si este cron trunca a medias, es la señal de que hace falta Pro.

/**
 * GET /api/cron/sincronizar-todo
 *
 * Corte unificado: Deals + KPIs + contacto_ids/correos de HubSpot,
 * Analítica (historial de etapas, actividades/tareas, leads) y Cierres de
 * Monday, los 3 en una sola corrida -- reemplaza a /sincronizar,
 * /sincronizar-analitica y /sincronizar-monday como cron jobs
 * independientes (con el límite de 2 cron jobs del plan Hobby, unificar
 * era la única forma de meter los 3 en el mismo corte, 2 veces al día).
 * El mismo flujo (sincronizarTodo) también lo dispara el botón manual
 * "🔄 Sincronizar HubSpot" en /maestro.
 *
 * Autenticación: `Authorization: Bearer $CRON_SECRET` o `?secret=...`.
 *
 * Parámetros opcionales:
 *   ?periodo=2026-08   fuerza un periodo en lugar del vigente
 *   ?simulacion=1      solo reporta, no escribe
 *
 * Prueba manual:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     ".../api/cron/sincronizar-todo?simulacion=1"
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

  const resultado = await sincronizarTodo(db, {
    periodoId: objetivo.id,
    desde: objetivo.kpi_inicio,
    hasta: objetivo.kpi_fin,
    ventana: "kpi_4_semanas",
    origen: "cron",
    simulacion,
  });

  return NextResponse.json({
    ok: true,
    simulacion,
    ejecutado: hoy,
    periodo: objetivo.id,
    etiqueta: objetivo.etiqueta,
    rango: { desde: objetivo.kpi_inicio, hasta: objetivo.kpi_fin },
    ...resultado,
  });
}
