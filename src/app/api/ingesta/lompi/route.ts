import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ingestarAuditoriasLompi, ingestarPendientesLompi,
  type AuditoriaLompiCrudo, type PendienteLompiCrudo,
} from "@/lib/ingesta/cargar";

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
 * Contrato del body (ambos campos son opcionales, pero al menos uno debe
 * venir):
 * {
 *   "resultados": [
 *     {
 *       "vendedor_email": "correo@dominio.com",
 *       "periodo": "2026-09",
 *       "puntaje": 87.5,
 *       "hallazgos": [{ "titulo": "...", "detalle": "...", "severidad": "alto" }]
 *     }
 *   ],
 *   "pendientes": [
 *     {
 *       "vendedor_telefono": "3312345678",
 *       "tipo": "whatsapp",
 *       "clave_externa": "id-propio-de-lompi-si-lo-tiene",
 *       "descripcion": "Cliente Juan Pérez sin responder desde ayer"
 *     }
 *   ]
 * }
 *
 * IMPORTANTE sobre "pendientes": cada llamada debe traer la FOTO COMPLETA
 * de todo lo que sigue pendiente en ESE MOMENTO (de todos los vendedores),
 * no solo lo nuevo -- este endpoint compara contra lo que ya teníamos
 * abierto y cierra automáticamente lo que ya no aparece (lo interpreta
 * como atendido). Si se manda un subconjunto, va a marcar como "atendido"
 * todo lo que se haya quedado fuera por error.
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

function resultadoValido(r: unknown): r is AuditoriaLompiCrudo {
  if (!r || typeof r !== "object") return false;
  const x = r as Record<string, unknown>;
  return (
    typeof x.vendedor_email === "string" && x.vendedor_email.length > 0 &&
    typeof x.periodo === "string" && x.periodo.length > 0 &&
    (x.puntaje === null || x.puntaje === undefined || typeof x.puntaje === "number") &&
    (x.hallazgos === undefined || Array.isArray(x.hallazgos))
  );
}

function pendienteValido(r: unknown): r is PendienteLompiCrudo {
  if (!r || typeof r !== "object") return false;
  const x = r as Record<string, unknown>;
  return (
    typeof x.tipo === "string" && x.tipo.length > 0 &&
    (x.vendedor_telefono === undefined || typeof x.vendedor_telefono === "string") &&
    (x.vendedor_email === undefined || typeof x.vendedor_email === "string") &&
    (x.clave_externa === undefined || typeof x.clave_externa === "string") &&
    (x.descripcion === undefined || typeof x.descripcion === "string") &&
    (x.vendedor_telefono !== undefined || x.vendedor_email !== undefined)
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

  const { resultados, pendientes } = body as { resultados?: unknown; pendientes?: unknown };

  if (resultados === undefined && pendientes === undefined) {
    return NextResponse.json({ error: "Manda al menos 'resultados' o 'pendientes'" }, { status: 400 });
  }
  if (resultados !== undefined && (!Array.isArray(resultados) || !resultados.every(resultadoValido))) {
    return NextResponse.json(
      { error: "'resultados' debe ser un arreglo; cada fila necesita vendedor_email (string) y periodo (string)" },
      { status: 400 },
    );
  }
  if (pendientes !== undefined && (!Array.isArray(pendientes) || !pendientes.every(pendienteValido))) {
    return NextResponse.json(
      { error: "'pendientes' debe ser un arreglo; cada fila necesita tipo (string) y vendedor_telefono o vendedor_email" },
      { status: 400 },
    );
  }

  const db = createAdminClient();
  try {
    const respuesta: Record<string, unknown> = { ok: true };

    if (Array.isArray(resultados) && resultados.length > 0) {
      const crudos: AuditoriaLompiCrudo[] = resultados.map((r) => ({
        vendedor_email: r.vendedor_email,
        periodo: r.periodo,
        puntaje: r.puntaje ?? null,
        hallazgos: r.hallazgos ?? [],
      }));
      const r = await ingestarAuditoriasLompi(db, crudos);
      respuesta.resultados = { filasOk: r.filasOk, sinAsignar: r.sinAsignar };
    }

    if (Array.isArray(pendientes)) {
      const crudos: PendienteLompiCrudo[] = pendientes.map((p) => ({
        vendedor_telefono: p.vendedor_telefono,
        vendedor_email: p.vendedor_email,
        clave_externa: p.clave_externa,
        tipo: p.tipo,
        descripcion: p.descripcion,
      }));
      const r = await ingestarPendientesLompi(db, crudos);
      respuesta.pendientes = { abiertos: r.abiertos, resueltos: r.resueltos, sinAsignar: r.sinAsignar };
    }

    return NextResponse.json(respuesta);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido en la ingesta" },
      { status: 500 },
    );
  }
}
