import readXlsxFile, { readSheetNames } from "read-excel-file/node";

import { isIsoDate } from "./contracts.mjs";

const CBAS_SHEETS = new Set([
  "金融交易部資產交換選擇權報價表",
  "即將到期",
  "轉(交)換公司債停止轉(交)換資訊",
]);

export async function parseCbasWorkbook(input) {
  const sheetNames = await readSheetNames(input.absolutePath);
  assertExactCbasSheetNames(sheetNames);
  const [quoteRows, dueRows, stopRows] = await Promise.all([
    readXlsxFile(input.absolutePath, { sheet: "金融交易部資產交換選擇權報價表" }),
    readXlsxFile(input.absolutePath, { sheet: "即將到期" }),
    readXlsxFile(input.absolutePath, { sheet: "轉(交)換公司債停止轉(交)換資訊" }),
  ]);
  return Object.freeze({
    ...parseCbasRows({ quoteRows, dueRows, stopRows }),
    kind: "cbas",
    sourceRights: input.sourceRights,
    sha256: input.sha256,
    diagnostics: [],
  });
}

export function assertExactCbasSheetNames(names) {
  if (!Array.isArray(names) || names.length !== CBAS_SHEETS.size) {
    throw new TypeError("unknown CBAS worksheet layout");
  }
  for (const name of names) {
    if (!CBAS_SHEETS.has(name)) throw new TypeError(`unknown CBAS worksheet: ${String(name)}`);
  }
}

export function parseCbasRows({ quoteRows, dueRows, stopRows } = {}) {
  const sourceDate = reportDate(quoteRows);
  const quoteHeader = headerIndex(quoteRows, (row) => value(row[1]) === "代號");
  const dueHeader = headerIndex(dueRows, (row) => value(row[1]) === "標的");
  const stopHeader = headerIndex(stopRows, (row) => value(row[0]).includes("債券代碼"));
  if (quoteHeader < 0 || dueHeader < 0 || stopHeader < 0) throw new TypeError("CBAS worksheet headers are invalid");
  const quoteRecords = uniqueRows(rowsBeforeQuoteFootnotes(quoteRows.slice(quoteHeader + 1)), "CBAS quote", (row) => mapQuote(row));
  const dueRecords = uniqueRows(dueRows.slice(dueHeader + 1), "CBAS due", (row) => mapDue(row));
  const conversionStops = uniqueRows(stopRows.slice(stopHeader + 1), "CBAS conversion stop", (row) => mapStop(row), (record) => `${record.bondCode}:${record.startDate}`);
  return Object.freeze({
    sourceDate,
    quoteRecords,
    dueRecords,
    conversionStops,
    records: quoteRecords,
  });
}

function rowsBeforeQuoteFootnotes(rows) {
  const end = rows.findIndex((row) => value(row?.[0]).startsWith("權利金試算"));
  return end < 0 ? rows : rows.slice(0, end);
}

function reportDate(rows) {
  const row = Array.isArray(rows) ? rows.find((candidate) => value(candidate?.[1]).includes("日期")) : undefined;
  const date = isoDate(row?.[2], "CBAS report date");
  return date;
}

function headerIndex(rows, predicate) {
  return Array.isArray(rows) ? rows.findIndex((row) => Array.isArray(row) && predicate(row)) : -1;
}

function uniqueRows(rows, label, mapper, identity = (record) => record.bondCode) {
  const seen = new Map();
  const result = [];
  for (const row of rows.filter((candidate) => Array.isArray(candidate) && candidate.some((cell) => value(cell) !== ""))) {
    const record = mapper(row);
    const key = identity(record);
    const prior = seen.get(key);
    if (prior) {
      if (JSON.stringify(prior) !== JSON.stringify(record)) throw new TypeError(`${label} contains duplicate canonical key: ${key}`);
      continue;
    }
    const frozen = Object.freeze(record);
    seen.set(key, frozen);
    result.push(frozen);
  }
  return result;
}

function mapQuote(row) {
  return {
    bondName: requiredText(row[0], "CBAS quote name"),
    bondCode: bondCode(row[1], "CBAS quote bond code"),
    guarantee: optionalText(row[2]),
    tcri: optionalText(row[3]),
    optionQuote: optionalNumber(row[4], "CBAS option quote"),
    discountRate: optionalNumber(row[5], "CBAS discount rate"),
    optionExpiryDate: optionalDate(row[6], "CBAS option expiry date"),
    putDate: optionalDate(row[7], "CBAS put date"),
    yearsToPut: optionalNumber(row[8], "CBAS years to put"),
    putPrice: optionalNumber(row[9], "CBAS put price"),
    conversionPrice: optionalNumber(row[10], "CBAS conversion price"),
    conversionValue: optionalNumber(row[11], "CBAS conversion value"),
    cbMarketPrice: optionalNumber(row[12], "CBAS market price"),
    premiumDiscountRate: optionalNumber(row[13], "CBAS premium discount rate"),
    referenceQuote: optionalNumber(row[14], "CBAS reference quote"),
    remainingBalance: optionalNumber(row[15], "CBAS remaining balance"),
    issueLots: optionalNumber(row[16], "CBAS issue lots"),
    volatility21d: optionalNumber(row[17], "CBAS volatility"),
    underwritingRestriction: optionalText(row[18]),
    spread: optionalNumber(row[22], "CBAS spread"),
  };
}

function mapDue(row) {
  return {
    status: requiredText(row[0], "CBAS due status"),
    bondCode: bondCode(row[1], "CBAS due bond code"),
    bondName: requiredText(row[2], "CBAS due name"),
    cbMarketPrice: optionalNumber(row[3], "CBAS due market price"),
    putPrice: optionalNumber(row[4], "CBAS due put price"),
    putDate: optionalDate(row[5], "CBAS due put date"),
    remainingBalance: optionalNumber(row[6], "CBAS due remaining balance"),
    circulationRatio: optionalNumber(row[7], "CBAS due circulation ratio"),
    maturityDate: optionalDate(row[8], "CBAS due maturity date"),
    forceRedemptionDate: optionalDate(row[9], "CBAS force redemption date"),
  };
}

function mapStop(row) {
  return {
    bondCode: bondCode(row[0], "CBAS conversion stop bond code"),
    bondName: requiredText(row[1], "CBAS conversion stop name"),
    startDate: isoDate(row[2], "CBAS conversion stop start date"),
    dueDate: isoDate(row[3], "CBAS conversion stop due date"),
    reason: requiredText(row[4], "CBAS conversion stop reason"),
  };
}

function bondCode(cell, label) {
  const text = value(cell);
  if (!/^\d{5,6}$/.test(text)) throw new TypeError(`${label} must be a five or six digit code`);
  return text;
}

function requiredText(cell, label) {
  const text = value(cell);
  if (!text) throw new TypeError(`${label} is required`);
  return text;
}

function optionalText(cell) {
  const text = value(cell);
  return text === "" ? null : text;
}

function optionalNumber(cell, label) {
  if (cell === null || cell === undefined || value(cell) === "") return null;
  const number = Number(cell);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number`);
  return number;
}

function optionalDate(cell, label) {
  if (cell === null || cell === undefined || ["", "-", "--", "—", "－"].includes(value(cell))) return null;
  return isoDate(cell, label);
}

function isoDate(cell, label) {
  const date = cell instanceof Date ? cell.toISOString().slice(0, 10) : value(cell).replaceAll("/", "-");
  if (!isIsoDate(date)) throw new TypeError(`${label} must be a valid ISO date`);
  return date;
}

function value(cell) {
  return cell === null || cell === undefined ? "" : String(cell).trim();
}
