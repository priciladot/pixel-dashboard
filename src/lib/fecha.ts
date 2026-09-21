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
