/**
 * Crea los usuarios en Supabase Auth con contraseña temporal y su rol en
 * user_metadata. El trigger on_auth_user_created levanta el perfil; después
 * corre 003_seed.sql para completar puestos y alias.
 *
 *   npm run crear-usuarios
 *
 * Ajusta la lista antes de correrlo: los correos deben ser los reales.
 */
import "./_env";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const EQUIPO = [
  { email: "pris@digitalpixel.studio",    nombre: "Priscila Domínguez",    corto: "Pris",   rol: "admin" },
  { email: "daniel@digitalpixel.studio",  nombre: "Daniel Cebada",         corto: "Daniel", rol: "supervisor" },
  { email: "noelia@digitalpixel.studio",  nombre: "Noelia",                corto: "Noelia", rol: "supervisor" },
  { email: "th@digitalpixel.studio",      nombre: "Talento Humano",        corto: "TH",     rol: "supervisor" },
  { email: "erick@digitalpixel.studio",   nombre: "Erick Jiménez",         corto: "Erick",  rol: "vendedor" },
  { email: "diego@digitalpixel.studio",   nombre: "Diego Ramírez",         corto: "Diego",  rol: "vendedor" },
  { email: "roxana@digitalpixel.studio",  nombre: "Roxana Mendoza",        corto: "Roxana", rol: "vendedor" },
  { email: "mar@digitalpixel.studio",     nombre: "María Gaytán Casillas", corto: "Mar",    rol: "vendedor" },
  { email: "gabriela@digitalpixel.studio",nombre: "Gabriela Gutiérrez",    corto: "Gaby",   rol: "vendedor" },
];

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const credenciales: Array<{ email: string; password: string }> = [];

  for (const p of EQUIPO) {
    const password = `Px-${randomBytes(6).toString("base64url")}`;
    const { error } = await db.auth.admin.createUser({
      email: p.email,
      password,
      email_confirm: true,
      user_metadata: { nombre_completo: p.nombre, nombre_corto: p.corto, rol: p.rol },
    });

    if (error) {
      console.log(`  ${p.email.padEnd(32)} omitido — ${error.message}`);
      continue;
    }
    credenciales.push({ email: p.email, password });
    console.log(`  ${p.email.padEnd(32)} creado como ${p.rol}`);
  }

  if (credenciales.length > 0) {
    console.log("\nContraseñas temporales (entrégalas por canal privado y pide cambio en el primer acceso):\n");
    credenciales.forEach((c) => console.log(`  ${c.email.padEnd(32)} ${c.password}`));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
