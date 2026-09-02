import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Se excluye /api a propósito: cada route handler valida su propio acceso
  // (sesión + rol, o el Bearer del cron). Si el middleware las cubriera, la
  // corrida automática recibiría un redirect a /login en vez de ejecutarse.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
