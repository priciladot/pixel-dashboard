"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });

    if (err) {
      setError(
        err.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : "No se pudo iniciar sesión. Inténtalo de nuevo.",
      );
      setCargando(false);
      return;
    }
    router.push(params.get("redirect") || "/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page px-5">
      <div className="w-full max-w-[380px]">
        <div className="mb-5 text-center">
          <p className="text-[18px] font-semibold tracking-tight text-ink">PIXEL.play</p>
          <p className="mt-0.5 text-[13px] text-ink-soft">Desempeño comercial</p>
        </div>

        <form onSubmit={entrar} className="rounded-card border border-line bg-surface px-5 py-5">
          <label className="block text-[12px] font-medium text-ink-soft" htmlFor="email">
            Correo corporativo
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-line px-2.5 py-2 text-[13px] text-ink focus:border-serie-1 focus:outline-none"
          />

          <label className="mt-3.5 block text-[12px] font-medium text-ink-soft" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-line px-2.5 py-2 text-[13px] text-ink focus:border-serie-1 focus:outline-none"
          />

          {error && (
            <p className="mt-3 rounded border border-[#f3c2c2] bg-[#fdecec] px-2.5 py-2 text-[12px] text-[#d03b3b]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="mt-4 w-full rounded bg-ink px-3 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {cargando ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-3 text-center text-[11px] text-ink-muted">
          Cada quien ve únicamente lo que le corresponde según su rol.
        </p>
      </div>
    </div>
  );
}
