import type { Semaforo } from "./types";

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", maximumFractionDigits: 0,
});
const mxnExacto = new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", minimumFractionDigits: 2,
});
const entero = new Intl.NumberFormat("es-MX");

export const IVA = 1.16;
export const conIva  = (n: number) => Math.round(n * IVA * 100) / 100;
export const sinIva  = (n: number) => Math.round((n / IVA) * 100) / 100;

export const dinero  = (n?: number | null) => (n == null ? "—" : mxn.format(n));
export const dineroExacto = (n?: number | null) => (n == null ? "—" : mxnExacto.format(n));
export const num     = (n?: number | null) => (n == null ? "—" : entero.format(n));
export const pct     = (n?: number | null, d = 1) => (n == null ? "—" : `${n.toFixed(d)}%`);
export const dias    = (n?: number | null) => (n == null ? "—" : `${n.toFixed(1)} días`);

/** Compacto para tarjetas: $5.8M / $744K */
export function dineroCorto(n?: number | null): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return mxn.format(n);
}

/** Los colores de estado nunca viajan solos: siempre con icono y etiqueta. */
export const SEMAFORO: Record<Semaforo, { etiqueta: string; icono: string; color: string; bg: string; borde: string }> = {
  verde:    { etiqueta: "En objetivo",   icono: "●", color: "#0ca30c", bg: "#e9f7e9", borde: "#bfe6bf" },
  amarillo: { etiqueta: "Cerca",         icono: "◐", color: "#8a6100", bg: "#fdf4e0", borde: "#f2dfae" },
  naranja:  { etiqueta: "Rezagado",      icono: "◑", color: "#a04a25", bg: "#fdeee7", borde: "#f4cbb6" },
  rojo:     { etiqueta: "Crítico",       icono: "▲", color: "#d03b3b", bg: "#fdecec", borde: "#f3c2c2" },
  sin_dato: { etiqueta: "Sin objetivo",  icono: "○", color: "#52514e", bg: "#f2f1ed", borde: "#e1e0d9" },
};

export function semaforoDe(cumplimiento?: number | null): Semaforo {
  if (cumplimiento == null) return "sin_dato";
  if (cumplimiento >= 100) return "verde";
  if (cumplimiento >= 80)  return "amarillo";
  if (cumplimiento >= 50)  return "naranja";
  return "rojo";
}

/** Lectura de un indicador contra su estándar universal. */
export function contraEstandar(
  valor: number | null | undefined,
  min?: number | null,
  max?: number | null,
): { estado: "cumple" | "debajo" | "arriba" | "sin_dato"; texto: string } {
  if (valor == null) return { estado: "sin_dato", texto: "Sin dato en la fuente" };
  if (min != null && valor < min) return { estado: "debajo", texto: `${entero.format(min - valor)} por debajo del estándar` };
  if (max != null && valor > max) return { estado: "arriba", texto: `${entero.format(valor - max)} por encima del rango` };
  return { estado: "cumple", texto: "Dentro del estándar" };
}

export const CALIDAD_ETIQUETA: Record<string, string> = {
  ok: "Dato completo",
  parcial: "Dato parcial",
  por_revisar: "Sin asignar / Por revisar",
};
