import {
  aggregateCandles,
  verifiedDailyCandles,
} from "./bond-technical-analysis.js";

const TAIPEI_UTC_OFFSET = "+08:00";
const TAIWAN_KLINE_LOCALE = Object.freeze({
  time: "時間：",
  open: "開：",
  high: "高：",
  low: "低：",
  close: "收：",
  volume: "成交量：",
  turnover: "成交額：",
  change: "漲跌幅：",
  second: "秒",
  minute: "",
  hour: "小時",
  day: "日",
  week: "週",
  month: "月",
  year: "年",
});

function taipeiStartOfDay(date) {
  return Date.parse(`${date}T00:00:00${TAIPEI_UTC_OFFSET}`);
}

export function toKlineData(points, { period = "day" } = {}) {
  const daily = verifiedDailyCandles(points);
  const candles = period === "day" ? daily : aggregateCandles(daily, period);
  return candles.map((candle) => ({
    timestamp: taipeiStartOfDay(candle.periodStart),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.tradingUnits ?? 0),
  }));
}

export function chartDataState(points, options) {
  return toKlineData(points, options).length === 0 ? "empty" : "ready";
}

const PERIOD_MAP = Object.freeze({
  day: "day",
  week: "week",
  month: "month",
});
const RANGE_DAYS = Object.freeze({
  "1D": 1,
  "5D": 5,
  "1M": 31,
  "3M": 92,
  "6M": 184,
  "1Y": 366,
  ALL: null,
});
const EXTRA_INDICATORS = new Set(["MACD", "RSI", "KDJ", "BOLL"]);

export function rangeKlineData(data, range) {
  const days = RANGE_DAYS[range] ?? null;
  if (days === null || data.length === 0) return data;
  const cutoff = data.at(-1).timestamp - days * 24 * 60 * 60 * 1000;
  return data.filter((item) => item.timestamp >= cutoff);
}

function colorToken(name, fallback) {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function klineStyles() {
  const up = colorToken("--chart-up", "#c62828");
  const down = colorToken("--chart-down", "#078a55");
  const flat = colorToken("--color-flat", "#667085");
  const border = colorToken("--line", "#dde3ea");
  const muted = colorToken("--muted", "#667085");
  return {
    grid: {
      horizontal: { color: border },
      vertical: { color: border },
    },
    candle: {
      bar: {
        compareRule: "current_open",
        upColor: up,
        downColor: down,
        noChangeColor: flat,
        upBorderColor: up,
        downBorderColor: down,
        noChangeBorderColor: flat,
        upWickColor: up,
        downWickColor: down,
        noChangeWickColor: flat,
      },
      priceMark: { last: { upColor: up, downColor: down, noChangeColor: flat } },
    },
    indicator: { ohlc: { compareRule: "current_open", upColor: up, downColor: down, noChangeColor: flat } },
    xAxis: { tickText: { color: muted } },
    yAxis: { tickText: { color: muted } },
  };
}

function renderState(host, state, message) {
  if (!host) return;
  host.replaceChildren();
  const element = document.createElement("p");
  element.className = `klinechart-state klinechart-state--${state}`;
  element.textContent = message;
  host.append(element);
}

export async function mountKlineChart({
  host,
  points = [],
  bondCode = "",
  period = "day",
  range = "ALL",
  extraIndicator = "MACD",
  onCrosshair,
} = {}) {
  const chartPeriod = PERIOD_MAP[period] ?? "day";
  const fullData = toKlineData(points, { period: chartPeriod });
  const data = rangeKlineData(fullData, range);
  const noop = () => {};
  if (!host) return Object.freeze({ state: "unavailable", dispose: noop, scrollToLatest: noop });
  if (data.length === 0) {
    renderState(host, "empty", "目前沒有足夠的已驗證 OHLCV 資料可繪製圖表。");
    return Object.freeze({ state: "empty", dispose: noop, scrollToLatest: noop });
  }

  renderState(host, "loading", "技術圖表載入中…");
  try {
    const { dispose, init, registerLocale } = await import("./vendor/klinecharts.esm.js");
    registerLocale("zh-TW", TAIWAN_KLINE_LOCALE);
    host.replaceChildren();
    const paneHeight = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches ? 360 : 520;
    const chart = init(host, {
      locale: "zh-TW",
      timezone: "Asia/Taipei",
      zoomAnchor: "last_bar",
      styles: klineStyles(),
      layout: { pane: { height: paneHeight, minHeight: 180 } },
    });
    if (!chart) throw new Error("KLINECHART_INIT_FAILED");
    chart.setSymbol({ ticker: String(bondCode || "CB"), pricePrecision: 2, volumePrecision: 0 });
    chart.setPeriod({ span: 1, type: chartPeriod });
    chart.setDataLoader({ getBars: ({ callback }) => callback(data, false) });
    chart.createIndicator({ name: "MA", paneId: "candle_pane", calcParams: [5, 10, 20, 60] }, true);
    chart.createIndicator("VOL");
    if (EXTRA_INDICATORS.has(extraIndicator)) {
      chart.createIndicator(extraIndicator);
    }
    const crosshairHandler = typeof onCrosshair === "function"
      ? (value) => onCrosshair(value?.kLineData ?? null)
      : null;
    if (crosshairHandler) chart.subscribeAction("onCrosshairChange", crosshairHandler);
    const observer = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => chart.resize())
      : null;
    observer?.observe(host);
    return Object.freeze({
      state: "ready",
      data,
      scrollToLatest: () => chart.scrollToRealTime(),
      dispose: () => {
        observer?.disconnect();
        if (crosshairHandler) chart.unsubscribeAction("onCrosshairChange", crosshairHandler);
        dispose(chart);
      },
    });
  } catch {
    renderState(host, "error", "技術圖表暫時無法載入，請稍後重試。");
    return Object.freeze({ state: "error", dispose: noop, scrollToLatest: noop });
  }
}
