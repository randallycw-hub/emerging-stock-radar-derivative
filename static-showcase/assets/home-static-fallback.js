import { buildHomeSummary } from "./home-page.js";
import { buildCrossMarketEventEntries, isPublishedIsoDate } from "./public-event-digest.js";
import { formatNumber, renderMarketStatusLine } from "./site-shell.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function displayCount(value) {
  return value === null || value === undefined ? "—" : formatNumber(value);
}

function summaryPanel(title, metrics) {
  return `<article class="home-summary-panel"><h3>${escapeHtml(title)}</h3><dl>${metrics.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${displayCount(value)}</dd></div>`).join("")}</dl></article>`;
}

function renderSummary(summary) {
  const emerging = summary.emerging;
  const ipo = summary.ipo;
  const bonds = summary.bonds;
  return [
    summaryPanel("興櫃市場", emerging ? [
      ["市場家數", emerging.marketCount], ["今日有交易", emerging.tradedCount], ["今日成交總額", emerging.totalTurnover], ["上漲／下跌", `${emerging.upCount}／${emerging.downCount}`],
    ] : [["市場家數", null], ["今日有交易", null]]),
    summaryPanel("IPO 進度", ipo ? [
      ["進行中案件", ipo.activeCases], ["近期審議", ipo.upcomingReviews], ["7 日內競拍／申購", ipo.auctionOrSubscription7d],
    ] : [["進行中案件", null], ["近期審議", null]]),
    summaryPanel("可轉債事件", bonds ? [
      ["有效 CB", bonds.activeCount], ["今日有成交", bonds.tradedCount], ["30 日內事件", bonds.events30d],
    ] : [["有效 CB", null], ["今日有成交", null]]),
  ].join("");
}

function renderEvents(events) {
  if (!events.length) return '<p class="empty-state">目前沒有近期已發布事件。</p>';
  const labels = { emerging: "興櫃", ipo: "IPO", bonds: "CB" };
  return events.slice(0, 8).map((event) => `<a class="home-event-card" href="${escapeHtml(event.href)}"><time datetime="${escapeHtml(event.date)}">${escapeHtml(event.date.replaceAll("-", "/"))}</time><p>${escapeHtml(labels[event.market] ?? "市場")} · ${escapeHtml(event.title)}</p>${event.code ? `<strong>${escapeHtml(event.code)}</strong>` : ""}<span aria-hidden="true">→</span></a>`).join("");
}

function formatDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? value.replaceAll("-", "/") : "—";
}

function formatMetric(value, { percent = false } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const rendered = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(Number(value));
  return percent ? `${rendered}%` : rendered;
}

function publicState(state) {
  const messages = {
    data_unavailable: "資料暫時無法取得",
    no_verified_data: "尚無可用的已驗證成交資料",
    no_trades: "今日無成交",
    not_published: "待公布",
    not_available: "尚未納入本期公開資料",
  };
  return messages[state] ?? "暫無可顯示的公開資料";
}

function stateHtml(state) {
  return `<p class="home-v51-state">${escapeHtml(publicState(state))}</p>`;
}

function researchRow({ route, primary, secondary, metric }) {
  const body = `<span><strong>${escapeHtml(primary)}</strong>${secondary ? `<small>${escapeHtml(secondary)}</small>` : ""}</span>${metric ? `<b>${escapeHtml(metric)}</b>` : ""}`;
  return route ? `<a class="home-v51-row" href="${escapeHtml(route)}">${body}<i aria-hidden="true">→</i></a>` : `<div class="home-v51-row">${body}</div>`;
}

function renderCbStockLeaders(section = {}) {
  const entries = Array.isArray(section.entries) ? section.entries : [];
  const list = section.state === "ready"
    ? entries.map((entry) => {
      const bondLinks = (Array.isArray(entry.relatedBonds) ? entry.relatedBonds : [])
        .map((bond) => `<a href="${escapeHtml(bond.route)}">${escapeHtml(`${bond.code} ${bond.name}`)}</a>`).join("、");
      return `<div class="home-v51-row"><span><a class="home-v51-row__primary" href="${escapeHtml(entry.route)}">${escapeHtml(`${entry.code} ${entry.name}`)}</a>${bondLinks ? `<small>相關 CB：${bondLinks}</small>` : ""}</span><b>${escapeHtml(formatMetric(entry.changePercent, { percent: true }))}</b><i aria-hidden="true">→</i></div>`;
    }).join("")
    : stateHtml(section.state);
  return `<article class="home-v51-card home-v51-card--leader"><div class="home-v51-card__heading"><p class="kicker">CB UNDERLYING STOCKS</p><h3>可轉債標的股漲幅</h3><a href="./bonds.html">查看可轉債</a></div><p class="home-v51-card__meta">資料日 ${escapeHtml(formatDate(section.dataDate))}</p><div class="home-v51-list">${list}</div></article>`;
}

function renderRankEntries(entries) {
  if (!entries.length) return '<p class="home-v51-state">本期沒有符合條件的公開排行資料。</p>';
  return entries.map((entry) => researchRow({
    route: entry.route,
    primary: `${entry.rank}. ${entry.code} ${entry.name}`,
    secondary: entry.primaryLabel,
    metric: formatMetric(entry.primaryValue, { percent: /漲跌|YoY/u.test(entry.primaryLabel ?? "") }),
  })).join("");
}

function renderEmergingRankings(section = {}) {
  const tabs = section.tabs && typeof section.tabs === "object" ? section.tabs : {};
  const entries = Object.entries(tabs);
  const firstKey = entries[0]?.[0];
  const body = section.state === "ready"
    ? `<div class="home-v51-tabs" role="tablist" aria-label="興櫃排行種類">${entries.map(([key, tab]) => `<button type="button" data-home-v51-ranking-tab="${escapeHtml(key)}" role="tab" aria-selected="${String(key === firstKey)}">${escapeHtml(tab.label)}</button>`).join("")}</div><div class="home-v51-tab-panels">${entries.map(([key, tab]) => `<div data-home-v51-ranking-panel="${escapeHtml(key)}" role="tabpanel"${key === firstKey ? "" : " hidden"}>${tab.state === "not_available" ? stateHtml(tab.state) : renderRankEntries(Array.isArray(tab.entries) ? tab.entries : [])}</div>`).join("")}</div>`
    : stateHtml(section.state);
  return `<article class="home-v51-card"><div class="home-v51-card__heading"><p class="kicker">EMERGING MARKET</p><h3>興櫃排行</h3><a href="./emerging.html">查看全部</a></div><p class="home-v51-card__meta">資料日 ${escapeHtml(formatDate(section.dataDate))}</p>${body}</article>`;
}

function renderIpoCalendar(section = {}) {
  const entries = Array.isArray(section.days7?.entries) ? section.days7.entries : [];
  const list = section.state === "ready" && entries.length
    ? entries.slice(0, 5).map((entry) => researchRow({ route: entry.route, primary: `${entry.code} ${entry.name}`, secondary: `${formatDate(entry.date)}・${entry.label}` })).join("")
    : stateHtml(section.state);
  return `<article class="home-v51-card"><div class="home-v51-card__heading"><p class="kicker">IPO EVENT CALENDAR</p><h3>近期 IPO 時程</h3><a href="./ipo.html">完整時程</a></div><p class="home-v51-card__meta">未來 7 日已公告事件</p><div class="home-v51-list">${list}</div></article>`;
}

function renderCbTurnover(section = {}) {
  const renderPeriod = (label, period) => `<section class="home-v51-subsection"><h4>${escapeHtml(label)}</h4>${period?.state === "ready" ? (period.entries ?? []).map((entry) => researchRow({ route: entry.route, primary: `${entry.code} ${entry.name}`, secondary: `${entry.issuerCode} ${entry.issuerName}`, metric: `${formatMetric(entry.tradingUnits)} 張` })).join("") : stateHtml(period?.state)}</section>`;
  return `<article class="home-v51-card"><div class="home-v51-card__heading"><p class="kicker">CB TURNOVER</p><h3>CB 成交排行</h3><a href="./bonds.html">查看總表</a></div>${renderPeriod("當日成交", section.daily)}${renderPeriod("近 5 日成交", section.weekly)}</article>`;
}

function renderCbIssuance(section = {}) {
  const entries = Array.isArray(section.entries) ? section.entries : [];
  const list = section.state === "ready"
    ? entries.map((entry) => researchRow({ route: entry.route, primary: `${entry.cbCode} ${entry.cbName}`, secondary: `${entry.companyName}・${entry.stage}・${formatDate(entry.nextDate)}` })).join("")
    : stateHtml(section.state);
  return `<article class="home-v51-card"><div class="home-v51-card__heading"><p class="kicker">CB ISSUANCE</p><h3>已公告發行與掛牌</h3><a href="./bonds-issuance.html">查看發行進度</a></div><div class="home-v51-list">${list}</div></article>`;
}

function renderCbOfficialEvents(section = {}) {
  const entries = Array.isArray(section.entries) ? section.entries : [];
  const list = section.state === "ready"
    ? entries.map((entry) => `<a class="home-v51-row" href="${escapeHtml(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer"><span><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(`${formatDate(entry.date)}・${entry.code} ${entry.name}`)}</small></span><b>${escapeHtml(entry.sourceName || "官方公告")}</b><i aria-hidden="true">↗</i></a>`).join("")
    : stateHtml(section.state);
  return `<article class="home-v51-card"><div class="home-v51-card__heading"><p class="kicker">OFFICIAL CB EVENTS</p><h3>官方 CB 事件</h3><a href="./bonds-events.html">查看事件</a></div><div class="home-v51-list">${list}</div></article>`;
}

function renderIpoThirtyDays(section = {}) {
  const entries = Array.isArray(section.days30?.entries) ? section.days30.entries : [];
  const list = section.state === "ready" && entries.length
    ? entries.slice(0, 6).map((entry) => researchRow({ route: entry.route, primary: `${entry.code} ${entry.name}`, secondary: `${formatDate(entry.date)}・${entry.label}` })).join("")
    : stateHtml(section.state);
  return `<article class="home-v51-card"><div class="home-v51-card__heading"><p class="kicker">IPO 30 DAYS</p><h3>30 日內 IPO 排程</h3><a href="./ipo-radar.html">IPO 雷達</a></div><div class="home-v51-list">${list}</div></article>`;
}

function renderV51Events(section = {}) {
  const entries = Array.isArray(section.entries) ? section.entries : [];
  if (section.state !== "ready") return stateHtml(section.state);
  const labels = { cb: "CB", ipo: "IPO", emerging: "興櫃" };
  return entries.slice(0, 8).map((entry) => `<a class="home-event-card" href="${escapeHtml(entry.route)}"><time datetime="${escapeHtml(entry.date)}">${escapeHtml(formatDate(entry.date))}</time><p>${escapeHtml(labels[entry.category] ?? "市場")} · ${escapeHtml(entry.title)}</p><strong>${escapeHtml(entry.code)}</strong><span aria-hidden="true">→</span></a>`).join("");
}

export function buildV51HomeStaticFallback(research = {}) {
  const home = research?.home ?? {};
  const dataDate = research?.meta?.dataDate ?? null;
  return {
    statusText: dataDate ? renderMarketStatusLine({ dataDate, updatedAt: research?.meta?.updatedAt }) : "資料日 —",
    coverageText: `資料日期 ${formatDate(dataDate)}`,
    startHtml: `<div class="home-v51-section-heading"><p class="kicker">SNAPSHOT / VERIFIED PUBLIC DATA</p><h2>本次公開資料摘要</h2><p>互動載入後會以同一份已驗證快照，比對前一個有效快照並列出實際異動。</p></div><div class="home-v51-start-grid">${renderCbStockLeaders(home.cbStockLeaders)}${renderEmergingRankings(home.emergingRankings)}${renderIpoCalendar(home.ipoCalendar)}</div>`,
    workbenchHtml: `<div class="home-v51-workbench">${renderCbTurnover(home.cbTurnover)}${renderCbIssuance(home.cbIssuance)}${renderCbOfficialEvents(home.cbOfficialEvents)}${renderIpoThirtyDays(home.ipoCalendar)}</div>`,
    eventHtml: renderV51Events(home.latestEvents),
  };
}

export function buildHomeStaticFallback({ emerging, ipo, bonds, manifest } = {}) {
  const dataDate = manifest?.market?.dataDate;
  const asOfDate = isPublishedIsoDate(dataDate) ? dataDate : null;
  const summary = buildHomeSummary({ emerging, ipo, bonds, asOfDate });
  const events = buildCrossMarketEventEntries({
    asOfDate,
    bonds: Array.isArray(bonds?.records) ? bonds.records : bonds,
    emergingEvents: Array.isArray(emerging?.events) ? emerging.events : [],
    ipoDataDate: ipo?.dataDate,
    ipoRecords: Array.isArray(ipo?.records) ? ipo.records : [],
    ipoSourceManifest: Array.isArray(ipo?.sourceManifest) ? ipo.sourceManifest : [],
  });
  return {
    statusText: asOfDate
      ? renderMarketStatusLine({ dataDate: asOfDate, updatedAt: manifest?.market?.generatedAt })
      : "資料日 —",
    coverageText: `資料日期 ${asOfDate ? asOfDate.replaceAll("-", "/") : "—"}`,
    summaryHtml: renderSummary(summary),
    eventHtml: renderEvents(events),
  };
}
