import { QUOTE_SNAPSHOT } from "./quote-snapshot";
import COMPANY_BASIC_SNAPSHOT from "./company-basic-snapshot.json";

export const INDUSTRIES: Record<string, string> = {
  "02": "食品工業", "03": "塑膠工業", "04": "紡織纖維", "05": "電機機械",
  "06": "電器電纜", "08": "玻璃陶瓷", "10": "鋼鐵工業", "11": "橡膠工業",
  "14": "建材營造", "15": "航運業", "16": "觀光餐旅", "17": "金融業",
  "20": "其他", "21": "化學工業", "22": "生技醫療", "23": "油電燃氣",
  "24": "半導體", "25": "電腦及週邊", "26": "光電業", "27": "通信網路",
  "28": "電子零組件", "29": "電子通路", "30": "資訊服務", "31": "其他電子",
  "32": "文化創意", "33": "農業科技", "35": "綠能環保", "36": "數位雲端",
  "37": "運動休閒", "38": "居家生活", "80": "管理股票"
};

const QUOTE_OPENAPI_URL = "https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics";
const QUOTE_CSV_URL = "https://www.tpex.org.tw/web/emergingstock/lateststats/new_dl.php";
const QUOTE_LEGACY_URL = "https://www.tpex.org.tw/www/zh-tw/emerging/latest?id=&response=json";
const BASIC_URL = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R";

type RawBasic = Record<string, string>;
type RawQuote = { value?: Array<string | number | null> } | Array<string | number | null>;
type QuoteRecord = Record<string, unknown>;

let marketCache: { at: number; value: MarketPayload } | null = null;
let basicCache: { at: number; value: RawBasic[] } | null = null;

export type MarketRow = {
  code: string; name: string; fullName: string; industry: string; industryCode: string;
  listedDate: string;
  latest: number | null; previousAverage: number | null; average: number | null;
  bid: number | null; ask: number | null; bidQuantity: number; askQuantity: number;
  high: number | null; low: number | null; volume: number; turnover: number;
  change: number | null; qualified: boolean; lowLiquidity: boolean;
  buySell: string; suspended: boolean; quoteDate: string; website: string;
};

export type MarketPayload = {
  generatedAt: string; quoteDate: string; quoteTime: string; stale: boolean;
  source: "openapi" | "csv" | "legacy" | "snapshot";
  rows: MarketRow[]; summary: Record<string, string | number>;
};

export async function getMarketData(force = false): Promise<MarketPayload> {
  if (!force && marketCache && Date.now() - marketCache.at < 55_000) return marketCache.value;
  const [quoteJson, basics] = await Promise.all([fetchQuoteJson(), getBasicRows()]);
  const basicMap = new Map(basics.map(x => [String(x.SecuritiesCompanyCode || ""), x]));
  const normalized = normalizeQuoteResponse(quoteJson);
  const officialStamp = parseRocDateTime(normalized.date);
  const rows: MarketRow[] = normalized.rows.map((record: QuoteRecord) => {
    const get = (...names: string[]) => {
      for (const name of names) {
        if (record[name] !== undefined && record[name] !== null) return record[name];
      }
      return "";
    };
    const code = String(get("代號") || "").trim();
    const basic = basicMap.get(code) || {};
    const previousAverage = num(get("前日均價"));
    const average = num(get("日均價"));
    const latest = num(get("成交"));
    const volume = integer(get("成交量"));
    const turnover = Math.round((average || latest || 0) * volume);
    const change = average !== null && previousAverage !== null && previousAverage !== 0
      ? round((average - previousAverage) / previousAverage, 6) : null;
    const qualified = volume >= 10_000 && turnover >= 500_000;
    const suspendTime = String(get("暫停交易開始時間(時:分:秒)", "暫停交易開始時間") || "").trim();
    return {
      code,
      name: String(get("名稱") || basic.CompanyAbbreviation || "").trim(),
      fullName: String(basic.CompanyName || get("名稱") || "").trim(),
      industryCode: String(basic.SecuritiesIndustryCode || "").trim(),
      industry: INDUSTRIES[String(basic.SecuritiesIndustryCode || "").trim()] || "待確認",
      listedDate: normalizeDate(String(basic.DateOfListing || "")),
      latest, previousAverage, average,
      bid: num(get("報買價")), ask: num(get("報賣價")),
      bidQuantity: integer(get("報買量")), askQuantity: integer(get("報賣量")),
      high: num(get("日最高")), low: num(get("日最低")), volume, turnover, change,
      qualified, lowLiquidity: !qualified,
      buySell: String(get("投資人成交買賣別") || "").trim(),
      suspended: Boolean(suspendTime && !/^0+$/.test(suspendTime.replace(/:/g, ""))),
      quoteDate: officialStamp.date,
      website: normalizeWebsite(String(basic.WebAddress || ""))
    };
  }).filter(row => basicMap.size === 0 || basicMap.has(row.code));

  const presentCodes = new Set(rows.map(row => row.code));
  for (const basic of basics) {
    const code = String(basic.SecuritiesCompanyCode || "").trim();
    if (!/^\d{4}$/.test(code) || presentCodes.has(code)) continue;
    const industryCode = String(basic.SecuritiesIndustryCode || "").trim();
    rows.push({
      code,
      name: String(basic.CompanyAbbreviation || basic.CompanyName || "").trim(),
      fullName: String(basic.CompanyName || basic.CompanyAbbreviation || "").trim(),
      industryCode,
      industry: INDUSTRIES[industryCode] || "待確認",
      listedDate: normalizeDate(String(basic.DateOfListing || "")),
      latest: null,
      previousAverage: null,
      average: null,
      bid: null,
      ask: null,
      bidQuantity: 0,
      askQuantity: 0,
      high: null,
      low: null,
      volume: 0,
      turnover: 0,
      change: null,
      qualified: false,
      lowLiquidity: true,
      buySell: "",
      suspended: false,
      quoteDate: officialStamp.date,
      website: normalizeWebsite(String(basic.WebAddress || ""))
    });
  }
  rows.sort((a, b) => (b.change ?? -999) - (a.change ?? -999) || b.turnover - a.turnover || a.code.localeCompare(b.code));
  const dateTime = taipeiNowParts();
  const quoteDate = officialStamp.date || dateTime.date;
  const quoteTime = officialStamp.time || dateTime.time;
  const payload: MarketPayload = {
    generatedAt: `${dateTime.date} ${dateTime.time}`,
    quoteDate,
    quoteTime,
    source: normalized.source,
    stale: normalized.source === "snapshot" || (quoteDate ? quoteDate !== dateTime.date : false),
    rows,
    summary: {
      count: rows.length,
      qualified: rows.filter(x => x.qualified).length,
      rising: rows.filter(x => x.change !== null && x.change > 0).length,
      falling: rows.filter(x => x.change !== null && x.change < 0).length,
      flat: rows.filter(x => x.change === 0).length,
      lowLiquidity: rows.filter(x => x.lowLiquidity).length,
      turnover: rows.reduce((sum, x) => sum + x.turnover, 0)
    }
  };
  marketCache = { at: Date.now(), value: payload };
  return payload;
}

export async function getBasicRows(): Promise<RawBasic[]> {
  if (basicCache && Date.now() - basicCache.at < 6 * 60 * 60 * 1000) return basicCache.value;
  const response = await fetch(BASIC_URL, { headers: browserHeaders(), redirect: "error", signal: AbortSignal.timeout(6000) }).catch(() => null);
  let value: RawBasic[];
  if (response?.ok) {
    value = await response.json() as RawBasic[];
  } else {
    value = COMPANY_BASIC_SNAPSHOT as RawBasic[];
  }
  basicCache = { at: Date.now(), value };
  return value;
}

export function conceptTags(industry: string, text: string): string[] {
  const source = `${industry} ${text}`;
  const rules: Array<[RegExp, string]> = [
    [/人工智慧|\bAI\b|機器學習|生成式/i, "AI"], [/伺服器|資料中心|雲端運算/i, "伺服器/雲端"],
    [/半導體|晶圓|封裝測試|IC設計/i, "半導體"], [/散熱|熱管理/i, "散熱"],
    [/生技|醫療|新藥|藥品|醫材/i, "生技醫療"], [/太陽能|再生能源|儲能|綠能/i, "綠能/儲能"],
    [/電動車|充電樁|車用/i, "電動車"], [/機器人|自動化/i, "機器人/自動化"],
    [/資安|資訊安全/i, "資安"], [/衛星|低軌|航太/i, "衛星/航太"],
    [/5G|通訊|通信網路/i, "通訊"], [/遊戲|數位內容/i, "數位內容"]
  ];
  const found = rules.filter(([re]) => re.test(source)).map(([, label]) => label);
  if (!found.length && industry && industry !== "待確認") found.push(industry);
  return [...new Set(found)].slice(0, 3);
}

async function fetchQuoteJson() {
  const openApi = await fetch(QUOTE_OPENAPI_URL, {
    headers: browserHeaders(),
    cache: "no-store",
    redirect: "error"
  }).catch(() => null);
  if (openApi?.ok) return { source: "openapi", value: await openApi.json() };

  const csv = await fetch(QUOTE_CSV_URL, {
    headers: { ...browserHeaders(), Accept: "text/csv,text/plain,*/*" },
    cache: "no-store",
    redirect: "error"
  }).catch(() => null);
  if (csv?.ok) {
    const rows = await parseCsvResponse(csv).catch(() => []);
    if (rows.length) return { source: "csv", value: rows };
  }

  const legacy = await fetch(`${QUOTE_LEGACY_URL}&_=${Date.now()}`, {
    headers: { ...browserHeaders(), Referer: "https://www.tpex.org.tw/zh-tw/esb/trading/info/pricing.html", "Cache-Control": "no-cache" },
    cache: "no-store",
    redirect: "error"
  }).catch(() => null);
  if (legacy?.ok) return { source: "legacy", value: await legacy.json() };

  return { source: "snapshot", value: quoteSnapshotRows() };
}

function normalizeQuoteResponse(input: unknown): { date: string; rows: QuoteRecord[]; source: MarketPayload["source"] } {
  const wrapped = input as { source?: MarketPayload["source"]; value?: unknown };
  const source = wrapped?.source || "legacy";
  const value = wrapped?.value ?? input;
  if (Array.isArray(value)) {
    const rows = value.filter((row): row is QuoteRecord => Boolean(row) && typeof row === "object" && !Array.isArray(row));
    return { date: String(rows[0]?.["資料日期"] || ""), rows, source };
  }

  const payload = value as { tables?: Array<{ date?: string; fields?: string[]; data?: RawQuote[] }> };
  const table = payload?.tables?.[0] || {};
  const fields = table.fields || [];
  const rows = (table.data || []).map(entry => {
    const raw = Array.isArray(entry) ? entry : (entry.value || []);
    return Object.fromEntries(fields.map((field, index) => [field, raw[index]]));
  });
  return { date: String(table.date || ""), rows, source };
}

async function parseCsvResponse(response: Response): Promise<QuoteRecord[]> {
  const bytes = await response.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(bytes);
  if (!text.includes("資料日期")) {
    try { text = new TextDecoder("big5").decode(bytes); } catch { return []; }
  }
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  if (!headers.includes("資料日期") || !headers.includes("代號")) return [];
  return lines.slice(1).map(line => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  }).filter(row => /^\d{4}$/.test(String(row["代號"] || "").trim()));
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(value.trim()); value = ""; }
    else value += char;
  }
  cells.push(value.trim());
  return cells;
}

function quoteSnapshotRows(): QuoteRecord[] {
  return Object.entries(QUOTE_SNAPSHOT).map(([code, row]) => ({
    "資料日期": row[10], "代號": code, "名稱": row[0], "前日均價": row[4],
    "報買價": row[5], "報買量": 0, "報賣價": row[6], "報賣量": 0,
    "日最高": null, "日最低": null, "日均價": row[3], "成交": row[2],
    "投資人成交買賣別": "", "暫停交易開始時間": row[9] ? "備援快照" : "", "成交量": row[7]
  }));
}

function browserHeaders() { return { "User-Agent": "Mozilla/5.0", Accept: "application/json,text/plain,*/*" }; }
function num(value: unknown): number | null { const cleaned = String(value ?? "").replace(/,/g, "").trim(); if (!cleaned || cleaned === "-") return null; const n = Number(cleaned); return Number.isFinite(n) ? n : null; }
function integer(value: unknown): number { return Math.round(num(value) || 0); }
function round(value: number, digits: number) { const p = 10 ** digits; return Math.round(value * p) / p; }
function normalizeWebsite(value: string) { if (!value) return ""; return /^https?:\/\//i.test(value) ? value : `https://${value}`; }
function normalizeDate(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^\d{8}$/.test(digits) && Number(digits.slice(0, 4)) > 1900) return `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`;
  if (/^\d{7}$/.test(digits)) return `${Number(digits.slice(0,3)) + 1911}-${digits.slice(3,5)}-${digits.slice(5,7)}`;
  return value;
}
function parseRocDateTime(value: string) {
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, time: iso[4] ? `${iso[4]}:${iso[5]}:${iso[6] || "00"}` : "" };
  const match = value.match(/(\d{2,3})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2}):(\d{2})/);
  if (!match) return { date: normalizeDate(value), time: "" };
  return {
    date: `${Number(match[1]) + 1911}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`,
    time: `${String(match[4]).padStart(2, "0")}:${match[5]}:${match[6]}`
  };
}
function taipeiNowParts() {
  const parts = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date());
  const get = (type: string) => parts.find(x => x.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}:${get("second")}` };
}
