/**
 * Helpers de fecha en zona horaria de México (America/Mexico_City), no UTC
 * -- confirmado por Pris (2026-09-21). Usar new Date().toISOString() (o
 * getUTCFullYear()/getUTCMonth()/getFullYear() del runtime del servidor,
 * que en Vercel corre en UTC) corre el día/mes uno hacia adelante durante
 * las horas 00:00-05:59 UTC, que en México todavía son la tarde/noche del
 * día anterior -- eso puede activar el mes o el periodo equivocado justo
 * a fin de mes.
 *
 * México (CDMX y la gran mayoría del país) no observa horario de verano
 * desde la reforma de 2022 -- es UTC-6 todo el año -- así que la
 * medianoche de un día calendario en CDMX equivale siempre a las 06:00 UTC
 * de ese mismo día.
 */

/** "Hoy" como YYYY-MM-DD en CDMX -- para comparar contra columnas de fecha simple (periodos.cal_inicio, periodo_semanas.inicio, etc). */
export function hoyCDMX(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
}

/** Año/mes de "hoy" en CDMX. */
export function fechaHoyCDMX(): { anio: number; mes: number } {
  const [anio, mes] = hoyCDMX().split("-").map(Number);
  return { anio, mes };
}

/** Instante (Date) de la medianoche CDMX de "hoy menos `diasAtras` días" -- para comparar contra timestamps (detectado_en, resuelto_en, etc). */
export function inicioDiaCDMX(diasAtras = 0): Date {
  const [anio, mes, dia] = hoyCDMX().split("-").map(Number);
  const medianocheHoyUTC = new Date(Date.UTC(anio, mes - 1, dia, 6, 0, 0, 0));
  medianocheHoyUTC.setUTCDate(medianocheHoyUTC.getUTCDate() - diasAtras);
  return medianocheHoyUTC;
}

/**
 * Fecha calendario (YYYY-MM-DD) en CDMX de un timestamp ISO. Un timestamp con
 * hora real (ej. cierre de HubSpot 2026-10-01T02:46Z) cae en el día/mes
 * anterior en México (30-sep 8:46 p.m.). Los valores que vienen de una
 * columna de fecha simple llegan como medianoche UTC exacta -- esos se
 * dejan tal cual, para no restarles un día.
 */
export function fechaCalendarioCDMX(iso: string): string {
  if (/T00:00:00(\.0+)?(Z|\+00:00)$/.test(iso)) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));
}
