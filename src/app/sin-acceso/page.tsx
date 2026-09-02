import Link from "next/link";

export default function SinAcceso() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page px-5">
      <div className="max-w-md rounded-card border border-line bg-surface px-6 py-7 text-center">
        <p className="text-[13px] font-semibold text-ink">Esta sección no está disponible para tu perfil</p>
        <p className="mt-2 text-[13px] text-ink-soft">
          Tu cuenta tiene acceso únicamente a tu propia evaluación. Si necesitas la vista consolidada,
          pídeselo a la administración del tablero.
        </p>
        <Link href="/" className="mt-4 inline-block rounded bg-ink px-3 py-1.5 text-[13px] text-white">
          Volver a mi perfil
        </Link>
      </div>
    </div>
  );
}
