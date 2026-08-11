import { isIsoDate, isIsoDateTime, isYearMonth } from "../domain/dates.ts";
import {
  normalize94025Row,
  parseMonthlyRevenueCsv,
  type NormalizedMonthlyRevenue94025,
} from "../source-verification/source-94025.ts";

export type CbIssuerResearchRecord = {
  issuerCode: string;
  issuerName: string;
  market: "listed" | "otc";
  industryName: string;
  revenueMonth: string;
  sourcePublishedOn: string;
  revenueUnit: "仟元";
  currentMonthRevenue: string;
  monthOverMonthPercent: string | null;
  yearOverYearPercent: string | null;
  cumulativeRevenue: string | null;
  cumulativeYearOverYearPercent: string | null;
};

export type CbIssuerResearchSourceStatus = {
  status: "current" | "stale" | "unavailable";
  dataDate: string | null;
  fetchedAt: string | null;
};

export type CbIssuerResearchDiagnostic = {
  issuerCode: string;
  reason: "CROSS_MARKET_CONFLICT" | "NAME_CONFLICT" | "MISSING_REVENUE";
};

export type CbIssuerResearchSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  records: readonly CbIssuerResearchRecord[];
  sources: {
    listed: CbIssuerResearchSourceStatus;
    otc: CbIssuerResearchSourceStatus;
  };
  diagnostics: readonly CbIssuerResearchDiagnostic[];
};

type Market = "listed" | "otc";

type MarketProjection = {
  currentRows: Map<string, NormalizedMonthlyRevenue94025> | undefined;
  staleRecords: Map<string, CbIssuerResearchRecord>;
  source: CbIssuerResearchSourceStatus;
};

export type CbIssuerAliasEntry = {
  issuerCode: string;
  aliases: readonly string[];
};

export type CbIssuerAliasIndex = {
  entries: readonly CbIssuerAliasEntry[];
  matches: (issuerCode: string, issuerName: string) => boolean;
};

const SNAPSHOT_KEYS = ["schemaVersion", "generatedAt", "records", "sources", "diagnostics"];
const SOURCE_NAMES = ["listed", "otc"];
const SOURCE_STATUS_KEYS = ["status", "dataDate", "fetchedAt"];
const RECORD_KEYS = [
  "issuerCode",
  "issuerName",
  "market",
  "industryName",
  "revenueMonth",
  "sourcePublishedOn",
  "revenueUnit",
  "currentMonthRevenue",
  "monthOverMonthPercent",
  "yearOverYearPercent",
  "cumulativeRevenue",
  "cumulativeYearOverYearPercent",
];
const DIAGNOSTIC_KEYS = ["issuerCode", "reason"];
const ISSUER_KEYS = ["issuerCode", "issuerName"];
const NON_NEGATIVE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const SIGNED_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const DIAGNOSTIC_REASONS = new Set<CbIssuerResearchDiagnostic["reason"]>([
  "CROSS_MARKET_CONFLICT",
  "NAME_CONFLICT",
  "MISSING_REVENUE",
]);

export function buildCbIssuerAliasIndex(
  value: readonly { issuerCode: string; issuerName: string }[],
): CbIssuerAliasIndex {
  if (!Array.isArray(value)) throw new TypeError("issuers must be an array");
  const aliasesByCode = new Map<string, Set<string>>();
  for (const [index, candidate] of value.entries()) {
    const issuer = requireRecord(candidate, `issuer ${index}`);
    assertExactKeys(issuer, ISSUER_KEYS, `issuer ${index}`);
    const issuerCode = readIssuerCode(issuer.issuerCode, `issuer ${index} issuerCode`);
    const issuerName = normalizeIssuerName(
      readNonemptyString(issuer.issuerName, `issuer ${index} issuerName`),
    );
    const aliases = aliasesByCode.get(issuerCode) ?? new Set<string>();
    aliases.add(issuerName);
    aliasesByCode.set(issuerCode, aliases);
  }

  const entries = [...aliasesByCode]
    .map(([issuerCode, aliases]) => ({
      issuerCode,
      aliases: [...aliases].sort(compareText),
    }))
    .sort((left, right) => compareText(left.issuerCode, right.issuerCode));
  const matches = (issuerCode: string, issuerName: string): boolean =>
    aliasesByCode.get(issuerCode)?.has(normalizeIssuerName(issuerName)) ?? false;

  return deepFreeze({ entries, matches: Object.freeze(matches) });
}

export function buildCbIssuerResearchSnapshot(input: {
  generatedAt: string;
  issuers: readonly { issuerCode: string; issuerName: string }[];
  listed: PromiseSettledResult<string>;
  otc: PromiseSettledResult<string>;
  previous?: CbIssuerResearchSnapshot;
}): CbIssuerResearchSnapshot {
  assertTimestamp(input.generatedAt, "generatedAt");
  const previous = input.previous === undefined
    ? undefined
    : parseCbIssuerResearchSnapshot(input.previous);
  if (
    previous !== undefined
    && Date.parse(input.generatedAt) <= Date.parse(previous.generatedAt)
  ) {
    throw new TypeError("generatedAt must advance beyond the previous snapshot");
  }

  const issuerAliases = buildCbIssuerAliasIndex(input.issuers);
  const listed = buildMarketProjection(
    input.listed,
    "listed",
    input.generatedAt,
    previous,
  );
  const otc = buildMarketProjection(
    input.otc,
    "otc",
    input.generatedAt,
    previous,
  );
  const records: CbIssuerResearchRecord[] = [];
  const diagnostics: CbIssuerResearchDiagnostic[] = [];

  for (const issuer of issuerAliases.entries) {
    const listedCurrent = listed.currentRows?.get(issuer.issuerCode);
    const otcCurrent = otc.currentRows?.get(issuer.issuerCode);
    if (listedCurrent !== undefined && otcCurrent !== undefined) {
      diagnostics.push({
        issuerCode: issuer.issuerCode,
        reason: "CROSS_MARKET_CONFLICT",
      });
      continue;
    }

    const current = listedCurrent === undefined
      ? otcCurrent === undefined
        ? undefined
        : { market: "otc" as const, row: otcCurrent }
      : { market: "listed" as const, row: listedCurrent };
    if (current !== undefined) {
      if (!issuerAliases.matches(issuer.issuerCode, current.row.companyName)) {
        diagnostics.push({ issuerCode: issuer.issuerCode, reason: "NAME_CONFLICT" });
        continue;
      }
      records.push(projectCurrentRecord(issuer, current.market, current.row));
      continue;
    }

    const stale = listed.staleRecords.get(issuer.issuerCode)
      ?? otc.staleRecords.get(issuer.issuerCode);
    if (stale !== undefined) {
      if (!issuerAliases.matches(issuer.issuerCode, stale.issuerName)) {
        diagnostics.push({ issuerCode: issuer.issuerCode, reason: "NAME_CONFLICT" });
        continue;
      }
      records.push({ ...stale });
      continue;
    }

    diagnostics.push({ issuerCode: issuer.issuerCode, reason: "MISSING_REVENUE" });
  }

  return deepFreeze({
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    records,
    sources: { listed: listed.source, otc: otc.source },
    diagnostics,
  });
}

export function parseCbIssuerResearchSnapshot(value: unknown): CbIssuerResearchSnapshot {
  const snapshot = requireRecord(value, "CB issuer research snapshot");
  assertExactKeys(snapshot, SNAPSHOT_KEYS, "CB issuer research snapshot");
  if (snapshot.schemaVersion !== 1) {
    throw new TypeError("CB issuer research snapshot schemaVersion must be 1");
  }
  assertTimestamp(snapshot.generatedAt, "CB issuer research snapshot generatedAt");

  const records = parseCbIssuerResearchRecords(snapshot.records);
  const sourcesValue = requireRecord(snapshot.sources, "CB issuer research snapshot sources");
  assertExactKeys(sourcesValue, SOURCE_NAMES, "CB issuer research snapshot sources");
  const sources = {
    listed: validateSourceStatus(sourcesValue.listed, "listed", snapshot.generatedAt),
    otc: validateSourceStatus(sourcesValue.otc, "otc", snapshot.generatedAt),
  };
  validateRecordSourceConsistency(records, sources);
  const diagnostics = validateDiagnostics(snapshot.diagnostics, records);

  return deepFreeze({
    schemaVersion: 1,
    generatedAt: snapshot.generatedAt,
    records,
    sources,
    diagnostics,
  });
}

export function parseCbIssuerResearchRecords(
  value: unknown,
): readonly CbIssuerResearchRecord[] {
  return deepFreeze(validateRecords(value));
}

function buildMarketProjection(
  result: PromiseSettledResult<string>,
  market: Market,
  generatedAt: string,
  previous: CbIssuerResearchSnapshot | undefined,
): MarketProjection {
  if (result.status === "fulfilled") {
    const rows = parseMonthlyRevenueCsv(result.value, `${market} monthly revenue CSV`)
      .map(normalize94025Row);
    const dataDate = rows.map(({ sourcePublishedOn }) => sourcePublishedOn).sort().at(-1)!;
    const previousDataDate = previous?.sources[market].dataDate;
    if (previousDataDate !== undefined && previousDataDate !== null && dataDate < previousDataDate) {
      throw new TypeError(`${market} source dataDate must not move backward`);
    }
    return {
      currentRows: selectNewestRows(rows),
      staleRecords: new Map(),
      source: { status: "current", dataDate, fetchedAt: generatedAt },
    };
  }

  const previousSource = previous?.sources[market];
  if (previous !== undefined && previousSource !== undefined && previousSource.status !== "unavailable") {
    return {
      currentRows: undefined,
      staleRecords: new Map(
        previous.records
          .filter((record) => record.market === market)
          .map((record) => [record.issuerCode, { ...record }]),
      ),
      source: {
        status: "stale",
        dataDate: previousSource.dataDate,
        fetchedAt: previousSource.fetchedAt,
      },
    };
  }
  return {
    currentRows: undefined,
    staleRecords: new Map(),
    source: { status: "unavailable", dataDate: null, fetchedAt: null },
  };
}

function selectNewestRows(
  rows: readonly NormalizedMonthlyRevenue94025[],
): Map<string, NormalizedMonthlyRevenue94025> {
  const newest = new Map<string, NormalizedMonthlyRevenue94025>();
  for (const row of rows) {
    const existing = newest.get(row.companyCode);
    if (
      existing === undefined
      || compareTuple(
        [row.sourcePublishedOn, row.yearMonth],
        [existing.sourcePublishedOn, existing.yearMonth],
      ) > 0
    ) {
      newest.set(row.companyCode, row);
    }
  }
  return newest;
}

function compareTuple(
  left: readonly [string, string],
  right: readonly [string, string],
): -1 | 0 | 1 {
  if (left[0] !== right[0]) return left[0] < right[0] ? -1 : 1;
  if (left[1] !== right[1]) return left[1] < right[1] ? -1 : 1;
  return 0;
}

function projectCurrentRecord(
  issuer: { issuerCode: string },
  market: Market,
  row: NormalizedMonthlyRevenue94025,
): CbIssuerResearchRecord {
  return {
    issuerCode: issuer.issuerCode,
    issuerName: row.companyName,
    market,
    industryName: row.industryName,
    revenueMonth: row.yearMonth,
    sourcePublishedOn: row.sourcePublishedOn,
    revenueUnit: "仟元",
    currentMonthRevenue: row.currentMonthRevenue,
    monthOverMonthPercent: row.monthOverMonthPercent ?? null,
    yearOverYearPercent: row.yearOverYearPercent ?? null,
    cumulativeRevenue: row.cumulativeRevenue ?? null,
    cumulativeYearOverYearPercent: row.cumulativeYearOverYearPercent ?? null,
  };
}

function validateRecords(value: unknown): CbIssuerResearchRecord[] {
  const records = requireExactDenseArray(value, "CB issuer research records");
  const codes = new Set<string>();
  return records.map((candidate, index) => {
    const record = requireRecord(candidate, `CB issuer research record ${index}`);
    assertExactKeys(record, RECORD_KEYS, `CB issuer research record ${index}`);
    const issuerCode = readIssuerCode(record.issuerCode, `record ${index} issuerCode`);
    if (codes.has(issuerCode)) throw new TypeError(`duplicate CB issuer research code ${issuerCode}`);
    codes.add(issuerCode);
    const issuerName = readNonemptyString(record.issuerName, `record ${index} issuerName`);
    if (record.market !== "listed" && record.market !== "otc") {
      throw new TypeError(`record ${index} market is invalid`);
    }
    const industryName = readNonemptyString(record.industryName, `record ${index} industryName`);
    if (!isYearMonth(record.revenueMonth)) throw new TypeError(`record ${index} revenueMonth is invalid`);
    if (!isIsoDate(record.sourcePublishedOn)) {
      throw new TypeError(`record ${index} sourcePublishedOn is invalid`);
    }
    if (record.revenueMonth > record.sourcePublishedOn.slice(0, 7)) {
      throw new TypeError(`record ${index} revenueMonth follows its sourcePublishedOn`);
    }
    if (record.revenueUnit !== "仟元") throw new TypeError(`record ${index} revenueUnit is invalid`);
    const currentMonthRevenue = readDecimal(
      record.currentMonthRevenue,
      NON_NEGATIVE_DECIMAL,
      `record ${index} currentMonthRevenue`,
    );
    const monthOverMonthPercent = readNullableDecimal(
      record.monthOverMonthPercent,
      SIGNED_DECIMAL,
      `record ${index} monthOverMonthPercent`,
    );
    const yearOverYearPercent = readNullableDecimal(
      record.yearOverYearPercent,
      SIGNED_DECIMAL,
      `record ${index} yearOverYearPercent`,
    );
    const cumulativeRevenue = readNullableDecimal(
      record.cumulativeRevenue,
      NON_NEGATIVE_DECIMAL,
      `record ${index} cumulativeRevenue`,
    );
    const cumulativeYearOverYearPercent = readNullableDecimal(
      record.cumulativeYearOverYearPercent,
      SIGNED_DECIMAL,
      `record ${index} cumulativeYearOverYearPercent`,
    );
    if (
      cumulativeRevenue !== null
      && compareNonNegativeDecimals(cumulativeRevenue, currentMonthRevenue) < 0
    ) {
      throw new TypeError(`record ${index} cumulativeRevenue is inconsistent`);
    }
    if (
      record.revenueMonth.endsWith("-01")
      && cumulativeRevenue !== null
      && compareNonNegativeDecimals(cumulativeRevenue, currentMonthRevenue) !== 0
    ) {
      throw new TypeError(`record ${index} January cumulativeRevenue is inconsistent`);
    }
    return {
      issuerCode,
      issuerName,
      market: record.market,
      industryName,
      revenueMonth: record.revenueMonth,
      sourcePublishedOn: record.sourcePublishedOn,
      revenueUnit: "仟元",
      currentMonthRevenue,
      monthOverMonthPercent,
      yearOverYearPercent,
      cumulativeRevenue,
      cumulativeYearOverYearPercent,
    };
  });
}

function validateSourceStatus(
  value: unknown,
  market: Market,
  generatedAt: string,
): CbIssuerResearchSourceStatus {
  const source = requireRecord(value, `${market} source`);
  assertExactKeys(source, SOURCE_STATUS_KEYS, `${market} source`);
  if (
    source.status !== "current"
    && source.status !== "stale"
    && source.status !== "unavailable"
  ) {
    throw new TypeError(`${market} source status is invalid`);
  }
  if (source.status === "unavailable") {
    if (source.dataDate !== null || source.fetchedAt !== null) {
      throw new TypeError(`${market} unavailable source dates must be null`);
    }
    return { status: "unavailable", dataDate: null, fetchedAt: null };
  }
  if (!isIsoDate(source.dataDate)) throw new TypeError(`${market} source dataDate is invalid`);
  assertTimestamp(source.fetchedAt, `${market} source fetchedAt`);
  if (source.status === "current" && source.fetchedAt !== generatedAt) {
    throw new TypeError(`${market} current source fetchedAt must equal generatedAt`);
  }
  if (source.status === "stale" && Date.parse(source.fetchedAt) >= Date.parse(generatedAt)) {
    throw new TypeError(`${market} stale source fetchedAt must precede generatedAt`);
  }
  return {
    status: source.status,
    dataDate: source.dataDate,
    fetchedAt: source.fetchedAt,
  };
}

function validateRecordSourceConsistency(
  records: readonly CbIssuerResearchRecord[],
  sources: CbIssuerResearchSnapshot["sources"],
): void {
  for (const record of records) {
    const source = sources[record.market];
    if (source.status === "unavailable") {
      throw new TypeError(`${record.market} unavailable source must not retain records`);
    }
    if (source.dataDate === null || record.sourcePublishedOn > source.dataDate) {
      throw new TypeError(`${record.market} source dataDate precedes a retained record`);
    }
  }
}

function validateDiagnostics(
  value: unknown,
  records: readonly CbIssuerResearchRecord[],
): CbIssuerResearchDiagnostic[] {
  const diagnostics = requireExactDenseArray(value, "CB issuer research diagnostics");
  const outputCodes = new Set(records.map(({ issuerCode }) => issuerCode));
  const diagnosticCodes = new Set<string>();
  return diagnostics.map((candidate, index) => {
    const diagnostic = requireRecord(candidate, `CB issuer research diagnostic ${index}`);
    assertExactKeys(diagnostic, DIAGNOSTIC_KEYS, `CB issuer research diagnostic ${index}`);
    const issuerCode = readIssuerCode(diagnostic.issuerCode, `diagnostic ${index} issuerCode`);
    if (outputCodes.has(issuerCode)) {
      throw new TypeError(`diagnostic ${issuerCode} overlaps an output record`);
    }
    if (diagnosticCodes.has(issuerCode)) {
      throw new TypeError(`duplicate diagnostic issuerCode ${issuerCode}`);
    }
    diagnosticCodes.add(issuerCode);
    if (
      typeof diagnostic.reason !== "string"
      || !DIAGNOSTIC_REASONS.has(diagnostic.reason as CbIssuerResearchDiagnostic["reason"])
    ) {
      throw new TypeError(`diagnostic ${index} reason is invalid`);
    }
    return {
      issuerCode,
      reason: diagnostic.reason as CbIssuerResearchDiagnostic["reason"],
    };
  });
}

function normalizeIssuerName(value: string): string {
  return value.normalize("NFC").trim().replace(/[\u0009-\u000d\u0020\u3000]+/g, " ");
}

function readIssuerCode(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "" || value !== value.trim()) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function readNonemptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is invalid`);
  return value;
}

function readDecimal(value: unknown, pattern: RegExp, name: string): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new TypeError(`${name} is invalid`);
  return value;
}

function readNullableDecimal(value: unknown, pattern: RegExp, name: string): string | null {
  if (value === null) return null;
  return readDecimal(value, pattern, name);
}

function compareNonNegativeDecimals(left: string, right: string): -1 | 0 | 1 {
  const [leftInteger, leftFraction = ""] = left.split(".");
  const [rightInteger, rightFraction = ""] = right.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const leftValue = BigInt(`${leftInteger}${leftFraction.padEnd(scale, "0")}`);
  const rightValue = BigInt(`${rightInteger}${rightFraction.padEnd(scale, "0")}`);
  if (leftValue === rightValue) return 0;
  return leftValue < rightValue ? -1 : 1;
}

function assertTimestamp(value: unknown, name: string): asserts value is string {
  if (!isIsoDateTime(value)) throw new TypeError(`${name} must be a valid ISO timestamp`);
}

function compareText(left: string, right: string): -1 | 0 | 1 {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function requireExactDenseArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an exact dense array`);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== value.length + 1
    || ownKeys.some((key) => typeof key !== "string")
  ) {
    throw new TypeError(`${name} must be an exact dense array`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, String(index))) {
      throw new TypeError(`${name} must be an exact dense array`);
    }
  }
  return value;
}

function assertExactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  name: string,
): void {
  const keys = Reflect.ownKeys(record);
  if (
    keys.length !== expected.length
    || !keys.every((key) => typeof key === "string" && expected.includes(key))
  ) {
    throw new TypeError(`${name} keys do not match the exact schema`);
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${name} must be a plain object`);
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
