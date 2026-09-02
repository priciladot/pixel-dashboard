import { redirect } from "next/navigation";
import { requiereSesion, rutaInicial } from "@/lib/auth";

/** Enruta a cada quien a donde le toca según su rol. */
export default async function Inicio() {
  const perfil = await requiereSesion();
  redirect(rutaInicial(perfil));
}
