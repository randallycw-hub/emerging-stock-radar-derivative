import { isIsoDate } from "../domain/dates.ts";

export type RefreshMode = "FAST" | "OFFICIAL" | "EVENT" | "RECONCILE" | "WEEKLY";

const modes = new Set<RefreshMode>(["FAST", "OFFICIAL", "EVENT", "RECONCILE", "WEEKLY"]);

export function parseRefreshMode(value: unknown): RefreshMode {
  if (typeof value !== "string" || !modes.has(value as RefreshMode)) {
    throw new TypeError("refresh mode is invalid");
  }
  return value as RefreshMode;
}

export function refreshSchedule(): readonly Readonly<{
  mode: RefreshMode;
  taipeiTime: string;
  tradingDaysOnly: boolean;
  taipeiWeekday?: "Saturday";
}>[] {
  return Object.freeze([
    Object.freeze({ mode: "FAST" as const, taipeiTime: "16:15", tradingDaysOnly: true }),
    Object.freeze({ mode: "OFFICIAL" as const, taipeiTime: "17:45", tradingDaysOnly: true }),
    Object.freeze({ mode: "EVENT" as const, taipeiTime: "22:30", tradingDaysOnly: false }),
    Object.freeze({ mode: "RECONCILE" as const, taipeiTime: "07:30", tradingDaysOnly: true }),
    Object.freeze({ mode: "WEEKLY" as const, taipeiTime: "10:00", tradingDaysOnly: false, taipeiWeekday: "Saturday" as const }),
  ]);
}

export function shouldPublishMarketCandidate(input: Readonly<{
  mode: RefreshMode;
  requestedDate: string;
  officialDataDate: string | null;
  previousPublishedDate: string | null;
}>): boolean {
  const mode = parseRefreshMode(input.mode);
  if (mode !== "OFFICIAL") return false;
  if (!isIsoDate(input.requestedDate) || !isIsoDate(input.officialDataDate)) return false;
  if (input.officialDataDate !== input.requestedDate) return false;
  return input.previousPublishedDate === null
    || (isIsoDate(input.previousPublishedDate) && input.officialDataDate > input.previousPublishedDate);
}
