import { isIsoDate, isIsoDateTime } from "../domain/dates.ts";
import type {
  CbInstitutionDailySnapshot,
  CbInstitutionTrade,
} from "../source-verification/source-cb-institution.ts";
import type { CbRedemptionEvent } from "../source-verification/source-cb-redemption.ts";
import type {
  CbUnderwritingCase,
  CbUnderwritingSnapshot,
} from "../source-verification/source-cb-underwriting.ts";

export type SupplementalSourceState = "fresh" | "stale" | "unavailable";

type SupplementalSourceStatus = {
  state: SupplementalSourceState;
  dataDate: string | null;
  periodYear: number | null;
};

export type CbSupplementalSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  unitFaceValueTwd: "100000" | null;
  institutionHistory: Readonly<Record<string, readonly CbInstitutionTrade[]>>;
  redemptions: readonly CbRedemptionEvent[];
  underwritingCases: readonly CbUnderwritingCase[];
  sources: {
    institution: SupplementalSourceStatus;
    redemption: SupplementalSourceStatus;
    underwriting: SupplementalSourceStatus;
  };
};

export type CbInstitutionSummary = {
  dataDate: string | null;
  dailyNetUnits: string | null;
  net5dUnits: string | null;
  net20dUnits: string | null;
};

export function parseCbSupplementalSnapshot(value: unknown): CbSupplementalSnapshot {
  return deepFreeze(validatePreviousSnapshot(value as CbSupplementalSnapshot));
}

export function parseCbRedemptionEvent(value: unknown): CbRedemptionEvent {
  return deepFreeze({ ...validateRedemption(value) });
}

const SNAPSHOT_KEYS = [
  "schemaVersion",
  "generatedAt",
  "unitFaceValueTwd",
  "institutionHistory",
  "redemptions",
  "underwritingCases",
  "sources",
] as const;
const SOURCE_NAMES = ["institution", "redemption", "underwriting"] as const;
const SOURCE_STATUS_KEYS = ["state", "dataDate", "periodYear"] as const;
const INSTITUTION_SNAPSHOT_KEYS = [
  "tradingDate",
  "tradingUnitFaceValueTwd",
  "records",
] as const;
const INSTITUTION_TRADE_KEYS = [
  "bondCode",
  "bondName",
  "tradingDate",
  "foreignBuyUnits",
  "foreignSellUnits",
  "foreignNetUnits",
  "trustBuyUnits",
  "trustSellUnits",
  "trustNetUnits",
  "dealerBuyUnits",
  "dealerSellUnits",
  "dealerNetUnits",
  "totalNetUnits",
] as const;
const REDEMPTION_KEYS = [
  "issuerCode",
  "issuerName",
  "bondCode",
  "bondName",
  "announcementDate",
  "delistingDate",
  "subject",
  "detailUrl",
] as const;
const UNDERWRITING_SNAPSHOT_KEYS = ["rocYear", "notice", "records"] as const;
const UNDERWRITING_CASE_KEYS = [
  "referenceNumber",
  "filedDate",
  "leadUnderwriter",
  "issuerName",
  "guaranteeType",
  "placementMethods",
  "caseStatus",
] as const;
const UNDERWRITING_NOTICE = "本公告系統僅供參考，相關資料以正式刊登報紙之公告內容為準。";
const SIGNED_INTEGER = /^[+-]?\d+$/;
const REDEMPTION_SUBJECT_PATTERN = /簡稱[：:]\s*([^，,)]+)[，,]\s*代碼[：:]\s*(\d{5,6})\).*?訂於(\d{3})年(\d{2})月(\d{2})日終止櫃檯買賣/;
const REDEMPTION_DETAIL_QUERY_PARAMETERS = [
  "TYPEK",
  "co_id",
  "date1",
  "seq_no",
  "pub_class",
  "firstin",
] as const;

export function buildCbSupplementalSnapshot(input: {
  generatedAt: string;
  institution?: CbInstitutionDailySnapshot;
  redemptions?: readonly CbRedemptionEvent[];
  redemptionYear?: number;
  underwriting?: CbUnderwritingSnapshot;
  previous?: CbSupplementalSnapshot;
}): CbSupplementalSnapshot {
  assertGeneratedAt(input.generatedAt);
  const previous = input.previous === undefined
    ? undefined
    : parseCbSupplementalSnapshot(input.previous);
  if (
    previous !== undefined
    && Date.parse(input.generatedAt) <= Date.parse(previous.generatedAt)
  ) {
    throw new TypeError("generatedAt must be later than previous generatedAt");
  }

  const institution = buildInstitutionSection(input.institution, previous);
  const redemption = buildRedemptionSection(input.redemptions, input.redemptionYear, previous);
  const underwriting = buildUnderwritingSection(input.underwriting, previous);

  return deepFreeze({
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    unitFaceValueTwd: institution.unitFaceValueTwd,
    institutionHistory: institution.history,
    redemptions: redemption.records,
    underwritingCases: underwriting.records,
    sources: {
      institution: institution.source,
      redemption: redemption.source,
      underwriting: underwriting.source,
    },
  });
}

export function summarizeCbInstitution(
  snapshot: CbSupplementalSnapshot | undefined,
  bondCode: string,
  asOfDate: string,
): CbInstitutionSummary {
  assertDerivedQuery(bondCode, asOfDate);
  if (snapshot === undefined) {
    return deepFreeze({
      dataDate: null,
      dailyNetUnits: null,
      net5dUnits: null,
      net20dUnits: null,
    });
  }

  const validated = parseCbSupplementalSnapshot(snapshot);
  const records = [...(validated.institutionHistory[bondCode] ?? [])]
    .filter((record) => record.tradingDate <= asOfDate)
    .sort((left, right) => right.tradingDate.localeCompare(left.tradingDate));

  return deepFreeze({
    dataDate: records[0]?.tradingDate ?? null,
    dailyNetUnits: sumInstitutionWindow(records, 1),
    net5dUnits: sumInstitutionWindow(records, 5),
    net20dUnits: sumInstitutionWindow(records, 20),
  });
}

export function currentCbRedemption(
  snapshot: CbSupplementalSnapshot | undefined,
  bondCode: string,
  asOfDate: string,
): CbRedemptionEvent | null {
  assertDerivedQuery(bondCode, asOfDate);
  if (snapshot === undefined) return null;

  const event = parseCbSupplementalSnapshot(snapshot).redemptions
    .filter((candidate) =>
      candidate.bondCode === bondCode
      && candidate.announcementDate <= asOfDate
      && asOfDate <= candidate.delistingDate
    )
    .sort((left, right) => right.announcementDate.localeCompare(left.announcementDate))[0];
  return event === undefined ? null : deepFreeze(cloneRedemption(event));
}

function assertDerivedQuery(bondCode: string, asOfDate: string): void {
  if (typeof bondCode !== "string" || !/^\d{5,6}$/.test(bondCode)) {
    throw new TypeError("bondCode must be an exact five- or six-digit CB code");
  }
  if (!isIsoDate(asOfDate)) {
    throw new TypeError("asOfDate must be a canonical ISO date");
  }
}

function sumInstitutionWindow(
  records: readonly CbInstitutionTrade[],
  length: number,
): string | null {
  if (records.length < length) return null;
  return records.slice(0, length)
    .reduce((sum, record) => sum + BigInt(record.totalNetUnits), BigInt(0))
    .toString();
}

function buildInstitutionSection(
  current: CbInstitutionDailySnapshot | undefined,
  previous: CbSupplementalSnapshot | undefined,
): {
  unitFaceValueTwd: "100000" | null;
  history: Record<string, CbInstitutionTrade[]>;
  source: SupplementalSourceStatus;
} {
  if (current !== undefined) {
    const daily = validateInstitutionDaily(current);
    const periodYear = Number(daily.tradingDate.slice(0, 4));
    const previousPeriodYear = previous?.sources.institution.periodYear;
    if (previousPeriodYear !== undefined && previousPeriodYear !== null && periodYear < previousPeriodYear) {
      throw new TypeError("institution periodYear must not move backward");
    }
    const previousDataDate = previous?.sources.institution.dataDate;
    if (
      previousDataDate !== undefined
      && previousDataDate !== null
      && daily.tradingDate < previousDataDate
    ) {
      throw new TypeError("institution tradingDate must not precede previous institution dataDate");
    }
    const history = mergeInstitutionHistory(previous?.institutionHistory ?? {}, daily.records);
    return {
      unitFaceValueTwd: "100000",
      history,
      source: {
        state: "fresh",
        dataDate: daily.tradingDate,
        periodYear,
      },
    };
  }
  if (previous !== undefined && previous.sources.institution.state !== "unavailable") {
    return {
      unitFaceValueTwd: "100000",
      history: cloneInstitutionHistory(previous.institutionHistory),
      source: { ...previous.sources.institution, state: "stale" },
    };
  }
  return {
    unitFaceValueTwd: null,
    history: {},
    source: { state: "unavailable", dataDate: null, periodYear: null },
  };
}

function buildRedemptionSection(
  current: readonly CbRedemptionEvent[] | undefined,
  currentYear: number | undefined,
  previous: CbSupplementalSnapshot | undefined,
): { records: CbRedemptionEvent[]; source: SupplementalSourceStatus } {
  const redemptionYear = validateOptionalRedemptionYear(currentYear);
  if (current !== undefined) {
    if (redemptionYear === undefined) {
      throw new TypeError("redemptionYear is required for every current redemption result");
    }
    const records = validateRedemptions(current);
    const recordYears = new Set(records.map((record) => Number(record.announcementDate.slice(0, 4))));
    if (recordYears.size > 1) {
      throw new TypeError("redemption records must belong to one year");
    }
    const recordYear = recordYears.values().next().value as number | undefined;
    if (recordYear !== undefined && redemptionYear !== recordYear) {
      throw new TypeError("redemptionYear does not match records");
    }
    const periodYear = redemptionYear;
    const dataDate = records.length === 0
      ? null
      : records.map((record) => record.announcementDate).sort().at(-1) ?? null;
    const previousSource = previous?.sources.redemption;
    if (previousSource !== undefined && previousSource.periodYear !== null) {
      if (periodYear < previousSource.periodYear) {
        throw new TypeError("redemption year must not move backward");
      }
      if (
        periodYear === previousSource.periodYear
        && dataDate === null
        && previous !== undefined
        && previous.redemptions.length !== 0
      ) {
        throw new TypeError("empty redemption result must be a newer-year rollover and must not erase records within a period");
      }
      if (
        periodYear === previousSource.periodYear
        && dataDate !== null
        && previousSource.dataDate !== null
        && dataDate < previousSource.dataDate
      ) {
        throw new TypeError("redemption dataDate must not move backward within a year");
      }
    }
    return {
      records,
      source: {
        state: "fresh",
        dataDate,
        periodYear,
      },
    };
  }
  if (redemptionYear !== undefined) {
    throw new TypeError("redemptionYear requires a current redemption result");
  }
  if (previous !== undefined && previous.sources.redemption.state !== "unavailable") {
    return {
      records: previous.redemptions.map(cloneRedemption),
      source: { ...previous.sources.redemption, state: "stale" },
    };
  }
  return {
    records: [],
    source: { state: "unavailable", dataDate: null, periodYear: null },
  };
}

function validateOptionalRedemptionYear(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError("redemptionYear is invalid");
  }
  return value;
}

function buildUnderwritingSection(
  current: CbUnderwritingSnapshot | undefined,
  previous: CbSupplementalSnapshot | undefined,
): { records: CbUnderwritingCase[]; source: SupplementalSourceStatus } {
  if (current !== undefined) {
    const { rocYear, records } = validateUnderwritingSnapshot(current);
    const periodYear = rocYear + 1911;
    const dataDate = records.length === 0
      ? null
      : records.map((record) => record.filedDate).sort().at(-1) ?? null;
    const previousSource = previous?.sources.underwriting;
    if (previousSource !== undefined && previousSource.periodYear !== null) {
      if (periodYear < previousSource.periodYear) {
        throw new TypeError("underwriting period must not move backward");
      }
      if (
        periodYear === previousSource.periodYear
        && dataDate === null
        && previous !== undefined
        && previous.underwritingCases.length !== 0
      ) {
        throw new TypeError("empty underwriting result must not erase records within a period");
      }
      if (
        periodYear === previousSource.periodYear
        && dataDate !== null
        && previousSource.dataDate !== null
        && dataDate < previousSource.dataDate
      ) {
        throw new TypeError("underwriting dataDate must not move backward within a period");
      }
    }
    return {
      records,
      source: {
        state: "fresh",
        dataDate,
        periodYear,
      },
    };
  }
  if (previous !== undefined && previous.sources.underwriting.state !== "unavailable") {
    return {
      records: previous.underwritingCases.map(cloneUnderwritingCase),
      source: { ...previous.sources.underwriting, state: "stale" },
    };
  }
  return {
    records: [],
    source: { state: "unavailable", dataDate: null, periodYear: null },
  };
}

function validatePreviousSnapshot(value: CbSupplementalSnapshot): CbSupplementalSnapshot {
  const snapshot = requireRecord(value, "previous snapshot");
  assertExactKeys(snapshot, SNAPSHOT_KEYS, "previous snapshot");
  if (snapshot.schemaVersion !== 1) throw new TypeError("previous schemaVersion must be 1");
  assertGeneratedAt(snapshot.generatedAt);
  if (snapshot.unitFaceValueTwd !== null && snapshot.unitFaceValueTwd !== "100000") {
    throw new TypeError("previous unitFaceValueTwd is invalid");
  }

  const history = validateInstitutionHistory(snapshot.institutionHistory);
  const redemptions = validateRedemptions(snapshot.redemptions);
  const underwritingCases = validateUnderwritingCases(snapshot.underwritingCases);
  const sourcesRecord = requireRecord(snapshot.sources, "previous sources");
  assertExactKeys(sourcesRecord, SOURCE_NAMES, "previous sources");
  const sources = {
    institution: validateSourceStatus(sourcesRecord.institution, "institution"),
    redemption: validateSourceStatus(sourcesRecord.redemption, "redemption"),
    underwriting: validateSourceStatus(sourcesRecord.underwriting, "underwriting"),
  };

  validatePreviousInstitutionState(snapshot.unitFaceValueTwd, history, sources.institution);
  validatePreviousRedemptionState(redemptions, sources.redemption);
  validatePreviousUnderwritingState(underwritingCases, sources.underwriting);

  return {
    schemaVersion: 1,
    generatedAt: snapshot.generatedAt,
    unitFaceValueTwd: snapshot.unitFaceValueTwd,
    institutionHistory: history,
    redemptions,
    underwritingCases,
    sources,
  };
}

function validatePreviousInstitutionState(
  unit: unknown,
  history: Record<string, CbInstitutionTrade[]>,
  source: SupplementalSourceStatus,
): void {
  if (source.state === "unavailable") {
    if (
      source.dataDate !== null
      || source.periodYear !== null
      || unit !== null
      || Object.keys(history).length !== 0
    ) {
      throw new TypeError("previous unavailable institution section must be empty");
    }
    return;
  }
  if (unit !== "100000" || typeof source.dataDate !== "string" || !isIsoDate(source.dataDate)) {
    throw new TypeError("previous institution dataDate or unit is invalid");
  }
  if (source.periodYear !== Number(source.dataDate.slice(0, 4))) {
    throw new TypeError("previous institution periodYear does not match its dataDate");
  }
  if (Object.values(history).some((trades) =>
    trades.some((trade) => trade.tradingDate > source.dataDate!)
  )) {
    throw new TypeError("previous institution dataDate precedes retained history");
  }
}

function validatePreviousRedemptionState(
  records: readonly CbRedemptionEvent[],
  source: SupplementalSourceStatus,
): void {
  if (source.state === "unavailable") {
    if (source.dataDate !== null || source.periodYear !== null || records.length !== 0) {
      throw new TypeError("previous unavailable redemption section must be empty");
    }
    return;
  }
  if (source.periodYear === null) {
    throw new TypeError("previous redemption periodYear is invalid");
  }
  const dates = records.map((record) => record.announcementDate);
  if (dates.length === 0) {
    if (source.dataDate !== null) throw new TypeError("previous redemption dataDate must be null");
    return;
  }
  if (
    typeof source.dataDate !== "string"
    || !isIsoDate(source.dataDate)
    || source.dataDate !== [...dates].sort().at(-1)
  ) {
    throw new TypeError("previous redemption dataDate does not match its records");
  }
  if (dates.some((date) => Number(date.slice(0, 4)) !== source.periodYear)) {
    throw new TypeError("previous redemption periodYear does not match its records");
  }
}

function validatePreviousUnderwritingState(
  records: readonly CbUnderwritingCase[],
  source: SupplementalSourceStatus,
): void {
  if (source.state === "unavailable") {
    if (source.dataDate !== null || source.periodYear !== null || records.length !== 0) {
      throw new TypeError("previous unavailable underwriting section must be empty");
    }
    return;
  }
  if (source.periodYear === null) {
    throw new TypeError("previous underwriting periodYear is invalid");
  }
  const periodYear = source.periodYear;
  const dates = records.map((record) => record.filedDate);
  if (dates.length === 0) {
    if (source.dataDate !== null) throw new TypeError("previous underwriting dataDate must be null");
    return;
  }
  if (
    typeof source.dataDate !== "string"
    || !isSlashDate(source.dataDate)
    || source.dataDate !== [...dates].sort().at(-1)
  ) {
    throw new TypeError("previous underwriting dataDate does not match its records");
  }
  if (dates.some((date) => {
    const year = Number(date.slice(0, 4));
    return year !== periodYear && year !== periodYear - 1;
  })) {
    throw new TypeError("previous underwriting periodYear does not match its records");
  }
}

function validateSourceStatus(value: unknown, name: string): SupplementalSourceStatus {
  const source = requireRecord(value, `previous ${name} source`);
  assertExactKeys(source, SOURCE_STATUS_KEYS, `previous ${name} source`);
  if (source.state !== "fresh" && source.state !== "stale" && source.state !== "unavailable") {
    throw new TypeError(`previous ${name} source state is invalid`);
  }
  if (source.dataDate !== null && typeof source.dataDate !== "string") {
    throw new TypeError(`previous ${name} dataDate is invalid`);
  }
  if (
    source.periodYear !== null
    && (!Number.isInteger(source.periodYear) || (source.periodYear as number) < 1)
  ) {
    throw new TypeError(`previous ${name} periodYear is invalid`);
  }
  return {
    state: source.state,
    dataDate: source.dataDate,
    periodYear: source.periodYear as number | null,
  };
}

function validateInstitutionDaily(value: CbInstitutionDailySnapshot): {
  tradingDate: string;
  records: CbInstitutionTrade[];
} {
  const snapshot = requireRecord(value, "institution daily snapshot");
  assertExactKeys(snapshot, INSTITUTION_SNAPSHOT_KEYS, "institution daily snapshot");
  if (typeof snapshot.tradingDate !== "string" || !isIsoDate(snapshot.tradingDate)) {
    throw new TypeError("institution tradingDate is invalid");
  }
  if (snapshot.tradingUnitFaceValueTwd !== "100000") {
    throw new TypeError("institution trading unit is invalid");
  }
  assertDenseArray(snapshot.records, "institution records");
  const seenCodes = new Set<string>();
  const records = snapshot.records.map((record) => {
    const normalized = validateInstitutionTrade(record);
    if (normalized.tradingDate !== snapshot.tradingDate) {
      throw new TypeError("institution daily date mismatch");
    }
    if (seenCodes.has(normalized.bondCode)) {
      throw new TypeError(`duplicate institution daily bond code: ${normalized.bondCode}`);
    }
    seenCodes.add(normalized.bondCode);
    return normalized;
  });
  return { tradingDate: snapshot.tradingDate, records };
}

function validateInstitutionHistory(value: unknown): Record<string, CbInstitutionTrade[]> {
  const history = requireRecord(value, "institution history");
  const historyKeys = Reflect.ownKeys(history);
  if (historyKeys.some((key) => (
    typeof key !== "string"
    || !Object.prototype.propertyIsEnumerable.call(history, key)
    || !/^\d{5,6}$/.test(key)
  ))) {
    throw new TypeError("institution history key is invalid");
  }
  const result: Record<string, CbInstitutionTrade[]> = {};
  for (const bondCode of (historyKeys as string[]).sort()) {
    const trades = history[bondCode];
    if (!Array.isArray(trades) || trades.length > 60) {
      throw new TypeError(`institution history ${bondCode} must contain at most 60 trades`);
    }
    assertDenseArray(trades, `institution history ${bondCode}`);
    const seenDates = new Set<string>();
    const normalized = trades.map((trade) => {
      const record = validateInstitutionTrade(trade);
      if (record.bondCode !== bondCode) {
        throw new TypeError("institution history bond code mismatch");
      }
      if (seenDates.has(record.tradingDate)) {
        throw new TypeError(`duplicate institution history date: ${bondCode}:${record.tradingDate}`);
      }
      seenDates.add(record.tradingDate);
      return record;
    });
    const sorted = [...normalized].sort((left, right) => left.tradingDate.localeCompare(right.tradingDate));
    if (!normalized.every((record, index) => record.tradingDate === sorted[index].tradingDate)) {
      throw new TypeError(`institution history ${bondCode} must be sorted ascending`);
    }
    result[bondCode] = normalized;
  }
  return result;
}

function validateInstitutionTrade(value: unknown): CbInstitutionTrade {
  const trade = requireRecord(value, "institution trade");
  assertExactKeys(trade, INSTITUTION_TRADE_KEYS, "institution trade");
  if (typeof trade.bondCode !== "string" || !/^\d{5,6}$/.test(trade.bondCode)) {
    throw new TypeError("institution trade bond code is invalid");
  }
  if (typeof trade.bondName !== "string" || trade.bondName === "") {
    throw new TypeError("institution trade bond name is invalid");
  }
  if (typeof trade.tradingDate !== "string" || !isIsoDate(trade.tradingDate)) {
    throw new TypeError("institution trade date is invalid");
  }
  const unitKeys = INSTITUTION_TRADE_KEYS.slice(3);
  for (const key of unitKeys) {
    if (typeof trade[key] !== "string" || !SIGNED_INTEGER.test(trade[key])) {
      throw new TypeError(`institution trade ${key} is invalid`);
    }
  }
  if (BigInt(trade.foreignNetUnits as string) !== BigInt(trade.foreignBuyUnits as string) - BigInt(trade.foreignSellUnits as string)) {
    throw new TypeError("institution foreign net units are invalid");
  }
  if (BigInt(trade.trustNetUnits as string) !== BigInt(trade.trustBuyUnits as string) - BigInt(trade.trustSellUnits as string)) {
    throw new TypeError("institution trust net units are invalid");
  }
  if (BigInt(trade.dealerNetUnits as string) !== BigInt(trade.dealerBuyUnits as string) - BigInt(trade.dealerSellUnits as string)) {
    throw new TypeError("institution dealer net units are invalid");
  }
  if (
    BigInt(trade.totalNetUnits as string)
    !== BigInt(trade.foreignNetUnits as string)
      + BigInt(trade.trustNetUnits as string)
      + BigInt(trade.dealerNetUnits as string)
  ) {
    throw new TypeError("institution total net units are invalid");
  }
  return Object.fromEntries(
    INSTITUTION_TRADE_KEYS.map((key) => [key, trade[key]]),
  ) as CbInstitutionTrade;
}

function mergeInstitutionHistory(
  previous: Readonly<Record<string, readonly CbInstitutionTrade[]>>,
  current: readonly CbInstitutionTrade[],
): Record<string, CbInstitutionTrade[]> {
  const byBond = new Map<string, Map<string, CbInstitutionTrade>>();
  for (const [bondCode, trades] of Object.entries(previous)) {
    byBond.set(bondCode, new Map(trades.map((trade) => [trade.tradingDate, { ...trade }])));
  }
  for (const trade of current) {
    const byDate = byBond.get(trade.bondCode) ?? new Map<string, CbInstitutionTrade>();
    const existing = byDate.get(trade.tradingDate);
    if (existing !== undefined && !sameInstitutionTrade(existing, trade)) {
      throw new TypeError(`conflicting institution trade: ${trade.bondCode}:${trade.tradingDate}`);
    }
    byDate.set(trade.tradingDate, { ...trade });
    byBond.set(trade.bondCode, byDate);
  }
  const result: Record<string, CbInstitutionTrade[]> = {};
  for (const bondCode of [...byBond.keys()].sort()) {
    result[bondCode] = [...(byBond.get(bondCode)?.values() ?? [])]
      .sort((left, right) => left.tradingDate.localeCompare(right.tradingDate))
      .slice(-60)
      .map((trade) => ({ ...trade }));
  }
  return result;
}

function cloneInstitutionHistory(
  history: Readonly<Record<string, readonly CbInstitutionTrade[]>>,
): Record<string, CbInstitutionTrade[]> {
  return Object.fromEntries(
    Object.entries(history).map(([bondCode, trades]) => [
      bondCode,
      trades.map((trade) => ({ ...trade })),
    ]),
  );
}

function sameInstitutionTrade(left: CbInstitutionTrade, right: CbInstitutionTrade): boolean {
  return INSTITUTION_TRADE_KEYS.every((key) => left[key] === right[key]);
}

function validateRedemptions(value: unknown): CbRedemptionEvent[] {
  assertDenseArray(value, "redemptions");
  const seen = new Set<string>();
  return value.map((event) => {
    const normalized = parseCbRedemptionEvent(event);
    const key = `${normalized.bondCode}:${normalized.announcementDate}`;
    if (seen.has(key)) throw new TypeError(`duplicate redemption event: ${key}`);
    seen.add(key);
    return normalized;
  });
}

function validateRedemption(value: unknown): CbRedemptionEvent {
  const event = requireRecord(value, "redemption event");
  assertExactKeys(event, REDEMPTION_KEYS, "redemption event");
  assertStringPattern(event.issuerCode, /^\d{4}$/, "redemption issuerCode");
  assertNonemptyString(event.issuerName, "redemption issuerName");
  assertStringPattern(event.bondCode, /^\d{5,6}$/, "redemption bondCode");
  const bondSuffix = event.bondCode.slice(event.issuerCode.length);
  if (!event.bondCode.startsWith(event.issuerCode) || !/^\d{1,2}$/.test(bondSuffix)) {
    throw new TypeError("redemption issuerCode does not match bondCode");
  }
  assertNonemptyString(event.bondName, "redemption bondName");
  assertIsoDate(event.announcementDate, "redemption announcementDate");
  assertIsoDate(event.delistingDate, "redemption delistingDate");
  if (event.announcementDate > event.delistingDate) {
    throw new TypeError("redemption announcementDate must not exceed delistingDate");
  }
  assertNonemptyString(event.subject, "redemption subject");
  assertRedemptionSubject(
    event.subject,
    event.issuerName,
    event.bondName,
    event.bondCode,
    event.delistingDate,
  );
  assertRedemptionUrl(event.detailUrl, event.issuerCode, event.announcementDate);
  return Object.fromEntries(REDEMPTION_KEYS.map((key) => [key, event[key]])) as CbRedemptionEvent;
}

function assertRedemptionUrl(value: unknown, issuerCode: unknown, announcementDate: unknown): void {
  if (typeof value !== "string") throw new TypeError("redemption detailUrl is invalid");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("redemption detailUrl is invalid");
  }
  if (
    url.protocol !== "https:"
    || url.host !== "mopsov.twse.com.tw"
    || url.pathname !== "/mops/web/ajax_t120sb23"
    || url.username !== ""
    || url.password !== ""
    || url.hash !== ""
  ) {
    throw new TypeError("redemption detailUrl does not match its event");
  }
  for (const [parameter] of url.searchParams) {
    if (!REDEMPTION_DETAIL_QUERY_PARAMETERS.includes(
      parameter as typeof REDEMPTION_DETAIL_QUERY_PARAMETERS[number],
    )) {
      throw new TypeError("redemption detailUrl contains an unexpected query parameter");
    }
  }
  if (REDEMPTION_DETAIL_QUERY_PARAMETERS.some((parameter) =>
    url.searchParams.getAll(parameter).length !== 1
  )) {
    throw new TypeError("redemption detailUrl query parameters do not match the verified contract");
  }
  if (
    url.searchParams.get("TYPEK") !== "otc"
    || !/^[1-9]\d*$/.test(url.searchParams.get("seq_no") ?? "")
    || url.searchParams.get("pub_class") !== "0"
    || url.searchParams.get("firstin") !== "1"
    || url.searchParams.get("co_id") !== issuerCode
    || url.searchParams.get("date1") !== String(announcementDate).replaceAll("-", "")
  ) {
    throw new TypeError("redemption detailUrl does not match its event");
  }
}

function assertRedemptionSubject(
  value: string,
  issuerName: unknown,
  bondName: unknown,
  bondCode: unknown,
  delistingDate: unknown,
): void {
  if (typeof issuerName !== "string" || !value.startsWith(`公告${issuerName}`)) {
    throw new TypeError("redemption subject does not match issuerName announcement prefix");
  }
  const match = REDEMPTION_SUBJECT_PATTERN.exec(value);
  if (match === null) throw new TypeError("redemption subject does not match the verified contract");
  const subjectDelistingDate = `${Number(match[3]) + 1911}-${match[4]}-${match[5]}`;
  if (
    match[1] !== bondName
    || match[2] !== bondCode
    || !isIsoDate(subjectDelistingDate)
    || subjectDelistingDate !== delistingDate
  ) {
    throw new TypeError("redemption subject does not match its normalized fields");
  }
}

function cloneRedemption(value: CbRedemptionEvent): CbRedemptionEvent {
  return { ...value };
}

function validateUnderwritingSnapshot(value: CbUnderwritingSnapshot): {
  rocYear: number;
  records: CbUnderwritingCase[];
} {
  const snapshot = requireRecord(value, "underwriting snapshot");
  assertExactKeys(snapshot, UNDERWRITING_SNAPSHOT_KEYS, "underwriting snapshot");
  if (!Number.isInteger(snapshot.rocYear) || (snapshot.rocYear as number) < 1) {
    throw new TypeError("underwriting rocYear is invalid");
  }
  if (snapshot.notice !== UNDERWRITING_NOTICE) {
    throw new TypeError("underwriting notice is invalid");
  }
  const rocYear = snapshot.rocYear as number;
  const pageYear = rocYear + 1911;
  const records = validateUnderwritingCases(snapshot.records);
  if (records.some((record) => {
    const filedYear = Number(record.filedDate.slice(0, 4));
    return filedYear !== pageYear && filedYear !== pageYear - 1;
  })) {
    throw new TypeError("underwriting filedDate is outside the page carry-over window");
  }
  return { rocYear, records };
}

function validateUnderwritingCases(value: unknown): CbUnderwritingCase[] {
  assertDenseArray(value, "underwriting cases");
  return value.map((entry) => {
    const record = requireRecord(entry, "underwriting case");
    assertExactKeys(record, UNDERWRITING_CASE_KEYS, "underwriting case");
    assertNonemptyString(record.referenceNumber, "underwriting referenceNumber");
    if (typeof record.filedDate !== "string" || !isSlashDate(record.filedDate)) {
      throw new TypeError("underwriting filedDate is invalid");
    }
    assertNonemptyString(record.leadUnderwriter, "underwriting leadUnderwriter");
    assertNonemptyString(record.issuerName, "underwriting issuerName");
    if (record.guaranteeType !== "secured" && record.guaranteeType !== "unsecured") {
      throw new TypeError("underwriting guaranteeType is invalid");
    }
    assertDenseArray(record.placementMethods, "underwriting placementMethods");
    if (!record.placementMethods.every(
      (method): method is string => typeof method === "string" && method !== "",
    )) {
      throw new TypeError("underwriting placementMethods are invalid");
    }
    assertNonemptyString(record.caseStatus, "underwriting caseStatus");
    return {
      referenceNumber: record.referenceNumber,
      filedDate: record.filedDate,
      leadUnderwriter: record.leadUnderwriter,
      issuerName: record.issuerName,
      guaranteeType: record.guaranteeType,
      placementMethods: [...record.placementMethods],
      caseStatus: record.caseStatus,
    };
  });
}

function cloneUnderwritingCase(value: CbUnderwritingCase): CbUnderwritingCase {
  return { ...value, placementMethods: [...value.placementMethods] };
}

function assertGeneratedAt(value: unknown): asserts value is string {
  if (!isIsoDateTime(value)) {
    throw new TypeError("generatedAt must be a valid ISO timestamp");
  }
}

function assertIsoDate(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !isIsoDate(value)) throw new TypeError(`${name} is invalid`);
}

function isSlashDate(value: string): boolean {
  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value);
  return match !== null && isIsoDate(`${match[1]}-${match[2]}-${match[3]}`);
}

function assertNonemptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value === "") throw new TypeError(`${name} is invalid`);
}

function assertStringPattern(value: unknown, pattern: RegExp, name: string): asserts value is string {
  if (typeof value !== "string" || !pattern.test(value)) throw new TypeError(`${name} is invalid`);
}

function assertExactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  name: string,
): void {
  const keys = Reflect.ownKeys(record);
  if (
    keys.length !== expected.length
    || !keys.every((key) => (
      typeof key === "string"
      && expected.includes(key)
      && Object.prototype.propertyIsEnumerable.call(record, key)
    ))
  ) {
    throw new TypeError(`${name} keys do not match the verified contract`);
  }
}

function assertDenseArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be a dense array`);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== value.length + 1
    || !ownKeys.includes("length")
    || !Array.from({ length: value.length }, (_, index) => String(index)).every(
      (key) => Object.prototype.propertyIsEnumerable.call(value, key),
    )
  ) {
    throw new TypeError(`${name} must be a dense array`);
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
