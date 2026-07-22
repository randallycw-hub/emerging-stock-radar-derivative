const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const isoDateTimePattern =
  /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const yearMonthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;
const millisecondsPerDay = 86_400_000;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = isoDatePattern.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = isoDateTimePattern.exec(value);
  if (!match || !isIsoDate(match[1])) return false;
  return Number.isFinite(Date.parse(value));
}

export function isYearMonth(value: unknown): value is string {
  return typeof value === "string" && yearMonthPattern.test(value);
}

export function toTaipeiDate(isoDateTime: string): string {
  if (!isIsoDateTime(isoDateTime)) {
    throw new TypeError(`invalid ISO datetime: ${isoDateTime}`);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoDateTime));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function compareIsoDates(left: string, right: string): -1 | 0 | 1 {
  if (!isIsoDate(left) || !isIsoDate(right)) {
    throw new TypeError("compareIsoDates requires valid ISO dates");
  }
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function dateToEpochDay(isoDate: string): number {
  if (!isIsoDate(isoDate)) throw new TypeError(`invalid ISO date: ${isoDate}`);
  const [year, month, day] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / millisecondsPerDay);
}

export function daysUntil(targetDate: string, now: string): number {
  return dateToEpochDay(targetDate) - dateToEpochDay(toTaipeiDate(now));
}

export function isFutureDate(targetDate: string, now: string): boolean {
  return daysUntil(targetDate, now) > 0;
}

export function isDataStale(
  sourceDataDate: string,
  now: string,
  staleAfterDays: number,
): boolean {
  if (!Number.isInteger(staleAfterDays) || staleAfterDays < 0) {
    throw new TypeError("staleAfterDays must be a non-negative integer");
  }
  return -daysUntil(sourceDataDate, now) > staleAfterDays;
}
