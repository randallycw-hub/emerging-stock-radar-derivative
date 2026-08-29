function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function recordsOf(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.records) ? value.records : [];
}

function publicText(value) {
  const normalized = text(value);
  return normalized && normalized !== "-" ? normalized : null;
}

function display(value) {
  return publicText(value) ?? "—";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value));
}

function formatDate(value) {
  return validDate(value) ? value.replaceAll("-", "/") : "—";
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

export const COMPANY_TABS = Object.freeze([
  "overview",
  "revenue",
  "ipo-events",
  "bonds",
  "events",
]);

export function parseCompanyCode(value) {
  const code = text(value);
  return /^\d{4}$/.test(code) ? code : null;
}

export function parseCompanyTab(value) {
  if (value === "ipo" || value === "securities") return "ipo-events";
  if (value === "bonds") return "bonds";
  return COMPANY_TABS.includes(value) ? value : "overview";
}

function companyMasterRecord(records, code) {
  return recordsOf(records).find((record) => text(record?.stockCode) === code) ?? null;
}

function exactCompanyRecord(records, code) {
  return recordsOf(records).find((record) => text(record?.companyCode) === code) ?? null;
}

function revenueRecord(records, code) {
  return recordsOf(records)
    .filter((record) => text(record?.["公司代號"]) === code)
    .sort((left, right) => text(right?.["資料年月"]).localeCompare(text(left?.["資料年月"])))[0] ?? null;
}

function exactBondRecords(records, code) {
  return recordsOf(records)
    .filter((record) => text(record?.status).toLowerCase() === "active")
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
  return recordsOf(record?.events)
    .map((event) => ({ label: publicText(event?.label ?? event?.title), date: publicText(event?.date) }))
    .filter((event) => event.label && validDate(event.date))
    .sort((left, right) => left.date.localeCompare(right.date) || left.label.localeCompare(right.label, "zh-Hant"));
}

function latestIpoDate(record) {
  return [record?.applicationDate, ...publicEvents(record).map((event) => event.date)]
    .filter(validDate)
    .sort()
    .at(-1) ?? null;
}

function activeIpoRecord(records, code, dataDate) {
  const active = recordsOf(records)
    .filter((record) => text(record?.companyCode) === code)
    .filter((record) => /^[ABCD]$/.test(text(record?.stage)) && !text(record?.exceptionStatus));
  const dated = active.filter((record) => {
    if (!validDate(dataDate)) return true;
    const latest = latestIpoDate(record);
    return latest && (Date.parse(`${dataDate}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) <= 365 * 86_400_000;
  });
  return dated.sort((left, right) => String(latestIpoDate(right)).localeCompare(String(latestIpoDate(left))))[0] ?? null;
}

function companyEvents(ipoRecord, workbench, code) {
  const ipoEvents = publicEvents(ipoRecord).map((event) => ({ market: "IPO", ...event }));
  const bondEvents = recordsOf(workbench)
    .filter((record) => text(record?.status).toLowerCase() === "active")
    .filter((record) => text(record?.term?.issuerCode ?? record?.view?.issuerCode) === code)
    .flatMap((record) => publicEvents(record).map((event) => ({ market: "CB", ...event })));
  return [...ipoEvents, ...bondEvents]
    .sort((left, right) => left.date.localeCompare(right.date)
      || left.market.localeCompare(right.market)
      || left.label.localeCompare(right.label, "zh-Hant"));
}

/**
 * Builds the public company read model from the staged canonical company master.
 * Page-specific source records enrich facts only; they never choose identity,
 * market, industry, or CB ownership.
 */
export function buildCompanyOverview({
  code,
  companyMaster = [],
  emerging = [],
  ipo = [],
  revenue = [],
  workbench = [],
} = {}) {
  const companyCode = parseCompanyCode(code);
  if (!companyCode) return null;
  const company = companyMasterRecord(companyMaster, companyCode);
  if (!company) return null;

  const market = exactCompanyRecord(emerging, companyCode);
  const ipoRecord = activeIpoRecord(ipo, companyCode, company.dataDate);
  const monthlyRevenue = revenueRecord(revenue, companyCode);
  const bonds = exactBondRecords(workbench, companyCode);
  return {
    code: companyCode,
    name: display(company.companyName),
    market: display(company.market),
    industry: display(company.industry),
    dataDate: publicText(company.dataDate),
    emerging: market ? {
      tradingDate: publicText(market.tradingDate),
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
    events: companyEvents(ipoRecord, workbench, companyCode),
  };
}

function fact(label, value) {
  return `<div class="company-fact"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function eventList(events) {
  return events.length
    ? `<ol class="company-event-list company-event-timeline">${events.map((event) => `<li><time>${escapeHtml(formatDate(event.date))}</time><span class="company-event-market">${escapeHtml(event.market ?? "IPO")}</span><strong>${escapeHtml(event.label)}</strong></li>`).join("")}</ol>`
    : "";
}

export function renderCompanyOverviewHtml(overview, activeTab = "overview") {
  if (!overview) {
    return '<h2>目前沒有可用公開公司資料</h2><p>請由上方搜尋輸入公司名稱、股票代碼或可轉債代碼。</p>';
  }
  const selectedTab = parseCompanyTab(activeTab);
  const ipoEvents = overview.ipo?.events ?? [];
  const events = overview.events ?? [];
  const bonds = overview.bonds ?? [];
  const overviewHtml = `<h3>概覽</h3><dl>${fact("市場", overview.market)}${fact("產業", overview.industry)}${fact("資料日", formatDate(overview.dataDate))}${fact("盤後均價", formatCompanyNumber(overview.emerging?.dailyAveragePrice))}${fact("成交量", formatCompanyNumber(overview.emerging?.transactionVolume))}</dl>`;
  const revenueHtml = overview.revenue
    ? `<h3>營收</h3><dl>${fact("資料年月", display(overview.revenue.yearMonth))}${fact("當月營收", formatCompanyNumber(overview.revenue.currentMonthRevenue))}${fact("月增率", formatCompanyPercent(overview.revenue.monthOverMonthPercent))}${fact("年增率", formatCompanyPercent(overview.revenue.yearOverYearPercent))}</dl><a href="./emerging.html?view=revenue&q=${encodeURIComponent(overview.code)}">查看月營收明細</a>`
    : '<h3>營收</h3><p class="company-empty">目前無可用資料。</p>';
  const ipoHtml = overview.ipo
    ? `<h3>IPO／事件</h3><dl>${fact("市場", display(overview.ipo.market))}${fact("目前階段", display(overview.ipo.stage))}</dl>${eventList(ipoEvents)}<a href="./ipo-radar.html?q=${encodeURIComponent(overview.code)}">查看 IPO 明細</a>`
    : '<h3>IPO／事件</h3><p class="company-empty">目前沒有 IPO 進行資料。</p>';
  const bondsHtml = bonds.length
    ? `<h3>可轉債</h3><div class="company-bond-list">${bonds.map((bond) => `<a href="./bonds.html?bond=${encodeURIComponent(bond.bondCode)}"><strong>${escapeHtml(bond.bondCode)} ${escapeHtml(bond.bondName)}</strong><span>收盤 ${escapeHtml(formatCompanyNumber(bond.cbClose))}　資料日 ${escapeHtml(formatDate(bond.cbPriceDate))}　溢價 ${escapeHtml(formatCompanyPercent(bond.premiumRate))}</span></a>`).join("")}</div>`
    : '<h3>可轉債</h3><p class="company-empty">目前沒有可轉債公開資料。</p>';
  const eventsHtml = events.length
    ? `<h3>公開事件</h3>${eventList(events)}`
    : '<h3>公開事件</h3><p class="company-empty">目前沒有公開事件。</p>';
  const panels = { overview: overviewHtml, revenue: revenueHtml, "ipo-events": ipoHtml, bonds: bondsHtml, events: eventsHtml };
  const labels = { overview: "概覽", revenue: "營收", "ipo-events": "IPO／事件", bonds: "可轉債", events: "公開事件" };
  return `
    <header class="company-overview-heading">
      <p class="section-number">COMPANY ${escapeHtml(overview.code)}</p>
      <h2><span>${escapeHtml(overview.code)}</span>${escapeHtml(overview.name)}</h2>
      <p>以同一公司代碼的已發布公開資料彙整。</p>
    </header>
    <div class="company-tabs" role="tablist" aria-label="公司公開資料分頁">${COMPANY_TABS.map((tab) => `<button type="button" role="tab" aria-selected="${selectedTab === tab}" aria-controls="company-panel-${tab}" data-company-tab="${tab}">${labels[tab]}</button>`).join("")}</div>
    ${COMPANY_TABS.map((tab) => `<section id="company-panel-${tab}" class="company-overview-card" role="tabpanel" data-company-panel="${tab}"${selectedTab === tab ? "" : " hidden"}>${panels[tab]}</section>`).join("")}
  `;
}

function syncCompanyTab(activeTab) {
  if (typeof location === "undefined" || typeof globalThis.history?.replaceState !== "function") return;
  const url = new URL(location.href);
  if (activeTab === "overview") url.searchParams.delete("tab");
  else url.searchParams.set("tab", activeTab);
  globalThis.history.replaceState(globalThis.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function bindCompanyTabs(target, initialTab) {
  const tabs = [...target.querySelectorAll("[data-company-tab]")];
  const activate = (button, { sync = true } = {}) => {
    const active = parseCompanyTab(button.dataset.companyTab);
    for (const control of tabs) control.setAttribute("aria-selected", String(control === button));
    for (const panel of target.querySelectorAll("[data-company-panel]")) panel.hidden = panel.dataset.companyPanel !== active;
    if (sync) syncCompanyTab(active);
  };
  for (const [index, button] of tabs.entries()) {
    button.addEventListener("click", () => activate(button));
    button.addEventListener("keydown", (event) => {
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
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

function renderOverview(target, overview, activeTab = "overview") {
  target.innerHTML = renderCompanyOverviewHtml(overview, activeTab);
  if (overview) bindCompanyTabs(target, parseCompanyTab(activeTab));
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
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
  if (!runtime?.companyMasterUrl) {
    target.innerHTML = '<p class="empty-state">公司公開資料暫時無法載入，請稍後再試。</p>';
    return;
  }
  const [companyMaster, market, ipo, revenue, workbench] = await Promise.all([
    fetchJson(new URL(runtime.companyMasterUrl, document.baseURI)),
    runtime.emergingMarketUrl ? fetchJson(new URL(runtime.emergingMarketUrl, document.baseURI)) : null,
    runtime.ipoEventsUrl ? fetchJson(new URL(runtime.ipoEventsUrl, document.baseURI)) : null,
    runtime.datasets?.["94025"] ? fetchJson(new URL(runtime.datasets["94025"], document.baseURI)) : null,
    runtime.datasets?.bondWorkbench ? fetchJson(new URL(runtime.datasets.bondWorkbench, document.baseURI)) : null,
  ]);
  if (!Array.isArray(companyMaster?.records)) {
    target.innerHTML = '<p class="empty-state">公司公開資料暫時無法載入，請稍後再試。</p>';
    return;
  }
  renderOverview(target, buildCompanyOverview({
    code,
    companyMaster: companyMaster.records,
    emerging: market,
    ipo,
    revenue,
    workbench,
  }), parseCompanyTab(new URLSearchParams(location.search).get("tab")));
}

if (globalThis.window && globalThis.document) loadCompanyOverview();
