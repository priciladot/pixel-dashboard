import { requiereSesion } from "@/lib/auth";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requiereSesion();
  return <Shell perfil={perfil}>{children}</Shell>;
}
