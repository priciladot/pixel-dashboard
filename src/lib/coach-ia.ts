import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyCDMX } from "@/lib/fecha";
import {
  accionesPrioritarias, conteoTareasAbiertas, dealsEstancados, diagnosticoCoach, disciplinaComercial,
  perfilPorId, periodoActivoDe, periodos, reporteSemaforoComercial,
} from "@/lib/queries";

/**
 * "Tu foco de hoy": lo genera Claude una vez al día por vendedor, a partir de
 * SUS datos reales de HubSpot/Monday ya calculados por el dashboard. Se
 * guarda en `coach_diario` (migración 046) como caché y para no repetir las
 * tácticas de los últimos días. Si falta la llave (ANTHROPIC_API_KEY), la
 * tabla o la IA falla, el Coach de siempre sigue funcionando sin esto.
 */

export interface CoachDelDia {
  foco: Array<{ accion: string; motivo: string }>;
  tactica: { titulo: string; texto: string };
  animo: string;
}

export type EstadoCoachDelDia =
  | { tipo: "sin_ia" }
  | { tipo: "pendiente" }
  | { tipo: "listo"; contenido: CoachDelDia };

const MODELO = "claude-opus-5-5";

function esTextoNoVacio(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function esCoachValido(x: unknown): x is CoachDelDia {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const foco = o.foco;
  const tactica = o.tactica as Record<string, unknown> | undefined;
  return (
    Array.isArray(foco) && foco.length > 0 &&
    foco.every((f) => !!f && typeof f === "object" && esTextoNoVacio((f as Record<string, unknown>).accion) && esTextoNoVacio((f as Record<string, unknown>).motivo)) &&
    !!tactica && esTextoNoVacio(tactica.titulo) && esTextoNoVacio(tactica.texto) &&
    esTextoNoVacio(o.animo)
  );
}

/** Lo que ya se generó hoy para este vendedor (o si todavía toca generarlo). Solo lee; no cuesta nada. */
export async function leerCoachDelDia(vendedorId: string): Promise<EstadoCoachDelDia> {
  if (!process.env.ANTHROPIC_API_KEY) return { tipo: "sin_ia" };
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("coach_diario")
      .select("contenido")
      .eq("vendedor_id", vendedorId)
      .eq("fecha", hoyCDMX())
      .maybeSingle();
    // Tabla inexistente (migración sin correr) u otro error: no se genera nada, para no gastar sin poder guardar.
    if (error) return { tipo: "sin_ia" };
    if (data && esCoachValido((data as { contenido: unknown }).contenido)) {
      return { tipo: "listo", contenido: (data as { contenido: CoachDelDia }).contenido };
    }
    return { tipo: "pendiente" };
  } catch {
    return { tipo: "sin_ia" };
  }
}

/** Contexto del vendedor para la IA: solo datos ya calculados por el dashboard, sin correos ni teléfonos. */
async function construirContexto(vendedorId: string): Promise<string | null> {
  const lista = await periodos();
  const periodo = periodoActivoDe(lista) ?? lista[0];
  if (!periodo) return null;

  const [persona, semaforo, disciplina, acciones, estancados, diagnostico, tareas] = await Promise.all([
    perfilPorId(vendedorId),
    reporteSemaforoComercial(periodo.id),
    disciplinaComercial(periodo.id, vendedorId),
    accionesPrioritarias(vendedorId, 6),
    dealsEstancados(vendedorId, 7),
    diagnosticoCoach(periodo.id, vendedorId),
    conteoTareasAbiertas(vendedorId),
  ]);
  if (!persona) return null;

  const fila = semaforo.filas.find((f) => f.vendedorId === vendedorId) ?? null;
  const semana = disciplina.semanas.find((s) => s.esSemanaActual) ?? null;
  const redondear = (n: number | null | undefined) => (n == null ? null : Math.round(n));

  const contexto = {
    fecha_hoy: hoyCDMX(),
    vendedor: persona.nombre_corto,
    periodo: periodo.etiqueta,
    meta_del_mes_con_iva: fila
      ? {
          objetivo: redondear(fila.objetivo),
          vendido: redondear(fila.resultado),
          cumplimiento_pct: fila.objetivo > 0 ? Math.round((fila.resultado / fila.objetivo) * 100) : null,
          existentes: { vendido: redondear(fila.resultadoExistentes), meta: redondear(fila.existentesVerde) },
          nuevos: { vendido: redondear(fila.resultadoNuevos), meta: redondear(fila.nuevosVerde) },
          falta_para_la_meta: redondear(Math.max(0, fila.resta)),
          falta_para_punto_de_equilibrio: redondear(fila.restantePE),
        }
      : null,
    semana_actual: semana
      ? {
          vendido: redondear(semana.montoVendido),
          meta_semanal: redondear(semana.metaCierreSemana),
          negocios_creados: semana.negociosCreados,
          tareas_completadas: semana.tareasCompletadas,
          tareas_asignadas: semana.tareasAsignadas,
          notas_registradas: semana.notas,
        }
      : null,
    tareas_abiertas: tareas.total,
    tareas_atrasadas: tareas.atrasadas,
    acciones_prioritarias: acciones.map((a) => ({
      tipo: a.tipo,
      negocio: a.deal_nombre,
      monto_con_iva: redondear(a.deal_monto_con_iva),
      tarea: a.asunto,
      fecha: a.fecha,
    })),
    negocios_estancados: estancados.slice(0, 8).map((d) => ({
      negocio: d.nombre,
      monto_con_iva: redondear(d.monto_con_iva),
      etapa: d.etapa_actual,
      dias_sin_actividad: d.dias_sin_actividad,
    })),
    alertas_del_sistema: diagnostico.map((a) => a.mensaje),
  };
  return JSON.stringify(contexto);
}

const SISTEMA = `Eres el coach comercial de Pixel Play, una agencia mexicana que vende activaciones, eventos y experiencias de marca a empresas (venta consultiva B2B). Hablas con UN vendedor y le das su foco para HOY.

Reglas:
- Usa SOLO los datos que te doy. No inventes cifras, nombres de clientes, negocios ni hechos. Si algo no está en los datos, no lo menciones.
- Cada acción de "foco" debe ser concreta y hacerse hoy: nombra el negocio real y, si ayuda, el monto o los días sin actividad. Nada genérico como "da seguimiento a tus clientes".
- Si los datos son pocos, da menos acciones (mínimo 1, máximo 3) y dilo con honestidad.
- El canal que más funciona con los clientes es WhatsApp; los correos y el newsletter casi no reciben respuesta. Puedes sugerirlo cuando venga al caso.
- "tactica" es una técnica de venta práctica para hoy, adaptada a la situación real de este vendedor (por ejemplo, según su meta, su ritmo semanal o sus negocios estancados). No repitas ninguna de las tácticas recientes que te indico.
- Tono cercano, directo y respetuoso, en español de México. Sin regaños ni exageraciones. Frases cortas.
- "animo" es una sola frase breve y honesta sobre cómo va, sin inventar.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, con esta forma exacta:
{"foco":[{"accion":"...","motivo":"..."}],"tactica":{"titulo":"...","texto":"..."},"animo":"..."}`;

/** Genera (o devuelve lo ya generado hoy) el foco del día. Solo lo llama la ruta /api/coach-ia, que ya verificó la sesión. */
export async function generarCoachDelDia(vendedorId: string): Promise<CoachDelDia | null> {
  const estado = await leerCoachDelDia(vendedorId);
  if (estado.tipo === "sin_ia") return null;
  if (estado.tipo === "listo") return estado.contenido;

  try {
    const contexto = await construirContexto(vendedorId);
    if (!contexto) return null;

    const db = createAdminClient();
    const { data: previos } = await db
      .from("coach_diario")
      .select("contenido")
      .eq("vendedor_id", vendedorId)
      .lt("fecha", hoyCDMX())
      .order("fecha", { ascending: false })
      .limit(10);
    const titulosPrevios = ((previos as Array<{ contenido: Partial<CoachDelDia> }> | null) ?? [])
      .map((p) => p.contenido?.tactica?.titulo)
      .filter((t): t is string => typeof t === "string");

    const client = new Anthropic({ timeout: 90_000, maxRetries: 1 });
    const respuesta = await client.messages.create({
      model: MODELO,
      max_tokens: 4000,
      system: SISTEMA,
      messages: [
        {
          role: "user",
          content:
            `Datos de hoy del vendedor (JSON):\n${contexto}\n\n` +
            `Tácticas que ya le diste en los últimos días (no las repitas ni uses una casi igual):\n` +
            (titulosPrevios.length > 0 ? titulosPrevios.map((t) => `- ${t}`).join("\n") : "- (ninguna todavía)"),
        },
      ],
    });

    if ((respuesta.stop_reason as string) === "refusal") return null;
    const texto = respuesta.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const ini = texto.indexOf("{");
    const fin = texto.lastIndexOf("}");
    if (ini < 0 || fin <= ini) return null;
    const parseado: unknown = JSON.parse(texto.slice(ini, fin + 1));
    if (!esCoachValido(parseado)) return null;

    const contenido: CoachDelDia = {
      foco: parseado.foco.slice(0, 3),
      tactica: parseado.tactica,
      animo: parseado.animo,
    };
    await db.from("coach_diario").upsert(
      { vendedor_id: vendedorId, fecha: hoyCDMX(), contenido, modelo: MODELO },
      { onConflict: "vendedor_id,fecha" },
    );
    return contenido;
  } catch (e) {
    console.error("coach-ia: no se pudo generar el foco del día", e instanceof Error ? e.message : e);
    return null;
  }
}
