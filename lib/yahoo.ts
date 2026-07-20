const YAHOO_CHART_URL = (code: string, suffix: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${code}.${suffix}?range=1mo&interval=1d&includePrePost=false`;
const YAHOO_SPARK_URL = (symbols: string[]) =>
  `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(symbols.join(","))}&range=1mo&interval=1d`;
const YAHOO_LIVE_URL = (symbols: string[]) =>
  `https://tw.stock.yahoo.com/_td-stock/api/resource/StockServices.stockList;symbols=${encodeURIComponent(symbols.join(","))};fields=avgPrice`;

const CACHE_MS = 45_000;

export type YahooQuote = {
  code: string;
  symbol: string;
  current: number | null;
  previousClose: number | null;
  previousCloseDate: string;
  dailyChange: number | null;
  dailyChangePercent: number | null;
  lastWeekClose: number | null;
  lastWeekCloseDate: string;
  priceTime: string;
  priceDate: string;
  average: number | null;
  bid: number | null;
  ask: number | null;
  high: number | null;
  low: number | null;
  volume: number;
  marketStatus: string;
  suffix: string;
  note: string;
  error: string;
};

type CacheEntry = { at: number; value: YahooQuote };
type YahooLiveItem = {
  symbol?: string;
  price?: { raw?: string | number | null };
  bid?: { raw?: string | number | null };
  ask?: { raw?: string | number | null };
  change?: { raw?: string | number | null };
  changePercent?: string;
  regularMarketPreviousClose?: { raw?: string | number | null };
  regularMarketDayHigh?: { raw?: string | number | null };
  regularMarketDayLow?: { raw?: string | number | null };
  regularMarketTime?: string;
  avgPrice?: string | number | null;
  volume?: string | number | null;
  marketStatus?: string;
};
type YahooSparkPayload = {
  spark?: {
    result?: Array<{
      symbol?: string;
      response?: NonNullable<NonNullable<YahooChartPayload["chart"]>["result"]>;
    }>;
  };
};
const quoteCache = new Map<string, CacheEntry>();

export async function getYahooQuote(
  code: string,
  options: { force?: boolean; lastWeekEnd?: string; suffixes?: string[]; liveQuote?: YahooLiveItem | null } = {}
): Promise<YahooQuote> {
  const cleanCode = String(code || "").trim();
  const suffixes = options.suffixes?.length ? options.suffixes : ["TWO"];
  const cacheKey = `${cleanCode}:${suffixes.join(",")}:${options.lastWeekEnd || "auto"}`;
  const cached = quoteCache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const resolvedLiveQuote = options.liveQuote === undefined
    ? (await fetchYahooLiveQuotes([cleanCode], suffixes[0]).catch(() => new Map())).get(cleanCode) || null
    : options.liveQuote;

  const failures: string[] = [];
  for (const suffix of suffixes) {
    try {
      const response = await fetch(YAHOO_CHART_URL(cleanCode, suffix), {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json,text/plain,*/*" },
        cache: "no-store",
        redirect: "manual"
      });
      if (response.status >= 300 && response.status < 400) {
        throw new Error(`第三方行情服務重新導向 HTTP ${response.status}`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as YahooChartPayload;
      const historical = parseYahooChart(cleanCode, suffix, payload, options.lastWeekEnd || lastCompletedFriday());
      const value = resolvedLiveQuote ? mergeYahooLiveQuote(historical, resolvedLiveQuote) : historical;
      quoteCache.set(cacheKey, { at: Date.now(), value });
      return value;
    } catch (error) {
      failures.push(`${cleanCode}.${suffix} ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const fallback: YahooQuote = {
    code: cleanCode, symbol: `${cleanCode}.${suffixes[0]}`, current: null,
    previousClose: null, previousCloseDate: "", dailyChange: null, dailyChangePercent: null,
    lastWeekClose: null, lastWeekCloseDate: "", priceTime: "", priceDate: "",
    average: null, bid: null, ask: null, high: null, low: null,
    volume: 0, marketStatus: "", suffix: suffixes[0], note: "無可用報價", error: failures.join("；")
  };
  const value = resolvedLiveQuote ? mergeYahooLiveQuote(fallback, resolvedLiveQuote) : fallback;
  quoteCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

export async function getYahooQuotes(
  codes: string[],
  options: { force?: boolean; lastWeekEnd?: string; suffixes?: string[]; concurrency?: number } = {}
): Promise<YahooQuote[]> {
  const suffix = options.suffixes?.[0] || "TWO";
  const [liveQuotes, historicalQuotes] = await Promise.all([
    fetchYahooLiveQuotes(codes, suffix).catch(() => new Map<string, YahooLiveItem>()),
    fetchYahooHistoricalQuotes(codes, suffix).catch(() => new Map<string, YahooChartPayload>())
  ]);
  const lastWeekEnd = options.lastWeekEnd || lastCompletedFriday();

  return codes.map(code => {
    const payload = historicalQuotes.get(code);
    let historical = emptyYahooQuote(code, suffix, payload ? "" : "歷史行情暫時無法取得");
    if (payload) {
      try {
        historical = parseYahooChart(code, suffix, payload, lastWeekEnd);
      } catch (error) {
        historical.error = error instanceof Error ? error.message : String(error);
      }
    }
    const liveQuote = liveQuotes.get(code);
    const value = liveQuote ? mergeYahooLiveQuote(historical, liveQuote) : historical;
    const cacheKey = `${code}:${suffix}:${lastWeekEnd}`;
    quoteCache.set(cacheKey, { at: Date.now(), value });
    return value;
  });
}

async function fetchYahooHistoricalQuotes(codes: string[], suffix: string): Promise<Map<string, YahooChartPayload>> {
  const symbols = codes.map(code => `${code}.${suffix}`);
  const response = await fetch(YAHOO_SPARK_URL(symbols), {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json,text/plain,*/*" },
    cache: "no-store",
    redirect: "follow"
  });
  if (!response.ok) throw new Error(`歷史行情服務 HTTP ${response.status}`);
  const payload = await response.json() as YahooSparkPayload;
  const values = new Map<string, YahooChartPayload>();
  for (const row of payload.spark?.result || []) {
    const code = String(row.symbol || "").split(".")[0];
    if (/^\d{4}$/.test(code) && row.response?.[0]) {
      values.set(code, { chart: { result: [row.response[0]], error: null } });
    }
  }
  return values;
}

async function fetchYahooLiveQuotes(codes: string[], suffix: string): Promise<Map<string, YahooLiveItem>> {
  const symbols = codes.map(code => `${code}.${suffix}`);
  const response = await fetch(YAHOO_LIVE_URL(symbols), {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json,text/plain,*/*",
      Referer: "https://tw.stock.yahoo.com/"
    },
    cache: "no-store",
    redirect: "follow"
  });
  if (!response.ok) throw new Error(`即時行情服務 HTTP ${response.status}`);
  const rows = await response.json() as YahooLiveItem[];
  const values = new Map<string, YahooLiveItem>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const code = String(row.symbol || "").split(".")[0];
    if (/^\d{4}$/.test(code)) values.set(code, row);
  }
  return values;
}

type YahooChartPayload = {
  chart?: {
    error?: { description?: string } | null;
    result?: Array<{
      meta?: Record<string, unknown>;
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }> };
    }> | null;
  };
};

function emptyYahooQuote(code: string, suffix: string, error = ""): YahooQuote {
  return {
    code, symbol: `${code}.${suffix}`, current: null,
    previousClose: null, previousCloseDate: "", dailyChange: null, dailyChangePercent: null,
    lastWeekClose: null, lastWeekCloseDate: "", priceTime: "", priceDate: "",
    average: null, bid: null, ask: null, high: null, low: null,
    volume: 0, marketStatus: "", suffix, note: "", error
  };
}

function parseYahooChart(code: string, suffix: string, payload: YahooChartPayload, lastWeekEnd: string): YahooQuote {
  if (payload.chart?.error) throw new Error(payload.chart.error.description || "行情服務回傳錯誤");
  const result = payload.chart?.result?.[0];
  if (!result) throw new Error("行情服務未回傳價格資料");
  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const volumes = result.indicators?.quote?.[0]?.volume || [];
  const weekStart = addDate(lastWeekEnd, -4);
  let lastWeekClose: number | null = null;
  let lastWeekCloseDate = "";
  let latestClose: number | null = null;
  let latestDate = "";
  const sessions: Array<{ date: string; close: number; volume: number | null }> = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const close = closes[index];
    if (close === null || close === undefined || !Number.isFinite(Number(close))) continue;
    const date = taipeiDate(timestamps[index]);
    sessions.push({ date, close: Number(close), volume: finiteNumber(volumes[index]) });
    if (date >= weekStart && date <= lastWeekEnd) {
      lastWeekClose = Number(close);
      lastWeekCloseDate = date;
    }
    if (!latestDate || date >= latestDate) {
      latestClose = Number(close);
      latestDate = date;
    }
  }

  const regularPrice = finiteNumber(meta.regularMarketPrice);
  const regularTime = finiteNumber(meta.regularMarketTime);
  const priceTime = regularTime === null ? "" : taipeiDateTime(regularTime);
  const priceDate = priceTime ? priceTime.slice(0, 10) : latestDate;
  const current = regularPrice ?? latestClose;
  const previousSession = sessions
    .filter(session => session.date < priceDate && (session.volume === null || session.volume > 0))
    .sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const previousClose = previousSession?.close ?? finiteNumber(meta.chartPreviousClose);
  const dailyChange = current !== null && previousClose !== null ? current - previousClose : null;
  const dailyChangePercent = dailyChange !== null && previousClose !== 0 ? dailyChange / previousClose : null;
  const note = lastWeekCloseDate && lastWeekCloseDate !== lastWeekEnd
    ? `上週五無交易，改用 ${lastWeekCloseDate} 收盤`
    : lastWeekClose === null ? "上週無有效收盤價" : "";

  return {
    code,
    symbol: String(meta.symbol || `${code}.${suffix}`),
    current,
    previousClose,
    previousCloseDate: previousSession?.date || "",
    dailyChange,
    dailyChangePercent,
    lastWeekClose,
    lastWeekCloseDate,
    priceTime,
    priceDate,
    average: null,
    bid: null,
    ask: null,
    high: finiteNumber(meta.regularMarketDayHigh),
    low: finiteNumber(meta.regularMarketDayLow),
    volume: Math.round(finiteNumber(meta.regularMarketVolume) || 0),
    marketStatus: "",
    suffix,
    note,
    error: current === null ? "無可用報價" : ""
  };
}

function mergeYahooLiveQuote(historical: YahooQuote, live: YahooLiveItem): YahooQuote {
  const current = liveNumber(live.price) ?? historical.current;
  const previousClose = liveNumber(live.regularMarketPreviousClose) ?? historical.previousClose;
  const parsedTime = live.regularMarketTime ? new Date(live.regularMarketTime) : null;
  const priceTime = parsedTime && Number.isFinite(parsedTime.getTime())
    ? taipeiDateTime(Math.floor(parsedTime.getTime() / 1000))
    : historical.priceTime;
  const priceDate = priceTime ? priceTime.slice(0, 10) : historical.priceDate;
  const reportedChange = liveNumber(live.change);
  const dailyChange = reportedChange ?? (current !== null && previousClose !== null ? current - previousClose : null);
  const reportedPercent = parsePercent(live.changePercent);
  const dailyChangePercent = reportedPercent ?? (dailyChange !== null && previousClose !== 0 ? dailyChange / previousClose : null);
  const previousCloseDate = priceDate > historical.priceDate && historical.priceDate
    ? historical.priceDate
    : historical.previousCloseDate;

  return {
    ...historical,
    symbol: String(live.symbol || historical.symbol),
    current,
    previousClose,
    previousCloseDate,
    dailyChange,
    dailyChangePercent,
    priceTime,
    priceDate,
    average: finiteNumber(live.avgPrice),
    bid: liveNumber(live.bid),
    ask: liveNumber(live.ask),
    high: liveNumber(live.regularMarketDayHigh) ?? historical.high,
    low: liveNumber(live.regularMarketDayLow) ?? historical.low,
    volume: Math.round(finiteNumber(live.volume) || 0),
    marketStatus: String(live.marketStatus || ""),
    error: current === null ? "無可用報價" : ""
  };
}

export function lastCompletedFriday(now = new Date()): string {
  const parts = taipeiParts(now);
  const date = new Date(`${parts.date}T00:00:00Z`);
  const day = date.getUTCDay();
  let offset = (day - 5 + 7) % 7;
  if (day === 5 && Number(parts.hour) < 14) offset = 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function taipeiDate(epochSeconds: number): string {
  return taipeiParts(new Date(epochSeconds * 1000)).date;
}

function taipeiDateTime(epochSeconds: number): string {
  const parts = taipeiParts(new Date(epochSeconds * 1000));
  return `${parts.date} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function taipeiParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: get("hour"), minute: get("minute"), second: get("second") };
}

function addDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return value !== null && value !== "" && Number.isFinite(number) ? number : null;
}

function liveNumber(value: { raw?: string | number | null } | undefined): number | null {
  return finiteNumber(value?.raw);
}

function parsePercent(value: unknown): number | null {
  const text = String(value || "").replace("%", "").trim();
  const number = Number(text);
  return text && Number.isFinite(number) ? number / 100 : null;
}
