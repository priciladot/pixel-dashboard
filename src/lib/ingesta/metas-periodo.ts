import type { SupabaseClient } from "@supabase/supabase-js";
import { hoyCDMX } from "@/lib/fecha";

/**
 * Evita que un mes arranque sin metas por vendedor (pasó en octubre): si el
 * mes en curso no tiene filas en `metas_semaforo`, se arman a partir del mes
 * anterior repartiendo la meta mensual del ÁREA (ventas_historico_mensual.meta_con_iva,
 * la que Pris ajusta mes a mes) con la misma proporción entre vendedores.
 * Sin meta del área capturada no inventa nada. Lo creado queda como
 * `confirmado = false` en `objetivos`, para que el dashboard avise que es
 * una distribución por confirmar. Nunca pisa filas que ya existan.
 */
export async function asegurarMetasDelPeriodo(db: SupabaseClient): Promise<{ periodoId: string; creadas: number } | null> {
  const [anio, mes] = hoyCDMX().split("-").map(Number);
  const periodoId = `${anio}-${String(mes).padStart(2, "0")}`;

  const { data: existentes } = await db.from("metas_semaforo").select("vendedor_id").eq("periodo_id", periodoId).limit(1);
  if (existentes && existentes.length > 0) return null;

  const { data: hist } = await db.from("ventas_historico_mensual").select("meta_con_iva").eq("anio", anio).eq("mes", mes).maybeSingle();
  const metaArea = (hist as { meta_con_iva: number | null } | null)?.meta_con_iva ?? null;
  if (metaArea == null || metaArea <= 0) return null;

  const { data: previo } = await db.from("metas_semaforo").select("periodo_id").lt("periodo_id", periodoId).order("periodo_id", { ascending: false }).limit(1);
  const periodoBase = (previo as Array<{ periodo_id: string }> | null)?.[0]?.periodo_id;
  if (!periodoBase) return null;

  const [{ data: msBase }, { data: objBase }] = await Promise.all([
    db.from("metas_semaforo").select("*").eq("periodo_id", periodoBase),
    db.from("objetivos").select("*").eq("periodo_id", periodoBase),
  ]);
  const filasMs = (msBase as Array<Record<string, unknown>> | null) ?? [];
  const filasObj = (objBase as Array<Record<string, unknown>> | null) ?? [];
  const sumaBase = filasMs.reduce((acc, m) => acc + Number(m.existentes_verde ?? 0) + Number(m.nuevos_verde ?? 0), 0);
  if (filasMs.length === 0 || sumaBase <= 0) return null;

  const f = metaArea / sumaBase;
  const esc = (v: unknown) => (v == null ? null : Math.round(Number(v) * f * 100) / 100);

  const nuevasMs = filasMs.map((m) => ({
    vendedor_id: m.vendedor_id, periodo_id: periodoId,
    existentes_verde: esc(m.existentes_verde), existentes_amarillo: esc(m.existentes_amarillo),
    nuevos_verde: esc(m.nuevos_verde), nuevos_amarillo: esc(m.nuevos_amarillo),
    punto_equilibrio: esc(m.punto_equilibrio),
  }));
  const nuevosObj = filasObj.map((o) => ({
    vendedor_id: o.vendedor_id, periodo_id: periodoId,
    objetivo_total: esc(o.objetivo_total), objetivo_existentes: esc(o.objetivo_existentes), objetivo_nuevos: esc(o.objetivo_nuevos),
    objetivo_pe: esc(o.objetivo_pe), confirmado: false,
  }));

  const { error: e1 } = await db.from("metas_semaforo").upsert(nuevasMs, { onConflict: "vendedor_id,periodo_id", ignoreDuplicates: true });
  if (e1) throw new Error(`metas_semaforo: ${e1.message}`);
  if (nuevosObj.length > 0) {
    const { error: e2 } = await db.from("objetivos").upsert(nuevosObj, { onConflict: "vendedor_id,periodo_id", ignoreDuplicates: true });
    if (e2) throw new Error(`objetivos: ${e2.message}`);
  }
  return { periodoId, creadas: nuevasMs.length };
}
