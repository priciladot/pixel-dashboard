import { NextResponse } from "next/server";
import { perfilActual } from "@/lib/auth";
import { perfilPorId } from "@/lib/queries";
import { generarCoachDelDia } from "@/lib/coach-ia";

export const runtime = "nodejs";
// La IA puede tardar; esta llamada va aparte de la carga de la página para no bloquearla.
export const maxDuration = 60;

/**
 * POST /api/coach-ia  { vendedorId }
 * Genera (o devuelve) "Tu foco de hoy" del vendedor. Requiere sesión, y solo
 * funciona para perfiles que esa sesión ya puede ver (lo decide el RLS en
 * `perfilPorId`): un vendedor solo el suyo, Dirección y Talento Humano todos.
 * Una generación por vendedor al día (caché en coach_diario).
 */
export async function POST(req: Request) {
  const sesion = await perfilActual();
  if (!sesion) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  let vendedorId = "";
  try {
    const body = (await req.json()) as { vendedorId?: unknown };
    vendedorId = typeof body.vendedorId === "string" ? body.vendedorId : "";
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  if (!vendedorId) return NextResponse.json({ error: "Falta vendedorId" }, { status: 400 });

  const persona = await perfilPorId(vendedorId);
  if (!persona) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const contenido = await generarCoachDelDia(vendedorId);
  if (!contenido) return NextResponse.json({ error: "No disponible" }, { status: 503 });
  return NextResponse.json({ contenido });
}
