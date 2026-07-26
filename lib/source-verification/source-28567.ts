import { isIsoDate } from "../domain/dates.ts";
import { parseCsv } from "./csv.ts";

export interface Source28567Row {
  companyCode: string;
  companyName: string;
  companyShortName: string;
  industryName: string;
  websiteUrl: string;
  establishmentDate: string;
  paidInCapital: string;
  chairperson: string;
  generalManager: string;
  taxId: string;
  address: string;
}

export interface NormalizedCompany28567 extends Source28567Row {
  sourceDatasetId: "28567";
  sourceRecordId: string;
}

export class Source28567ValidationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "Source28567ValidationError";
  }
}

const FIELDS = [
  "companyCode", "companyName", "companyShortName", "industryName", "websiteUrl",
  "establishmentDate", "paidInCapital", "chairperson", "generalManager", "taxId", "address",
] as const;
export function parse28567Csv(text: string): Source28567Row[] {
  if (typeof text !== "string") throw new Source28567ValidationError("28567 CSV must be a string");
  return parse28567Rows(parseCsv(text));
}

export function parse28567Json(value: unknown): Source28567Row[] {
  if (!Array.isArray(value)) throw new Source28567ValidationError("28567 OpenAPI payload must be an array");
  return parse28567Rows(value);
}

export function normalize28567Row(row: Source28567Row): NormalizedCompany28567 {
  assertRow(row, "28567 source row");
  const companyCode = required(row.companyCode, "companyCode");
  const taxId = required(row.taxId, "taxId");
  const establishmentDate = normalizeDate(row.establishmentDate);
  const websiteUrl = normalizeUrl(row.websiteUrl);
  return {
    sourceDatasetId: "28567",
    sourceRecordId: `${companyCode}:${taxId}`,
    companyCode,
    companyName: required(row.companyName, "companyName"),
    companyShortName: required(row.companyShortName, "companyShortName"),
    industryName: required(row.industryName, "industryName"),
    websiteUrl,
    establishmentDate,
    paidInCapital: normalizeDecimal(row.paidInCapital),
    chairperson: required(row.chairperson, "chairperson"),
    generalManager: required(row.generalManager, "generalManager"),
    taxId,
    address: required(row.address, "address"),
  };
}

export function assertUnique28567Identities(rows: readonly NormalizedCompany28567[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.sourceRecordId)) throw new Source28567ValidationError(`duplicate identity: ${row.sourceRecordId}`);
    seen.add(row.sourceRecordId);
  }
}

export function join28567To94025Coverage(
  coverageCompanyCodes: readonly string[],
  profiles: readonly NormalizedCompany28567[],
): { matched: NormalizedCompany28567[]; unmatchedCoverageCodes: string[]; ambiguousCodes: string[] } {
  const byCode = new Map<string, NormalizedCompany28567[]>();
  for (const profile of profiles) {
    const list = byCode.get(profile.companyCode) ?? [];
    list.push(profile);
    byCode.set(profile.companyCode, list);
  }
  const matched: NormalizedCompany28567[] = [];
  const unmatchedCoverageCodes: string[] = [];
  const ambiguousCodes: string[] = [];
  for (const code of coverageCompanyCodes) {
    const candidates = byCode.get(code) ?? [];
    if (candidates.length === 1) matched.push(candidates[0]);
    else if (candidates.length === 0) unmatchedCoverageCodes.push(code);
    else ambiguousCodes.push(code);
  }
  return { matched, unmatchedCoverageCodes, ambiguousCodes };
}

function parse28567Rows(values: readonly unknown[]): Source28567Row[] {
  if (values.length === 0) throw new Source28567ValidationError("28567 dataset must contain at least one row");
  const rows = values.map((value, index) => {
    assertRow(value, `28567 row ${index + 1}`);
    return value;
  });
  const normalized = rows.map(normalize28567Row);
  assertUnique28567Identities(normalized);
  return rows;
}

function assertRow(value: unknown, name: string): asserts value is Source28567Row {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Source28567ValidationError(`${name} must be an object`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!(FIELDS as readonly string[]).includes(key)) throw new Source28567ValidationError(`${name} has unknown key: ${key}`);
  for (const field of FIELDS) {
    if (!Object.hasOwn(record, field)) throw new Source28567ValidationError(`${name} missing required field: ${field}`);
    if (typeof record[field] !== "string") throw new Source28567ValidationError(`${name}.${field} must be a string`);
  }
}

function required(value: string, name: string): string {
  const result = value.trim();
  if (!result || result === "-" || result === "--") throw new Source28567ValidationError(`${name} is required`);
  return result;
}

function normalizeDate(value: string): string {
  const text = required(value, "establishmentDate");
  const match = /^(\d{3})(\d{2})(\d{2})$/.exec(text);
  const iso = match ? `${Number(match[1]) + 1911}-${match[2]}-${match[3]}` : text;
  if (!isIsoDate(iso)) throw new Source28567ValidationError("establishmentDate must be a valid date");
  return iso;
}

function normalizeUrl(value: string): string {
  const text = required(value, "websiteUrl");
  let url: URL;
  try { url = new URL(text); } catch { throw new Source28567ValidationError("websiteUrl must be an absolute URL"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Source28567ValidationError("websiteUrl must use http or https");
  return url.toString();
}

function normalizeDecimal(value: string): string {
  const text = required(value, "paidInCapital").replaceAll(",", "");
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Source28567ValidationError("paidInCapital must be a non-negative decimal");
  const [integer, fraction = ""] = text.split(".");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction ? `${integer.replace(/^0+(?=\d)/, "")}.${normalizedFraction}` : integer.replace(/^0+(?=\d)/, "");
}
