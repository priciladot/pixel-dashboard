import type { AppRole } from "./types";

export type NivelTemperatura = "caliente" | "tibio" | "frio";

export interface NivelAnuncio {
  nivel: NivelTemperatura;
  etiqueta: string;
  puntos: string[];
}

export interface Anuncio {
  id: string;
  titulo: string;
  entrada: string;
  niveles: NivelAnuncio[];
  reglas: string[];
  cierre: string;
  audiencia: AppRole[];
  /** Si viene, además del rol se exige que el correo esté en esta lista. */
  correos?: string[];
  /** ISO con desfase de CDMX (-06:00). Vigencia es [vigenteDesde, vigenteHasta). */
  vigenteDesde: string;
  vigenteHasta: string;
}

export const ANUNCIOS: Anuncio[] = [
  {
    id: "recordatorio-temperatura-2026-09",
    titulo: "Cómo calificar tus leads",
    entrada: "La temperatura la define la fecha del evento, contada desde que entra el lead.",
    audiencia: ["vendedor", "supervisor"],
    vigenteDesde: "2026-09-21T00:00:00-06:00",
    vigenteHasta: "2026-09-28T00:00:00-06:00",
    niveles: [
      {
        nivel: "caliente",
        etiqueta: "Caliente — Evento a menos de 30 días",
        puntos: [
          "Cotización formal y Deal en HubSpot antes de mandar cualquier número.",
          "5 toques en 10 días hábiles.",
        ],
      },
      {
        nivel: "tibio",
        etiqueta: "Tibio — Evento entre 30 y 90 días",
        puntos: [
          "Deal en etapa inicial, catálogo y rango de inversión.",
          "Sin cotización formal hasta que haya fecha o presupuesto.",
          "5 toques en 6 semanas.",
        ],
      },
      {
        nivel: "frio",
        etiqueta: "Frío — Más de 90 días o sin proyecto",
        puntos: [
          "No se crea Deal. Pasa a nurturing de marketing.",
          "5 toques en el trimestre.",
        ],
      },
    ],
    reglas: [
      "Calificas dentro de las primeras 24 horas.",
      "Cotización sin Deal asociado no existe.",
      "Al agotar los cinco toques, cierras con motivo tipificado.",
    ],
    cierre: "Si el cliente mueve la fecha, recalificas el mismo día y reinicias la cadencia.",
  },
];

/**
 * Filtra por rol, por correo (si el anuncio trae lista) y por rango de
 * vigencia [desde, hasta). Con `verTodos` (dirección) se ignora el filtro
 * de audiencia/correo -- Pris confirmó que como Dirección/Dueña siempre
 * debe tener visibilidad total, incluyendo la vista previa desde /maestro.
 */
export function anunciosVigentes(rol: AppRole, correo: string, ahora: Date = new Date(), verTodos = false): Anuncio[] {
  const t = ahora.getTime();
  return ANUNCIOS.filter((a) => {
    if (!verTodos) {
      if (!a.audiencia.includes(rol)) return false;
      if (a.correos && !a.correos.includes(correo)) return false;
    }
    const desde = new Date(a.vigenteDesde).getTime();
    const hasta = new Date(a.vigenteHasta).getTime();
    return t >= desde && t < hasta;
  });
}
