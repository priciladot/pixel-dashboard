import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esAdmin, esDireccion } from "@/lib/auth";
import type { Perfil } from "@/lib/types";

const ROL_ETIQUETA: Record<Perfil["rol"], string> = {
  admin: "Administrador general",
  supervisor: "Dirección / Supervisión",
  vendedor: "Vendedor",
};

async function cerrarSesion() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export function Shell({ perfil, children }: { perfil: Perfil; children: React.ReactNode }) {
  const links: Array<{ href: string; texto: string }> = [];
  if (esDireccion(perfil)) links.push({ href: "/maestro", texto: "Dashboard maestro" });
  links.push({ href: `/vendedor/${perfil.id}`, texto: esDireccion(perfil) ? "Mi perfil" : "Mi evaluación" });
  if (esAdmin(perfil)) links.push({ href: "/ingesta", texto: "Ingesta de datos" });

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold tracking-tight text-ink">PIXEL.play</span>
            <span className="text-[12px] text-ink-muted">Desempeño comercial</span>
          </Link>

          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded px-2.5 py-1.5 text-[13px] text-ink-soft hover:bg-surface-sunk hover:text-ink"
              >
                {l.texto}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-[13px] font-medium text-ink">{perfil.nombre_completo}</p>
              <p className="text-[11px] text-ink-muted">{ROL_ETIQUETA[perfil.rol]}</p>
            </div>
            <form action={cerrarSesion}>
              <button
                type="submit"
                className="rounded border border-line px-2.5 py-1.5 text-[12px] text-ink-soft hover:bg-surface-sunk hover:text-ink"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-5 py-7">{children}</main>

      <footer className="mx-auto max-w-[1180px] px-5 pb-8 text-[11px] text-ink-muted">
        Venta CON IVA (semáforo comercial) · HubSpot SIN IVA · factor 1.16 · periodos de KPI en
        bloques de 4 semanas.
      </footer>
    </div>
  );
}
