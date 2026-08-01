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

const REVIEWED_CHRONOLOGY_ANOMALIES = [
  {
    sourceRecordId: "TWSE:6280:0931230",
    applicationDate: "0931230",
    listingReviewDate: "0930907",
    boardApprovalDate: "0930921",
    listingContractApprovalOrFilingDate: "0931001",
    listingDate: "0931228",
    reason: "Official historical row has pre-application review milestones; reviewed 2026-08-02.",
  },
  {
    sourceRecordId: "TWSE:2453:0890831",
    applicationDate: "0890831",
    listingReviewDate: "0890929",
    boardApprovalDate: "0891017",
    listingContractApprovalOrFilingDate: "0890115",
    listingDate: "0900522",
    reason: "Official historical row has a pre-application contract milestone; reviewed 2026-08-02.",
  },
] as const;

export class Source11586ValidationError extends TypeError {
  constructor(message: string) { super(message); this.name = "Source11586ValidationError"; }
}

export function parse11586Csv(text: string): Source11586Row[] {
  if (typeof text !== "string") throw new Source11586ValidationError("11586 CSV must be a string");
  const rows = parseCsv(text).map((row) => {
    if ("公司代號" in row) {
      return {
        sourceRecordId: `TWSE:${row["公司代號"]}:${row["申請日期"]}`,
        companyCode: row["公司代號"],
        companyName: row["公司簡稱"],
        applicationDate: row["申請日期"],
        chairmanName: row["董事長"],
        applicationCapitalThousandsTwd: row["申請時股本(仟元)"],
        listingReviewDate: row["上市審議委員會審議日期"],
        boardApprovalDate: row["交易所董事會通過上市日期"],
        listingContractApprovalOrFilingDate: row["上市契約報請主管機關備查(主管機關核准)日期"],
        listingDate: row["股票上市買賣日期"],
        underwriters: row["承銷商"],
        underwritingPrice: row["承銷價"],
        note: row["備註"],
      };
    }
    return row;
  });
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
  const underwriters = row.underwriters.trim() === "" ? [] : row.underwriters.split("|").map((value) => requiredText(value, "underwriters"));
  const applicationCapitalThousandsTwd = optionalDecimal(row.applicationCapitalThousandsTwd, "applicationCapitalThousandsTwd") ?? "";
  let previous = applicationDate;
  for (const [name, date] of Object.entries(dates)) {
    if (date !== undefined && date < previous) throw new Source11586ValidationError(`${name} violates application chronology`);
    if (date !== undefined) previous = date;
  }
  return {
    sourceDatasetId: "11586",
    sourceRecordId,
    companyCode,
    companyName,
    applicationDate,
    chairmanName: optionalText(row.chairmanName) ?? "",
    applicationCapitalThousandsTwd,
    ...dates,
    underwriters,
    note: row.note.trim(),
  };
}

export function assertUnique11586Applications(
  rows: readonly Pick<NormalizedListingApplication11586, "companyCode" | "applicationDate">[],
): void {
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
  const acceptedRows: Source11586Row[] = [];
  const applicationIdentities: Array<Pick<NormalizedListingApplication11586, "companyCode" | "applicationDate">> = [];
  for (const row of rows) {
    try {
      const normalized = normalize11586Application(row);
      applicationIdentities.push(normalized);
      acceptedRows.push(row);
    } catch (error) {
      if (!(error instanceof Source11586ValidationError)
        || !error.message.endsWith("violates application chronology")
        || !isReviewedChronologyAnomaly(row)) throw error;
      applicationIdentities.push({
        companyCode: requiredText(row.companyCode, "companyCode"),
        applicationDate: requiredDate(row.applicationDate, "applicationDate"),
      });
    }
  }
  assertUnique11586Applications(applicationIdentities);
  return acceptedRows;
}

function isReviewedChronologyAnomaly(row: Source11586Row): boolean {
  return REVIEWED_CHRONOLOGY_ANOMALIES.some((anomaly) => (
    row.sourceRecordId === anomaly.sourceRecordId
    && row.applicationDate === anomaly.applicationDate
    && row.listingReviewDate === anomaly.listingReviewDate
    && row.boardApprovalDate === anomaly.boardApprovalDate
    && row.listingContractApprovalOrFilingDate === anomaly.listingContractApprovalOrFilingDate
    && row.listingDate === anomaly.listingDate
  ));
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
  const match = /^(?:(\d{4})[-/]?(\d{2})[-/]?(\d{2})|(\d{3})[-/]?(\d{2})[-/]?(\d{2}))$/.exec(text);
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
