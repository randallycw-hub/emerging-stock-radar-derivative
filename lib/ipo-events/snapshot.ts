import { isIsoDate } from "../domain/dates.ts";
import { getApprovedIpoResource, type IpoManifestSourceId } from "../pipeline/source-registry.ts";
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

const ipoMarkets = new Set<IpoMarket>(["上市", "創新板", "上櫃"]);
const ipoStages = new Set<IpoStage>(["A", "B", "C", "D", "listed", "withdrawn", "delayed", "cancelled"]);
const ipoEventKinds = new Set<IpoEventKind>(Object.keys(eventLabels) as IpoEventKind[]);
const ipoManifestSourceIds = new Set<IpoManifestSourceId>([
  "twse-applications",
  "tpex-applications",
  "tpex-ipo-listings",
  "twse-auctions",
  "twse-public-offerings",
]);

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
    mergeListingUnderwriter(
      record,
      row.underwriter,
      applicationUnderwriterKeys.has(recordKey(row.companyCode, row.market)),
    );
    addEvent(record, "listing_date", row.listingDate, row.sourceRecordId);
  }

  for (const row of selectLatestSourceFlows(input.auctions, (row) => row.auctionOpenDate)) {
    const record = getEvidenceRecord(records, row.companyCode, row.companyName, row.market);
    if (!isEvidenceForCurrentApplication(record, row.auctionOpenDate)) continue;
    mergeSourceRow(record, "auction", row);
    mergeRecordValue(record, "listingDate", row.listingDate);
    mergeRecordValue(record, "finalUnderwritingPrice", row.finalUnderwritingPrice);
    mergeRecordValue(record, "underwriter", row.underwriter);
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
    mergeRecordValue(record, "underwriter", row.underwriter);
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

  const snapshot: IpoEventSnapshot = {
    schemaVersion: 1,
    dataDate: input.dataDate,
    generatedAt: input.generatedAt,
    sourceManifest: input.sourceManifest.map((entry) => ({ ...entry })),
    records: sortedRecords,
  };
  assertIpoEventSnapshot(snapshot);
  return snapshot;
}

export function assertIpoEventSnapshot(value: unknown): asserts value is IpoEventSnapshot {
  const snapshot = exactObject(
    value,
    ["schemaVersion", "dataDate", "generatedAt", "sourceManifest", "records"],
    "IPO snapshot",
  );
  if (snapshot.schemaVersion !== 1) throw snapshotError("schemaVersion must be 1");
  if (typeof snapshot.dataDate !== "string" || !isIsoDate(snapshot.dataDate)) {
    throw snapshotError("dataDate must be a valid YYYY-MM-DD date");
  }
  if (!isIsoDateTime(snapshot.generatedAt)) throw snapshotError("generatedAt must be a valid ISO instant");
  if (!Array.isArray(snapshot.sourceManifest) || snapshot.sourceManifest.length !== ipoManifestSourceIds.size) {
    throw snapshotError("sourceManifest must contain all five sources");
  }
  const manifestIds = new Set<IpoManifestSourceId>();
  const year = Number(snapshot.dataDate.slice(0, 4));
  for (const value of snapshot.sourceManifest) {
    const entry = exactObject(
      value,
      ["sourceId", "sourceUrl", "downloadedAt", "sha256", "rawBytes", "rowCount"],
      "IPO snapshot sourceManifest entry",
    );
    if (typeof entry.sourceId !== "string" || !ipoManifestSourceIds.has(entry.sourceId as IpoManifestSourceId)) {
      throw snapshotError("sourceManifest has an unknown sourceId");
    }
    const sourceId = entry.sourceId as IpoManifestSourceId;
    if (manifestIds.has(sourceId)) throw snapshotError("sourceManifest has a duplicate sourceId");
    manifestIds.add(sourceId);
    const resource = getApprovedIpoResource(sourceId, year);
    if (entry.sourceUrl !== resource.exactUrl) throw snapshotError("sourceManifest sourceUrl is not approved");
    if (!isIsoDateTime(entry.downloadedAt)) throw snapshotError("sourceManifest downloadedAt must be a valid ISO instant");
    if (typeof entry.sha256 !== "string" || !/^sha256:[a-f0-9]{64}$/.test(entry.sha256)) {
      throw snapshotError("sourceManifest sha256 is invalid");
    }
    if (!isPositiveInteger(entry.rawBytes)) throw snapshotError("sourceManifest rawBytes must be a positive integer");
    if (!isPositiveInteger(entry.rowCount)) throw snapshotError("sourceManifest rowCount must be a positive integer");
  }
  if ([...ipoManifestSourceIds].some((sourceId) => !manifestIds.has(sourceId))) {
    throw snapshotError("sourceManifest is missing a required sourceId");
  }
  if (!Array.isArray(snapshot.records)) throw snapshotError("records must be an array");
  const recordIds = new Set<string>();
  for (const value of snapshot.records) assertTimelineRecord(value, recordIds);
}

function assertTimelineRecord(value: unknown, recordIds: Set<string>): void {
  const record = exactObject(value, [
    "companyCode", "companyName", "market", "stage", "exceptionStatus", "applicationDate",
    "reviewDate", "boardDate", "contractDate", "listingDate", "auction", "publicOffering",
    "provisionalUnderwritingPrice", "finalUnderwritingPrice", "underwriter", "events",
  ], "IPO snapshot record");
  const companyCode = requiredCompanyCode(record.companyCode, "record.companyCode");
  requiredText(record.companyName, "record.companyName");
  const market = requiredMarket(record.market, "record.market");
  if (typeof record.stage !== "string" || !ipoStages.has(record.stage as IpoStage)) throw snapshotError("record.stage is invalid");
  if (record.exceptionStatus !== null && !["withdrawn", "delayed", "cancelled"].includes(String(record.exceptionStatus))) {
    throw snapshotError("record.exceptionStatus is invalid");
  }
  if (record.applicationDate !== "—") requiredDate(record.applicationDate, "record.applicationDate");
  for (const field of ["reviewDate", "boardDate", "contractDate", "listingDate"] as const) {
    nullableDate(record[field], `record.${field}`);
  }
  nullableDecimal(record.provisionalUnderwritingPrice, "record.provisionalUnderwritingPrice");
  nullableDecimal(record.finalUnderwritingPrice, "record.finalUnderwritingPrice");
  if (typeof record.underwriter !== "string") throw snapshotError("record.underwriter must be a string");
  if (record.auction !== null) assertAuction(record.auction, companyCode, market);
  if (record.publicOffering !== null) assertPublicOffering(record.publicOffering, companyCode, market);
  if (!Array.isArray(record.events)) throw snapshotError("record.events must be an array");
  for (const event of record.events) assertEvent(event, companyCode, market);
  const identity = `${companyCode}\u0000${market}`;
  if (recordIds.has(identity)) throw snapshotError("records contain a duplicate company/market identity");
  recordIds.add(identity);
}

function assertAuction(value: unknown, companyCode: string, market: IpoMarket): void {
  const row = exactObject(value, [
    "companyCode", "companyName", "market", "bidStartDate", "bidEndDate", "auctionOpenDate",
    "listingDate", "minimumBidPrice", "finalUnderwritingPrice", "underwriter", "cancelled", "sourceRecordId",
  ], "IPO snapshot auction");
  assertEvidenceIdentity(row, companyCode, market, "auction");
  requiredText(row.companyName, "auction.companyName");
  for (const field of ["bidStartDate", "bidEndDate", "auctionOpenDate"] as const) requiredDate(row[field], `auction.${field}`);
  nullableDate(row.listingDate, "auction.listingDate");
  nullableDecimal(row.minimumBidPrice, "auction.minimumBidPrice");
  nullableDecimal(row.finalUnderwritingPrice, "auction.finalUnderwritingPrice");
  if (typeof row.underwriter !== "string") throw snapshotError("auction.underwriter must be a string");
  if (typeof row.cancelled !== "boolean") throw snapshotError("auction.cancelled must be a boolean");
  requiredText(row.sourceRecordId, "auction.sourceRecordId");
}

function assertPublicOffering(value: unknown, companyCode: string, market: IpoMarket): void {
  const row = exactObject(value, [
    "companyCode", "companyName", "market", "subscriptionStartDate", "subscriptionEndDate", "drawDate",
    "listingDate", "provisionalUnderwritingPrice", "finalUnderwritingPrice", "underwriter", "cancelled", "sourceRecordId",
  ], "IPO snapshot publicOffering");
  assertEvidenceIdentity(row, companyCode, market, "publicOffering");
  requiredText(row.companyName, "publicOffering.companyName");
  for (const field of ["subscriptionStartDate", "subscriptionEndDate", "drawDate"] as const) requiredDate(row[field], `publicOffering.${field}`);
  nullableDate(row.listingDate, "publicOffering.listingDate");
  nullableDecimal(row.provisionalUnderwritingPrice, "publicOffering.provisionalUnderwritingPrice");
  nullableDecimal(row.finalUnderwritingPrice, "publicOffering.finalUnderwritingPrice");
  if (typeof row.underwriter !== "string") throw snapshotError("publicOffering.underwriter must be a string");
  if (typeof row.cancelled !== "boolean") throw snapshotError("publicOffering.cancelled must be a boolean");
  requiredText(row.sourceRecordId, "publicOffering.sourceRecordId");
}

function assertEvidenceIdentity(
  row: Record<string, unknown>,
  companyCode: string,
  market: IpoMarket,
  name: string,
): void {
  if (requiredCompanyCode(row.companyCode, `${name}.companyCode`) !== companyCode) throw snapshotError(`${name}.companyCode does not match record`);
  if (requiredMarket(row.market, `${name}.market`) !== market) throw snapshotError(`${name}.market does not match record`);
}

function assertEvent(value: unknown, companyCode: string, market: IpoMarket): void {
  const event = exactObject(
    value,
    ["companyCode", "market", "kind", "date", "label", "sourceRecordIds"],
    "IPO snapshot event",
  );
  if (requiredCompanyCode(event.companyCode, "event.companyCode") !== companyCode) throw snapshotError("event.companyCode does not match record");
  if (requiredMarket(event.market, "event.market") !== market) throw snapshotError("event.market does not match record");
  if (typeof event.kind !== "string" || !ipoEventKinds.has(event.kind as IpoEventKind)) throw snapshotError("event.kind is invalid");
  requiredDate(event.date, "event.date");
  requiredText(event.label, "event.label");
  if (!Array.isArray(event.sourceRecordIds) || event.sourceRecordIds.length === 0) {
    throw snapshotError("event.sourceRecordIds must be a non-empty array");
  }
  const sourceRecordIds = new Set<string>();
  for (const sourceRecordId of event.sourceRecordIds) {
    const text = requiredText(sourceRecordId, "event.sourceRecordIds entry");
    if (sourceRecordIds.has(text)) throw snapshotError("event.sourceRecordIds contains a duplicate");
    sourceRecordIds.add(text);
  }
}

function exactObject(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw snapshotError(`${name} must be an object`);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw snapshotError(`${name} has unknown or missing fields`);
  }
  return record;
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw snapshotError(`${name} must be a non-empty string`);
  return value;
}

function requiredCompanyCode(value: unknown, name: string): string {
  const text = requiredText(value, name);
  if (!/^\d{4}$/.test(text)) throw snapshotError(`${name} must be a four-digit company code`);
  return text;
}

function requiredMarket(value: unknown, name: string): IpoMarket {
  if (typeof value !== "string" || !ipoMarkets.has(value as IpoMarket)) throw snapshotError(`${name} is invalid`);
  return value as IpoMarket;
}

function requiredDate(value: unknown, name: string): string {
  if (typeof value !== "string" || !isIsoDate(value)) throw snapshotError(`${name} must be a valid YYYY-MM-DD date`);
  return value;
}

function nullableDate(value: unknown, name: string): void {
  if (value !== null) requiredDate(value, name);
}

function nullableDecimal(value: unknown, name: string): void {
  if (value !== null && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value))) {
    throw snapshotError(`${name} must be a non-negative decimal or null`);
  }
}

function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match || !isIsoDate(match[1])) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (match[5] !== "Z") {
    const offsetHour = Number(match[7]);
    const offsetMinute = Number(match[8]);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function snapshotError(message: string): TypeError {
  return new TypeError(`IPO snapshot ${message}`);
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

function mergeListingUnderwriter(
  record: MutableRecord,
  value: string,
  hasApplicationUnderwriter: boolean,
): void {
  if (!hasApplicationUnderwriter) mergeRecordValue(record, "underwriter", value);
  else if (!isMissingValue(value) && isMissingValue(record.underwriter)) record.underwriter = value;
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
