import { isIsoDate } from "../domain/dates.ts";

type VerifiedDataset<T extends Record<string, unknown>> = Readonly<{
  status: "verified";
  records: readonly T[];
}>;

type V56Snapshot = Readonly<{
  schemaVersion: 3;
  dataDate: string;
  securityMaster: VerifiedDataset<SecurityMasterRecord>;
  cbMaster: VerifiedDataset<CbMasterRecord>;
  cbEvents: VerifiedDataset<CbEventRecord>;
  ipoPipeline: VerifiedDataset<Record<string, unknown>>;
  emerging: VerifiedDataset<Record<string, unknown>>;
}>;

type SecurityMasterRecord = Readonly<{
  stockCode: string;
  relatedCbCodes: readonly string[];
}>;

type CbMasterRecord = Readonly<{
  cbCode: string;
  currentConversionPrice?: number | null;
  outstandingAmount?: number | null;
}>;

type CbEventRecord = Readonly<{
  eventId: string;
  eventType: string;
  cbCode: string;
  announcementDate?: string;
}>;

export type V56DailyChange = Readonly<{
  changeId: string;
  entityType: "cb" | "ipo" | "emerging";
  entityId: string;
  fieldName: string;
  changeType:
    | "conversion_price_changed"
    | "outstanding_changed"
    | "new_early_redemption"
    | "new_listing"
    | "conversion_suspension_added"
    | "put_window_added"
    | "maturity_window_entered"
    | "ipo_stage_changed"
    | "new_ipo_event"
    | "emerging_turnover_rank_changed";
  oldValue: number | string | null;
  newValue: number | string | null;
  effectiveDate: string;
}>;

function isVerifiedDataset(value: unknown): value is VerifiedDataset<Record<string, unknown>> {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as { status?: unknown; records?: unknown };
  return candidate.status === "verified" && Array.isArray(candidate.records);
}

function isV56Snapshot(value: unknown): value is V56Snapshot {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 3 || !isIsoDate(candidate.dataDate)) return false;

  return ["securityMaster", "cbMaster", "cbEvents", "ipoPipeline", "emerging"].every((key) => isVerifiedDataset(candidate[key]));
}

function isComparableNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isCbMasterRecord(value: unknown): value is CbMasterRecord {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.cbCode === "string"
    && /^\d{4,6}$/.test(candidate.cbCode)
    && (candidate.currentConversionPrice === undefined || isComparableNumberOrNull(candidate.currentConversionPrice))
    && (candidate.outstandingAmount === undefined || isComparableNumberOrNull(candidate.outstandingAmount));
}

function isCbEventRecord(value: unknown): value is CbEventRecord {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.eventId === "string"
    && typeof candidate.eventType === "string"
    && typeof candidate.cbCode === "string"
    && /^\d{4,6}$/.test(candidate.cbCode)
    && (candidate.announcementDate === undefined || isIsoDate(candidate.announcementDate));
}

function sameNullableNumber(left: number | null | undefined, right: number | null | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

function makeChange(
  input: Omit<V56DailyChange, "changeId">,
): V56DailyChange {
  return Object.freeze({
    ...input,
    changeId: `${input.entityType}:${input.entityId}:${input.changeType}:${input.effectiveDate}`,
  });
}

const CHANGE_ORDER: Readonly<Record<V56DailyChange["changeType"], number>> = Object.freeze({
  conversion_price_changed: 0,
  outstanding_changed: 1,
  new_early_redemption: 2,
  new_listing: 3,
  conversion_suspension_added: 4,
  put_window_added: 5,
  maturity_window_entered: 6,
  ipo_stage_changed: 7,
  new_ipo_event: 8,
  emerging_turnover_rank_changed: 9,
});

/**
 * Produces public change records only when both consecutive snapshots passed
 * the V5.6 verified-state contract. Failed or partial snapshots are ignored.
 */
export function buildDailyChanges(input: Readonly<{ previous: unknown; current: unknown }>): readonly V56DailyChange[] {
  if (!isV56Snapshot(input.previous) || !isV56Snapshot(input.current)) return Object.freeze([]);

  const previousCb = new Map(
    input.previous.cbMaster.records.filter(isCbMasterRecord).map((record) => [record.cbCode, record] as const),
  );
  const previousEvents = new Set(
    input.previous.cbEvents.records.filter(isCbEventRecord).map((record) => record.eventId),
  );
  const changes: V56DailyChange[] = [];

  for (const currentCb of input.current.cbMaster.records.filter(isCbMasterRecord)) {
    const previousCbRecord = previousCb.get(currentCb.cbCode);
    if (previousCbRecord === undefined) continue;

    if (!sameNullableNumber(previousCbRecord.currentConversionPrice, currentCb.currentConversionPrice)) {
      changes.push(makeChange({
        entityType: "cb",
        entityId: currentCb.cbCode,
        fieldName: "currentConversionPrice",
        changeType: "conversion_price_changed",
        oldValue: previousCbRecord.currentConversionPrice ?? null,
        newValue: currentCb.currentConversionPrice ?? null,
        effectiveDate: input.current.dataDate,
      }));
    }

    if (!sameNullableNumber(previousCbRecord.outstandingAmount, currentCb.outstandingAmount)) {
      changes.push(makeChange({
        entityType: "cb",
        entityId: currentCb.cbCode,
        fieldName: "outstandingAmount",
        changeType: "outstanding_changed",
        oldValue: previousCbRecord.outstandingAmount ?? null,
        newValue: currentCb.outstandingAmount ?? null,
        effectiveDate: input.current.dataDate,
      }));
    }
  }

  for (const event of input.current.cbEvents.records.filter(isCbEventRecord)) {
    const isNewEvent = !previousEvents.has(event.eventId);
    if (!isNewEvent && event.eventType !== "maturity") continue;
    const eventChange = cbEventChange(event, input.previous.dataDate, input.current.dataDate);
    if (eventChange === null) continue;
    changes.push(makeChange({
      entityType: "cb",
      entityId: event.cbCode,
      fieldName: "eventType",
      changeType: eventChange.changeType,
      oldValue: null,
      newValue: eventChange.label,
      effectiveDate: event.announcementDate ?? input.current.dataDate,
    }));
  }

  appendIpoChanges(changes, input.previous, input.current);
  appendEmergingChanges(changes, input.previous, input.current);

  return Object.freeze(changes.sort((left, right) => (
    left.entityType.localeCompare(right.entityType)
    || left.entityId.localeCompare(right.entityId)
    || CHANGE_ORDER[left.changeType] - CHANGE_ORDER[right.changeType]
    || left.changeId.localeCompare(right.changeId)
  )));
}

function cbEventChange(
  event: CbEventRecord,
  previousDataDate: string,
  currentDataDate: string,
): Readonly<{ changeType: Extract<V56DailyChange["changeType"], "new_early_redemption" | "new_listing" | "conversion_suspension_added" | "put_window_added" | "maturity_window_entered">; label: string }> | null {
  if (!isNewlyAnnounced(event.announcementDate, previousDataDate, currentDataDate) && event.eventType !== "maturity") return null;
  if (event.eventType === "early_redemption") return { changeType: "new_early_redemption", label: "提前贖回" };
  if (event.eventType === "listing") {
    return { changeType: "new_listing", label: "新掛牌" };
  }
  if (event.eventType === "conversion_suspension" || event.eventType === "suspension") {
    return { changeType: "conversion_suspension_added", label: "停止轉換" };
  }
  if (event.eventType === "put") return { changeType: "put_window_added", label: "賣回窗口" };
  if (event.eventType === "maturity" && entersMaturityWindow(event.announcementDate, previousDataDate, currentDataDate)) {
    return { changeType: "maturity_window_entered", label: "進入到期窗口" };
  }
  return null;
}

function isNewlyAnnounced(
  announcementDate: string | undefined,
  previousDataDate: string,
  currentDataDate: string,
): boolean {
  return isIsoDate(announcementDate)
    && announcementDate > previousDataDate
    && announcementDate <= currentDataDate;
}

function entersMaturityWindow(eventDate: string | undefined, previousDataDate: string, currentDataDate: string): boolean {
  if (!isIsoDate(eventDate)) return false;
  const previousLimit = addCalendarDays(previousDataDate, 90);
  const currentLimit = addCalendarDays(currentDataDate, 90);
  return eventDate > previousLimit && eventDate <= currentLimit;
}

function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function appendIpoChanges(changes: V56DailyChange[], previous: V56Snapshot, current: V56Snapshot): void {
  const previousRecords = new Map(
    previous.ipoPipeline.records
      .filter(isIpoRecord)
      .map((record) => [record.stockCode, record] as const),
  );
  for (const record of current.ipoPipeline.records.filter(isIpoRecord)) {
    const prior = previousRecords.get(record.stockCode);
    const priorEvents = new Set(prior?.events.map(ipoEventKey) ?? []);
    const newlyPublishedEvents = record.events.filter((event) => (
      !priorEvents.has(ipoEventKey(event))
      && isNewlyAnnounced(event.date, previous.dataDate, current.dataDate)
    ));
    if (prior !== undefined && prior.stage !== record.stage && newlyPublishedEvents.length > 0) {
      changes.push(makeChange({
        entityType: "ipo",
        entityId: record.stockCode,
        fieldName: "stage",
        changeType: "ipo_stage_changed",
        oldValue: prior.stage,
        newValue: record.stage,
        effectiveDate: current.dataDate,
      }));
    }
    for (const event of newlyPublishedEvents) {
      changes.push(makeChange({
        entityType: "ipo",
        entityId: record.stockCode,
        fieldName: "event",
        changeType: "new_ipo_event",
        oldValue: null,
        newValue: event.label,
        effectiveDate: event.date,
      }));
    }
  }
}

function appendEmergingChanges(changes: V56DailyChange[], previous: V56Snapshot, current: V56Snapshot): void {
  const previousRanks = turnoverRanks(previous.emerging.records.filter(isEmergingRecord));
  const currentRanks = turnoverRanks(current.emerging.records.filter(isEmergingRecord));
  for (const record of current.emerging.records.filter(isEmergingRecord)) {
    const previousRank = previousRanks.get(record.stockCode) ?? null;
    const currentRank = currentRanks.get(record.stockCode) ?? null;
    if (previousRank === currentRank || (previousRank !== null && previousRank > 10 && (currentRank === null || currentRank > 10))) continue;
    changes.push(makeChange({
      entityType: "emerging",
      entityId: record.stockCode,
      fieldName: "turnoverRank",
      changeType: "emerging_turnover_rank_changed",
      oldValue: previousRank,
      newValue: currentRank,
      effectiveDate: current.dataDate,
    }));
  }
}

function turnoverRanks(records: readonly EmergingRecord[]): ReadonlyMap<string, number> {
  const ranked = records
    .filter((record): record is EmergingRecord & { transactionAmount: number } => typeof record.transactionAmount === "number")
    .sort((left, right) => right.transactionAmount - left.transactionAmount || left.stockCode.localeCompare(right.stockCode));
  return new Map(ranked.map((record, index) => [record.stockCode, index + 1]));
}

type IpoEvent = Readonly<{
  date: string;
  kind: string;
  label: string;
  verified: boolean;
}>;

type IpoRecord = Readonly<{
  stockCode: string;
  stage: string | null;
  events: readonly IpoEvent[];
}>;

type EmergingRecord = Readonly<{
  stockCode: string;
  transactionAmount: number | null;
}>;

function isIpoRecord(value: unknown): value is IpoRecord {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.stockCode !== "string" || !/^\d{4}$/.test(candidate.stockCode)) return false;
  if (candidate.stage !== null && candidate.stage !== undefined && typeof candidate.stage !== "string") return false;
  if (!Array.isArray(candidate.events)) return false;
  return candidate.events.every((event) => {
    if (event === null || typeof event !== "object") return false;
    const eventCandidate = event as Record<string, unknown>;
    return isIsoDate(eventCandidate.date)
      && typeof eventCandidate.kind === "string"
      && typeof eventCandidate.label === "string"
      && eventCandidate.verified === true;
  });
}

function isEmergingRecord(value: unknown): value is EmergingRecord {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.stockCode === "string"
    && /^\d{4}$/.test(candidate.stockCode)
    && (candidate.transactionAmount === undefined || isComparableNumberOrNull(candidate.transactionAmount));
}

function ipoEventKey(event: IpoEvent): string {
  return `${event.date}:${event.kind}:${event.label}`;
}
