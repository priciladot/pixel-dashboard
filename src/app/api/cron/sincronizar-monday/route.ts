import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarCierres, listarColumnas } from "@/lib/ingesta/monday";
import { ingestarCierresMonday } from "@/lib/ingesta/cargar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/sincronizar-monday
 *
 * Trae los elementos del tablero "Deals Ganados 2026 - HubSpot" de Monday
 * y los guarda en `monday_cierres` — la división de montos cuando dos
 * vendedores colaboran en un evento. No toca hubspot_deals ni kpi_mensual.
 *
 * YA NO está en el cron automático de Vercel (ver vercel.json), reemplazado
 * por el corte unificado de /api/cron/sincronizar-todo (Deals + Analítica +
 * Monday en una sola corrida, 2 veces al día). Esta ruta se queda solo para
 * pruebas/debug puntuales de esta sección en aislado.
 *
 * Autenticación: header `Authorization: Bearer $CRON_SECRET` (lo manda
 * Vercel Cron solo) o `?secret=...` para pruebas manuales desde el navegador.
 *
 * Parámetros opcionales:
 *   ?columnas=1   en vez de sincronizar, regresa id/título/tipo de cada
 *                 columna del tablero — para llenar las variables
 *                 MONDAY_COL_* con los ids reales, no los defaults de ejemplo.
 *
 * Prueba manual:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     ".../api/cron/sincronizar-monday?columnas=1"
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

  if (url.searchParams.get("columnas") === "1") {
    try {
      const columnas = await listarColumnas();
      return NextResponse.json({ ok: true, columnas });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "Error desconocido";
      return NextResponse.json({ ok: false, error: mensaje }, { status: 500 });
    }
  }

  try {
    const db = createAdminClient();
    const crudos = await listarCierres();
    const r = await ingestarCierresMonday(db, crudos, { tipo: "monday_cron" });

    return NextResponse.json({
      ok: true,
      ejecutado: new Date().toISOString().slice(0, 10),
      ingestaId: r.ingestaId,
      elementosLeidos: crudos.length,
      filasOk: r.filasOk,
      sinAsignar: r.sinAsignar,
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 });
  }
}
