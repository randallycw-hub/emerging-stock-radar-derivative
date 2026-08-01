import { isIsoDate } from "../../lib/domain/dates.ts";
import {
  normalizeCbQuoteRow,
  normalizeTpexStockClose,
  normalizeTwseStockClose,
  parseConversionIndex,
  parseMopsConversionPrice,
} from "../../lib/source-verification/source-cb-market.ts";
import { mapLimit } from "./map-limit.mjs";

const TPEX_CB_QUOTE =
  "https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry";
const TWSE_CLOSE =
  "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
const TPEX_CLOSE =
  "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes";
const TPEX_CONVERSION_INDEX =
  "https://www.tpex.org.tw/www/zh-tw/bond/convSearch";
const TWSE_MONTHLY_STOCK =
  "https://www.twse.com.tw/exchangeReport/STOCK_DAY";
const TPEX_MONTHLY_STOCK =
  "https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock";
const CB_QUOTE_FIELDS = [
  "日期",
  "交易模式",
  "收市價",
  "漲跌",
  "開市價",
  "最高價",
  "最低價",
  "成交筆數",
  "單位",
  "成交金額(元)",
  "平均價",
];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const MOPS_PARSE_MAX_ATTEMPTS = 5;
const MOPS_PARSE_RETRY_DELAY_MS = 2_000;

export async function fetchMopsDetail(
  officialDetailUrl,
  fetchImpl = fetch,
) {
  assertApprovedMopsUrl(officialDetailUrl);
  return fetchTextWithRetry(
    officialDetailUrl,
    {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "EmergingStockRadar/1.0 official-eod-collector",
      },
    },
    fetchImpl,
    "text/html",
  );
}

export async function fetchMopsConversionPrice(
  entry,
  fetchImpl = fetch,
  sleepImpl = sleep,
) {
  for (let attempt = 1; attempt <= MOPS_PARSE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return parseMopsConversionPrice(
        await fetchMopsDetail(entry.officialDetailUrl, fetchImpl),
        entry.officialDetailUrl,
      );
    } catch (error) {
      const retryableMissingFields = (
        error instanceof TypeError
        && error.message === "missing MOPS conversion field"
      );
      if (!retryableMissingFields || attempt === MOPS_PARSE_MAX_ATTEMPTS) {
        throw new Error(
          `MOPS_CONVERSION_PARSE_FAILED:${entry.bondCode}:${entry.officialDetailUrl}`,
          { cause: error },
        );
      }
      await sleepImpl(MOPS_PARSE_RETRY_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  throw new Error(`MOPS_CONVERSION_PARSE_FAILED:${entry.bondCode}`);
}

export async function fetchCurrentOfficialMarketData({
  bondCodes,
  issuerCodes,
  date,
  fetchImpl = fetch,
  sleepImpl = sleep,
  perRequestDelayMs = 350,
  checkpoint = {},
  onCheckpoint = async () => {},
}) {
  if (!isIsoDate(date)) throw new TypeError("date must be a valid ISO date");
  if (!Number.isInteger(perRequestDelayMs) || perRequestDelayMs < 0) {
    throw new TypeError("perRequestDelayMs must be a non-negative integer");
  }
  const requestedBondCodes = uniqueCodes(bondCodes, /^\d{5,6}$/, "bond code");
  const requestedIssuerCodes = uniqueCodes(
    issuerCodes,
    /^[0-9A-Z]{4,6}$/,
    "issuer code",
  );
  const issuerSet = new Set(requestedIssuerCodes);
  const bondSet = new Set(requestedBondCodes);

  const [twsePayload, tpexPayload] = await mapLimit(
    [TWSE_CLOSE, TPEX_CLOSE],
    2,
    (url) => fetchJsonWithRetry(url, {}, fetchImpl),
  );
  if (!Array.isArray(twsePayload) || !Array.isArray(tpexPayload)) {
    throw new TypeError("official stock close payload must be an array");
  }
  const stockCloses = [
    ...twsePayload
      .filter((row) => issuerSet.has(recordCode(row, "Code")))
      .map(normalizeTwseStockClose),
    ...tpexPayload
      .filter((row) => issuerSet.has(recordCode(row, "SecuritiesCompanyCode")))
      .filter(hasPublishedTpexClose)
      .map(normalizeTpexStockClose),
  ];

  const conversionBody = new URLSearchParams({
    name: "bondIssuer",
    searchNo: "",
    response: "json",
  });
  const conversionPayload = await fetchJsonWithRetry(
    TPEX_CONVERSION_INDEX,
    postOptions(conversionBody),
    fetchImpl,
  );
  const conversionEntries = parseConversionIndex(conversionPayload)
    .filter((entry) => bondSet.has(entry.bondCode));

  const requestDate = date.replaceAll("-", "/");
  const quoteGroups = await mapLimit(requestedBondCodes, 1, async (bondCode) => {
    const cached = checkpoint.cbQuotesByBondCode?.[bondCode];
    if (
      Array.isArray(cached)
      && cached.some((quote) => quote?.tradingDate === date)
    ) return cached;
    await sleepImpl(perRequestDelayMs);
    const body = new URLSearchParams({
      date: requestDate,
      code: bondCode,
      response: "json",
    });
    const payload = await fetchJsonWithRetry(
      TPEX_CB_QUOTE,
      postOptions(body),
      fetchImpl,
    );
    const table = verifiedCbQuoteTable(payload);
    const values = table.data.map((row) => normalizeCbQuoteRow(bondCode, row));
    await onCheckpoint({
      kind: "cbQuotesByBondCode",
      key: bondCode,
      value: values,
    });
    return values;
  });

  const conversionPrices = await mapLimit(
    conversionEntries,
    1,
    async (entry) => {
      const cached = checkpoint.conversionPricesByBondCode?.[entry.bondCode];
      if (
        cached !== null
        && typeof cached === "object"
        && !Array.isArray(cached)
      ) {
        return cached;
      }
      await sleepImpl(perRequestDelayMs);
      const value = await fetchMopsConversionPrice(
        entry,
        fetchImpl,
        sleepImpl,
      );
      await onCheckpoint({
        kind: "conversionPricesByBondCode",
        key: entry.bondCode,
        value,
      });
      return value;
    },
  );

  return {
    requestedDate: date,
    cbQuotes: quoteGroups.flat(),
    stockCloses,
    conversionPrices,
    sourceUrls: [
      TPEX_CB_QUOTE,
      TWSE_CLOSE,
      TPEX_CLOSE,
      TPEX_CONVERSION_INDEX,
      ...conversionEntries.map((entry) => entry.officialDetailUrl),
    ],
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchCbMonthlyHistory({
  bondCode,
  month,
  fetchImpl = fetch,
}) {
  const code = uniqueCodes([bondCode], /^\d{5,6}$/, "bond code")[0];
  const monthStart = officialMonthStart(month);
  const body = new URLSearchParams({
    date: monthStart,
    code,
    response: "json",
  });
  const payload = await fetchJsonWithRetry(
    TPEX_CB_QUOTE,
    postOptions(body),
    fetchImpl,
  );
  return verifiedCbQuoteTable(payload).data.map(
    (row) => normalizeCbQuoteRow(code, row),
  );
}

export async function fetchTwseMonthlyStockHistory({
  issuerCode,
  month,
  fetchImpl = fetch,
}) {
  const code = uniqueCodes(
    [issuerCode],
    /^[0-9A-Z]{4,6}$/,
    "issuer code",
  )[0];
  const monthStart = officialMonthStart(month).replaceAll("/", "");
  const url = new URL(TWSE_MONTHLY_STOCK);
  url.searchParams.set("response", "json");
  url.searchParams.set("date", monthStart);
  url.searchParams.set("stockNo", code);
  const payload = await fetchJsonWithRetry(url.toString(), {}, fetchImpl);
  const table = verifiedMonthlyTable(
    payload,
    [
      "日期", "成交股數", "成交金額", "開盤價", "最高價",
      "最低價", "收盤價", "漲跌價差", "成交筆數", "註記",
    ],
    "TWSE monthly stock",
  );
  return table.data.map((row) => {
    assertMonthlyRow(row, 10, "TWSE monthly stock");
    return normalizeTwseStockClose({
      Date: row[0],
      Code: code,
      Name: "",
      TradeVolume: row[1],
      TradeValue: row[2],
      OpeningPrice: row[3],
      HighestPrice: row[4],
      LowestPrice: row[5],
      ClosingPrice: row[6],
      Change: row[7],
      Transaction: row[8],
    });
  });
}

export async function fetchTpexMonthlyStockHistory({
  issuerCode,
  month,
  fetchImpl = fetch,
}) {
  const code = uniqueCodes(
    [issuerCode],
    /^[0-9A-Z]{4,6}$/,
    "issuer code",
  )[0];
  const body = new URLSearchParams({
    code,
    date: officialMonthStart(month),
    response: "json",
  });
  const payload = await fetchJsonWithRetry(
    TPEX_MONTHLY_STOCK,
    postOptions(body),
    fetchImpl,
  );
  const table = verifiedMonthlyTable(
    Array.isArray(payload?.tables) ? payload.tables[0] : undefined,
    [
      "日 期", "成交張數", "成交仟元", "開盤",
      "最高", "最低", "收盤", "漲跌", "筆數",
    ],
    "TPEx monthly stock",
  );
  return table.data.map((row) => {
    assertMonthlyRow(row, 9, "TPEx monthly stock");
    return normalizeTpexStockClose({
      Date: row[0],
      SecuritiesCompanyCode: code,
      CompanyName: "",
      Close: row[6],
      Change: row[7],
      Open: row[3],
      High: row[4],
      Low: row[5],
      Average: row[6],
      TradingShares: multiplyIntegerText(row[1], 1000),
      TransactionAmount: multiplyIntegerText(row[2], 1000),
      TransactionNumber: row[8],
      LatestBidPrice: "",
      LatesAskPrice: "",
      Capitals: "",
      NextReferencePrice: "",
      NextLimitUp: "",
      NextLimitDown: "",
    });
  });
}

async function fetchJsonWithRetry(url, init, fetchImpl) {
  const text = await fetchTextWithRetry(
    url,
    init,
    fetchImpl,
    "application/json",
  );
  try {
    return JSON.parse(text);
  } catch {
    throw new TypeError(`INVALID_JSON:${url}`);
  }
}

async function fetchTextWithRetry(
  url,
  init,
  fetchImpl,
  expectedContentType,
) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, cloneRequestInit(init));
      if (!response.ok) {
        const error = new Error(`HTTP_${response.status}:${url}`);
        if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_ATTEMPTS) {
          throw error;
        }
        lastError = error;
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes(expectedContentType)) {
        throw new TypeError(`UNEXPECTED_CONTENT_TYPE:${url}:${contentType}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS || !isRetryableNetworkError(error)) throw error;
    }
  }
  throw lastError;
}

function cloneRequestInit(init) {
  return {
    ...init,
    headers: init.headers === undefined ? undefined : { ...init.headers },
    body: init.body instanceof URLSearchParams
      ? new URLSearchParams(init.body)
      : init.body,
  };
}

function postOptions(body) {
  return {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": "EmergingStockRadar/1.0 official-eod-collector",
    },
    body,
  };
}

function verifiedCbQuoteTable(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("CB quote payload must be an object");
  }
  const table = Array.isArray(payload.tables) ? payload.tables[0] : undefined;
  if (table === null || typeof table !== "object" || Array.isArray(table)) {
    throw new TypeError("CB quote payload must contain a table");
  }
  if (
    !Array.isArray(table.fields)
    || table.fields.length !== CB_QUOTE_FIELDS.length
    || !table.fields.every((field, index) => field === CB_QUOTE_FIELDS[index])
  ) {
    throw new TypeError("CB quote fields do not match the verified contract");
  }
  if (!Array.isArray(table.data)) {
    throw new TypeError("CB quote table data must be an array");
  }
  return table;
}

function verifiedMonthlyTable(payload, expectedFields, name) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError(`${name} payload must contain a table`);
  }
  if (
    !Array.isArray(payload.fields)
    || payload.fields.length !== expectedFields.length
    || !payload.fields.every((field, index) => field === expectedFields[index])
  ) {
    throw new TypeError(`${name} fields do not match the verified contract`);
  }
  if (!Array.isArray(payload.data)) {
    throw new TypeError(`${name} data must be an array`);
  }
  return payload;
}

function assertMonthlyRow(row, length, name) {
  if (!Array.isArray(row) || row.length !== length) {
    throw new TypeError(`${name} row must contain ${length} fields`);
  }
  if (row.some((value) => typeof value !== "string")) {
    throw new TypeError(`${name} row fields must be strings`);
  }
}

function multiplyIntegerText(value, multiplier) {
  const text = value.trim();
  if (!/^(?:0|[1-9]\d{0,2}(?:,\d{3})*|[1-9]\d*)$/.test(text)) {
    throw new TypeError("monthly amount must be a non-negative integer");
  }
  return (
    BigInt(text.replaceAll(",", "")) * BigInt(multiplier)
  ).toString();
}

function officialMonthStart(value) {
  if (typeof value !== "string" || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) {
    throw new TypeError("month must be YYYY-MM");
  }
  return `${value.replace("-", "/")}/01`;
}

function recordCode(value, key) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || typeof value[key] !== "string"
  ) {
    return "";
  }
  return value[key].trim().toUpperCase();
}

function hasPublishedTpexClose(row) {
  return !(
    row !== null
    && typeof row === "object"
    && !Array.isArray(row)
    && typeof row.Close === "string"
    && typeof row.Change === "string"
    && row.Close.trim() === "---"
    && row.Change.trim() === "---"
  );
}

function uniqueCodes(values, pattern, name) {
  if (!Array.isArray(values)) throw new TypeError(`${name}s must be an array`);
  const normalized = values.map((value) => {
    if (typeof value !== "string") throw new TypeError(`invalid ${name}`);
    const code = value.trim().toUpperCase();
    if (!pattern.test(code)) throw new TypeError(`invalid ${name}: ${value}`);
    return code;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`duplicate ${name}`);
  }
  return normalized.sort();
}

function assertApprovedMopsUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("URL_NOT_ALLOWED");
  }
  if (
    url.protocol !== "https:"
    || url.hostname !== "mopsov.twse.com.tw"
    || url.pathname !== "/mops/web/t120sg01"
    || url.username
    || url.password
  ) {
    throw new TypeError("URL_NOT_ALLOWED");
  }
}

function isRetryableNetworkError(error) {
  if (error instanceof TypeError && /^UNEXPECTED_CONTENT_TYPE|^INVALID_JSON/.test(error.message)) {
    return false;
  }
  return !(error instanceof Error && /^HTTP_\d+/.test(error.message));
}
