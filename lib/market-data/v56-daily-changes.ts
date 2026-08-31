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
  entityType: "cb";
  entityId: string;
  fieldName: string;
  changeType: "conversion_price_changed" | "outstanding_changed" | "new_early_redemption";
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
    if (previousEvents.has(event.eventId) || event.eventType !== "early_redemption") continue;
    changes.push(makeChange({
      entityType: "cb",
      entityId: event.cbCode,
      fieldName: "eventType",
      changeType: "new_early_redemption",
      oldValue: null,
      newValue: "提前贖回",
      effectiveDate: event.announcementDate ?? input.current.dataDate,
    }));
  }

  return Object.freeze(changes.sort((left, right) => (
    left.entityId.localeCompare(right.entityId)
    || CHANGE_ORDER[left.changeType] - CHANGE_ORDER[right.changeType]
    || left.changeId.localeCompare(right.changeId)
  )));
}
