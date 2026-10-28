import type { CoachDelDia } from "@/lib/coach-ia";

/** "Tu foco de hoy" (generado con IA). Solo presenta; no hace consultas. */
export function CoachIATarjeta({ contenido }: { contenido: CoachDelDia }) {
  return (
    <div className="rounded-card border px-4 py-3 shadow-sm" style={{ backgroundColor: "#7a4fd114", borderColor: "#7a4fd140" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7a4fd1]">🤖 Tu foco de hoy</p>
      <p className="mt-1 text-[13px] text-ink-soft">{contenido.animo}</p>
      <ol className="mt-2.5 space-y-2">
        {contenido.foco.map((f, i) => (
          <li key={i} className="text-[13px]">
            <span className="font-medium text-ink">{i + 1}. {f.accion}</span>
            <span className="block text-[12px] text-ink-soft">{f.motivo}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 border-t border-line pt-2.5">
        <p className="text-[12px] font-semibold text-ink">💬 {contenido.tactica.titulo}</p>
        <p className="mt-0.5 text-[12px] text-ink-soft">{contenido.tactica.texto}</p>
      </div>
      <p className="mt-2.5 text-[11px] text-ink-muted">
        Generado con IA a partir de tus datos de hoy; úsalo con criterio. Se renueva cada día.
      </p>
    </div>
  );
}
