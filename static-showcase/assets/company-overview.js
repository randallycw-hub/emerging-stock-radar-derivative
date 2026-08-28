import { mountKlineChart } from "./klinechart-adapter.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function publicText(value) {
  const normalized = text(value);
  return normalized && normalized !== "-" ? normalized : null;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function display(value) {
  return publicText(value) ?? "—";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

export function formatCompanyNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("zh-Hant-TW", { maximumFractionDigits: 2 }).format(number) : "—";
}

export function formatCompanyPercent(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}%` : "—";
}

function formatDate(value) {
  const date = publicText(value);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.replaceAll("-", "/") : "—";
}

export const COMPANY_TABS = Object.freeze([
  "overview",
  "technical",
  "ipo",
  "bonds",
  "revenue",
  "events",
]);

export function parseCompanyCode(value) {
  const code = text(value);
  return /^\d{4}$/.test(code) ? code : null;
}

export function parseCompanyTab(value) {
  return COMPANY_TABS.includes(value) ? value : "overview";
}

function exactCompanyRecord(records, code) {
  return arrayValue(records).find((record) => text(record?.companyCode) === code) ?? null;
}

function revenueRecord(records, code) {
  return arrayValue(records)
    .filter((record) => text(record?.["公司代號"]) === code)
    .sort((left, right) => text(right?.["資料年月"]).localeCompare(text(left?.["資料年月"])))[0] ?? null;
}

function exactBondRecords(records, code) {
  return arrayValue(records)
    .filter((record) => text(record?.term?.issuerCode ?? record?.view?.issuerCode) === code)
    .map((record) => ({
      bondCode: publicText(record?.term?.bondCode ?? record?.view?.bondCode),
      bondName: publicText(record?.term?.bondName ?? record?.view?.bondName),
      cbClose: publicText(record?.view?.cbClose),
      cbPriceDate: publicText(record?.view?.cbPriceDate),
      premiumRate: publicText(record?.view?.premiumRate),
    }))
    .filter((record) => record.bondCode && record.bondName)
    .sort((left, right) => left.bondCode.localeCompare(right.bondCode));
}

function publicEvents(record) {
  return arrayValue(record?.events)
    .map((event) => ({ label: publicText(event?.label), date: publicText(event?.date) }))
    .filter((event) => event.label && event.date && /^\d{4}-\d{2}-\d{2}$/.test(event.date))
    .sort((left, right) => left.date.localeCompare(right.date) || left.label.localeCompare(right.label, "zh-Hant"));
}

function companyEvents(ipoRecord, workbench, code) {
  const ipoEvents = publicEvents(ipoRecord).map((event) => ({ market: "IPO", ...event }));
  const bondEvents = arrayValue(workbench)
    .filter((record) => text(record?.term?.issuerCode ?? record?.view?.issuerCode) === code)
    .flatMap((record) => publicEvents(record).map((event) => ({ market: "CB", ...event })));
  return [...ipoEvents, ...bondEvents]
    .sort((left, right) => left.date.localeCompare(right.date)
      || left.market.localeCompare(right.market)
      || left.label.localeCompare(right.label, "zh-Hant"));
}

export function buildCompanyOverview({ code, emerging = [], ipo = [], revenue = [], workbench = [] } = {}) {
  const companyCode = parseCompanyCode(code);
  if (!companyCode) return null;

  const market = exactCompanyRecord(emerging, companyCode);
  const ipoRecord = exactCompanyRecord(ipo, companyCode);
  const monthlyRevenue = revenueRecord(revenue, companyCode);
  const bonds = exactBondRecords(workbench, companyCode);
  const events = companyEvents(ipoRecord, workbench, companyCode);
  const name = publicText(market?.companyName)
    ?? publicText(ipoRecord?.companyName)
    ?? publicText(monthlyRevenue?.["公司名稱"])
    ?? publicText(arrayValue(workbench).find((record) => text(record?.term?.issuerCode) === companyCode)?.term?.issuerName)
    ?? "—";

  return {
    code: companyCode,
    name,
    emerging: market ? {
      industryName: publicText(market.industryName),
      dailyAveragePrice: publicText(market.dailyAveragePrice),
      transactionVolume: publicText(market.transactionVolume),
    } : null,
    ipo: ipoRecord ? {
      market: publicText(ipoRecord.market),
      stage: publicText(ipoRecord.stage),
      events: publicEvents(ipoRecord),
    } : null,
    revenue: monthlyRevenue ? {
      yearMonth: publicText(monthlyRevenue["資料年月"]),
      currentMonthRevenue: publicText(monthlyRevenue["營業收入-當月營收"]),
      monthOverMonthPercent: publicText(monthlyRevenue["營業收入-上月比較增減(%)"]),
      yearOverYearPercent: publicText(monthlyRevenue["營業收入-去年同月增減(%)"]),
    } : null,
    bonds,
    events,
  };
}

function fact(label, value) {
  return `<div class="company-fact"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function companyTechnicalSection(bonds) {
  if (bonds.length === 0) {
    return '<h3>技術圖表</h3><p class="company-empty">目前沒有可轉債公開資料，因此無法提供可核對的 OHLCV 圖表。</p>';
  }
  const options = bonds.map((bond) => (
    `<option value="${escapeHtml(bond.bondCode)}">${escapeHtml(`${bond.bondCode} ${bond.bondName}`)}</option>`
  )).join("");
  return `<h3>技術圖表</h3><p>圖表使用本公司已掛牌可轉債的已驗證 OHLCV；缺漏交易日不插補。</p>
    <div class="company-chart-toolbar"><label>可轉債 <select data-company-chart-bond aria-label="選擇可轉債技術圖表">${options}</select></label><a data-company-chart-detail href="./bonds.html?bond=${encodeURIComponent(bonds[0].bondCode)}">開啟完整債券頁 →</a></div>
    <div class="chart-controls" aria-label="技術圖表控制項"><fieldset><legend>週期</legend><button type="button" data-company-chart-period="day" aria-pressed="true">日K</button><button type="button" data-company-chart-period="week" aria-pressed="false">週K</button><button type="button" data-company-chart-period="month" aria-pressed="false">月K</button></fieldset><fieldset><legend>區間</legend><button type="button" data-company-chart-range="3M" aria-pressed="false">3月</button><button type="button" data-company-chart-range="6M" aria-pressed="true">6月</button><button type="button" data-company-chart-range="1Y" aria-pressed="false">1年</button><button type="button" data-company-chart-range="ALL" aria-pressed="false">全部</button></fieldset><fieldset><legend>副圖</legend><button type="button" data-company-chart-indicator="MACD" aria-pressed="true">MACD</button><button type="button" data-company-chart-indicator="RSI" aria-pressed="false">RSI</button><button type="button" data-company-chart-indicator="KDJ" aria-pressed="false">KD</button><button type="button" data-company-chart-indicator="BOLL" aria-pressed="false">BOLL</button></fieldset><button type="button" data-company-chart-latest>回到最新</button><button type="button" data-company-chart-retry>重新載入</button></div>
    <p class="chart-legend"><span class="chart-legend-up">上漲／收高</span><span class="chart-legend-down">下跌／收低</span><span>MA5／10／20／60 · VOL</span></p>
    <p class="chart-crosshair" data-company-chart-crosshair aria-live="polite">移動游標可查看日期、開高低收與成交量。</p>
    <div class="klinechart-host" data-company-kline-host aria-label="公司可轉債真實 OHLCV K 線圖"></div>`;
}

export function renderCompanyOverviewHtml(overview, activeTab = "overview") {
  if (!overview) {
    return '<h2>請輸入 4 碼公司代號</h2><p>可從全站搜尋，或在網址加上 <code>?code=1234</code> 開啟公司整合頁。</p>';
  }
  const ipoEvents = overview.ipo?.events ?? [];
  const events = overview.events;
  const bonds = overview.bonds;
  const selectedTab = parseCompanyTab(activeTab);
  return `
    <header class="company-overview-heading">
      <p class="section-number">COMPANY ${escapeHtml(overview.code)}</p>
      <h2>${escapeHtml(overview.name)}</h2>
      <p>以相同公司代碼彙整各市場公開資料。</p>
    </header>
    <div class="company-tabs" role="tablist" aria-label="公司公開資料分頁">
      <button type="button" role="tab" aria-selected="${selectedTab === "overview"}" aria-controls="company-panel-overview" data-company-tab="overview">總覽</button><button type="button" role="tab" aria-selected="${selectedTab === "technical"}" aria-controls="company-panel-technical" data-company-tab="technical">技術圖表</button><button type="button" role="tab" aria-selected="${selectedTab === "ipo"}" aria-controls="company-panel-ipo" data-company-tab="ipo">IPO</button><button type="button" role="tab" aria-selected="${selectedTab === "bonds"}" aria-controls="company-panel-bonds" data-company-tab="bonds">可轉債</button><button type="button" role="tab" aria-selected="${selectedTab === "revenue"}" aria-controls="company-panel-revenue" data-company-tab="revenue">月營收</button><button type="button" role="tab" aria-selected="${selectedTab === "events"}" aria-controls="company-panel-events" data-company-tab="events">公開事件</button>
    </div>
    <section id="company-panel-overview" class="company-overview-card company-overview-card--emerging" role="tabpanel" data-company-panel="overview"${selectedTab === "overview" ? "" : " hidden"}><h3>興櫃市場</h3><dl>${fact("產業", display(overview.emerging?.industryName))}${fact("當日均價", formatCompanyNumber(overview.emerging?.dailyAveragePrice))}${fact("成交量", formatCompanyNumber(overview.emerging?.transactionVolume))}</dl>${overview.emerging ? `<a href="./market.html?code=${encodeURIComponent(overview.code)}">查看興櫃明細</a>` : ""}</section>
    <section id="company-panel-technical" class="company-overview-card company-overview-card--technical" role="tabpanel" data-company-panel="technical"${selectedTab === "technical" ? "" : " hidden"}>${companyTechnicalSection(bonds)}</section>
    <section id="company-panel-ipo" class="company-overview-card company-overview-card--ipo" role="tabpanel" data-company-panel="ipo"${selectedTab === "ipo" ? "" : " hidden"}><h3>IPO 時程</h3><dl>${fact("市場", display(overview.ipo?.market))}${fact("目前階段", display(overview.ipo?.stage))}</dl>${ipoEvents.length ? `<ol class="company-event-list">${ipoEvents.map((event) => `<li><time>${escapeHtml(formatDate(event.date))}</time><span>${escapeHtml(event.label)}</span></li>`).join("")}</ol>` : '<p class="company-empty">目前沒有 IPO 公開資料。</p>'}${overview.ipo ? `<a href="./ipo-radar.html?q=${encodeURIComponent(overview.code)}">查看 IPO 明細</a>` : ""}</section>
    <section id="company-panel-bonds" class="company-overview-card company-overview-card--bonds" role="tabpanel" data-company-panel="bonds"${selectedTab === "bonds" ? "" : " hidden"}><h3>相關可轉債</h3>${bonds.length ? `<div class="company-bond-list">${bonds.map((bond) => `<a href="./bonds.html?bond=${encodeURIComponent(bond.bondCode)}"><strong>${escapeHtml(bond.bondCode)} ${escapeHtml(bond.bondName)}</strong><span>收盤 ${escapeHtml(formatCompanyNumber(bond.cbClose))}　資料日 ${escapeHtml(formatDate(bond.cbPriceDate))}　溢價 ${escapeHtml(formatCompanyPercent(bond.premiumRate))}</span></a>`).join("")}</div>` : '<p class="company-empty">目前沒有可轉債公開資料。</p>'}</section>
    <section id="company-panel-revenue" class="company-overview-card" role="tabpanel" data-company-panel="revenue"${selectedTab === "revenue" ? "" : " hidden"}><h3>月營收</h3><dl>${fact("資料年月", display(overview.revenue?.yearMonth))}${fact("當月營收", formatCompanyNumber(overview.revenue?.currentMonthRevenue))}${fact("月增率", formatCompanyPercent(overview.revenue?.monthOverMonthPercent))}${fact("年增率", formatCompanyPercent(overview.revenue?.yearOverYearPercent))}</dl>${overview.revenue ? `<a href="./emerging.html?view=revenue&q=${encodeURIComponent(overview.code)}">查看月營收明細</a>` : '<p class="company-empty">目前沒有月營收公開資料。</p>'}</section>
    <section id="company-panel-events" class="company-overview-card" role="tabpanel" data-company-panel="events"${selectedTab === "events" ? "" : " hidden"}><h3>公開事件</h3>${events.length ? `<ol class="company-event-list">${events.map((event) => `<li><time>${escapeHtml(formatDate(event.date))}</time><span>${escapeHtml(event.market)} · ${escapeHtml(event.label)}</span></li>`).join("")}</ol>` : '<p class="company-empty">目前沒有公開事件。</p>'}</section>`;
}

function renderOverview(target, overview, activeTab = "overview", { history = [] } = {}) {
  target.innerHTML = renderCompanyOverviewHtml(overview, activeTab);
  if (!overview) return;
  const activateTechnicalChart = bindCompanyTechnicalChart(target, { history });
  bindCompanyTabs(target, parseCompanyTab(activeTab), { onActivate: activateTechnicalChart });
}

function syncCompanyTab(activeTab) {
  if (typeof location === "undefined" || typeof globalThis.history?.replaceState !== "function") return;
  const url = new URL(location.href);
  if (activeTab === "overview") url.searchParams.delete("tab");
  else url.searchParams.set("tab", activeTab);
  globalThis.history.replaceState(globalThis.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function bindCompanyTabs(target, initialTab, { onActivate = () => {} } = {}) {
  const tabs = [...target.querySelectorAll("[data-company-tab]")];
  const activate = (button, { sync = true } = {}) => {
    const active = parseCompanyTab(button.dataset.companyTab);
    for (const control of tabs) control.setAttribute("aria-selected", String(control === button));
    for (const panel of target.querySelectorAll("[data-company-panel]")) panel.hidden = panel.dataset.companyPanel !== active;
    if (sync) syncCompanyTab(active);
    onActivate(active);
  };
  for (const [index, button] of tabs.entries()) {
    button.addEventListener("click", () => activate(button));
    button.addEventListener("keydown", (event) => {
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
      const targetIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + direction + tabs.length) % tabs.length;
      if (!direction && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      tabs[targetIndex].focus();
      activate(tabs[targetIndex]);
    });
  }
  const current = tabs.find((tab) => tab.dataset.companyTab === initialTab) ?? tabs[0];
  if (current) activate(current, { sync: false });
}

function bindCompanyTechnicalChart(target, { history = [] } = {}) {
  const host = target.querySelector("[data-company-kline-host]");
  const selector = target.querySelector("[data-company-chart-bond]");
  if (!host || !selector) return () => {};

  const chartState = { period: "day", range: "6M", extraIndicator: "MACD" };
  let controller = null;
  const detailLink = target.querySelector("[data-company-chart-detail]");
  const crosshairTarget = target.querySelector("[data-company-chart-crosshair]");
  const updateCrosshair = (data) => {
    if (!crosshairTarget) return;
    crosshairTarget.textContent = data
      ? `日期 ${new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei" }).format(new Date(data.timestamp))} · 開 ${data.open} · 高 ${data.high} · 低 ${data.low} · 收 ${data.close} · 成交量 ${data.volume ?? "—"}`
      : "移動游標可查看日期、開高低收與成交量。";
  };
  const syncControls = () => {
    for (const button of target.querySelectorAll("[data-company-chart-period]")) button.setAttribute("aria-pressed", String(button.dataset.companyChartPeriod === chartState.period));
    for (const button of target.querySelectorAll("[data-company-chart-range]")) button.setAttribute("aria-pressed", String(button.dataset.companyChartRange === chartState.range));
    for (const button of target.querySelectorAll("[data-company-chart-indicator]")) button.setAttribute("aria-pressed", String(button.dataset.companyChartIndicator === chartState.extraIndicator));
  };
  const mount = async () => {
    controller?.dispose();
    updateCrosshair(null);
    const bondCode = selector.value;
    if (detailLink) detailLink.href = `./bonds.html?bond=${encodeURIComponent(bondCode)}`;
    controller = await mountKlineChart({
      host,
      points: arrayValue(history).filter((point) => text(point?.bondCode) === bondCode),
      bondCode,
      period: chartState.period,
      range: chartState.range,
      extraIndicator: chartState.extraIndicator,
      onCrosshair: updateCrosshair,
    });
  };
  selector.addEventListener("change", () => void mount());
  for (const button of target.querySelectorAll("[data-company-chart-period]")) {
    button.addEventListener("click", () => {
      chartState.period = button.dataset.companyChartPeriod ?? "day";
      syncControls();
      void mount();
    });
  }
  for (const button of target.querySelectorAll("[data-company-chart-range]")) {
    button.addEventListener("click", () => {
      chartState.range = button.dataset.companyChartRange ?? "6M";
      syncControls();
      void mount();
    });
  }
  for (const button of target.querySelectorAll("[data-company-chart-indicator]")) {
    button.addEventListener("click", () => {
      chartState.extraIndicator = button.dataset.companyChartIndicator ?? "MACD";
      syncControls();
      void mount();
    });
  }
  target.querySelector("[data-company-chart-retry]")?.addEventListener("click", () => void mount());
  target.querySelector("[data-company-chart-latest]")?.addEventListener("click", () => controller?.scrollToLatest());
  syncControls();
  return (activeTab) => {
    if (activeTab === "technical") void mount();
    else {
      controller?.dispose();
      controller = null;
    }
  };
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

async function loadCompanyOverview() {
  const target = document.querySelector("#company-overview-root");
  if (!target) return;
  const code = parseCompanyCode(new URLSearchParams(location.search).get("code"));
  if (!code) {
    renderOverview(target, null);
    return;
  }
  const pointer = await fetchJson(new URL("../data/current.json", import.meta.url));
  const runtime = pointer?.runtimeUrl ? await fetchJson(new URL(pointer.runtimeUrl, document.baseURI)) : null;
  if (!runtime) {
    target.innerHTML = '<p class="empty-state">公司公開資料暫時無法載入，請稍後再試。</p>';
    return;
  }
  const [market, ipo, revenue, workbench, history] = await Promise.all([
    runtime.emergingMarketUrl ? fetchJson(new URL(runtime.emergingMarketUrl, document.baseURI)) : null,
    runtime.ipoEventsUrl ? fetchJson(new URL(runtime.ipoEventsUrl, document.baseURI)) : null,
    runtime.datasets?.["94025"] ? fetchJson(new URL(runtime.datasets["94025"], document.baseURI)) : null,
    runtime.datasets?.bondWorkbench ? fetchJson(new URL(runtime.datasets.bondWorkbench, document.baseURI)) : null,
    runtime.datasets?.bondHistory ? fetchJson(new URL(runtime.datasets.bondHistory, document.baseURI)) : null,
  ]);
  renderOverview(target, buildCompanyOverview({
    code,
    emerging: market?.records ?? market,
    ipo: ipo?.records,
    revenue,
    workbench: workbench?.records,
  }), parseCompanyTab(new URLSearchParams(location.search).get("tab")), { history });
}

if (globalThis.window && globalThis.document) loadCompanyOverview();
