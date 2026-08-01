import { isIsoDate } from "../domain/dates.ts";

export type IpoMarket = "上市" | "創新板" | "上櫃";

export interface IpoApplicationSourceRow {
  companyCode: string;
  companyName: string;
  market: IpoMarket;
  applicationDate: string;
  reviewDate: string | null;
  boardDate: string | null;
  contractDate: string | null;
  listingDate: string | null;
  underwriter: string;
  note: string;
  sourceRecordId: string;
}

export interface IpoListingEvidenceRow {
  companyCode: string;
  companyName: string;
  market: "上櫃";
  listingDate: string;
  finalUnderwritingPrice: string | null;
  underwriter: string;
  sourceRecordId: string;
}

export interface IpoAuctionSourceRow {
  companyCode: string;
  companyName: string;
  market: IpoMarket;
  bidStartDate: string;
  bidEndDate: string;
  auctionOpenDate: string;
  listingDate: string | null;
  minimumBidPrice: string | null;
  finalUnderwritingPrice: string | null;
  underwriter: string;
  cancelled: boolean;
  sourceRecordId: string;
}

export interface IpoPublicOfferingSourceRow {
  companyCode: string;
  companyName: string;
  market: IpoMarket;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  drawDate: string;
  listingDate: string | null;
  provisionalUnderwritingPrice: string | null;
  finalUnderwritingPrice: string | null;
  underwriter: string;
  cancelled: boolean;
  sourceRecordId: string;
}

export class IpoSourceValidationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "IpoSourceValidationError";
  }
}

const TPEX_APPLICANT_FIELDS = [
  "Date", "SecuritiesCompanyCode", "CompanyName", "Chairman", "CapitalWhileApplying",
  "TPExListingScreeningCommitteeDate", "TPExSanctionedDate", "TPExApprovedTradingDate",
  "ListingDate", "LeadUnderwriter", "OfferingPrice", "Note",
] as const;

const TPEX_IPO_NO_LIMIT_FIELDS = [
  "Date", "SecuritiesCompanyCode", "CompanyName", "StartDateForStabilizationOperation",
  "EndDateForStabilizationOperation", "UnderwritingPrice", "OverAllotmentShares",
  "TransactionType", "Underwriter", "TradingType", "TradingPrice", "TradingVolume",
  "CurrentDayCumulativeTradingVolume",
] as const;

const AUCTION_FIELDS = [
  "序號", "開標日期", "證券名稱", "證券代號", "發行市場", "發行性質", "競拍方式", "投標開始日", "投標結束日",
  "競拍數量(張)", "最低投標價格(元)", "最低每標單投標數量(張)", "最高投(得)標數量(張)", "保證金成數(%)",
  "每一投標單投標處理費(元)", "撥券日期(上市、上櫃日期)", "主辦券商", "得標總金額(元)", "得標手續費率(%)",
  "總合格件", "合格投標數量(張)", "最低得標價格(元)", "最高得標價格(元)", "得標加權平均價格(元)",
  "實際承銷價格(元)", "取消競價拍賣(流標或取消)",
] as const;

const PUBLIC_OFFERING_FIELDS = [
  "序號", "抽籤日期", "證券名稱", "證券代號", "發行市場", "申購開始日", "申購結束日", "承銷股數", "實際承銷股數",
  "承銷價(元)", "實際承銷價(元)", "撥券日期(上市、上櫃日期)", "主辦券商", "申購股數", "總承銷金額(元)",
  "總合格件", "中籤率(%)", "取消公開抽籤 ",
] as const;

export function parseTpexApplicantSource(payload: unknown): IpoApplicationSourceRow[] {
  return requireRows(payload, "TPEx applicant", TPEX_APPLICANT_FIELDS).map((row) => {
    const companyCode = requiredCompanyCode(row.SecuritiesCompanyCode, "companyCode");
    const applicationDate = requiredOfficialDate(row.Date, "applicationDate");
    return {
      companyCode,
      companyName: requiredText(row.CompanyName, "companyName"),
      market: "上櫃",
      applicationDate,
      reviewDate: optionalOfficialDate(row.TPExListingScreeningCommitteeDate, "reviewDate"),
      boardDate: optionalOfficialDate(row.TPExSanctionedDate, "boardDate"),
      contractDate: optionalOfficialDate(row.TPExApprovedTradingDate, "contractDate"),
      listingDate: optionalOfficialDate(row.ListingDate, "listingDate"),
      underwriter: optionalText(row.LeadUnderwriter) ?? "",
      note: optionalText(row.Note) ?? "",
      sourceRecordId: `TPEx:${companyCode}:${applicationDate}`,
    };
  });
}

export function parseTpexIpoListingSource(payload: unknown): IpoListingEvidenceRow[] {
  return requireRows(payload, "TPEx IPO no-limit", TPEX_IPO_NO_LIMIT_FIELDS).map((row) => {
    const companyCode = requiredCompanyCode(row.SecuritiesCompanyCode, "companyCode");
    const listingDate = requiredOfficialDate(row.Date, "listingDate");
    return {
      companyCode,
      companyName: requiredText(row.CompanyName, "companyName"),
      market: "上櫃",
      listingDate,
      finalUnderwritingPrice: optionalDecimal(row.UnderwritingPrice, "underwritingPrice"),
      underwriter: optionalText(row.Underwriter) ?? "",
      sourceRecordId: `TPEx:ipo-no-limit:${companyCode}:${listingDate}`,
    };
  });
}

export function parseTwseAuctionSource(payload: unknown): IpoAuctionSourceRow[] {
  return requireTwseTable(payload, "TWSE auction", AUCTION_FIELDS).flatMap((row) => {
    const market = auctionMarket(row["發行市場"], row["發行性質"]);
    if (!market) return [];
    const companyCode = requiredCompanyCode(row["證券代號"], "companyCode");
    const auctionOpenDate = requiredOfficialDate(row["開標日期"], "auctionDate");
    return [{
      companyCode,
      companyName: requiredText(row["證券名稱"], "companyName"),
      market,
      bidStartDate: requiredOfficialDate(row["投標開始日"], "bidStartDate"),
      bidEndDate: requiredOfficialDate(row["投標結束日"], "bidEndDate"),
      auctionOpenDate,
      listingDate: optionalOfficialDate(row["撥券日期(上市、上櫃日期)"], "listingDate"),
      minimumBidPrice: optionalDecimal(row["最低投標價格(元)"], "minimumBidPrice"),
      finalUnderwritingPrice: optionalDecimal(row["實際承銷價格(元)"], "underwritingPrice"),
      underwriter: optionalText(row["主辦券商"]) ?? "",
      cancelled: optionalText(row["取消競價拍賣(流標或取消)"]) !== undefined,
      sourceRecordId: `TWSE:auction:${companyCode}:${auctionOpenDate}`,
    }];
  });
}

export function parseTwsePublicOfferingSource(payload: unknown): IpoPublicOfferingSourceRow[] {
  return requireTwseTable(payload, "TWSE public offering", PUBLIC_OFFERING_FIELDS).flatMap((row) => {
    const market = publicOfferingMarket(row["發行市場"]);
    if (!market) return [];
    const companyCode = requiredCompanyCode(row["證券代號"], "companyCode");
    const drawDate = requiredOfficialDate(row["抽籤日期"], "drawDate");
    return [{
      companyCode,
      companyName: requiredText(row["證券名稱"], "companyName"),
      market,
      subscriptionStartDate: requiredOfficialDate(row["申購開始日"], "subscriptionStartDate"),
      subscriptionEndDate: requiredOfficialDate(row["申購結束日"], "subscriptionEndDate"),
      drawDate,
      listingDate: optionalOfficialDate(row["撥券日期(上市、上櫃日期)"], "listingDate"),
      provisionalUnderwritingPrice: optionalDecimal(row["承銷價(元)"], "underwritingPrice"),
      finalUnderwritingPrice: optionalDecimal(row["實際承銷價(元)"], "underwritingPrice"),
      underwriter: optionalText(row["主辦券商"]) ?? "",
      cancelled: optionalText(row["取消公開抽籤 "]) !== undefined,
      sourceRecordId: `TWSE:public-offering:${companyCode}:${drawDate}`,
    }];
  });
}

function requireRows<T extends readonly string[]>(payload: unknown, source: string, fields: T): Array<Record<T[number], string>> {
  if (!Array.isArray(payload)) throw new IpoSourceValidationError(`${source} payload must be an array`);
  return payload.map((value, index) => {
    const row = requireRecord(value, `${source} row ${index + 1}`);
    assertExactKeys(row, fields, `${source} schema`);
    for (const field of fields) if (typeof row[field] !== "string") throw new IpoSourceValidationError(`${source}.${field} must be a string`);
    return row as Record<T[number], string>;
  });
}

function requireTwseTable<T extends readonly string[]>(payload: unknown, source: string, fields: T): Array<Record<T[number], string>> {
  const table = requireRecord(payload, `${source} payload`);
  assertAllowedTableKeys(table, source);
  if (!Array.isArray(table.fields) || !Array.isArray(table.data)) throw new IpoSourceValidationError(`${source} schema must contain fields and data arrays`);
  if (table.fields.length !== fields.length || table.fields.some((field, index) => field !== fields[index])) {
    throw new IpoSourceValidationError(`${source} field schema does not match the official response`);
  }
  return table.data.map((value, index) => {
    if (!Array.isArray(value) || value.length !== fields.length) throw new IpoSourceValidationError(`${source} row ${index + 1} does not match field schema`);
    if (value.some((cell) => typeof cell !== "string")) throw new IpoSourceValidationError(`${source} row ${index + 1} must contain string cells`);
    return Object.fromEntries(fields.map((field, fieldIndex) => [field, value[fieldIndex]])) as Record<T[number], string>;
  });
}

function assertAllowedTableKeys(value: Record<string, unknown>, source: string): void {
  const allowed = new Set(["stat", "date", "title", "fields", "data"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new IpoSourceValidationError(`${source} has unknown key: ${key}`);
  if ("stat" in value && value.stat !== "OK") throw new IpoSourceValidationError(`${source} status is not OK`);
  if ("date" in value && typeof value.date !== "string" && typeof value.date !== "number") throw new IpoSourceValidationError(`${source}.date must be a string or number`);
  if ("title" in value && typeof value.title !== "string") throw new IpoSourceValidationError(`${source}.title must be a string`);
}

function auctionMarket(issuingMarket: string, issuanceType: string): IpoMarket | null {
  if (issuingMarket === "集中交易市場" && issuanceType === "初上市") return "上市";
  if (issuingMarket === "創新板" && issuanceType === "創新板初上市") return "創新板";
  if (issuingMarket === "櫃檯買賣" && issuanceType === "初上櫃") return "上櫃";
  return null;
}

function publicOfferingMarket(issuanceType: string): IpoMarket | null {
  if (issuanceType === "初上市") return "上市";
  if (issuanceType === "創新板初上市") return "創新板";
  if (issuanceType === "初上櫃") return "上櫃";
  return null;
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new IpoSourceValidationError(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, fields: readonly string[], name: string): void {
  const actual = Object.keys(value);
  if (actual.length !== fields.length || actual.some((field) => !fields.includes(field))) {
    throw new IpoSourceValidationError(`${name} has unknown or missing fields`);
  }
}

function requiredCompanyCode(value: string, name: string): string {
  const companyCode = requiredText(value, name);
  if (!/^\d{4}$/.test(companyCode)) throw new IpoSourceValidationError(`${name} must be a four-digit company code`);
  return companyCode;
}

function requiredText(value: string, name: string): string {
  const text = optionalText(value);
  if (text === undefined) throw new IpoSourceValidationError(`${name} is required`);
  return text;
}

function optionalText(value: string): string | undefined {
  const text = value.trim();
  return text === "" || text === "-" || text === "--" || text === "---" ? undefined : text;
}

function requiredOfficialDate(value: string, name: string): string {
  const date = optionalOfficialDate(value, name);
  if (!date) throw new IpoSourceValidationError(`${name} is required`);
  return date;
}

function optionalOfficialDate(value: string, name: string): string | null {
  const text = optionalText(value);
  if (!text) return null;
  const match = /^(?:(\d{4})\/?(\d{2})\/?(\d{2})|(\d{3})\/?(\d{2})\/?(\d{2}))$/.exec(text);
  if (!match) throw new IpoSourceValidationError(`${name} must be a valid official date`);
  const date = match[1] ? `${match[1]}-${match[2]}-${match[3]}` : `${Number(match[4]) + 1911}-${match[5]}-${match[6]}`;
  if (!isIsoDate(date)) throw new IpoSourceValidationError(`${name} must be a valid official date`);
  return date;
}

function optionalDecimal(value: string, name: string): string | null {
  const text = optionalText(value);
  if (!text) return null;
  const normalized = text.replaceAll(",", "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new IpoSourceValidationError(`${name} must be a non-negative decimal`);
  return normalized.replace(/^0+(?=\d)/, "");
}
