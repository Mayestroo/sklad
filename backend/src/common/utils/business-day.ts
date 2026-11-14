/**
 * Day boundaries in the businesses' own clock. Sklad's tenants work in
 * Uzbekistan (Asia/Tashkent, UTC+5, no daylight saving since 1992), while the
 * server may run in UTC or anywhere else: "today" and a "date_to" filter must
 * not depend on the server's timezone.
 */
const BUSINESS_UTC_OFFSET_HOURS = 5;
const OFFSET_MS = BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The business-clock calendar date of an instant, as UTC fields. */
function businessCalendar(now: Date) {
  const shifted = new Date(now.getTime() + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function businessMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) - OFFSET_MS);
}

/** Instant at which the current business day began. */
export function startOfBusinessDay(now: Date = new Date()): Date {
  const { year, month, day } = businessCalendar(now);
  return businessMidnight(year, month, day);
}

/** Instant at which the current business month began. */
export function startOfBusinessMonth(now: Date = new Date()): Date {
  const { year, month } = businessCalendar(now);
  return businessMidnight(year, month, 1);
}

/** Lower bound of a `date_from` filter: a bare date means its business midnight. */
export function businessRangeStart(value: string): Date {
  return DATE_ONLY.test(value)
    ? new Date(`${value}T00:00:00.000+0${BUSINESS_UTC_OFFSET_HOURS}:00`)
    : new Date(value);
}

/** Upper bound of a `date_to` filter: a bare date runs to the end of that business day. */
export function businessRangeEnd(value: string): Date {
  return DATE_ONLY.test(value)
    ? new Date(`${value}T23:59:59.999+0${BUSINESS_UTC_OFFSET_HOURS}:00`)
    : new Date(value);
}
