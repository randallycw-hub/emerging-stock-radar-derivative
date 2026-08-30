import type { CbRightsEvent } from "../source-verification/source-cb-rights-event.ts";

export type CbRightsEventStatus = "upcoming" | "active" | "deadline_soon" | "completed" | "cancelled";

export type CbRightsEventSnapshot = Readonly<{
  schemaVersion: 1;
  generatedAt: string;
  dataDate: string;
  events: readonly CbRightsEvent[];
  source: Readonly<{
    state: "fresh" | "stale" | "unavailable";
    dataDate: string | null;
    recordCount: number;
  }>;
}>;

type BuildInput = Readonly<{
  generatedAt: string;
  dataDate: string;
  current?: readonly CbRightsEvent[];
  previous?: CbRightsEventSnapshot | null;
}>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseDate(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function daysBetween(left: string, right: string): number | null {
  const leftTime = parseDate(left);
  const rightTime = parseDate(right);
  return leftTime === null || rightTime === null ? null : Math.round((leftTime - rightTime) / 86_400_000);
}

function assertEvent(event: CbRightsEvent): void {
  invariant(/^mops-redemption:\d{5,6}:\d{4}-\d{2}-\d{2}:\d+$/u.test(event.eventId), "CB rights event id is invalid.");
  invariant(event.eventType === "early_redemption", "CB rights event type is invalid.");
  invariant(/^\d{4}$/u.test(event.issuerCode), "CB rights issuer code is invalid.");
  invariant(/^\d{5,6}$/u.test(event.bondCode), "CB rights bond code is invalid.");
  invariant(/^\d{4}-\d{2}-\d{2}$/u.test(event.announcementDate), "CB rights announcement date is invalid.");
  invariant(event.sourceUrl.startsWith("https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?"), "CB rights source URL is invalid.");
  invariant(/^sha256:[a-f0-9]{64}$/u.test(event.rawTextHash), "CB rights raw hash is invalid.");
}

function sortEvents(events: readonly CbRightsEvent[]): readonly CbRightsEvent[] {
  return Object.freeze([...events].sort((left, right) => {
    const leftKey = left.acceptEndDate ?? left.recordDate ?? left.lastTradingDate ?? left.announcementDate;
    const rightKey = right.acceptEndDate ?? right.recordDate ?? right.lastTradingDate ?? right.announcementDate;
    return leftKey.localeCompare(rightKey) || left.eventId.localeCompare(right.eventId);
  }));
}

function dedupeEvents(events: readonly CbRightsEvent[]): readonly CbRightsEvent[] {
  const seen = new Set<string>();
  const result: CbRightsEvent[] = [];
  for (const event of events) {
    assertEvent(event);
    invariant(!seen.has(event.eventId), `Duplicate CB rights event: ${event.eventId}`);
    seen.add(event.eventId);
    result.push(Object.freeze({ ...event }));
  }
  return sortEvents(result);
}

export function classifyCbRightsEventStatus(
  event: Pick<CbRightsEvent, "announcementDate" | "acceptStartDate" | "acceptEndDate" | "brokerAcceptEndDate" | "recordDate" | "lastTradingDate" | "lastConversionDate">,
  asOfDate: string,
): CbRightsEventStatus {
  invariant(parseDate(asOfDate) !== null, "CB rights event status requires an ISO as-of date.");
  const keyDates = [
    event.brokerAcceptEndDate,
    event.acceptEndDate,
    event.recordDate,
    event.lastTradingDate,
    event.lastConversionDate,
  ].filter((value): value is string => parseDate(value) !== null);
  const latestDate = [...keyDates].sort().at(-1) ?? event.announcementDate;
  const latestDistance = daysBetween(latestDate, asOfDate);
  if (latestDistance !== null && latestDistance < 0) return "completed";

  const upcomingDeadline = keyDates
    .map((date) => daysBetween(date, asOfDate))
    .filter((distance): distance is number => distance !== null && distance >= 0 && distance <= 3);
  if (upcomingDeadline.length > 0) return "deadline_soon";

  const start = event.acceptStartDate ?? event.brokerAcceptEndDate;
  const end = event.acceptEndDate ?? event.lastTradingDate ?? event.lastConversionDate;
  if (start && end) {
    const startDistance = daysBetween(start, asOfDate);
    const endDistance = daysBetween(end, asOfDate);
    if (startDistance !== null && endDistance !== null && startDistance <= 0 && endDistance >= 0) return "active";
  }
  return "upcoming";
}

function assertSnapshot(snapshot: CbRightsEventSnapshot): void {
  invariant(snapshot.schemaVersion === 1, "CB rights event snapshot schema is invalid.");
  invariant(/^\d{4}-\d{2}-\d{2}$/u.test(snapshot.dataDate), "CB rights event snapshot data date is invalid.");
  invariant(!Number.isNaN(Date.parse(snapshot.generatedAt)), "CB rights event snapshot generated time is invalid.");
  const deduped = dedupeEvents(snapshot.events);
  invariant(deduped.length === snapshot.events.length, "CB rights event snapshot has duplicates.");
  invariant(snapshot.source.recordCount === snapshot.events.length, "CB rights event count does not match source metadata.");
}

export function parseCbRightsEventSnapshot(value: unknown): CbRightsEventSnapshot {
  invariant(value !== null && typeof value === "object" && !Array.isArray(value), "CB rights event snapshot must be an object.");
  const candidate = value as Record<string, unknown>;
  invariant(candidate.schemaVersion === 1, "CB rights event snapshot schema is invalid.");
  invariant(typeof candidate.generatedAt === "string", "CB rights event snapshot generated time is invalid.");
  invariant(typeof candidate.dataDate === "string", "CB rights event snapshot data date is invalid.");
  invariant(Array.isArray(candidate.events), "CB rights event snapshot events are invalid.");
  invariant(candidate.source !== null && typeof candidate.source === "object" && !Array.isArray(candidate.source), "CB rights event snapshot source is invalid.");
  const source = candidate.source as Record<string, unknown>;
  invariant(
    (source.state === "fresh" || source.state === "stale" || source.state === "unavailable")
      && (source.dataDate === null || typeof source.dataDate === "string")
      && typeof source.recordCount === "number",
    "CB rights event snapshot source is invalid.",
  );
  const events = candidate.events.map((entry) => {
    invariant(entry !== null && typeof entry === "object" && !Array.isArray(entry), "CB rights event is invalid.");
    const event = entry as CbRightsEvent;
    for (const key of [
      "eventId", "eventType", "issuerCode", "issuerName", "bondCode", "bondName",
      "announcementDate", "sourceUrl", "rawSourceId", "rawTextHash", "fetchedAt",
    ]) {
      invariant(typeof event[key as keyof CbRightsEvent] === "string", `CB rights event ${key} is invalid.`);
    }
    for (const key of [
      "acceptStartDate", "acceptEndDate", "brokerAcceptStartDate", "brokerAcceptEndDate",
      "lastConversionDate", "recordDate", "lastTradingDate", "redemptionPrice",
      "redemptionPricePercent", "reason",
    ]) {
      const field = event[key as keyof CbRightsEvent];
      invariant(field === null || typeof field === "string", `CB rights event ${key} is invalid.`);
    }
    assertEvent(event);
    return Object.freeze({ ...event });
  });
  const snapshot: CbRightsEventSnapshot = Object.freeze({
    schemaVersion: 1,
    generatedAt: candidate.generatedAt,
    dataDate: candidate.dataDate,
    events: Object.freeze(events),
    source: Object.freeze({
      state: source.state,
      dataDate: source.dataDate,
      recordCount: source.recordCount,
    }) as CbRightsEventSnapshot["source"],
  });
  assertSnapshot(snapshot);
  return snapshot;
}

export function buildCbRightsEventSnapshot(input: BuildInput): CbRightsEventSnapshot {
  invariant(/^\d{4}-\d{2}-\d{2}$/u.test(input.dataDate), "CB rights event data date is invalid.");
  invariant(!Number.isNaN(Date.parse(input.generatedAt)), "CB rights event generated time is invalid.");

  const hasCurrent = Array.isArray(input.current);
  const current = hasCurrent ? dedupeEvents(input.current ?? []) : null;
  const previous = input.previous ?? null;
  if (previous) assertSnapshot(previous);
  const shouldUsePrevious = current === null || (current.length === 0 && (previous?.events.length ?? 0) > 0);
  const events = shouldUsePrevious ? previous?.events ?? [] : current ?? [];
  const state = shouldUsePrevious
    ? (previous ? "stale" : "unavailable")
    : "fresh";

  const snapshot: CbRightsEventSnapshot = Object.freeze({
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    dataDate: input.dataDate,
    events: Object.freeze([...events]),
    source: Object.freeze({
      state,
      dataDate: events.length > 0 ? (shouldUsePrevious ? previous?.dataDate ?? null : input.dataDate) : null,
      recordCount: events.length,
    }),
  });
  assertSnapshot(snapshot);
  return snapshot;
}
