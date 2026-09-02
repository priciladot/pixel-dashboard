import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con service role: SALTA RLS. Úsalo únicamente en scripts de ingesta
 * y en route handlers que ya verificaron que quien llama es admin.
 * Nunca lo importes desde un componente de cliente.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
