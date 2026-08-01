import { isIsoDate } from "../domain/dates.ts";
import type {
  IpoApplicationSourceRow,
  IpoAuctionSourceRow,
  IpoListingEvidenceRow,
  IpoMarket,
  IpoPublicOfferingSourceRow,
} from "../source-verification/source-ipo-events.ts";

export type IpoStage = "A" | "B" | "C" | "D" | "listed" | "withdrawn" | "delayed" | "cancelled";
export type IpoEventKind =
  | "application_submitted" | "review_completed" | "board_approved"
  | "contract_approved" | "auction_bid_start" | "auction_bid_end"
  | "auction_open" | "public_subscription_start" | "public_subscription_end"
  | "public_draw" | "listing_date" | "withdrawn" | "delayed" | "cancelled";

export interface IpoEventSnapshot {
  schemaVersion: 1;
  dataDate: string;
  generatedAt: string;
  sourceManifest: IpoSourceManifestEntry[];
  records: IpoTimelineRecord[];
}

export interface IpoSourceManifestEntry {
  sourceId: "twse-applications" | "tpex-applications" | "tpex-ipo-listings" | "twse-auctions" | "twse-public-offerings";
  sourceUrl: string;
  downloadedAt: string;
  sha256: `sha256:${string}`;
  rawBytes: number;
  rowCount: number;
}

export interface IpoEvent {
  companyCode: string;
  market: IpoMarket;
  kind: IpoEventKind;
  date: string;
  label: string;
  sourceRecordIds: string[];
}

export interface IpoTimelineRecord {
  companyCode: string;
  companyName: string;
  market: IpoMarket;
  stage: IpoStage;
  exceptionStatus: "withdrawn" | "delayed" | "cancelled" | null;
  applicationDate: string;
  reviewDate: string | null;
  boardDate: string | null;
  contractDate: string | null;
  listingDate: string | null;
  auction: IpoAuctionSourceRow | null;
  publicOffering: IpoPublicOfferingSourceRow | null;
  provisionalUnderwritingPrice: string | null;
  finalUnderwritingPrice: string | null;
  underwriter: string;
  events: IpoEvent[];
}

export interface BuildIpoEventSnapshotInput {
  twseApplications: IpoApplicationSourceRow[];
  tpexApplications: IpoApplicationSourceRow[];
  tpexListings: IpoListingEvidenceRow[];
  auctions: IpoAuctionSourceRow[];
  publicOfferings: IpoPublicOfferingSourceRow[];
  generatedAt: string;
  dataDate: string;
  sourceManifest: IpoSourceManifestEntry[];
}

type MutableRecord = IpoTimelineRecord & { eventMap: Map<string, IpoEvent> };
type MergeableRecordField = "companyName" | "applicationDate" | "reviewDate" | "boardDate" | "contractDate" | "listingDate" | "provisionalUnderwritingPrice" | "finalUnderwritingPrice" | "underwriter";

const eventLabels: Record<IpoEventKind, string> = {
  application_submitted: "申請送件",
  review_completed: "審查完成",
  board_approved: "董事會核准",
  contract_approved: "契約核准",
  auction_bid_start: "競拍投標開始",
  auction_bid_end: "競拍投標截止",
  auction_open: "競拍開標",
  public_subscription_start: "公開申購開始",
  public_subscription_end: "公開申購截止",
  public_draw: "公開抽籤",
  listing_date: "掛牌日期",
  withdrawn: "撤銷",
  delayed: "延期",
  cancelled: "取消",
};

export function buildIpoEventSnapshot(input: BuildIpoEventSnapshotInput): IpoEventSnapshot {
  const records = new Map<string, MutableRecord>();
  const applicationUnderwriterKeys = new Set<string>();

  for (const row of selectLatestApplicationAttempts([...input.twseApplications, ...input.tpexApplications])) {
    const record = getRecord(records, row.companyCode, row.companyName, row.market);
    mergeRecordValue(record, "applicationDate", row.applicationDate);
    mergeRecordValue(record, "reviewDate", row.reviewDate);
    mergeRecordValue(record, "boardDate", row.boardDate);
    mergeRecordValue(record, "contractDate", row.contractDate);
    mergeRecordValue(record, "listingDate", row.listingDate);
    mergeRecordValue(record, "underwriter", row.underwriter);
    if (!isMissingValue(row.underwriter)) applicationUnderwriterKeys.add(recordKey(row.companyCode, row.market));
    addEvent(record, "application_submitted", row.applicationDate, row.sourceRecordId);
    addEventIfPresent(record, "review_completed", row.reviewDate, row.sourceRecordId);
    addEventIfPresent(record, "board_approved", row.boardDate, row.sourceRecordId);
    addEventIfPresent(record, "contract_approved", row.contractDate, row.sourceRecordId);
    addEventIfPresent(record, "listing_date", row.listingDate, row.sourceRecordId);
    const exception = exceptionFromNote(row.note);
    if (exception) {
      mergeExceptionStatus(record, exception);
    }
  }

  for (const row of input.tpexListings) {
    const record = getEvidenceRecord(records, row.companyCode, row.companyName, row.market);
    if (!isEvidenceForCurrentApplication(record, row.listingDate)) continue;
    mergeRecordValue(record, "listingDate", row.listingDate);
    mergeRecordValue(record, "finalUnderwritingPrice", row.finalUnderwritingPrice);
    mergeEvidenceText(record, "underwriter", row.underwriter, applicationUnderwriterKeys.has(recordKey(row.companyCode, row.market)));
    addEvent(record, "listing_date", row.listingDate, row.sourceRecordId);
  }

  for (const row of selectLatestSourceFlows(input.auctions, (row) => row.auctionOpenDate)) {
    const record = getEvidenceRecord(records, row.companyCode, row.companyName, row.market);
    if (!isEvidenceForCurrentApplication(record, row.auctionOpenDate)) continue;
    mergeSourceRow(record, "auction", row);
    mergeRecordValue(record, "listingDate", row.listingDate);
    mergeRecordValue(record, "finalUnderwritingPrice", row.finalUnderwritingPrice);
    mergeEvidenceText(record, "underwriter", row.underwriter, applicationUnderwriterKeys.has(recordKey(row.companyCode, row.market)));
    addEvent(record, "auction_bid_start", row.bidStartDate, row.sourceRecordId);
    addEvent(record, "auction_bid_end", row.bidEndDate, row.sourceRecordId);
    addEvent(record, "auction_open", row.auctionOpenDate, row.sourceRecordId);
    addEventIfPresent(record, "listing_date", row.listingDate, row.sourceRecordId);
    if (row.cancelled) {
      mergeExceptionStatus(record, "cancelled");
    }
  }

  for (const row of selectLatestSourceFlows(input.publicOfferings, (row) => row.drawDate)) {
    const record = getEvidenceRecord(records, row.companyCode, row.companyName, row.market);
    if (!isEvidenceForCurrentApplication(record, row.drawDate)) continue;
    mergeSourceRow(record, "publicOffering", row);
    mergeRecordValue(record, "listingDate", row.listingDate);
    mergeRecordValue(record, "provisionalUnderwritingPrice", row.provisionalUnderwritingPrice);
    mergeRecordValue(record, "finalUnderwritingPrice", row.finalUnderwritingPrice);
    mergeEvidenceText(record, "underwriter", row.underwriter, applicationUnderwriterKeys.has(recordKey(row.companyCode, row.market)));
    addEvent(record, "public_subscription_start", row.subscriptionStartDate, row.sourceRecordId);
    addEvent(record, "public_subscription_end", row.subscriptionEndDate, row.sourceRecordId);
    addEvent(record, "public_draw", row.drawDate, row.sourceRecordId);
    addEventIfPresent(record, "listing_date", row.listingDate, row.sourceRecordId);
    if (row.cancelled) {
      mergeExceptionStatus(record, "cancelled");
    }
  }

  const sortedRecords = [...records.values()]
    .map(({ eventMap, ...record }) => ({
      ...record,
      events: [...eventMap.values()]
        .map((event) => ({ ...event, sourceRecordIds: [...event.sourceRecordIds].sort() }))
        .sort(compareEvents),
    }))
    .map((record) => ({ ...record, stage: deriveIpoStage(record, input.dataDate) }))
    .sort((left, right) => left.companyCode.localeCompare(right.companyCode) || left.market.localeCompare(right.market));

  return {
    schemaVersion: 1,
    dataDate: input.dataDate,
    generatedAt: input.generatedAt,
    sourceManifest: input.sourceManifest.map((entry) => ({ ...entry })),
    records: sortedRecords,
  };
}

function selectLatestApplicationAttempts(rows: readonly IpoApplicationSourceRow[]): IpoApplicationSourceRow[] {
  const latestByCompanyMarket = new Map<string, IpoApplicationSourceRow[]>();
  for (const row of rows) {
    const key = `${row.companyCode}\u0000${row.market}`;
    const current = latestByCompanyMarket.get(key);
    if (!current || row.applicationDate > current[0].applicationDate) {
      latestByCompanyMarket.set(key, [row]);
    } else if (row.applicationDate === current[0].applicationDate) {
      current.push(row);
    }
  }
  const selected = [...latestByCompanyMarket.values()];
  for (const attempts of selected) assertCompatibleApplicationNotes(attempts);
  return selected.flat();
}

function assertCompatibleApplicationNotes(rows: readonly IpoApplicationSourceRow[]): void {
  let note = "";
  for (const row of rows) {
    if (row.note === "") continue;
    if (note !== "" && note !== row.note) throw new TypeError("IPO_SOURCE_CONFLICT:note");
    note = row.note;
  }
}

function selectLatestSourceFlows<T extends { companyCode: string; market: IpoMarket }>(
  rows: readonly T[],
  date: (row: T) => string,
): T[] {
  const latestByCompanyMarket = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.companyCode}\u0000${row.market}`;
    const current = latestByCompanyMarket.get(key);
    if (!current || date(row) > date(current[0])) {
      latestByCompanyMarket.set(key, [row]);
    } else if (date(row) === date(current[0])) {
      current.push(row);
    }
  }
  return [...latestByCompanyMarket.values()].flat();
}

export function deriveIpoStage(record: IpoTimelineRecord, today: string): IpoStage {
  if (record.exceptionStatus) return record.exceptionStatus;
  if (record.listingDate && record.listingDate <= today) return "listed";
  if (record.auction || record.publicOffering || record.listingDate) return "D";
  if (record.contractDate) return "C";
  if (record.boardDate || record.reviewDate) return "B";
  return "A";
}

export function taipeiCalendarDistance(today: string, eventDate: string): number {
  if (!isIsoDate(today) || !isIsoDate(eventDate)) throw new TypeError("taipeiCalendarDistance requires valid ISO dates");
  return toEpochDay(eventDate) - toEpochDay(today);
}

function getRecord(records: Map<string, MutableRecord>, companyCode: string, companyName: string, market: IpoMarket): MutableRecord {
  const key = recordKey(companyCode, market);
  const existing = records.get(key);
  if (existing) {
    mergeRecordValue(existing, "companyName", companyName);
    return existing;
  }
  const record: MutableRecord = {
    companyCode,
    companyName,
    market,
    stage: "A",
    exceptionStatus: null,
    applicationDate: "—",
    reviewDate: null,
    boardDate: null,
    contractDate: null,
    listingDate: null,
    auction: null,
    publicOffering: null,
    provisionalUnderwritingPrice: null,
    finalUnderwritingPrice: null,
    underwriter: "",
    events: [],
    eventMap: new Map(),
  };
  records.set(key, record);
  return record;
}

function recordKey(companyCode: string, market: IpoMarket): string {
  return `${companyCode}\u0000${market}`;
}

function getEvidenceRecord(
  records: Map<string, MutableRecord>,
  companyCode: string,
  companyName: string,
  market: IpoMarket,
): MutableRecord {
  const existing = records.get(recordKey(companyCode, market));
  if (!existing) return getRecord(records, companyCode, companyName, market);
  if (existing.applicationDate === "—") mergeRecordValue(existing, "companyName", companyName);
  return existing;
}

function isEvidenceForCurrentApplication(record: MutableRecord, evidenceDate: string): boolean {
  return record.applicationDate === "—" || evidenceDate >= record.applicationDate;
}

function mergeRecordValue(record: MutableRecord, field: MergeableRecordField, value: string | null): void {
  if (isMissingValue(value)) return;
  const existing = record[field];
  if (!isMissingValue(existing) && existing !== value) {
    if ((field === "provisionalUnderwritingPrice" || field === "finalUnderwritingPrice")
      && equivalentDecimal(existing, value)) return;
    throw new TypeError(`IPO_SOURCE_CONFLICT:${field}`);
  }
  record[field] = value;
}

function mergeEvidenceText(
  record: MutableRecord,
  field: "underwriter",
  value: string,
  hasCanonicalApplicationValue: boolean,
): void {
  if (!hasCanonicalApplicationValue) mergeRecordValue(record, field, value);
  else if (!isMissingValue(value) && isMissingValue(record[field])) record[field] = value;
}

function mergeSourceRow(record: MutableRecord, field: "auction" | "publicOffering", row: IpoAuctionSourceRow | IpoPublicOfferingSourceRow): void {
  const existing = record[field];
  if (!existing) {
    if (field === "auction") record.auction = { ...row } as IpoAuctionSourceRow;
    else record.publicOffering = { ...row } as IpoPublicOfferingSourceRow;
    return;
  }
  for (const [key, value] of Object.entries(row)) {
    if (key === "sourceRecordId") continue;
    const merged = existing as unknown as Record<string, unknown>;
    const current = merged[key];
    if (isMissingValue(current) && !isMissingValue(value)) merged[key] = value;
    else if (!isMissingValue(current) && !isMissingValue(value) && current !== value) {
      if (isPriceField(key) && typeof current === "string" && typeof value === "string" && equivalentDecimal(current, value)) continue;
      throw new TypeError(`IPO_SOURCE_CONFLICT:${key}`);
    }
  }
}

function isPriceField(field: string): boolean {
  return field === "minimumBidPrice" || field === "provisionalUnderwritingPrice" || field === "finalUnderwritingPrice";
}

function mergeExceptionStatus(record: MutableRecord, value: NonNullable<IpoTimelineRecord["exceptionStatus"]>): void {
  if (record.exceptionStatus && record.exceptionStatus !== value) throw new TypeError("IPO_SOURCE_CONFLICT:exceptionStatus");
  record.exceptionStatus = value;
}

function addEventIfPresent(record: MutableRecord, kind: IpoEventKind, date: string | null, sourceRecordId: string): void {
  if (date) addEvent(record, kind, date, sourceRecordId);
}

function addEvent(record: MutableRecord, kind: IpoEventKind, date: string, sourceRecordId: string): void {
  const key = `${record.companyCode}\u0000${record.market}\u0000${kind}\u0000${date}`;
  const event = record.eventMap.get(key) ?? {
    companyCode: record.companyCode,
    market: record.market,
    kind,
    date,
    label: eventLabels[kind],
    sourceRecordIds: [],
  };
  if (!event.sourceRecordIds.includes(sourceRecordId)) event.sourceRecordIds.push(sourceRecordId);
  record.eventMap.set(key, event);
}

function exceptionFromNote(note: string): "withdrawn" | "delayed" | null {
  if (/撤銷|撤回/.test(note)) return "withdrawn";
  if (/延期|延後/.test(note)) return "delayed";
  return null;
}

function isMissingValue(value: unknown): value is null | "" | "—" {
  return value === null || value === "" || value === "—";
}

function equivalentDecimal(left: string, right: string): boolean {
  const normalize = (value: string): string | null => {
    if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
    const [integer, fraction = ""] = value.split(".");
    const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
    const normalizedFraction = fraction.replace(/0+$/, "");
    return normalizedFraction === "" ? normalizedInteger : `${normalizedInteger}.${normalizedFraction}`;
  };
  const normalizedLeft = normalize(left);
  return normalizedLeft !== null && normalizedLeft === normalize(right);
}

function compareEvents(left: IpoEvent, right: IpoEvent): number {
  return left.date.localeCompare(right.date)
    || left.kind.localeCompare(right.kind)
    || left.label.localeCompare(right.label);
}

function toEpochDay(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}
