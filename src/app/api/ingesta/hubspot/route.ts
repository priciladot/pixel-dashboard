import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarDeals, buscarDealsCreados, enriquecerConOwners, listarOwners } from "@/lib/ingesta/hubspot";
import { ingestarDeals } from "@/lib/ingesta/cargar";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/ingesta/hubspot
 * body: { periodoId: string, ventana?: "kpi_4_semanas" | "calendario", simulacion?: boolean }
 *
 * Descarga los negocios del rango que corresponde al periodo —usando la
 * ventana de KPI de 4 semanas por omisión, no el mes calendario— y los pasa
 * por la capa de sanitización.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });

  const { data: perfil } = await supabase.from("profiles").select("rol").eq("id", user.id).single();
  if (perfil?.rol !== "admin") {
    return NextResponse.json({ error: "Solo el administrador puede correr la ingesta" }, { status: 403 });
  }

  const { periodoId, ventana = "kpi_4_semanas", simulacion = false } = await req.json();
  if (!periodoId) return NextResponse.json({ error: "Falta periodoId" }, { status: 400 });

  const db = createAdminClient();
  const { data: periodo } = await db.from("periodos").select("*").eq("id", periodoId).single();
  if (!periodo) return NextResponse.json({ error: "Periodo inexistente" }, { status: 404 });

  const desde = ventana === "calendario" ? periodo.cal_inicio : periodo.kpi_inicio;
  const hasta = ventana === "calendario" ? periodo.cal_fin : periodo.kpi_fin;

  try {
    const owners = await listarOwners();
    const [cerrados, creados] = await Promise.all([
      buscarDeals(desde, hasta),
      buscarDealsCreados(desde, hasta),
    ]);

    // sanearLote deduplica por hubspot_id, así que el traslape no cuenta doble.
    const crudos = enriquecerConOwners([...cerrados, ...creados], owners);

    const resultado = await ingestarDeals(db, crudos, {
      tipo: "hubspot_api",
      periodoId,
      ejecutadoPor: user.id,
      ventana,
      simulacion,
    });

    return NextResponse.json({ ok: true, rango: { desde, hasta }, ...resultado });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido en la ingesta" },
      { status: 500 },
    );
  }
}
