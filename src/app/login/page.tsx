import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-surface-page text-[13px] text-ink-soft">
          Cargando…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
