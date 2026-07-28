import { isIsoDate, isYearMonth } from "../domain/dates.ts";
import { parseCsv } from "./csv.ts";

export interface Source94025Row {
  sourcePublishedOn: string;
  yearMonth: string;
  companyCode: string;
  companyName: string;
  industryName: string;
  currentMonthRevenue: string;
  previousMonthRevenue: string;
  priorYearMonthRevenue: string;
  monthOverMonthPercent: string;
  yearOverYearPercent: string;
  cumulativeRevenue: string;
  priorYearCumulativeRevenue: string;
  cumulativeYearOverYearPercent: string;
  noteText: string;
}

export interface NormalizedMonthlyRevenue94025 {
  companyCode: string;
  companyName: string;
  industryName: string;
  yearMonth: string;
  sourcePublishedOn: string;
  revenueUnit: "仟元";
  currentMonthRevenue: string;
  previousMonthRevenue?: string;
  priorYearMonthRevenue?: string;
  monthOverMonthPercent?: string;
  yearOverYearPercent?: string;
  cumulativeRevenue?: string;
  priorYearCumulativeRevenue?: string;
  cumulativeYearOverYearPercent?: string;
}

export class Source94025ValidationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "Source94025ValidationError";
  }
}

type SourceField = keyof Source94025Row;

const SOURCE_FIELDS = [
  "sourcePublishedOn",
  "yearMonth",
  "companyCode",
  "companyName",
  "industryName",
  "currentMonthRevenue",
  "previousMonthRevenue",
  "priorYearMonthRevenue",
  "monthOverMonthPercent",
  "yearOverYearPercent",
  "cumulativeRevenue",
  "priorYearCumulativeRevenue",
  "cumulativeYearOverYearPercent",
  "noteText",
] as const satisfies readonly SourceField[];

const SHARED_ALIASES = {
  出表日期: "sourcePublishedOn",
  資料年月: "yearMonth",
  公司代號: "companyCode",
  公司名稱: "companyName",
  產業別: "industryName",
  "營業收入-當月營收": "currentMonthRevenue",
  "營業收入-上月營收": "previousMonthRevenue",
  "營業收入-去年當月營收": "priorYearMonthRevenue",
  "營業收入-上月比較增減(%)": "monthOverMonthPercent",
  "營業收入-去年同月增減(%)": "yearOverYearPercent",
  "累計營業收入-當月累計營收": "cumulativeRevenue",
  "累計營業收入-去年累計營收": "priorYearCumulativeRevenue",
  "累計營業收入-前期比較增減(%)": "cumulativeYearOverYearPercent",
  備註: "noteText",
} as const satisfies Readonly<Record<string, SourceField>>;

const PLACEHOLDERS = new Set(["", "-", "--", "－"]);
const PLAIN_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const GROUPED_DECIMAL = /^(?:[1-9]\d{0,2})(?:,\d{3})+(?:\.\d+)?$/;

export function parse94025Csv(text: string): Source94025Row[] {
  if (typeof text !== "string") {
    throw new Source94025ValidationError("94025 CSV must be a string");
  }
  return parseAliasedDataset(parseCsv(text), "94025 CSV");
}

export function parse94025Json(value: unknown): Source94025Row[] {
  if (!Array.isArray(value)) {
    throw new Source94025ValidationError("94025 OpenAPI payload must be an array");
  }
  return parseAliasedDataset(value, "94025 OpenAPI");
}

export function compare94025ResourceSchemas(
  csvRows: readonly Source94025Row[],
  jsonRows: readonly Source94025Row[],
): { equivalent: boolean; missingInCsv: SourceField[]; missingInJson: SourceField[] } {
  const csvFields = collectFields(csvRows);
  const jsonFields = collectFields(jsonRows);
  const missingInCsv = SOURCE_FIELDS.filter((field) => !csvFields.has(field));
  const missingInJson = SOURCE_FIELDS.filter((field) => !jsonFields.has(field));
  const sameRows = missingInCsv.length === 0
    && missingInJson.length === 0
    && resourceRowsEqual(csvRows, jsonRows);
  return {
    equivalent: sameRows,
    missingInCsv,
    missingInJson,
  };
}

export function normalize94025Revenue(value: string): string | undefined {
  return normalizeOptionalDecimal(value, {
    signed: false,
    percent: false,
    name: "revenue",
  });
}

export function normalize94025Percent(value: string): string | undefined {
  return normalizeOptionalDecimal(value, {
    signed: true,
    percent: true,
    name: "percent",
  });
}

export function normalize94025Row(
  row: Source94025Row,
): NormalizedMonthlyRevenue94025 {
  assertSourceRow(row, "94025 source row");

  const companyCode = requiredText(row.companyCode, "companyCode");
  const companyName = requiredText(row.companyName, "companyName");
  const industryName = requiredText(row.industryName, "industryName");
  const yearMonth = requiredYearMonth(row.yearMonth);
  const sourcePublishedOn = requiredPublishedDate(row.sourcePublishedOn);
  if (yearMonth > sourcePublishedOn.slice(0, 7)) {
    throw new Source94025ValidationError(
      "yearMonth cannot be later than sourcePublishedOn month",
    );
  }
  const currentMonthRevenue = requiredRevenue(
    row.currentMonthRevenue,
    "currentMonthRevenue",
  );
  const previousMonthRevenue = optionalRevenue(
    row.previousMonthRevenue,
    "previousMonthRevenue",
  );
  const priorYearMonthRevenue = optionalRevenueSnapshot(
    row.priorYearMonthRevenue,
    "priorYearMonthRevenue",
  );
  const monthOverMonthPercent = optionalPercent(
    row.monthOverMonthPercent,
    "monthOverMonthPercent",
  );
  const yearOverYearPercent = optionalPercent(
    row.yearOverYearPercent,
    "yearOverYearPercent",
  );
  const cumulativeRevenue = optionalRevenue(
    row.cumulativeRevenue,
    "cumulativeRevenue",
  );
  const priorYearCumulativeRevenue = optionalRevenue(
    row.priorYearCumulativeRevenue,
    "priorYearCumulativeRevenue",
  );
  const cumulativeYearOverYearPercent = optionalPercent(
    row.cumulativeYearOverYearPercent,
    "cumulativeYearOverYearPercent",
  );

  if (
    cumulativeRevenue !== undefined
    && compareNonNegativeDecimals(cumulativeRevenue, currentMonthRevenue) < 0
  ) {
    throw new Source94025ValidationError(
      "cumulativeRevenue cannot be less than currentMonthRevenue",
    );
  }
  if (
    yearMonth.endsWith("-01")
    && cumulativeRevenue !== undefined
    && compareNonNegativeDecimals(cumulativeRevenue, currentMonthRevenue) !== 0
  ) {
    throw new Source94025ValidationError(
      "January cumulativeRevenue must equal currentMonthRevenue",
    );
  }

  return {
    companyCode,
    companyName,
    industryName,
    yearMonth,
    sourcePublishedOn,
    revenueUnit: "仟元",
    currentMonthRevenue,
    previousMonthRevenue,
    priorYearMonthRevenue,
    monthOverMonthPercent,
    yearOverYearPercent,
    cumulativeRevenue,
    priorYearCumulativeRevenue,
    cumulativeYearOverYearPercent,
  };
}

export function assertUnique94025CompanyCodes(
  rows: readonly NormalizedMonthlyRevenue94025[],
): void {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = `${row.yearMonth}:${row.companyCode}`;
    if (keys.has(key)) {
      throw new Source94025ValidationError(
        `duplicate companyCode for yearMonth: ${key}`,
      );
    }
    keys.add(key);
  }
}

function parseAliasedDataset(
  values: readonly unknown[],
  name: string,
): Source94025Row[] {
  if (values.length === 0) {
    throw new Source94025ValidationError(`${name} must contain at least one row`);
  }
  const rows = values.map((value, index) =>
    parseAliasedRow(value, `${name} row ${index + 1}`)
  );
  assertUnique94025CompanyCodes(rows.map(normalize94025Row));
  return rows;
}

function parseAliasedRow(value: unknown, name: string): Source94025Row {
  const record = requireRecord(value, name);
  const aliasKeys = Object.keys(SHARED_ALIASES);
  for (const key of Object.keys(record)) {
    if (!Object.hasOwn(SHARED_ALIASES, key)) {
      throw new Source94025ValidationError(`${name} has unknown key: ${key}`);
    }
  }
  for (const key of aliasKeys) {
    if (!Object.hasOwn(record, key)) {
      throw new Source94025ValidationError(`${name} missing required field: ${key}`);
    }
    if (typeof record[key] !== "string") {
      throw new Source94025ValidationError(`${name}.${key} must be a string`);
    }
  }

  const row = Object.fromEntries(
    aliasKeys.map((key) => [SHARED_ALIASES[key as keyof typeof SHARED_ALIASES], record[key]]),
  ) as unknown as Source94025Row;
  assertSourceRow(row, name);
  return row;
}

function assertSourceRow(
  value: unknown,
  name: string,
): asserts value is Source94025Row {
  const record = requireRecord(value, name);
  for (const key of Object.keys(record)) {
    if (!SOURCE_FIELDS.includes(key as SourceField)) {
      throw new Source94025ValidationError(`${name} has unknown key: ${key}`);
    }
  }
  for (const field of SOURCE_FIELDS) {
    if (!Object.hasOwn(record, field)) {
      throw new Source94025ValidationError(`${name} missing required field: ${field}`);
    }
    if (typeof record[field] !== "string") {
      throw new Source94025ValidationError(`${name}.${field} must be a string`);
    }
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Source94025ValidationError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function collectFields(rows: readonly Source94025Row[]): Set<SourceField> {
  const fields = new Set<SourceField>();
  if (rows.length === 0) return fields;
  for (const field of SOURCE_FIELDS) {
    if (rows.every((row) => Object.hasOwn(row, field))) fields.add(field);
  }
  return fields;
}

function resourceRowsEqual(
  csvRows: readonly Source94025Row[],
  jsonRows: readonly Source94025Row[],
): boolean {
  if (csvRows.length !== jsonRows.length) return false;
  const csvByIdentity = new Map(
    csvRows.map((row) => [resourceRowIdentity(row), row]),
  );
  const jsonByIdentity = new Map(
    jsonRows.map((row) => [resourceRowIdentity(row), row]),
  );
  if (
    csvByIdentity.size !== csvRows.length
    || jsonByIdentity.size !== jsonRows.length
  ) {
    return false;
  }

  for (const [identity, csvRow] of csvByIdentity) {
    const jsonRow = jsonByIdentity.get(identity);
    if (
      jsonRow === undefined
      || SOURCE_FIELDS.some((field) => csvRow[field] !== jsonRow[field])
    ) {
      return false;
    }
  }
  return true;
}

function resourceRowIdentity(row: Source94025Row): string {
  return `${row.yearMonth}\u001f${row.companyCode}`;
}

function optionalText(value: string): string | undefined {
  const text = value.trim();
  return PLACEHOLDERS.has(text) ? undefined : text;
}

function requiredText(value: string, name: string): string {
  const text = optionalText(value);
  if (text === undefined) {
    throw new Source94025ValidationError(`${name} is required`);
  }
  if (text === "—") {
    throw new Source94025ValidationError(`${name} contains an unsupported em dash`);
  }
  return text;
}

function requiredPublishedDate(value: string): string {
  const text = requiredText(value, "sourcePublishedOn");
  let result: string | undefined;
  let match: RegExpExecArray | null;

  if ((match = /^(\d{4})(\d{2})(\d{2})$/.exec(text))) {
    result = `${match[1]}-${match[2]}-${match[3]}`;
  } else if ((match = /^(\d{3})(\d{2})(\d{2})$/.exec(text))) {
    result = `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    result = text;
  }

  if (result === undefined || !isIsoDate(result)) {
    throw new Source94025ValidationError(
      "sourcePublishedOn must be a valid official date",
    );
  }
  return result;
}

function requiredYearMonth(value: string): string {
  const text = requiredText(value, "yearMonth");
  let result: string | undefined;
  let match: RegExpExecArray | null;

  if ((match = /^(\d{4})(\d{2})$/.exec(text))) {
    result = `${match[1]}-${match[2]}`;
  } else if ((match = /^(\d{3})(\d{2})$/.exec(text))) {
    result = `${Number(match[1]) + 1911}-${match[2]}`;
  } else if (/^\d{4}-\d{2}$/.test(text)) {
    result = text;
  }

  if (result === undefined || !isYearMonth(result)) {
    throw new Source94025ValidationError("yearMonth must be a valid official month");
  }
  return result;
}

function requiredRevenue(value: string, name: string): string {
  const normalized = normalizeOptionalDecimal(value, {
    signed: false,
    percent: false,
    name,
  });
  if (normalized === undefined) {
    throw new Source94025ValidationError(`${name} is required`);
  }
  return normalized;
}

function optionalRevenue(value: string, name: string): string | undefined {
  return normalizeOptionalDecimal(value, {
    signed: false,
    percent: false,
    name,
  });
}

// A small number of official rows report negative comparative revenue after
// restatements.  The v1 contract intentionally stores revenue as non-negative;
// preserve correctness by omitting that unsupported comparative value instead
// of coercing it to zero.  Current-period revenue remains strict and required.
function optionalRevenueSnapshot(value: string, name: string): string | undefined {
  try {
    return optionalRevenue(value, name);
  } catch (error) {
    if (error instanceof Source94025ValidationError && /non-negative/.test(error.message) && /^[-－]/.test(value.trim())) {
      return undefined;
    }
    throw error;
  }
}

function optionalPercent(value: string, name: string): string | undefined {
  return normalizeOptionalDecimal(value, {
    signed: true,
    percent: true,
    name,
  });
}

function normalizeOptionalDecimal(
  value: string,
  options: {
    signed: boolean;
    percent: boolean;
    name: string;
  },
): string | undefined {
  if (typeof value !== "string") {
    throw new Source94025ValidationError(`${options.name} must be a string`);
  }
  const trimmed = value.trim();
  if (PLACEHOLDERS.has(trimmed)) return undefined;

  let text = trimmed.replaceAll("－", "-");
  if (options.percent && text.endsWith("%")) text = text.slice(0, -1);

  let sign = "";
  if (text.startsWith("-") || text.startsWith("+")) {
    sign = text[0];
    text = text.slice(1);
  }
  if (!options.signed && sign !== "") {
    if (sign === "-") {
      throw new Source94025ValidationError(`${options.name} must be non-negative`);
    }
    throw new Source94025ValidationError(
      `${options.name} must be a non-negative decimal`,
    );
  }
  if (!PLAIN_DECIMAL.test(text) && !GROUPED_DECIMAL.test(text)) {
    throw new Source94025ValidationError(
      `${options.name} must be a supported decimal`,
    );
  }

  const canonical = canonicalDecimal(text.replaceAll(",", ""));
  if (canonical === "0" || sign !== "-") return canonical;
  return `-${canonical}`;
}

function canonicalDecimal(value: string): string {
  const [integerPart, fractionPart = ""] = value.split(".");
  const integer = integerPart.replace(/^0+(?=\d)/, "");
  const fraction = fractionPart.replace(/0+$/, "");
  return fraction === "" ? integer : `${integer}.${fraction}`;
}

function compareNonNegativeDecimals(left: string, right: string): -1 | 0 | 1 {
  const [leftInteger, leftFraction = ""] = left.split(".");
  const [rightInteger, rightFraction = ""] = right.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const scaledLeft = BigInt(`${leftInteger}${leftFraction.padEnd(scale, "0")}`);
  const scaledRight = BigInt(`${rightInteger}${rightFraction.padEnd(scale, "0")}`);
  return scaledLeft === scaledRight ? 0 : scaledLeft < scaledRight ? -1 : 1;
}
