import { isIsoDate } from "../domain/dates.ts";
import type {
  CbQuote,
  CbTradingMode,
  ConversionPriceVersion,
  StockClose,
} from "../market-data/types.ts";

const CB_QUOTE_FIELD_COUNT = 11;
const CONVERSION_INDEX_FIELDS = [
  "發行機構代碼",
  "發行機構名稱",
  "債券名稱",
  "掛牌日期",
  "發行資料",
] as const;
const TWSE_FIELDS = new Set([
  "Date",
  "Code",
  "Name",
  "TradeVolume",
  "TradeValue",
  "OpeningPrice",
  "HighestPrice",
  "LowestPrice",
  "ClosingPrice",
  "Change",
  "Transaction",
]);
const TPEX_FIELDS = new Set([
  "Date",
  "SecuritiesCompanyCode",
  "CompanyName",
  "Close",
  "Change",
  "Open",
  "High",
  "Low",
  "Average",
  "TradingShares",
  "TransactionAmount",
  "TransactionNumber",
  "LatestBidPrice",
  "LatesAskPrice",
  "Capitals",
  "NextReferencePrice",
  "NextLimitUp",
  "NextLimitDown",
]);

export function normalizeCbQuoteRow(
  bondCode: string,
  row: readonly string[],
): CbQuote {
  assertBondCode(bondCode);
  if (!Array.isArray(row) || row.length !== CB_QUOTE_FIELD_COUNT) {
    throw new TypeError("CB quote row must contain exactly 11 fields");
  }
  assertStringCells(row, "CB quote row");

  const tradingMode = normalizeTradingMode(row[1]);
  return {
    bondCode,
    tradingDate: normalizeOfficialDate(row[0]),
    tradingMode,
    close: optionalDecimal(row[2], "close"),
    change: optionalSignedDecimal(row[3], "change"),
    open: optionalDecimal(row[4], "open"),
    high: optionalDecimal(row[5], "high"),
    low: optionalDecimal(row[6], "low"),
    tradeCount: integerOrZero(row[7], "tradeCount"),
    tradingUnits: integerOrZero(row[8], "tradingUnits"),
    turnover: integerOrZero(row[9], "turnover"),
    average: optionalDecimal(row[10], "average"),
  };
}

export function normalizeTwseStockClose(
  row: Record<string, string>,
): StockClose {
  assertOfficialRow(row, TWSE_FIELDS, "TWSE stock close");
  return {
    companyCode: companyCode(row.Code),
    market: "listed",
    tradingDate: normalizeOfficialDate(row.Date),
    close: requiredDecimal(row.ClosingPrice, "ClosingPrice"),
    change: requiredSignedDecimal(row.Change, "Change"),
    volume: requiredInteger(row.TradeVolume, "TradeVolume"),
    turnover: requiredInteger(row.TradeValue, "TradeValue"),
  };
}

export function normalizeTpexStockClose(
  row: Record<string, string>,
): StockClose {
  assertOfficialRow(row, TPEX_FIELDS, "TPEx stock close");
  const change = normalizeTpexChange(row.Change);
  return {
    companyCode: companyCode(row.SecuritiesCompanyCode),
    market: "otc",
    tradingDate: normalizeOfficialDate(row.Date),
    close: requiredDecimal(row.Close, "Close"),
    ...change,
    volume: requiredInteger(row.TradingShares, "TradingShares"),
    turnover: requiredInteger(row.TransactionAmount, "TransactionAmount"),
  };
}

function normalizeTpexChange(
  value: string,
): Pick<StockClose, "change" | "changeEvent"> {
  if (value.trim() === "除息") {
    return { change: null, changeEvent: "ex-dividend" };
  }
  return { change: requiredSignedDecimal(value, "Change") };
}

export function parseConversionIndex(payload: unknown): readonly {
  bondCode: string;
  issuerCode: string;
  officialDetailUrl: string;
}[] {
  const root = requireRecord(payload, "conversion index");
  if (!Array.isArray(root.tables) || root.tables.length === 0) {
    throw new TypeError("conversion index must contain tables");
  }
  const table = requireRecord(root.tables[0], "conversion index table");
  if (
    !Array.isArray(table.fields)
    || table.fields.length !== CONVERSION_INDEX_FIELDS.length
    || !table.fields.every((field, index) => field === CONVERSION_INDEX_FIELDS[index])
  ) {
    throw new TypeError("conversion index fields do not match the verified contract");
  }
  if (!Array.isArray(table.data)) {
    throw new TypeError("conversion index data must be an array");
  }

  const seen = new Set<string>();
  return table.data.map((value, index) => {
    if (!Array.isArray(value) || value.length !== CONVERSION_INDEX_FIELDS.length) {
      throw new TypeError(`conversion index row ${index + 1} must contain 5 fields`);
    }
    assertStringCells(value, `conversion index row ${index + 1}`);
    const issuerCode = companyCode(value[0]);
    const officialDetailUrl = requireApprovedMopsUrl(value[4]);
    const url = new URL(officialDetailUrl);
    const bondCode = url.searchParams.get("bond_id") ?? "";
    const urlIssuerCode = url.searchParams.get("issuer_stock_code") ?? "";
    assertBondCode(bondCode);
    if (urlIssuerCode !== issuerCode) {
      throw new TypeError("MOPS detail issuer code does not match conversion index");
    }
    if (seen.has(bondCode)) {
      throw new TypeError(`conversion index contains duplicate bond code: ${bondCode}`);
    }
    seen.add(bondCode);
    return { bondCode, issuerCode, officialDetailUrl };
  });
}

export function parseMopsConversionPrice(
  html: string,
  officialDetailUrl: string,
): ConversionPriceVersion {
  if (typeof html !== "string" || html.trim() === "") {
    throw new TypeError("MOPS detail HTML must be a non-empty string");
  }
  const approvedUrl = requireApprovedMopsUrl(officialDetailUrl);
  const url = new URL(approvedUrl);
  const bondCode = url.searchParams.get("bond_id") ?? "";
  const issuerCode = url.searchParams.get("issuer_stock_code") ?? "";
  assertBondCode(bondCode);
  companyCode(issuerCode);

  const text = htmlToText(html);
  const initialConversionPrice = extractMopsDecimal(
    text,
    /發行時轉\(交\)換價格[：:]\s*([0-9][0-9,.]*)\s*元/,
  );
  const currentConversionPrice = extractMopsDecimal(
    text,
    /最新轉\(交\)換價格[：:]\s*([0-9][0-9,.]*)\s*元/,
  );
  const dateMatch =
    /最近轉\(交\)換價格生效日期[：:]\s*(\d{3}\/\d{2}\/\d{2})/.exec(text);
  if (
    initialConversionPrice === null
    || currentConversionPrice === null
    || dateMatch === null
  ) {
    throw new TypeError("missing MOPS conversion field");
  }
  if (currentConversionPrice === "0") {
    throw new TypeError("invalid current conversion price");
  }

  return {
    bondCode,
    issuerCode,
    initialConversionPrice,
    currentConversionPrice,
    effectiveDate: normalizeOfficialDate(dateMatch[1]),
    officialDetailUrl: approvedUrl,
  };
}

function normalizeTradingMode(value: string): CbTradingMode {
  if (value === "等價") return "equivalent";
  if (value === "議價") return "negotiated";
  throw new TypeError(`unknown CB trading mode: ${value}`);
}

function normalizeOfficialDate(value: string): string {
  const text = value.trim();
  let isoDate: string | undefined;
  let match: RegExpExecArray | null;
  if ((match = /^(\d{3})(\d{2})(\d{2})$/.exec(text))) {
    isoDate = `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  } else if ((match = /^(\d{3})\/(\d{2})\/(\d{2})$/.exec(text))) {
    isoDate = `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  } else if ((match = /^(\d{4})(\d{2})(\d{2})$/.exec(text))) {
    isoDate = `${match[1]}-${match[2]}-${match[3]}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    isoDate = text;
  }
  if (isoDate === undefined || !isIsoDate(isoDate)) {
    throw new TypeError(`invalid official date: ${value}`);
  }
  return isoDate;
}

function optionalDecimal(value: string, name: string): string | null {
  return value.trim() === "" ? null : normalizeDecimal(value, name, false);
}

function optionalSignedDecimal(value: string, name: string): string | null {
  return value.trim() === "" ? null : normalizeDecimal(value, name, true);
}

function requiredDecimal(value: string, name: string): string {
  if (value.trim() === "") throw new TypeError(`${name} is required`);
  return normalizeDecimal(value, name, false);
}

function requiredSignedDecimal(value: string, name: string): string {
  if (value.trim() === "") throw new TypeError(`${name} is required`);
  return normalizeDecimal(value, name, true);
}

function normalizeDecimal(value: string, name: string, signed: boolean): string {
  const text = value.trim().replaceAll(",", "");
  const pattern = signed
    ? /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
    : /^(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (!pattern.test(text)) {
    throw new TypeError(`${name} must be a valid decimal`);
  }

  const negative = text.startsWith("-");
  const unsigned = text.replace(/^[+-]/, "");
  const [rawInteger = "0", rawFraction = ""] = unsigned.split(".");
  const integer = (rawInteger || "0").replace(/^0+(?=\d)/, "");
  const fraction = rawFraction.replace(/0+$/, "");
  const magnitude = fraction === "" ? integer : `${integer}.${fraction}`;
  if (/^0(?:\.0*)?$/.test(magnitude)) return "0";
  return negative ? `-${magnitude}` : magnitude;
}

function integerOrZero(value: string, name: string): string {
  return value.trim() === "" ? "0" : requiredInteger(value, name);
}

function requiredInteger(value: string, name: string): string {
  const text = value.trim();
  if (!/^(?:0|[1-9]\d{0,2}(?:,\d{3})*|[1-9]\d*)$/.test(text)) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return BigInt(text.replaceAll(",", "")).toString();
}

function extractMopsDecimal(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  return match ? requiredDecimal(match[1], "MOPS conversion price") : null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#160;", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requireApprovedMopsUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("unapproved MOPS detail URL");
  }
  if (
    url.protocol !== "https:"
    || url.hostname !== "mopsov.twse.com.tw"
    || url.pathname !== "/mops/web/t120sg01"
    || url.username !== ""
    || url.password !== ""
  ) {
    throw new TypeError("unapproved MOPS detail URL");
  }
  return url.toString();
}

function companyCode(value: string): string {
  const text = value.trim().toUpperCase();
  if (!/^[0-9A-Z]{4,6}$/.test(text)) {
    throw new TypeError(`invalid company code: ${value}`);
  }
  return text;
}

function assertBondCode(value: string): void {
  if (!/^\d{5,6}$/.test(value)) {
    throw new TypeError(`invalid bond code: ${value}`);
  }
}

function assertStringCells(
  values: readonly unknown[],
  name: string,
): asserts values is string[] {
  for (const [index, value] of values.entries()) {
    if (typeof value !== "string") {
      throw new TypeError(`${name} field ${index + 1} must be a string`);
    }
  }
}

function assertOfficialRow(
  value: unknown,
  allowedFields: ReadonlySet<string>,
  name: string,
): asserts value is Record<string, string> {
  const record = requireRecord(value, name);
  for (const key of Object.keys(record)) {
    if (!allowedFields.has(key)) {
      throw new TypeError(`${name} has unknown field: ${key}`);
    }
    if (typeof record[key] !== "string") {
      throw new TypeError(`${name}.${key} must be a string`);
    }
  }
  for (const field of allowedFields) {
    if (!(field in record)) {
      throw new TypeError(`${name} is missing field: ${field}`);
    }
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}
