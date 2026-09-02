import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { AppRole, Perfil } from "./types";

/**
 * Perfil de la sesión actual. El RLS ya garantiza que un vendedor solo pueda
 * leer su propia fila; esta función existe para decidir QUÉ pantalla mostrar,
 * no para autorizar datos.
 */
export async function perfilActual(): Promise<Perfil | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (data as Perfil) ?? null;
}

export async function requiereSesion(): Promise<Perfil> {
  const perfil = await perfilActual();
  if (!perfil) redirect("/login");
  return perfil;
}

export async function requiereRol(...roles: AppRole[]): Promise<Perfil> {
  const perfil = await requiereSesion();
  if (!roles.includes(perfil.rol)) redirect("/sin-acceso");
  return perfil;
}

export const esDireccion = (p: Perfil) => p.rol === "admin" || p.rol === "supervisor";
export const esAdmin = (p: Perfil) => p.rol === "admin";

/** Ruta inicial según el rol. */
export function rutaInicial(p: Perfil): string {
  return esDireccion(p) ? "/maestro" : `/vendedor/${p.id}`;
}

/** Bitácora: quién abrió el perfil de quién. */
export async function registrarAcceso(accion: string, recurso?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("accesos_log").insert({ usuario_id: user.id, accion, recurso });
}
