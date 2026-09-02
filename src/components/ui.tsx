import type { ReactNode } from "react";
import { CALIDAD_ETIQUETA, SEMAFORO } from "@/lib/format";
import type { Calidad, Semaforo } from "@/lib/types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-surface ${className}`}>{children}</div>
  );
}

export function Seccion({
  titulo, descripcion, acciones, children,
}: {
  titulo: string; descripcion?: string; acciones?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-[13px] text-ink-soft">{descripcion}</p>}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  );
}

export function Vacio({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <Card className="px-5 py-8 text-center">
      <p className="text-[13px] font-medium text-ink">{titulo}</p>
      {detalle && <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-soft">{detalle}</p>}
    </Card>
  );
}

/** El color de estado nunca va solo: icono + etiqueta siempre presentes. */
export function SemaforoBadge({ estado, compacto = false }: { estado: Semaforo; compacto?: boolean }) {
  const s = SEMAFORO[estado];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ color: s.color, backgroundColor: s.bg, borderColor: s.borde }}
    >
      <span aria-hidden="true">{s.icono}</span>
      {!compacto && s.etiqueta}
    </span>
  );
}

export function CalidadBadge({ calidad }: { calidad: Calidad }) {
  if (calidad === "ok") return null;
  const critico = calidad === "por_revisar";
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium"
      style={
        critico
          ? { color: "#a04a25", backgroundColor: "#fdeee7", borderColor: "#f4cbb6" }
          : { color: "#8a6100", backgroundColor: "#fdf4e0", borderColor: "#f2dfae" }
      }
      title="Bandera de la capa de sanitización: la métrica se muestra pero la fuente está incompleta."
    >
      <span aria-hidden="true">⚑</span>
      {CALIDAD_ETIQUETA[calidad]}
    </span>
  );
}

/**
 * Barra de magnitud. Serie única: no lleva leyenda, el título la nombra.
 * Extremo de 4px redondeado, anclado a la línea base.
 */
export function Barra({
  valor, maximo, color = "#2a78d6", etiqueta,
}: { valor: number; maximo: number; color?: string; etiqueta?: string }) {
  const ancho = maximo > 0 ? Math.min(100, Math.max(0, (valor / maximo) * 100)) : 0;
  return (
    <div className="barra-pista w-full" role="img" aria-label={etiqueta}>
      <div className="barra-valor" style={{ width: `${ancho}%`, backgroundColor: color }} title={etiqueta} />
    </div>
  );
}

/** Meta contra objetivo: la marca del 100% se dibuja como referencia. */
export function BarraCumplimiento({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <div className="barra-pista w-full" role="img" aria-label="Sin objetivo capturado" />;
  }
  const escala = Math.max(120, pct);
  const s = SEMAFORO[pct >= 100 ? "verde" : pct >= 80 ? "amarillo" : pct >= 50 ? "naranja" : "rojo"];
  return (
    <div className="relative w-full" role="img" aria-label={`Cumplimiento ${pct.toFixed(1)}%`}>
      <div className="barra-pista w-full">
        <div className="barra-valor" style={{ width: `${(pct / escala) * 100}%`, backgroundColor: s.color }} />
      </div>
      <span
        className="absolute top-[-2px] h-3 w-px bg-line-strong"
        style={{ left: `${(100 / escala) * 100}%` }}
        title="Objetivo (100%)"
      />
    </div>
  );
}

/** Tarjeta de indicador. Sin gráfico: nada de tooltip, el número es el dato. */
export function KpiCard({
  etiqueta, valor, apoyo, lectura, estado,
}: {
  etiqueta: string;
  valor: string;
  apoyo?: string;
  lectura?: string;
  estado?: "cumple" | "debajo" | "arriba" | "sin_dato";
}) {
  const tono =
    estado === "debajo" ? "#d03b3b" :
    estado === "arriba" ? "#8a6100" :
    estado === "cumple" ? "#006300" : "#52514e";
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{etiqueta}</p>
      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-ink">{valor}</p>
      {apoyo && <p className="mt-1.5 text-[12px] text-ink-soft tabular">{apoyo}</p>}
      {lectura && <p className="mt-1 text-[12px] font-medium" style={{ color: tono }}>{lectura}</p>}
    </Card>
  );
}
