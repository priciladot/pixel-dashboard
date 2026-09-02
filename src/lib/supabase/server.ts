import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Forma de las cookies que @supabase/ssr pide escribir. */
type CookieAEscribir = { name: string; value: string; options?: Record<string, unknown> };

/** Cliente con la sesión del usuario: TODA consulta pasa por RLS. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list: CookieAEscribir[]) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Invocado desde un Server Component: el middleware ya refrescó la sesión.
          }
        },
      },
    },
  );
}
