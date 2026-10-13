import Link from "next/link";
import { requiereRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Seccion, Vacio } from "@/components/ui";
import type { Perfil } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Directorio de perfiles para Talento Humano (solo lectura): lista al equipo
 * de ventas y de marketing y enlaza a cada perfil. No hay acciones de edición
 * aquí; el candado real es el RLS (talento_humano solo tiene SELECT).
 */
export default async function Equipo() {
  await requiereRol("admin", "supervisor", "talento_humano");
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, nombre_completo, nombre_corto, rol, puesto, activo")
    .in("rol", ["vendedor", "marketing", "marketing_lead"])
    .eq("activo", true)
    .order("nombre_completo");
  const personas = (data ?? []) as Pick<Perfil, "id" | "nombre_completo" | "nombre_corto" | "rol" | "puesto" | "activo">[];

  const ventas = personas.filter((p) => p.rol === "vendedor");
  const marketing = personas.filter((p) => p.rol !== "vendedor");

  if (personas.length === 0) return <Vacio titulo="No hay perfiles para mostrar" />;

  const lista = (items: typeof personas, base: "vendedor" | "mkt") => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((p) => (
        <Link key={p.id} href={`/${base}/${p.id}`}>
          <Card className="px-4 py-3 transition-colors hover:bg-surface-sunk">
            <p className="text-[14px] font-medium text-ink">{p.nombre_completo}</p>
            <p className="mt-0.5 text-[12px] text-ink-muted">{p.puesto ?? (base === "mkt" ? "Marketing" : "Equipo comercial")}</p>
          </Card>
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold tracking-tight text-ink">Perfiles del equipo</h1>
        <p className="mt-0.5 text-[13px] text-ink-soft">Vista de consulta: puedes ver cada perfil, no editarlo.</p>
      </div>
      <Seccion titulo="Ventas">{ventas.length ? lista(ventas, "vendedor") : <Vacio titulo="Sin perfiles de ventas" />}</Seccion>
      <Seccion titulo="Marketing">{marketing.length ? lista(marketing, "mkt") : <Vacio titulo="Sin perfiles de marketing" />}</Seccion>
    </>
  );
}
