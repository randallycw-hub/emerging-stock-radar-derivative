import { createHash } from "node:crypto";

import { isIsoDate } from "../domain/dates.ts";
import { parseCsv } from "./csv.ts";

export interface Source11406Row {
  officialDataDate: string;
  issuerCode: string;
  issuerName: string;
  bondCode: string;
  sourceBondTypeCode: string;
  seriesNumber: string;
  trancheNumber: string;
  shortName: string;
  issueDate: string;
  listingDate: string;
  maturityDate: string;
  issueAmount: string;
  outstandingAmount: string;
  couponRate: string;
  securedText: string;
  securityDescription: string;
  initialConversionPrice: string;
  conversionStartDate: string;
  conversionEndDate: string;
  putDatesText: string;
  putPrice: string;
  underwriter: string;
  trustee: string;
  outstandingChangeDate: string;
  outstandingChangeReason: string;
  offeringMethod: string;
}

export interface NormalizedBondIssue11406 {
  bondId: string;
  bondCode?: string;
  issuerCode: string;
  issuerName: string;
  shortName: string;
  sourceBondTypeCode: string;
  seriesNumber?: string;
  trancheNumber?: string;
  issueDate: string;
  listingDate?: string;
  maturityDate: string;
  issueAmount: string;
  outstandingAmount: string;
  couponRate?: string;
  secured: boolean;
  securityDescription?: string;
  initialConversionPrice?: string;
  conversionStartDate?: string;
  conversionEndDate?: string;
  putDates: string[];
  putPrice?: string;
  underwriter?: string;
  trustee?: string;
  outstandingChangeDate?: string;
  outstandingChangeReason?: string;
  offeringMethod?: string;
  officialDataDate: string;
}

type SourceField = keyof Source11406Row;

const SOURCE_FIELDS = [
  "officialDataDate",
  "issuerCode",
  "issuerName",
  "bondCode",
  "sourceBondTypeCode",
  "seriesNumber",
  "trancheNumber",
  "shortName",
  "issueDate",
  "listingDate",
  "maturityDate",
  "issueAmount",
  "outstandingAmount",
  "couponRate",
  "securedText",
  "securityDescription",
  "initialConversionPrice",
  "conversionStartDate",
  "conversionEndDate",
  "putDatesText",
  "putPrice",
  "underwriter",
  "trustee",
  "outstandingChangeDate",
  "outstandingChangeReason",
  "offeringMethod",
] as const satisfies readonly SourceField[];

const CSV_ALIASES = {
  資料日期: "officialDataDate",
  機構代碼: "issuerCode",
  機構名稱: "issuerName",
  債券代碼: "bondCode",
  債券種類: "sourceBondTypeCode",
  債券期: "seriesNumber",
  債券別: "trancheNumber",
  債券簡稱: "shortName",
  發行日期: "issueDate",
  掛牌日期: "listingDate",
  到期日期: "maturityDate",
  發行總額: "issueAmount",
  目前餘額: "outstandingAmount",
  票面利率: "couponRate",
  有無擔保: "securedText",
  債券擔保情形: "securityDescription",
  發行時轉換價格: "initialConversionPrice",
  轉換期間起: "conversionStartDate",
  迄: "conversionEndDate",
  賣回權日期: "putDatesText",
  賣回權價格: "putPrice",
  承銷機構: "underwriter",
  受託人: "trustee",
  最近餘額變動日: "outstandingChangeDate",
  最近餘額變動原因: "outstandingChangeReason",
  募集方式: "offeringMethod",
} as const satisfies Readonly<Record<string, SourceField>>;

const JSON_ALIASES = {
  Date: "officialDataDate",
  IssuerCode: "issuerCode",
  IssuerName: "issuerName",
  BondCode: "bondCode",
  BondType: "sourceBondTypeCode",
  SeriesNumber: "seriesNumber",
  TrancheNumber: "trancheNumber",
  ShortName: "shortName",
  IssueDate: "issueDate",
  ListingDate: "listingDate",
  MaturityDate: "maturityDate",
  IssueAmount: "issueAmount",
  OutstandingAmount: "outstandingAmount",
  CouponRate: "couponRate",
  Guaranteed: "securedText",
  GuaranteeDescription: "securityDescription",
  "Conversion/ExchangePriceAtIssuance": "initialConversionPrice",
  "Conversion/ExchangePeriodStartDate": "conversionStartDate",
  "Conversion/ExchangePeriodEndDate": "conversionEndDate",
  PutOptionDate: "putDatesText",
  PutOptionPrice: "putPrice",
  Underwriter: "underwriter",
  Trustee: "trustee",
  OutstandingChangeDate: "outstandingChangeDate",
  OutstandingChangeDescription: "outstandingChangeReason",
  OfferingMethod: "offeringMethod",
} as const satisfies Readonly<Record<string, SourceField>>;

const PLACEHOLDERS = new Set(["", "-", "—", "－"]);
const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const COMMA_DECIMAL_PATTERN = /^(?:[1-9]\d{0,2})(?:,\d{3})+(?:\.\d+)?$/;

export function parse11406Csv(text: string): Source11406Row[] {
  if (typeof text !== "string") throw new TypeError("11406 CSV must be a string");
  // The live TPEx export includes additional official columns that are outside
  // the approved v1 contract.  Drop only this reviewed allow-list; arbitrary
  // unknown columns must still fail closed below.
  const ignored = new Set([
    "計付息方式", "計息次數", "付息次數", "債券評等機構", "債券評等等級",
    "發行公司評等機構", "發行公司評等等級", "擔保機構評等機構", "擔保機構評等等級",
    "掛牌地點", "還本FLAG", "還本敘述", "發行期限年", "發行期限月", "上市櫃否", "幣別",
  ]);
  const rows = parseCsv(text).map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !ignored.has(key))));
  return parseAliasedDataset(rows, CSV_ALIASES, "11406 CSV");
}

export function parse11406Json(value: unknown): Source11406Row[] {
  if (!Array.isArray(value)) throw new TypeError("11406 OpenAPI payload must be an array");
  return parseAliasedDataset(value, JSON_ALIASES, "11406 OpenAPI");
}

export function compare11406ResourceSchemas(
  csvRows: readonly Source11406Row[],
  jsonRows: readonly Source11406Row[],
): { equivalent: boolean; missingInCsv: SourceField[]; missingInJson: SourceField[] } {
  const csvFields = collectFields(csvRows);
  const jsonFields = collectFields(jsonRows);
  const missingInCsv = SOURCE_FIELDS.filter((field) =>
    jsonFields.has(field) && !csvFields.has(field)
  );
  const missingInJson = SOURCE_FIELDS.filter((field) =>
    csvFields.has(field) && !jsonFields.has(field)
  );
  return {
    equivalent: missingInCsv.length === 0 && missingInJson.length === 0,
    missingInCsv,
    missingInJson,
  };
}

export function normalize11406Row(row: Source11406Row): NormalizedBondIssue11406 {
  assertSourceRow(row, "11406 source row");

  const issuerCode = requiredText(row.issuerCode, "issuerCode");
  const issuerName = requiredText(row.issuerName, "issuerName");
  const sourceBondTypeCode = requiredText(row.sourceBondTypeCode, "sourceBondTypeCode");
  const shortName = requiredText(row.shortName, "shortName");
  const bondCode = optionalText(row.bondCode);
  const seriesNumber = optionalText(row.seriesNumber);
  const trancheNumber = optionalText(row.trancheNumber);

  const officialDataDate = requiredDate(row.officialDataDate, "officialDataDate");
  const issueDate = requiredDate(row.issueDate, "issueDate");
  const listingDate = optionalDate(row.listingDate, "listingDate");
  const maturityDate = requiredDate(row.maturityDate, "maturityDate");
  assertLifecycleDateOrder(issueDate, listingDate, maturityDate);

  const issueAmount = parseAmount(row.issueAmount, "issueAmount");
  const outstandingAmount = parseAmount(row.outstandingAmount, "outstandingAmount");
  if (compareDecimals(outstandingAmount, issueAmount) > 0) {
    throw new TypeError("outstandingAmount cannot exceed issueAmount");
  }

  const couponRate = parseOptionalCoupon(row.couponRate);
  const { secured, securityDescription } = parseSecurity(
    row.securedText,
    row.securityDescription,
  );
  const initialConversionPrice = parseOptionalPositiveDecimal(
    row.initialConversionPrice,
    "initialConversionPrice",
  );

  const conversionStartDate = optionalDate(
    row.conversionStartDate,
    "conversionStartDate",
  );
  const conversionEndDate = optionalDate(row.conversionEndDate, "conversionEndDate");
  if ((conversionStartDate === undefined) !== (conversionEndDate === undefined)) {
    throw new TypeError("conversionStartDate and conversionEndDate must be present as a pair");
  }
  if (
    conversionStartDate
    && conversionEndDate
    && conversionStartDate > conversionEndDate
  ) {
    throw new TypeError("conversionStartDate cannot be after conversionEndDate");
  }
  for (const [name, date] of [
    ["conversionStartDate", conversionStartDate],
    ["conversionEndDate", conversionEndDate],
  ] as const) {
    if (date && (date < issueDate || date > maturityDate)) {
      throw new TypeError(`${name} must be within the bond lifecycle`);
    }
  }

  const { putDates, putPrice } = parsePutTerms(
    row.putDatesText,
    row.putPrice,
    issueDate,
    maturityDate,
  );
  const outstandingChangeDate = optionalDate(
    row.outstandingChangeDate,
    "outstandingChangeDate",
  );
  const outstandingChangeReason = optionalText(row.outstandingChangeReason);
  if (
    (outstandingChangeDate === undefined)
    !== (outstandingChangeReason === undefined)
  ) {
    throw new TypeError("outstanding change date and reason must be present as a pair");
  }

  const bondId = bondCode
    ? `bond:${bondCode.toUpperCase()}`
    : compositeBondId({
      issuerCode,
      sourceBondTypeCode,
      seriesNumber,
      trancheNumber,
      issueDate,
    });

  return {
    bondId,
    bondCode: bondCode?.toUpperCase(),
    issuerCode,
    issuerName,
    shortName,
    sourceBondTypeCode,
    seriesNumber,
    trancheNumber,
    issueDate,
    listingDate,
    maturityDate,
    issueAmount,
    outstandingAmount,
    couponRate,
    secured,
    securityDescription,
    initialConversionPrice,
    conversionStartDate,
    conversionEndDate,
    putDates,
    putPrice,
    underwriter: optionalText(row.underwriter),
    trustee: optionalText(row.trustee),
    outstandingChangeDate,
    outstandingChangeReason,
    offeringMethod: optionalText(row.offeringMethod),
    officialDataDate,
  };
}

function parseAliasedDataset(
  value: readonly unknown[],
  aliases: Readonly<Record<string, SourceField>>,
  name: string,
): Source11406Row[] {
  if (value.length === 0) throw new TypeError(`${name} must contain at least one row`);
  const rows = value.map((item, index) =>
    parseAliasedRow(item, aliases, `${name} row ${index + 1}`)
  );
  const identities = new Set<string>();
  for (const row of rows) {
    const identity = normalize11406Row(row).bondId;
    if (identities.has(identity)) {
      throw new TypeError(`${name} contains duplicate bond identity: ${identity}`);
    }
    identities.add(identity);
  }
  return rows;
}

function parseAliasedRow(
  value: unknown,
  aliases: Readonly<Record<string, SourceField>>,
  name: string,
): Source11406Row {
  const record = requireRecord(value, name);
  const aliasKeys = Object.keys(aliases);
  for (const key of Object.keys(record)) {
    if (!(key in aliases)) throw new TypeError(`${name} has unknown key: ${key}`);
  }
  for (const key of aliasKeys) {
    if (!(key in record)) throw new TypeError(`${name} missing required field: ${key}`);
    if (typeof record[key] !== "string") {
      throw new TypeError(`${name}.${key} must be a string`);
    }
  }

  const row = Object.fromEntries(
    aliasKeys.map((key) => [aliases[key], record[key]]),
  ) as unknown as Source11406Row;
  assertSourceRow(row, name);
  return row;
}

function assertSourceRow(value: unknown, name: string): asserts value is Source11406Row {
  const record = requireRecord(value, name);
  for (const key of Object.keys(record)) {
    if (!SOURCE_FIELDS.includes(key as SourceField)) {
      throw new TypeError(`${name} has unknown key: ${key}`);
    }
  }
  for (const field of SOURCE_FIELDS) {
    if (!(field in record)) throw new TypeError(`${name} missing required field: ${field}`);
    if (typeof record[field] !== "string") {
      throw new TypeError(`${name}.${field} must be a string`);
    }
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function collectFields(rows: readonly Source11406Row[]): Set<SourceField> {
  const fields = new Set<SourceField>();
  for (const row of rows) {
    for (const field of SOURCE_FIELDS) {
      if (Object.hasOwn(row, field)) fields.add(field);
    }
  }
  return fields;
}

function optionalText(value: string): string | undefined {
  const text = value.trim();
  return PLACEHOLDERS.has(text) ? undefined : text;
}

function requiredText(value: string, name: string): string {
  const text = optionalText(value);
  if (text === undefined) throw new TypeError(`${name} is required`);
  return text;
}

function parseOfficialCalendarDate(value: string): string | undefined {
  const text = optionalText(value);
  if (text === undefined) return undefined;

  let isoDate: string;
  let match: RegExpExecArray | null;
  if ((match = /^(\d{4})(\d{2})(\d{2})$/.exec(text))) {
    isoDate = `${match[1]}-${match[2]}-${match[3]}`;
  } else if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text))) {
    isoDate = text;
  } else if ((match = /^(\d{3})\/(\d{2})\/(\d{2})$/.exec(text))) {
    isoDate = `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  } else {
    return undefined;
  }
  return isIsoDate(isoDate) ? isoDate : undefined;
}

function requiredDate(value: string, name: string): string {
  if (optionalText(value) === undefined) throw new TypeError(`${name} is required`);
  const parsed = parseOfficialCalendarDate(value);
  if (parsed === undefined) throw new TypeError(`${name} must be a valid official date`);
  return parsed;
}

function optionalDate(value: string, name: string): string | undefined {
  if (optionalText(value) === undefined) return undefined;
  const parsed = parseOfficialCalendarDate(value);
  if (parsed === undefined) throw new TypeError(`${name} must be a valid official date`);
  return parsed;
}

function assertLifecycleDateOrder(
  issueDate: string,
  listingDate: string | undefined,
  maturityDate: string,
): void {
  if (maturityDate <= issueDate) {
    throw new TypeError("maturityDate must be after issueDate");
  }
  if (listingDate && (listingDate < issueDate || listingDate > maturityDate)) {
    throw new TypeError("listingDate must be within the bond lifecycle");
  }
}

function parseAmount(value: string, name: string): string {
  const text = requiredText(value, name);
  const unitMatch = /^(.*?)(仟元|元)?$/.exec(text);
  if (!unitMatch) throw new TypeError(`${name} must be a supported decimal amount`);
  const decimal = parseDecimal(unitMatch[1], name);
  return unitMatch[2] === "仟元" ? multiplyDecimal(decimal, BigInt(1000)) : decimal;
}

function parseOptionalCoupon(value: string): string | undefined {
  const text = optionalText(value);
  if (text === undefined) return undefined;
  const numberText = text.endsWith("%") ? text.slice(0, -1) : text;
  if (DECIMAL_PATTERN.test(numberText) || COMMA_DECIMAL_PATTERN.test(numberText)) {
    return parseDecimal(numberText, "couponRate");
  }
  if (/^[\d+\-.,%\s]+$/.test(text)) {
    throw new TypeError("couponRate contains malformed numeric-looking text");
  }
  return text;
}

function parseOptionalPositiveDecimal(value: string, name: string): string | undefined {
  const text = optionalText(value);
  if (text === undefined) return undefined;
  const decimal = parseDecimal(text, name);
  return decimal === "0" ? undefined : decimal;
}

function parseDecimal(value: string, name: string): string {
  const text = value.trim();
  if (!DECIMAL_PATTERN.test(text) && !COMMA_DECIMAL_PATTERN.test(text)) {
    throw new TypeError(`${name} must be a non-negative plain decimal`);
  }
  return canonicalDecimal(text.replaceAll(",", ""));
}

function canonicalDecimal(value: string): string {
  const [integerPart, fractionPart = ""] = value.split(".");
  const integer = integerPart.replace(/^0+(?=\d)/, "");
  const fraction = fractionPart.replace(/0+$/, "");
  return fraction === "" ? integer : `${integer}.${fraction}`;
}

function multiplyDecimal(value: string, multiplier: bigint): string {
  const [integerPart, fractionPart = ""] = value.split(".");
  const coefficient = BigInt(`${integerPart}${fractionPart}`) * multiplier;
  return formatScaledInteger(coefficient, fractionPart.length);
}

function formatScaledInteger(coefficient: bigint, scale: number): string {
  if (scale === 0) return coefficient.toString();
  const digits = coefficient.toString().padStart(scale + 1, "0");
  const integerPart = digits.slice(0, -scale);
  const fractionPart = digits.slice(-scale).replace(/0+$/, "");
  return fractionPart === "" ? integerPart : `${integerPart}.${fractionPart}`;
}

function compareDecimals(left: string, right: string): -1 | 0 | 1 {
  const [leftInteger, leftFraction = ""] = left.split(".");
  const [rightInteger, rightFraction = ""] = right.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const scaledLeft = BigInt(`${leftInteger}${leftFraction.padEnd(scale, "0")}`);
  const scaledRight = BigInt(`${rightInteger}${rightFraction.padEnd(scale, "0")}`);
  return scaledLeft === scaledRight ? 0 : scaledLeft < scaledRight ? -1 : 1;
}

function parseSecurity(
  securedText: string,
  descriptionText: string,
): { secured: boolean; securityDescription?: string } {
  const code = requiredText(securedText, "securedText");
  if (code !== "1" && code !== "2") {
    throw new TypeError("securedText must be official code 1 or 2");
  }
  const securityDescription = optionalText(descriptionText);
  if (code === "1" && securityDescription === undefined) {
    throw new TypeError("securityDescription is required for a secured issue");
  }
  return { secured: code === "1", securityDescription };
}

function parsePutTerms(
  datesText: string,
  pricesText: string,
  issueDate: string,
  maturityDate: string,
): { putDates: string[]; putPrice?: string } {
  const normalizedDatesText = optionalText(datesText);
  const normalizedPricesText = optionalText(pricesText);
  if (normalizedDatesText === undefined) {
    if (normalizedPricesText === undefined) return { putDates: [] };
    if (normalizedPricesText.includes("、")) {
      throw new TypeError("putDatesText and putPrice must both describe a contract");
    }
    const price = parseOptionalPositiveDecimal(normalizedPricesText, "putPrice");
    if (price !== undefined) {
      throw new TypeError("putDatesText is required when putPrice is positive");
    }
    return { putDates: [] };
  }
  if (normalizedPricesText === undefined) {
    throw new TypeError("put date and price counts must match");
  }

  const rawDates = normalizedDatesText.split("、").map((value) => value.trim());
  const rawPrices = normalizedPricesText.split("、").map((value) => value.trim());
  if (rawDates.length !== rawPrices.length) {
    throw new TypeError("put date and price counts must match");
  }
  const dates = rawDates.map((value, index) =>
    requiredDate(value, `putDatesText[${index}]`)
  );
  for (const date of dates) {
    if (date < issueDate || date > maturityDate) {
      throw new TypeError("putDatesText must be within the bond lifecycle");
    }
  }
  const prices = rawPrices.map((value, index) => {
    const price = parseOptionalPositiveDecimal(value, `putPrice[${index}]`);
    if (price === undefined) throw new TypeError("putPrice must be positive");
    return price;
  });
  if (new Set(prices).size !== 1) {
    throw new TypeError("multiple distinct put prices are unsupported");
  }
  return {
    putDates: [...new Set(dates)].sort(),
    putPrice: prices[0],
  };
}

function compositeBondId(parts: {
  issuerCode: string;
  sourceBondTypeCode: string;
  seriesNumber: string | undefined;
  trancheNumber: string | undefined;
  issueDate: string;
}): string {
  if (parts.seriesNumber === undefined || parts.trancheNumber === undefined) {
    throw new TypeError("incomplete composite identity for uncoded bond");
  }
  const identity = [
    parts.issuerCode,
    parts.sourceBondTypeCode,
    parts.seriesNumber,
    parts.trancheNumber,
    parts.issueDate,
  ].join("\u001f");
  return `bond:sha256:${createHash("sha256").update(identity, "utf8").digest("hex")}`;
}
