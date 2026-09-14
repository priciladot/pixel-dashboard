import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestarAuditoriasLompi, type AuditoriaLompiCrudo } from "@/lib/ingesta/cargar";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ingesta/lompi
 *
 * A diferencia del resto de la ingesta (nosotros jalamos HubSpot/Monday),
 * aquí Lompi -- el auditor de ventas del jefe -- nos EMPUJA sus resultados.
 * No hay sesión de Supabase (no es un navegador logueado): se autentica con
 * un API key propio en `Authorization: Bearer <LOMPI_API_KEY>`, generado
 * por nosotros y entregado solo a Lompi (nunca vive en este repo).
 *
 * Contrato del body:
 * {
 *   "resultados": [
 *     {
 *       "vendedor_email": "correo@dominio.com",
 *       "periodo": "2026-09",
 *       "puntaje": 87.5,
 *       "hallazgos": [{ "titulo": "...", "detalle": "...", "severidad": "alto" }]
 *     }
 *   ]
 * }
 */

function autenticado(req: Request): boolean {
  const esperado = process.env.LOMPI_API_KEY;
  if (!esperado) return false;

  const header = req.headers.get("authorization") ?? "";
  const recibido = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!recibido) return false;

  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function filaValida(r: unknown): r is AuditoriaLompiCrudo {
  if (!r || typeof r !== "object") return false;
  const x = r as Record<string, unknown>;
  return (
    typeof x.vendedor_email === "string" && x.vendedor_email.length > 0 &&
    typeof x.periodo === "string" && x.periodo.length > 0 &&
    (x.puntaje === null || x.puntaje === undefined || typeof x.puntaje === "number") &&
    (x.hallazgos === undefined || Array.isArray(x.hallazgos))
  );
}

export async function POST(req: Request) {
  if (!autenticado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const resultados = (body as { resultados?: unknown })?.resultados;
  if (!Array.isArray(resultados) || resultados.length === 0) {
    return NextResponse.json({ error: "Falta 'resultados' (arreglo no vacío)" }, { status: 400 });
  }
  if (!resultados.every(filaValida)) {
    return NextResponse.json(
      { error: "Cada resultado necesita vendedor_email (string) y periodo (string); puntaje y hallazgos son opcionales" },
      { status: 400 },
    );
  }

  const crudos: AuditoriaLompiCrudo[] = resultados.map((r) => ({
    vendedor_email: r.vendedor_email,
    periodo: r.periodo,
    puntaje: r.puntaje ?? null,
    hallazgos: r.hallazgos ?? [],
  }));

  const db = createAdminClient();
  try {
    const r = await ingestarAuditoriasLompi(db, crudos);
    return NextResponse.json({ ok: true, filasOk: r.filasOk, sinAsignar: r.sinAsignar });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido en la ingesta" },
      { status: 500 },
    );
  }
}
