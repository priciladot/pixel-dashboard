import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarKpisMarketing } from "@/lib/ingesta/monday-marketing";
import { listarMetricasCanal } from "@/lib/ingesta/monday-canales";
import { ingestarKpisMarketing, ingestarMetricasCanal } from "@/lib/ingesta/cargar";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ingesta/monday-marketing
 *
 * Sincroniza el tablero "Registro de KPIs - Marketing" de Monday, y de
 * paso los tableros de métricas por canal que sí tienen columna de
 * persona real (Individual Engagement, CTR Individual -- ver
 * monday-canales.ts) -- disparado desde el botón "🔄 Sincronizar
 * Marketing" en /mkt. También corre automáticamente 2 veces al día como
 * parte de sincronizarTodo() (ver /api/cron/sincronizar-todo); esta ruta
 * es para refrescar a demanda sin esperar al siguiente corte. Gateada a
 * dirección (admin/supervisor) o a la lead de Marketing (Dana) -- no a
 * todo el equipo de Marketing.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });

  const { data: perfil } = await supabase.from("profiles").select("rol").eq("id", user.id).single();
  const permitido = perfil?.rol === "admin" || perfil?.rol === "supervisor" || perfil?.rol === "marketing_lead";
  if (!permitido) {
    return NextResponse.json(
      { error: "Solo dirección o la lead de Marketing pueden correr esta sincronización" },
      { status: 403 },
    );
  }

  const db = createAdminClient();

  try {
    const crudos = await listarKpisMarketing();
    const r = await ingestarKpisMarketing(db, crudos, { tipo: "monday_mkt_api" });

    // Independiente del resultado de arriba: si los tableros de canal
    // fallan (permisos, tablero renombrado, etc.) no debe tumbar el sync
    // principal de KPIs, que es el que sí manda sobre el semáforo semanal.
    let canal: { filasOk: number; sinAsignar: number } | { error: string };
    try {
      const crudosCanal = await listarMetricasCanal();
      const rCanal = await ingestarMetricasCanal(db, crudosCanal, { tipo: "monday_mkt_api" });
      canal = { filasOk: rCanal.filasOk, sinAsignar: rCanal.sinAsignar };
    } catch (eCanal) {
      canal = { error: eCanal instanceof Error ? eCanal.message : "Error desconocido en métricas de canal" };
    }

    return NextResponse.json({
      ok: true, elementosLeidos: crudos.length, filasOk: r.filasOk, sinAsignar: r.sinAsignar, canal,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido en la ingesta" },
      { status: 500 },
    );
  }
}
