/**
 * Etapas reales del pipeline de HubSpot (board_id / pipeline configurado en
 * HUBSPOT_PIPELINE_ID). hubspot_deal_stages solo guarda el id numérico —
 * este mapeo salió de listarEtapasPipeline() contra la API real el
 * 2026-09-04, no está adivinado. Si el pipeline cambia de etapas, hay que
 * volver a correr ese diagnóstico (`?etapas=1` en /api/cron/sincronizar-analitica)
 * y actualizar esta lista.
 */
export interface EtapaPipeline {
  id: string;
  label: string;
  orden: number;
  resultado: "abierto" | "ganado" | "perdido";
}

export const ETAPAS_PIPELINE: EtapaPipeline[] = [
  { id: "45202791",  label: "Credenciales",           orden: 0, resultado: "abierto" },
  { id: "45202792",  label: "Cotización",              orden: 1, resultado: "abierto" },
  { id: "45202793",  label: "Seguimiento 1",           orden: 2, resultado: "abierto" },
  { id: "51142288",  label: "Seguimiento 2",           orden: 3, resultado: "abierto" },
  { id: "1310311997", label: "Seguimiento 3",          orden: 4, resultado: "abierto" },
  { id: "1310311998", label: "Seguimiento 4",          orden: 5, resultado: "abierto" },
  { id: "1111140612", label: "Último seguimiento",     orden: 6, resultado: "abierto" },
  { id: "1417873273", label: "Diferido / Evento futuro", orden: 7, resultado: "abierto" },
  { id: "45202796",  label: "Ganado",                  orden: 8, resultado: "ganado" },
  { id: "45202797",  label: "Perdido",                 orden: 9, resultado: "perdido" },
];

const POR_ID = new Map(ETAPAS_PIPELINE.map((e) => [e.id, e]));

/** Nombre legible de una etapa; si el id no está en el mapa (pipeline distinto o etapa nueva), regresa el id crudo para no ocultar el dato. */
export function nombreEtapa(id: string | null): string {
  if (!id) return "Sin etapa";
  return POR_ID.get(id)?.label ?? id;
}

export function etapaInfo(id: string | null): EtapaPipeline | null {
  if (!id) return null;
  return POR_ID.get(id) ?? null;
}
