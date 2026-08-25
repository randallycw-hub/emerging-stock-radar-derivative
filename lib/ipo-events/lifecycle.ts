import { isIsoDate } from "../domain/dates.ts";

type LifecycleEvent = Readonly<{
  companyCode: string;
  market: string;
  kind: string;
  date: string;
  label: string;
  sourceRecordIds: readonly string[];
}>;

type LifecycleInput = Readonly<{
  companyCode: string;
  market: string;
  stage: string;
  exceptionStatus: string | null;
  applicationDate: string;
  events: readonly LifecycleEvent[];
  auction: Readonly<{ bidStartDate?: string | null; bidEndDate?: string | null; auctionOpenDate?: string | null; minimumBidPrice?: string | null; finalUnderwritingPrice?: string | null }> | null;
  publicOffering: Readonly<{ subscriptionStartDate?: string | null; subscriptionEndDate?: string | null; drawDate?: string | null; listingDate?: string | null; provisionalUnderwritingPrice?: string | null; finalUnderwritingPrice?: string | null }> | null;
  listingDate: string | null;
  finalUnderwritingPrice?: string | null;
  provisionalUnderwritingPrice?: string | null;
  underwriter: string;
}>;

const activeStages = new Set(["A", "B", "C", "D"]);

export function normalizeIpoLifecycle(record: LifecycleInput, asOfDate: string) {
  if (!isIsoDate(asOfDate)) throw new TypeError("asOfDate must be an ISO date");
  const events = dedupeEvents(record.events)
    .filter((event) => event.date <= asOfDate)
    .sort((left, right) => left.date.localeCompare(right.date) || left.kind.localeCompare(right.kind));
  const stageStart = events.at(-1)?.date
    ?? (isIsoDate(record.applicationDate) ? record.applicationDate : null);
  return Object.freeze({
    currentStage: record.stage,
    daysInStage: stageStart === null ? null : calendarDistance(stageStart, asOfDate),
    events: Object.freeze(events),
    active: activeStages.has(record.stage)
      && record.exceptionStatus !== "withdrawn"
      && record.exceptionStatus !== "cancelled"
      && record.exceptionStatus !== "delayed",
  });
}

export function projectOffering(record: LifecycleInput) {
  return Object.freeze({
    bidStartDate: validDateOrNull(record.auction?.bidStartDate),
    bidEndDate: validDateOrNull(record.auction?.bidEndDate),
    auctionOpenDate: validDateOrNull(record.auction?.auctionOpenDate),
    subscriptionStartDate: validDateOrNull(record.publicOffering?.subscriptionStartDate),
    subscriptionEndDate: validDateOrNull(record.publicOffering?.subscriptionEndDate),
    drawDate: validDateOrNull(record.publicOffering?.drawDate),
    listingDate: validDateOrNull(record.publicOffering?.listingDate) ?? validDateOrNull(record.listingDate),
    underwriter: record.underwriter.trim() || null,
    underwritingPrice: validDecimalOrNull(record.finalUnderwritingPrice)
      ?? validDecimalOrNull(record.auction?.finalUnderwritingPrice)
      ?? validDecimalOrNull(record.publicOffering?.finalUnderwritingPrice)
      ?? validDecimalOrNull(record.provisionalUnderwritingPrice)
      ?? validDecimalOrNull(record.publicOffering?.provisionalUnderwritingPrice)
      ?? validDecimalOrNull(record.auction?.minimumBidPrice),
  });
}

function dedupeEvents(events: readonly LifecycleEvent[]): LifecycleEvent[] {
  const canonical = new Map<string, LifecycleEvent>();
  for (const event of events) {
    if (!isIsoDate(event.date)) continue;
    const key = [event.companyCode, event.market, event.kind, event.date].join("\u0000");
    const existing = canonical.get(key);
    if (existing === undefined) {
      canonical.set(key, Object.freeze({ ...event, sourceRecordIds: Object.freeze([...new Set(event.sourceRecordIds)].sort()) }));
      continue;
    }
    canonical.set(key, Object.freeze({
      ...existing,
      sourceRecordIds: Object.freeze([...new Set([...existing.sourceRecordIds, ...event.sourceRecordIds])].sort()),
    }));
  }
  return [...canonical.values()];
}

function validDateOrNull(value: unknown): string | null {
  return typeof value === "string" && isIsoDate(value) ? value : null;
}

function validDecimalOrNull(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d+(?:\.\d+)?$/.test(text) ? text : null;
}

function calendarDistance(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
