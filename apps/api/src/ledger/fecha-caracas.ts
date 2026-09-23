/**
 * El cierre diario se agrupa por fecha de Venezuela (America/Caracas, UTC−4
 * sin horario de verano), no por fecha UTC: un cobro a las 9pm de Caracas
 * ya es el día siguiente en UTC y caería en el cierre equivocado.
 *
 * Devuelve la medianoche UTC del día calendario de Caracas, que es como
 * Prisma persiste una columna `@db.Date`.
 */
export function fechaCaracasHoy(ahora: Date = new Date()): Date {
  const ymd = fechaCaracasYmd(ahora);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/**
 * Devuelve la fecha de hoy en Caracas como string "YYYY-MM-DD".
 * Mismo truco que `fechaCaracasHoy` pero sin el `Date` — para pasarle
 * a los endpoints que esperan una fecha como query param.
 */
export function fechaCaracasYmd(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora); // "2026-08-12"
}
