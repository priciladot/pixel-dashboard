import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerCsv, leerJson, leerSemaforo, leerEvaluacionPdf } from "@/lib/ingesta/archivos";
import { ingestarDeals, ingestarSemaforo } from "@/lib/ingesta/cargar";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/ingesta/archivo   (multipart/form-data)
 *   archivo:   File  (.csv .tsv .json .xlsx .pdf)
 *   periodoId: string
 *   ventana:   "kpi_4_semanas" | "calendario"   (opcional)
 *
 * El PDF NO se ingiere automáticamente: se devuelven las secciones extraídas
 * para que la dirección las revise antes de publicarlas como evaluación.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });

  const { data: perfil } = await supabase.from("profiles").select("rol").eq("id", user.id).single();
  if (perfil?.rol !== "admin") {
    return NextResponse.json({ error: "Solo el administrador puede cargar archivos" }, { status: 403 });
  }

  const form = await req.formData();
  const archivo = form.get("archivo") as File | null;
  const periodoId = String(form.get("periodoId") ?? "");
  const ventana = (String(form.get("ventana") ?? "kpi_4_semanas") === "calendario"
    ? "calendario" : "kpi_4_semanas") as "kpi_4_semanas" | "calendario";

  if (!archivo) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (!periodoId) return NextResponse.json({ error: "Falta periodoId" }, { status: 400 });

  const nombre = archivo.name;
  const ext = nombre.split(".").pop()?.toLowerCase() ?? "";
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const db = createAdminClient();

  try {
    if (ext === "csv" || ext === "tsv") {
      const { deals, filasLeidas, sinMapear } = leerCsv(buffer.toString("utf8"));
      const r = await ingestarDeals(db, deals, {
        tipo: "csv", periodoId, archivoNombre: nombre, ejecutadoPor: user.id, ventana,
      });
      return NextResponse.json({ ok: true, formato: "csv", columnasSinMapear: sinMapear, ...r, filasLeidas });
    }

    if (ext === "json") {
      const { deals, filasLeidas } = leerJson(buffer.toString("utf8"));
      const r = await ingestarDeals(db, deals, {
        tipo: "json", periodoId, archivoNombre: nombre, ejecutadoPor: user.id, ventana,
      });
      return NextResponse.json({ ok: true, formato: "json", ...r, filasLeidas });
    }

    if (ext === "xlsx" || ext === "xls") {
      const filas = await leerSemaforo(buffer);
      if (filas.length === 0) {
        return NextResponse.json(
          { error: "No se encontró una hoja con columnas de vendedor y venta." },
          { status: 422 },
        );
      }
      const r = await ingestarSemaforo(db, filas, {
        periodoId, archivoNombre: nombre, ejecutadoPor: user.id,
      });
      return NextResponse.json({ ok: true, formato: "semaforo_xlsx", filasLeidas: filas.length, ...r });
    }

    if (ext === "pdf") {
      const extraida = await leerEvaluacionPdf(buffer);
      return NextResponse.json({
        ok: true,
        formato: "pdf",
        requiereRevision: true,
        mensaje: "Secciones extraídas. Revísalas y publícalas manualmente como evaluación.",
        extraida: { ...extraida, textoCompleto: extraida.textoCompleto.slice(0, 8000) },
      });
    }

    return NextResponse.json({ error: `Formato .${ext} no soportado.` }, { status: 415 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al procesar el archivo" },
      { status: 500 },
    );
  }
}
