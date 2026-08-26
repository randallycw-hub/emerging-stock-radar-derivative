import {
  aggregateCandles,
  bollingerBands,
  macd,
  relativeStrengthIndex,
  simpleMovingAverage,
  stochasticKd,
  verifiedDailyCandles,
} from "./bond-technical-analysis.js";

const RANGE_DAYS = { "1M": 31, "3M": 93, "6M": 186, "1Y": 366, "3Y": 1096 };
const EVENT_TYPES = new Set([
  "conversion_adjustment", "conversion_suspension", "ex_dividend", "put", "redemption", "maturity",
]);
const MARKER_SYMBOLS = { conversion_adjustment: "A", conversion_suspension: "S", ex_dividend: "D", put: "P", redemption: "R", maturity: "M" };

export function chartPalette() {
  return {
    up: "var(--chart-up)", down: "var(--chart-down)",
    marker: Object.fromEntries([...EVENT_TYPES].map((type) => [type, { symbol: MARKER_SYMBOLS[type], color: `var(--chart-marker-${type})` }])),
  };
}

export function buildChartModel({ history = [], events = [], period = "day", range = "6M", archived = false } = {}) {
  const points = Array.isArray(history) ? history.filter((point) => validDate(point?.date)) : [];
  const dailyCandles = verifiedDailyCandles(points);
  const candles = period === "day" ? dailyCandles : aggregateCandles(dailyCandles, period);
  const slots = slotsForPeriod(points, candles, period);
  const averages = { ma5: simpleMovingAverage(candles, 5), ma20: simpleMovingAverage(candles, 20), ma60: simpleMovingAverage(candles, 60) };
  const indicators = {
    bollinger: bollingerBands(candles, 20, 2),
    rsi: relativeStrengthIndex(candles, 14),
    kd: stochasticKd(candles, 9, 3, 3),
    macd: macd(candles, 12, 26, 9),
  };
  const candleIndexByDate = new Map(candles.map((candle, index) => [candle.periodStart, index]));
  for (const slot of slots) {
    const index = candleIndexByDate.get(slot.date);
    slot.movingAverages = index === undefined ? { ma5: null, ma20: null, ma60: null } : {
      ma5: averages.ma5[index], ma20: averages.ma20[index], ma60: averages.ma60[index],
    };
  }
  const ranged = selectRange(slots, range);
  const model = {
    period, range, archived: Boolean(archived), candles: ranged,
    movingAverages: alignValues(ranged, averages, candleIndexByDate),
    indicators: alignValues(ranged, indicators, candleIndexByDate),
    eventMarkers: buildEventMarkers(events, ranged),
    status: candles.length < 60 ? "資料累積中" : "",
    hoverPayload(index) { return hoverPayload(ranged[index]); },
  };
  return model;
}

export function selectVisibleCandles(candles, { viewport = null } = {}) {
  const ranged = Array.isArray(candles) ? candles : [];
  const first = clampIndex(viewport?.start, ranged.length, 0);
  const last = clampIndex(viewport?.end, ranged.length, ranged.length - 1);
  if (!ranged.length || last < first) return [];
  return ranged.slice(first, last + 1).map((slot, offset) => ({ ...slot, index: first + offset }));
}

export function selectVisibleEventMarkers(markers, candles) {
  const first = candles?.[0]?.date;
  const last = candles?.at(-1)?.date;
  if (!first || !last) return [];
  return (Array.isArray(markers) ? markers : []).filter((marker) => marker.date >= first && marker.date <= last);
}

export function buildEventMarkers(events, candles) {
  const visible = Array.isArray(candles) ? candles : [];
  const start = visible[0]?.date;
  const end = visible.at(-1)?.date;
  const stacks = new Map();
  return (Array.isArray(events) ? events : [])
    .filter((event) => EVENT_TYPES.has(event?.type) && validDate(event?.date))
    .filter((event) => !start || (event.date >= start && event.date <= end))
    .sort((left, right) => left.date.localeCompare(right.date) || String(left.eventId ?? "").localeCompare(String(right.eventId ?? "")))
    .map((event) => {
      const stackIndex = stacks.get(event.date) ?? 0;
      stacks.set(event.date, stackIndex + 1);
      const title = event.title ?? event.type;
      return { eventId: event.eventId ?? `${event.type}:${event.date}:${stackIndex}`, date: event.date, type: event.type, title, stackIndex, accessibleLabel: `${title}（${event.type}）` };
    });
}

export function bindCandlestickChart(target, options = {}) {
  const root = target?.querySelector?.("[data-bond-candlestick-chart]");
  if (!root) return () => {};
  const canvas = root.querySelector("canvas");
  const summary = root.querySelector("[data-chart-summary]");
  const table = root.querySelector("[data-chart-table-body]");
  const advanced = root.querySelector("[data-chart-advanced-values]");
  let period = "day";
  let range = "6M";
  let model;
  let visible = [];
  let activeIndex = -1;
  let resizeObserver;

  const redraw = () => {
    model = buildChartModel({ ...options, period, range });
    const width = Math.max(1, root.clientWidth || 720);
    const capacity = Math.max(12, Math.floor((width - 72) / 9));
    const all = model.candles;
    visible = selectVisibleCandles(all, { viewport: { start: Math.max(0, all.length - capacity), end: all.length - 1 } });
    const markers = selectVisibleEventMarkers(model.eventMarkers, visible);
    drawCanvas(canvas, visible, markers, activeIndex, model);
    updateTable(table, visible);
    updateEvents(root.querySelector("[data-chart-events]"), markers);
    updateAdvanced(advanced, model);
    updateSummary(summary, activeIndex >= 0 ? model.hoverPayload(visible[activeIndex]?.index) : null, model.status);
  };
  const activate = (index) => {
    if (!visible.length) return;
    activeIndex = Math.max(0, Math.min(visible.length - 1, index));
    const markers = selectVisibleEventMarkers(model.eventMarkers, visible);
    drawCanvas(canvas, visible, markers, activeIndex, model);
    updateSummary(summary, model.hoverPayload(visible[activeIndex].index), model.status, markers.filter((marker) => marker.date === visible[activeIndex].date));
  };
  root.querySelectorAll("[data-chart-period]").forEach((button) => button.addEventListener("click", () => {
    period = button.dataset.chartPeriod;
    root.querySelectorAll("[data-chart-period]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    activeIndex = -1;
    redraw();
  }));
  root.querySelectorAll("[data-chart-range]").forEach((button) => button.addEventListener("click", () => {
    range = button.dataset.chartRange;
    root.querySelectorAll("[data-chart-range]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    activeIndex = -1;
    redraw();
  }));
  canvas?.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    activate(Math.round(((event.clientX - rect.left) / Math.max(rect.width, 1)) * Math.max(visible.length - 1, 0)));
  });
  canvas?.addEventListener("pointerleave", () => { activeIndex = -1; redraw(); });
  canvas?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    activate((activeIndex < 0 ? visible.length - 1 : activeIndex) + (event.key === "ArrowLeft" ? -1 : 1));
  });
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => redraw());
    resizeObserver.observe(root);
  } else if (typeof window !== "undefined") window.addEventListener("resize", redraw, { passive: true });
  redraw();
  return () => {
    resizeObserver?.disconnect();
    if (!resizeObserver && typeof window !== "undefined") window.removeEventListener("resize", redraw);
  };
}

function slotsForPeriod(points, candles, period) {
  if (period !== "day") return candles.map((candle) => ({ date: candle.periodStart, candle }));
  const byDate = new Map(candles.map((candle) => [candle.periodStart, candle]));
  return [...new Set(points.map((point) => point.date))].sort().map((date) => ({ date, candle: byDate.get(date) ?? null }));
}

function selectRange(slots, range) {
  if (!Array.isArray(slots) || !slots.length || !RANGE_DAYS[range]) return Array.isArray(slots) ? [...slots] : [];
  const latest = Date.parse(`${slots.at(-1).date}T00:00:00Z`);
  const cutoff = latest - RANGE_DAYS[range] * 86_400_000;
  return slots.filter((slot) => Date.parse(`${slot.date}T00:00:00Z`) >= cutoff);
}

function alignValues(slots, values, candleIndexByDate) {
  return Object.fromEntries(Object.entries(values).map(([key, series]) => [key, slots.map((slot) => {
    const index = candleIndexByDate.get(slot.date);
    return index === undefined ? null : series[index];
  })]));
}

function hoverPayload(slot) {
  if (!slot) return null;
  if (!slot.candle) return { date: slot.date, unavailable: true, message: "OHLC 資料尚未提供" };
  const candle = slot.candle;
  return { date: slot.date, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.tradingUnits };
}

function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value ?? ""); }
function clampIndex(value, length, fallback) { return Number.isInteger(value) ? Math.max(0, Math.min(length - 1, value)) : fallback; }

function drawCanvas(canvas, visible, markers, activeIndex, model) {
  const context = canvas?.getContext?.("2d");
  if (!context) return;
  const cssWidth = Math.max(320, Math.floor(canvas.parentElement?.clientWidth || 720));
  const cssHeight = 320;
  const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(cssWidth * ratio); canvas.height = Math.floor(cssHeight * ratio);
  canvas.style.width = `${cssWidth}px`; canvas.style.height = `${cssHeight}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, cssWidth, cssHeight);
  const style = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
  const palette = chartPalette(); const color = (value, fallback) => style?.getPropertyValue(value.slice(4, -1)).trim() || fallback;
  const colors = { grid: style?.getPropertyValue("--line").trim() || "#d8d0c4", ink: style?.getPropertyValue("--ink").trim() || "#211e1b", up: color(palette.up, "#8b412d"), down: color(palette.down, "#624d78"), ma5: style?.getPropertyValue("--violet").trim() || "#7a638f", ma20: style?.getPropertyValue("--clay").trim() || "#b96849", ma60: style?.getPropertyValue("--line-strong").trim() || "#4b6172" };
  const markerRows = Math.max(0, ...markers.map((marker) => marker.stackIndex + 1));
  const pad = { left: 48, right: 16, top: 42 + markerRows * 12, bottom: 54 }; const priceBottom = 216; const volumeTop = 248; const volumeBottom = 300;
  const numeric = visible.flatMap((slot) => slot.candle ? [slot.candle.high, slot.candle.low].map(Number).filter(Number.isFinite) : []);
  if (!numeric.length) { context.fillStyle = colors.ink; context.font = "14px system-ui"; context.textAlign = "center"; context.fillText(model.status || "資料累積中", cssWidth / 2, 150); return; }
  const low = Math.min(...numeric); const high = Math.max(...numeric); const spread = Math.max(high - low, 1); const y = (value) => pad.top + (high - Number(value)) / spread * (priceBottom - pad.top);
  const x = (index) => pad.left + (index + .5) * (cssWidth - pad.left - pad.right) / Math.max(visible.length, 1); const unit = (cssWidth - pad.left - pad.right) / Math.max(visible.length, 1); const body = Math.max(2, unit * .62);
  context.strokeStyle = colors.grid; context.beginPath(); context.moveTo(pad.left, priceBottom); context.lineTo(cssWidth - pad.right, priceBottom); context.moveTo(pad.left, volumeBottom); context.lineTo(cssWidth - pad.right, volumeBottom); context.stroke();
  const maxVolume = Math.max(...visible.map((item) => Number(item.candle?.tradingUnits) || 0), 1);
  visible.forEach((slot, index) => {
    const candle = slot.candle; if (!candle) return;
    const rising = Number(candle.close) >= Number(candle.open); const color = rising ? colors.up : colors.down; const px = x(index);
    context.strokeStyle = color; context.lineWidth = 1.5; context.beginPath(); context.moveTo(px, y(candle.high)); context.lineTo(px, y(candle.low)); context.stroke();
    const top = Math.min(y(candle.open), y(candle.close)); const height = Math.max(1, Math.abs(y(candle.open) - y(candle.close)));
    if (rising) { context.strokeRect(px - body / 2, top, body, height); } else { context.fillStyle = color; context.fillRect(px - body / 2, top, body, height); }
    const volume = Math.max(0, Number(candle.tradingUnits) || 0); context.fillStyle = color; context.fillRect(px - body / 2, volumeBottom - volume / maxVolume * (volumeBottom - volumeTop), body, volume / maxVolume * (volumeBottom - volumeTop));
  });
  [["ma5", colors.ma5], ["ma20", colors.ma20], ["ma60", colors.ma60]].forEach(([key, color]) => {
    context.strokeStyle = color; context.lineWidth = 1.3; context.setLineDash(key === "ma60" ? [4, 3] : []); context.beginPath(); let started = false;
    visible.forEach((slot, index) => { const value = slot.movingAverages?.[key]; if (value === null || value === undefined) { started = false; return; } if (!started) { context.moveTo(x(index), y(value)); started = true; } else context.lineTo(x(index), y(value)); }); context.stroke();
  }); context.setLineDash([]);
  markers.forEach((marker) => { const slotIndex = visible.findIndex((slot) => slot.date === marker.date); if (slotIndex < 0) return; const markerStyle = palette.marker[marker.type]; const px = x(slotIndex); const markerColor = color(markerStyle.color, colors.ink); const markerY = pad.top - 8 - marker.stackIndex * 12; context.strokeStyle = markerColor; context.setLineDash([2, 2]); context.beginPath(); context.moveTo(px, pad.top); context.lineTo(px, priceBottom); context.stroke(); context.setLineDash([]); context.fillStyle = markerColor; context.font = "bold 10px system-ui"; context.fillText(markerStyle.symbol, px - 3, markerY); });
  if (activeIndex >= 0 && visible[activeIndex]) { context.strokeStyle = colors.ink; context.setLineDash([3, 2]); context.beginPath(); context.moveTo(x(activeIndex), pad.top); context.lineTo(x(activeIndex), volumeBottom); context.stroke(); context.setLineDash([]); }
  context.fillStyle = colors.ink; context.font = "11px system-ui"; context.textAlign = "left"; context.fillText(visible[0].date, pad.left, 316); context.textAlign = "right"; context.fillText(visible.at(-1).date, cssWidth - pad.right, 316);
}

function updateSummary(target, payload, status, markers = []) {
  if (!target) return;
  if (!payload) { target.textContent = status || "移到圖表或用左右方向鍵檢視 K 線資料。"; return; }
  const eventText = markers.length ? `；事件 ${markers.map((marker) => marker.accessibleLabel).join("、")}` : "";
  target.textContent = payload.unavailable ? `${payload.date}，${payload.message}${eventText}` : `${payload.date}，開 ${payload.open}、高 ${payload.high}、低 ${payload.low}、收 ${payload.close}、成交量 ${payload.volume}${eventText}`;
}

function updateTable(target, visible) {
  if (!target) return;
  target.innerHTML = visible.map((slot) => slot.candle ? `<tr><td>${slot.date}</td><td>${slot.candle.open}</td><td>${slot.candle.high}</td><td>${slot.candle.low}</td><td>${slot.candle.close}</td><td>${slot.candle.tradingUnits}</td></tr>` : `<tr><td>${slot.date}</td><td colspan="5">資料累積中</td></tr>`).join("");
}

function updateEvents(target, markers) {
  if (!target) return;
  target.innerHTML = markers.length ? markers.map((marker) => `<li><time>${escapeHtml(marker.date)}</time> ${escapeHtml(marker.accessibleLabel)}</li>`).join("") : "<li>此視窗無公開事件標記</li>";
}

function updateAdvanced(target, model) {
  if (!target) return;
  const latest = (values) => [...values].reverse().find((value) => value !== null && value !== undefined) ?? null;
  const bollinger = latest(model.indicators.bollinger);
  const kd = latest(model.indicators.kd);
  const macdValue = latest(model.indicators.macd);
  const rsi = latest(model.indicators.rsi);
  target.textContent = bollinger || kd || macdValue || rsi
    ? `Bollinger 上 ${bollinger?.upper ?? "資料累積中"}／中 ${bollinger?.middle ?? "資料累積中"}／下 ${bollinger?.lower ?? "資料累積中"}；RSI ${rsi ?? "資料累積中"}；KD K ${kd?.k ?? "資料累積中"}／D ${kd?.d ?? "資料累積中"}；MACD ${macdValue?.macd ?? "資料累積中"}／線 ${macdValue?.signal ?? "資料累積中"}／柱 ${macdValue?.histogram ?? "資料累積中"}`
    : "資料累積中";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
