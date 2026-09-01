import { isIsoDate } from "../../lib/domain/dates.ts";
import { parseCbInstitutionDaily } from "../../lib/source-verification/source-cb-institution.ts";
import { parseCbRedemptionAnnouncements } from "../../lib/source-verification/source-cb-redemption.ts";
import {
  parseCbRedemptionDetail,
  validateApprovedCbRedemptionDetailUrl,
} from "../../lib/source-verification/source-cb-rights-event.ts";
import { parseCbUnderwritingHtml } from "../../lib/source-verification/source-cb-underwriting.ts";
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
const TPEX_CB_INSTITUTION =
  "https://www.tpex.org.tw/www/zh-tw/bond/newCb3itrade";
const TPEX_CB_REDEMPTION =
  "https://www.tpex.org.tw/www/zh-tw/bond/redeem";
const TWSA_CB_UNDERWRITING =
  "https://web.twsa.org.tw/edoc2/default.aspx";
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
const JSON_RESPONSE_MAX_BYTES = 500_000;
const HTML_RESPONSE_MAX_BYTES = 1_000_000;

export async function fetchCbSupplementalSources({
  date,
  fetchImpl = fetch,
}) {
  if (!isIsoDate(date)) throw new TypeError("date must be a valid ISO date");

  const institutionBody = new URLSearchParams({
    date: date.replaceAll("-", "/"),
    type: "Daily",
    id: "",
    response: "json",
  });
  const redemptionBody = new URLSearchParams({
    date: date.slice(0, 4),
    id: "",
    response: "json",
  });
  const institutionRequest = fetchJsonWithRetry(
      TPEX_CB_INSTITUTION,
      supplementalPostOptions(institutionBody),
      fetchImpl,
      JSON_RESPONSE_MAX_BYTES,
    ).then((payload) => {
      const parsed = parseCbInstitutionDaily(payload);
      if (parsed.tradingDate !== date) {
        throw new TypeError("SUPPLEMENTAL_INSTITUTION_DATE_MISMATCH");
      }
      return parsed;
    });
  const redemptionRequest = fetchJsonWithRetry(
      TPEX_CB_REDEMPTION,
      supplementalPostOptions(redemptionBody),
      fetchImpl,
      JSON_RESPONSE_MAX_BYTES,
    ).then((payload) => {
      const parsed = parseCbRedemptionAnnouncements(payload);
      if (payload.date !== `${date.slice(0, 4)}0101`) {
        throw new TypeError("SUPPLEMENTAL_REDEMPTION_YEAR_MISMATCH");
      }
      return parsed;
    });
  const underwritingRequest = fetchTextWithRetry(
      TWSA_CB_UNDERWRITING,
      {
        method: "GET",
        redirect: "error",
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "EmergingStockRadar/1.0 official-eod-collector",
        },
      },
      fetchImpl,
      "text/html",
      HTML_RESPONSE_MAX_BYTES,
    ).then((html) => {
      const parsed = parseCbUnderwritingHtml(html);
      if (parsed.rocYear + 1911 !== Number(date.slice(0, 4))) {
        throw new TypeError("SUPPLEMENTAL_UNDERWRITING_YEAR_MISMATCH");
      }
      return parsed;
    });
  // Detail pages are only requested from already parsed TPEx discovery rows.  The
  // function below validates the MOPS URL contract again before every request.
  const redemptionDetailsRequest = redemptionRequest.then((entries) =>
    fetchCbRedemptionDetails(entries, fetchImpl),
  );
  const [institution, redemption, underwriting, redemptionDetails] = await Promise.allSettled([
    institutionRequest,
    redemptionRequest,
    underwritingRequest,
    redemptionDetailsRequest,
  ]);
  return { institution, redemption, underwriting, redemptionDetails };
}

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

export async function fetchMopsRedemptionDetail(
  officialDetailUrl,
  fetchImpl = fetch,
) {
  validateApprovedCbRedemptionDetailUrl(officialDetailUrl);
  return fetchTextWithRetry(
    officialDetailUrl,
    {
      method: "GET",
      redirect: "error",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "EmergingStockRadar/1.0 official-eod-collector",
      },
    },
    fetchImpl,
    "text/html",
    HTML_RESPONSE_MAX_BYTES,
  );
}

export async function fetchCbRedemptionDetails(
  entries,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
) {
  if (!Array.isArray(entries)) throw new TypeError("CB_REDEMPTION_DISCOVERY_INVALID");
  const fetchedAt = now();
  const results = [];
  // The official endpoint is deliberately kept sequential: a source failure makes
  // this dataset fall back to its last-known-good snapshot rather than publishing
  // a partial set of rights events.
  for (const entry of entries) {
    validateApprovedCbRedemptionDetailUrl(entry.detailUrl);
    const html = await fetchMopsRedemptionDetail(entry.detailUrl, fetchImpl);
    results.push(parseCbRedemptionDetail(html, entry, fetchedAt));
  }
  return Object.freeze(results);
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
      .filter(hasPublishedTwseClose)
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
    ) return cached.filter((quote) => quote?.tradingDate === date);
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
    const values = table.data
      .map((row) => normalizeCbQuoteRow(bondCode, row))
      .filter((quote) => quote.tradingDate === date);
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

async function fetchJsonWithRetry(url, init, fetchImpl, maxBytes) {
  const text = await fetchTextWithRetry(
    url,
    init,
    fetchImpl,
    "application/json",
    maxBytes,
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
  maxBytes,
) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, cloneRequestInit(init));
      if (response.redirected) {
        throw new TypeError(`REDIRECT_NOT_ALLOWED:${url}`);
      }
      if (!response.ok) {
        const error = new Error(`HTTP_${response.status}:${url}`);
        if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_ATTEMPTS) {
          throw error;
        }
        lastError = error;
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "";
      const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
      if (mediaType !== expectedContentType) {
        throw new TypeError(`UNEXPECTED_CONTENT_TYPE:${url}:${contentType}`);
      }
      return await readBoundedText(response, url, maxBytes);
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS || !isRetryableNetworkError(error)) throw error;
    }
  }
  throw lastError;
}

async function readBoundedText(response, url, maxBytes) {
  if (maxBytes === undefined) return response.text();
  const contentLength = response.headers.get("content-length");
  if (/^\d+$/.test(contentLength ?? "") && Number(contentLength) > maxBytes) {
    throw new TypeError(`RESPONSE_TOO_LARGE:${url}:${maxBytes}`);
  }
  if (response.body === null || typeof response.body.getReader !== "function") {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new TypeError(`RESPONSE_TOO_LARGE:${url}:${maxBytes}`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      throw new TypeError(`RESPONSE_TOO_LARGE:${url}:${maxBytes}`);
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return chunks.join("");
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

function supplementalPostOptions(body) {
  return {
    ...postOptions(body),
    redirect: "error",
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

function hasPublishedTwseClose(row) {
  return !(
    row !== null
    && typeof row === "object"
    && !Array.isArray(row)
    && typeof row.ClosingPrice === "string"
    && row.ClosingPrice.trim() === ""
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
  if (error instanceof TypeError && /^(?:UNEXPECTED_CONTENT_TYPE|INVALID_JSON|REDIRECT_NOT_ALLOWED|RESPONSE_TOO_LARGE)/.test(error.message)) {
    return false;
  }
  return !(error instanceof Error && /^HTTP_\d+/.test(error.message));
}
