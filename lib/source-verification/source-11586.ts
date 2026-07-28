import { isIsoDate } from "../domain/dates.ts";
import { parseCsv } from "./csv.ts";

export interface Source11586Row {
  sourceRecordId: string;
  companyCode: string;
  companyName: string;
  applicationDate: string;
  chairmanName: string;
  applicationCapitalThousandsTwd: string;
  listingReviewDate: string;
  boardApprovalDate: string;
  listingContractApprovalOrFilingDate: string;
  listingDate: string;
  underwriters: string;
  underwritingPrice: string;
  note: string;
}

export interface NormalizedListingApplication11586 {
  sourceDatasetId: "11586";
  sourceRecordId: string;
  companyCode: string;
  companyName: string;
  applicationDate: string;
  chairmanName: string;
  applicationCapitalThousandsTwd: string;
  listingReviewDate?: string;
  boardApprovalDate?: string;
  listingContractApprovalOrFilingDate?: string;
  listingDate?: string;
  underwriters: string[];
  note: string;
}

type SourceField = keyof Source11586Row;
const SOURCE_FIELDS = [
  "sourceRecordId", "companyCode", "companyName", "applicationDate", "chairmanName",
  "applicationCapitalThousandsTwd", "listingReviewDate", "boardApprovalDate",
  "listingContractApprovalOrFilingDate", "listingDate", "underwriters",
  "underwritingPrice", "note",
] as const satisfies readonly SourceField[];

export class Source11586ValidationError extends TypeError {
  constructor(message: string) { super(message); this.name = "Source11586ValidationError"; }
}

export function parse11586Csv(text: string): Source11586Row[] {
  if (typeof text !== "string") throw new Source11586ValidationError("11586 CSV must be a string");
  // TWSE currently emits non-contractual helper columns alongside the
  // reviewed fields; keep the parser strict for all other unknown columns.
  const ignored = new Set(["索引", "公司代號"]);
  const rows = parseCsv(text).map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !ignored.has(key) && key !== "索引" && key !== "公司代號" && key !== "公司簡稱")));
  for (const row of rows) {
    for (const helper of ["申請日期", "公司代號", "公司簡稱", "索引"]) delete row[helper];
  }
  return parseRows(rows, "11586 CSV");
}

export function parse11586Json(value: unknown): Source11586Row[] {
  if (!Array.isArray(value)) throw new Source11586ValidationError("11586 OpenAPI payload must be an array");
  return parseRows(value, "11586 OpenAPI");
}

export function compare11586ResourceSchemas(
  csvRows: readonly Source11586Row[],
  jsonRows: readonly Source11586Row[],
): { equivalent: boolean; missingInCsv: SourceField[]; missingInJson: SourceField[] } {
  const csvFields = fields(csvRows);
  const jsonFields = fields(jsonRows);
  const missingInCsv = SOURCE_FIELDS.filter((field) => !csvFields.has(field));
  const missingInJson = SOURCE_FIELDS.filter((field) => !jsonFields.has(field));
  const sameRows = missingInCsv.length === 0 && missingInJson.length === 0
    && JSON.stringify(csvRows) === JSON.stringify(jsonRows);
  return { equivalent: sameRows, missingInCsv, missingInJson };
}

export function normalize11586Application(row: Source11586Row): NormalizedListingApplication11586 {
  assertRow(row, "11586 source row");
  const sourceRecordId = requiredText(row.sourceRecordId, "sourceRecordId");
  const companyCode = requiredText(row.companyCode, "companyCode");
  const companyName = requiredText(row.companyName, "companyName");
  const applicationDate = requiredDate(row.applicationDate, "applicationDate");
  const dates = {
    listingReviewDate: optionalDate(row.listingReviewDate, "listingReviewDate"),
    boardApprovalDate: optionalDate(row.boardApprovalDate, "boardApprovalDate"),
    listingContractApprovalOrFilingDate: optionalDate(row.listingContractApprovalOrFilingDate, "listingContractApprovalOrFilingDate"),
    listingDate: optionalDate(row.listingDate, "listingDate"),
  };
  let previous = applicationDate;
  for (const [name, date] of Object.entries(dates)) {
    if (date !== undefined && date < previous) throw new Source11586ValidationError(`${name} violates application chronology`);
    if (date !== undefined) previous = date;
  }
  const underwriters = row.underwriters.trim() === "" ? [] : row.underwriters.split("|").map((value) => requiredText(value, "underwriters"));
  return {
    sourceDatasetId: "11586",
    sourceRecordId,
    companyCode,
    companyName,
    applicationDate,
    chairmanName: optionalText(row.chairmanName) ?? "",
    applicationCapitalThousandsTwd: optionalDecimal(row.applicationCapitalThousandsTwd, "applicationCapitalThousandsTwd") ?? "",
    ...dates,
    underwriters,
    note: row.note.trim(),
  };
}

export function assertUnique11586Applications(rows: readonly NormalizedListingApplication11586[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const identity = `${row.companyCode}:${row.applicationDate}`;
    if (seen.has(identity)) throw new Source11586ValidationError(`duplicate application identity: ${identity}`);
    seen.add(identity);
  }
}

function parseRows(values: readonly unknown[], name: string): Source11586Row[] {
  if (values.length === 0) throw new Source11586ValidationError(`${name} must contain at least one row`);
  const rows = values.map((value, index) => {
    const record = requireRecord(value, `${name} row ${index + 1}`);
    for (const key of Object.keys(record)) if (!SOURCE_FIELDS.includes(key as SourceField)) throw new Source11586ValidationError(`${name} has unknown key: ${key}`);
    for (const field of SOURCE_FIELDS) {
      if (!(field in record)) throw new Source11586ValidationError(`${name} missing required field: ${field}`);
      if (typeof record[field] !== "string") throw new Source11586ValidationError(`${name}.${field} must be a string`);
    }
    return record as unknown as Source11586Row;
  });
  assertUnique11586Applications(rows.map(normalize11586Application));
  return rows;
}

function fields(rows: readonly Source11586Row[]): Set<SourceField> {
  const result = new Set<SourceField>();
  for (const row of rows) for (const field of SOURCE_FIELDS) if (Object.hasOwn(row, field)) result.add(field);
  return result;
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Source11586ValidationError(`${name} must be an object`);
  return value as Record<string, unknown>;
}
function assertRow(value: unknown, name: string): asserts value is Source11586Row {
  const record = requireRecord(value, name);
  for (const key of Object.keys(record)) if (!SOURCE_FIELDS.includes(key as SourceField)) throw new Source11586ValidationError(`${name} has unknown key: ${key}`);
  for (const field of SOURCE_FIELDS) {
    if (!(field in record)) throw new Source11586ValidationError(`${name} missing required field: ${field}`);
    if (typeof record[field] !== "string") throw new Source11586ValidationError(`${name}.${field} must be a string`);
  }
}
function requiredText(value: string, name: string): string { const text = value.trim(); if (text === "" || text === "-" || text === "--") throw new Source11586ValidationError(`${name} is required`); return text; }
function optionalText(value: string): string | undefined { const text = value.trim(); return text === "" || text === "-" || text === "--" ? undefined : text; }
function requiredDate(value: string, name: string): string { const date = optionalDate(value, name); if (!date) throw new Source11586ValidationError(`${name} is required`); return date; }
function optionalDate(value: string, name: string): string | undefined {
  const text = optionalText(value); if (!text) return undefined;
  const match = /^(?:(\d{4})[-/]?(\d{2})[-/]?(\d{2})|(\d{3})[/-](\d{2})[/-](\d{2}))$/.exec(text);
  if (!match) throw new Source11586ValidationError(`${name} must be a valid official date`);
  const date = match[1] ? `${match[1]}-${match[2]}-${match[3]}` : `${Number(match[4]) + 1911}-${match[5]}-${match[6]}`;
  if (!isIsoDate(date)) throw new Source11586ValidationError(`${name} must be a valid official date`);
  return date;
}
function optionalDecimal(value: string, name: string): string | undefined {
  const text = optionalText(value); if (!text) return undefined;
  const normalized = text.replaceAll(",", "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Source11586ValidationError(`${name} must be a non-negative decimal`);
  return normalized.replace(/^0+(?=\d)/, "");
}
