const EVENT_LABELS = Object.freeze({
  early_redemption: "提前贖回",
  suspension: "停止轉換",
  put: "賣回權",
  maturity: "到期",
  conversion_price_adjustment: "轉換價調整",
  listing: "掛牌",
});

const EVENT_COLORS = Object.freeze({
  early_redemption: "#0e766e",
  suspension: "#7149b8",
  put: "#2563eb",
  maturity: "#7149b8",
  conversion_price_adjustment: "#2563eb",
  listing: "#0e766e",
});

export function normalizeOfficialCandles(points) {
  if (!Array.isArray(points)) return [];
  const seen = new Set();
  return points
    .flatMap((point) => {
      const time = isoDate(point?.date ?? point?.tradeDate ?? point?.tradingDate);
      const open = finite(point?.cbOpen ?? point?.open);
      const high = finite(point?.cbHigh ?? point?.high);
      const low = finite(point?.cbLow ?? point?.low);
      const close = finite(point?.cbClose ?? point?.close);
      const volume = finite(point?.cbTradingUnits ?? point?.volume);
      if (time === null || open === null || high === null || low === null || close === null || volume === null || seen.has(time)) return [];
      if (high < Math.max(open, close) || low > Math.min(open, close)) return [];
      seen.add(time);
      return [{ time, open, high, low, close, volume }];
    })
    .sort((left, right) => left.time.localeCompare(right.time));
}

export function chartDataState(points) {
  return normalizeOfficialCandles(points).length > 0 ? "ready" : "empty";
}

export function buildLightweightEventMarkers(events) {
  if (!Array.isArray(events)) return [];
  const seen = new Set();
  return events
    .flatMap((event) => {
      const time = firstDate(event?.deadlineDate, event?.effectiveDate, event?.startDate, event?.announcementDate, event?.date);
      const type = typeof event?.eventType === "string" ? event.eventType : typeof event?.type === "string" ? event.type : "";
      const text = cleanText(event?.title) || EVENT_LABELS[type] || "公開事件";
      if (time === null || seen.has(`${time}:${type}:${text}`)) return [];
      seen.add(`${time}:${type}:${text}`);
      return [{
        time,
        position: type === "early_redemption" || type === "maturity" ? "aboveBar" : "belowBar",
        color: EVENT_COLORS[type] ?? "#2563eb",
        shape: "circle",
        text,
      }];
    })
    .sort((left, right) => left.time.localeCompare(right.time) || left.text.localeCompare(right.text));
}

/**
 * Renders TradingView Lightweight Charts from official OHLCV only. The module
 * never calculates or exposes MA, MACD, RSI, KD, or BOLL indicators.
 */
export async function mountLightweightCbChart(host, { candles = [], events = [], onCrosshair = null } = {}) {
  if (!host || typeof host !== "object") return Object.freeze({ state: "error", dispose: noop, focusDate: noop });
  const data = normalizeOfficialCandles(candles);
  if (data.length === 0) {
    renderState(host, "目前沒有足夠的已驗證 OHLCV 資料可繪製 K 線。");
    return Object.freeze({ state: "empty", dispose: noop, focusDate: noop });
  }

  try {
    const { createChart, CandlestickSeries, HistogramSeries, createSeriesMarkers } = await import("./vendor/lightweight-charts.standalone.production.mjs");
    const chart = createChart(host, {
      autoSize: true,
      height: 360,
      layout: { background: { color: "transparent" }, textColor: "#667085" },
      grid: { vertLines: { color: "rgba(148, 163, 184, .2)" }, horzLines: { color: "rgba(148, 163, 184, .2)" } },
      rightPriceScale: { borderColor: "rgba(148, 163, 184, .35)" },
      timeScale: { borderColor: "rgba(148, 163, 184, .35)", timeVisible: true },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#c62828",
      downColor: "#078a55",
      borderVisible: false,
      wickUpColor: "#c62828",
      wickDownColor: "#078a55",
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "rgba(37, 99, 235, .36)",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    candleSeries.setData(data.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    volumeSeries.setData(data.map(({ time, volume, close, open }) => ({
      time,
      value: volume,
      color: close >= open ? "rgba(198, 40, 40, .35)" : "rgba(7, 138, 85, .35)",
    })));
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    const markerController = typeof createSeriesMarkers === "function"
      ? createSeriesMarkers(candleSeries, buildLightweightEventMarkers(events))
      : null;
    if (typeof onCrosshair === "function") {
      chart.subscribeCrosshairMove((parameter) => {
        const candle = parameter?.seriesData?.get(candleSeries) ?? null;
        onCrosshair(candle === null ? null : { ...candle });
      });
    }
    chart.timeScale().fitContent();
    const observer = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => chart.applyOptions({ width: host.clientWidth || 1 }))
      : null;
    observer?.observe(host);
    return Object.freeze({
      state: "ready",
      dispose: () => {
        observer?.disconnect();
        markerController?.detach?.();
        chart.remove();
      },
      focusDate: (date) => {
        const target = isoDate(date);
        if (target === null) return;
        const index = data.findIndex((entry) => entry.time >= target);
        if (index < 0) return;
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, index - 12), to: Math.min(data.length - 1, index + 12) });
      },
    });
  } catch {
    renderState(host, "K 線圖暫時無法載入，請稍後重試。");
    return Object.freeze({ state: "error", dispose: noop, focusDate: noop });
  }
}

function renderState(host, message) {
  host.innerHTML = `<p class="chart-state">${escapeHtml(message)}</p>`;
}

function firstDate(...values) {
  return values.find((value) => isoDate(value) !== null) ?? null;
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function cleanText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function noop() {}
