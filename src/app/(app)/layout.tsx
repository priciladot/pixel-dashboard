import { requiereSesion, registrarDiaActivo } from "@/lib/auth";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requiereSesion();
  // Días activos, no un contador de logins -- ver registrarDiaActivo().
  // No debe tumbar la página si falla, es un dato secundario.
  registrarDiaActivo(perfil.id).catch(() => {});
  return <Shell perfil={perfil}>{children}</Shell>;
}
