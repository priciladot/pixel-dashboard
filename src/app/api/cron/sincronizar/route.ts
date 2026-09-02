import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarDeals, buscarDealsCreados, enriquecerConOwners, listarOwners } from "@/lib/ingesta/hubspot";
import { ingestarDeals } from "@/lib/ingesta/cargar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;   // Límite del plan Hobby de Vercel. En Pro sube a 300.

/**
 * GET /api/cron/sincronizar
 *
 * Sincronización automática con HubSpot. La dispara el cron de Vercel, que
 * manda `Authorization: Bearer $CRON_SECRET` en cada corrida.
 *
 * Parámetros opcionales (para dispararlo a mano):
 *   ?periodo=2026-08   fuerza un periodo en lugar del vigente
 *   ?anterior=1        sincroniza también el periodo previo (cierres tardíos)
 *   ?simulacion=1      solo reporta, no escribe
 *   ?secret=...        alternativa a la cabecera Authorization, para probar
 *                      desde el navegador. Evítalo fuera de pruebas puntuales:
 *                      los parámetros de query quedan en logs y en el
 *                      historial del navegador.
 *
 * Prueba manual:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://pixel-dashboard-delta.vercel.app/api/cron/sincronizar?simulacion=1"
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
  const incluirAnterior = url.searchParams.get("anterior") === "1";
  const simulacion = url.searchParams.get("simulacion") === "1";

  const db = createAdminClient();
  const hoy = new Date().toISOString().slice(0, 10);

  // Periodo vigente = aquel cuya ventana de KPI (4 semanas) contiene hoy.
  // Si hoy cae en un hueco del calendario, se toma el más reciente ya iniciado.
  const { data: periodos } = await db
    .from("periodos")
    .select("id, etiqueta, kpi_inicio, kpi_fin")
    .order("kpi_inicio", { ascending: false });

  if (!periodos || periodos.length === 0) {
    return NextResponse.json({ error: "No hay periodos configurados." }, { status: 404 });
  }

  let objetivo = forzado
    ? periodos.find((p) => p.id === forzado)
    : periodos.find((p) => hoy >= p.kpi_inicio && hoy <= p.kpi_fin)
      ?? periodos.find((p) => p.kpi_inicio <= hoy);

  if (!objetivo) objetivo = periodos[0];

  const aSincronizar = [objetivo];
  if (incluirAnterior) {
    const i = periodos.findIndex((p) => p.id === objetivo!.id);
    const previo = periodos[i + 1];
    if (previo) aSincronizar.push(previo);
  }

  try {
    const owners = await listarOwners();
    const corridas = [];

    for (const p of aSincronizar) {
      const [cerrados, creados] = await Promise.all([
        buscarDeals(p.kpi_inicio, p.kpi_fin),
        buscarDealsCreados(p.kpi_inicio, p.kpi_fin),
      ]);

      // sanearLote deduplica por hubspot_id: el traslape no cuenta doble.
      const crudos = enriquecerConOwners([...cerrados, ...creados], owners);

      const r = await ingestarDeals(db, crudos, {
        tipo: "hubspot_cron",
        periodoId: p.id,
        ventana: "kpi_4_semanas",
        simulacion,
      });

      corridas.push({
        periodo: p.id,
        etiqueta: p.etiqueta,
        rango: { desde: p.kpi_inicio, hasta: p.kpi_fin },
        ingestaId: r.ingestaId,
        filasLeidas: r.filasLeidas,
        filasOk: r.filasOk,
        filasMarcadas: r.filasSanitizadas,
        sinAsignar: r.sinAsignar,
        banderas: r.resumen.por_bandera,
      });
    }

    return NextResponse.json({ ok: true, simulacion, ejecutado: hoy, corridas });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    // El error queda además en la tabla `ingestas`, visible desde /ingesta.
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 });
  }
}
