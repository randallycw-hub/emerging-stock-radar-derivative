import { formatDate, safeJsonFetch } from "./site-shell.js";
import { buildCrossMarketEventEntries, isPublishedIsoDate } from "./public-event-digest.js";

const updateTarget = globalThis.document?.querySelector("#last-successful-update") ?? null;
const coverageTarget = globalThis.document?.querySelector("#home-data-coverage") ?? null;
const eventStrip = globalThis.document?.querySelector("#home-event-strip") ?? null;
const summaryTarget = globalThis.document?.querySelector("#home-market-summary") ?? null;
const rankingTarget = globalThis.document?.querySelector("#home-rankings") ?? null;
const bootstrapConfig = globalThis.window?.__OFFICIAL_SHOWCASE__ ?? {
  generationPointerUrl: new URL("../data/current.json", import.meta.url).href,
};
const pointerUrl = bootstrapConfig.generationPointerUrl;

if (globalThis.window && globalThis.document) loadHomeData();

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_IPO_STAGES = new Set(["A", "B", "C", "D"]);

function recordsOf(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.records) ? value.records : null;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sum(records, fields) {
  return records.reduce((total, record) => {
    const value = fields.map((field) => number(record?.[field])).find((candidate) => candidate !== null);
    return total + (value ?? 0);
  }, 0);
}

function daysFrom(asOfDate, date) {
  if (!isPublishedIsoDate(asOfDate) || !isPublishedIsoDate(date)) return null;
  return (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${asOfDate}T00:00:00Z`)) / DAY_MS;
}

function countUpcomingEvents(records, asOfDate, matcher, days) {
  const seen = new Set();
  for (const record of records) {
    for (const event of Array.isArray(record?.events) ? record.events : []) {
      const distance = daysFrom(asOfDate, event?.date);
      if (distance === null || distance < 0 || distance > days || !matcher.test(String(event?.label ?? event?.title ?? event?.type ?? ""))) continue;
      seen.add(String(record?.companyCode ?? record?.bondCode ?? event?.bondCode ?? `${event.date}:${event.label ?? event.title}`));
    }
  }
  return seen.size;
}

function activeBond(record) {
  return String(record?.status ?? "").toLowerCase() === "active";
}

export function buildHomeSummary({ emerging, ipo, bonds, asOfDate = null } = {}) {
  const emergingRecords = recordsOf(emerging);
  const ipoRecords = recordsOf(ipo);
  const bondRecords = recordsOf(bonds);
  const activeIpoRecords = ipoRecords?.filter((record) => ACTIVE_IPO_STAGES.has(String(record?.stage ?? ""))) ?? null;
  const activeBondRecords = bondRecords?.filter(activeBond) ?? null;
  return {
    emerging: emergingRecords === null ? null : {
      marketCount: emergingRecords.length,
      tradedCount: emergingRecords.filter((record) => (number(record?.transactionVolume) ?? 0) > 0).length,
      totalTurnover: sum(emergingRecords, ["estimatedTransactionAmount", "transactionAmount"]),
      upCount: emergingRecords.filter((record) => record?.direction === "up").length,
      downCount: emergingRecords.filter((record) => record?.direction === "down").length,
      newListingCount: emergingRecords.filter((record) => record?.listingDate === asOfDate || record?.isNewListing === true).length,
      lowLiquidityCount: emergingRecords.filter((record) => record?.lowLiquidity === true || record?.liquidityStatus === "low").length,
    },
    ipo: ipoRecords === null ? null : {
      activeCases: activeIpoRecords.length,
      upcomingReviews: countUpcomingEvents(activeIpoRecords, asOfDate, /審議/u, 90),
      auctionOrSubscription7d: countUpcomingEvents(activeIpoRecords, asOfDate, /競拍|申購|抽籤/u, 7),
      plannedListings30d: countUpcomingEvents(activeIpoRecords, asOfDate, /掛牌|上市|上櫃買賣/u, 30),
    },
    bonds: bondRecords === null ? null : {
      activeCount: activeBondRecords.length,
      tradedCount: activeBondRecords.filter((record) => (number(record?.cbTradeUnits) ?? number(record?.transactionVolume) ?? 0) > 0).length,
      totalTurnover: sum(activeBondRecords, ["cbTurnoverAmount", "transactionAmount", "turnoverAmount"]),
      events30d: countUpcomingEvents(activeBondRecords, asOfDate, /./u, 30),
      recentListings: activeBondRecords.filter((record) => {
        const distance = daysFrom(asOfDate, record?.listingDate);
        return distance !== null && distance <= 0 && distance >= -30;
      }).length,
    },
    emergingCount: emergingRecords?.length ?? null,
    ipoCount: ipoRecords?.length ?? null,
    activeBondCount: activeBondRecords?.length ?? null,
  };
}

function ranked(records, { label, code, name, metric, direction = "desc" }) {
  return {
    label,
    metric,
    entries: records
      .map((record) => ({ code: String(record?.[code] ?? "").trim(), name: String(record?.[name] ?? "").trim(), value: number(record?.[metric]) }))
      .filter((record) => record.code && record.value !== null)
      .sort((left, right) => direction === "asc" ? left.value - right.value : right.value - left.value)
      .slice(0, 10),
  };
}

export function buildObjectiveRankings({ emerging, bonds } = {}) {
  const emergingRecords = recordsOf(emerging) ?? [];
  const bondRecords = recordsOf(bonds)?.filter(activeBond) ?? [];
  return [
    ranked(emergingRecords, { label: "興櫃成交金額前 10", code: "companyCode", name: "companyName", metric: "estimatedTransactionAmount" }),
    ranked(emergingRecords, { label: "興櫃成交量前 10", code: "companyCode", name: "companyName", metric: "transactionVolume" }),
    ranked(emergingRecords, { label: "興櫃日均價漲幅前 10", code: "companyCode", name: "companyName", metric: "averageChangePercent" }),
    ranked(emergingRecords, { label: "興櫃週漲幅前 10", code: "companyCode", name: "companyName", metric: "weeklyChangePercent" }),
    ranked(bondRecords, { label: "CB 成交量前 10", code: "bondCode", name: "bondName", metric: "cbTradeUnits" }),
    ranked(bondRecords, { label: "CB 成交金額前 10", code: "bondCode", name: "bondName", metric: "cbTurnoverAmount" }),
    ranked(bondRecords, { label: "CB 轉換溢價率排序", code: "bondCode", name: "bondName", metric: "premiumRate", direction: "asc" }),
    ranked(bondRecords, { label: "CB 流通餘額變化排序", code: "bondCode", name: "bondName", metric: "outstandingReductionRate" }),
  ];
}

async function loadHomeData() {
  const pointer = await safeJsonFetch(pointerUrl, { errorTarget: updateTarget });
  if (!pointer?.runtimeUrl) return renderHomeEvents({});

  const runtime = await safeJsonFetch(
    new URL(pointer.runtimeUrl, document.baseURI),
    { errorTarget: updateTarget },
  );
  if (!runtime?.manifestUrl) return renderHomeEvents({});

  const manifest = await safeJsonFetch(
    new URL(runtime.manifestUrl, document.baseURI),
    { errorTarget: updateTarget },
  );
  const workbenchUrl = runtime.datasets?.bondWorkbench;
  const ipoEventsUrl = runtime.ipoEventsUrl;
  const emergingUrl = runtime.emergingMarketUrl;
  const [workbench, ipo, emerging] = await Promise.all([
    typeof workbenchUrl === "string"
      ? safeJsonFetch(new URL(workbenchUrl, document.baseURI), { errorTarget: coverageTarget })
      : Promise.resolve(null),
    typeof ipoEventsUrl === "string"
      ? safeJsonFetch(new URL(ipoEventsUrl, document.baseURI), { errorTarget: coverageTarget })
      : Promise.resolve(null),
    typeof emergingUrl === "string"
      ? safeJsonFetch(new URL(emergingUrl, document.baseURI), { errorTarget: coverageTarget })
      : Promise.resolve(null),
  ]);

  const date = manifest?.market?.dataDate ?? manifest?.generatedAt;
  updateTarget.textContent = isPublishedIsoDate(date)
    ? `最後成功更新：${formatDate(date)}`
    : "更新時間尚未提供";
  const asOfDate = manifest?.market?.dataDate;
  renderHomeEvents({
    asOfDate,
    bonds: Array.isArray(workbench?.records) ? workbench.records : undefined,
    emergingEvents: Array.isArray(emerging?.events) ? emerging.events : undefined,
    ipoDataDate: ipo?.dataDate,
    ipoRecords: Array.isArray(ipo?.records) ? ipo.records : undefined,
    ipoSourceManifest: Array.isArray(ipo?.sourceManifest) ? ipo.sourceManifest : undefined,
  });
  renderHomeSummary(buildHomeSummary({ emerging, ipo, bonds: workbench, asOfDate }));
  renderHomeRankings(buildObjectiveRankings({ emerging, bonds: workbench }));
}

function renderHomeEvents(input) {
  const events = buildCrossMarketEventEntries(input);
  const dataDate = isPublishedIsoDate(input.asOfDate) ? formatDate(input.asOfDate) : "尚未提供";
  if (coverageTarget) coverageTarget.textContent = `資料日期 ${dataDate}`;
  if (!eventStrip) return;
  const render = (market = "all") => {
    const selected = market === "all" ? events : events.filter((event) => event.market === market);
    eventStrip.innerHTML = selected.length
      ? selected.map(eventTimelineHtml).join("")
      : '<p class="empty-state">目前沒有近期已發布事件。</p>';
  };
  for (const button of document.querySelectorAll("[data-home-event-market]")) {
    button.addEventListener("click", () => {
      const market = button.dataset.homeEventMarket ?? "all";
      for (const control of document.querySelectorAll("[data-home-event-market]")) control.setAttribute("aria-pressed", String(control === button));
      render(market);
    });
  }
  render();
}

function renderHomeSummary(summary) {
  if (!summaryTarget) return;
  const count = (value) => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "string") return escapeHtml(value);
    return new Intl.NumberFormat("zh-TW").format(value);
  };
  const metric = (label, value) => `<div><dt>${escapeHtml(label)}</dt><dd>${count(value)}</dd></div>`;
  const panel = (title, metrics) => `<article class="home-summary-panel"><h3>${escapeHtml(title)}</h3><dl>${metrics.map(([label, value]) => metric(label, value)).join("")}</dl></article>`;
  summaryTarget.innerHTML = [
    summary.emerging === null ? panel("興櫃市場", [["資料狀態", null]]) : panel("興櫃市場", [["市場家數", summary.emerging.marketCount], ["今日有交易", summary.emerging.tradedCount], ["今日成交總額", summary.emerging.totalTurnover], ["上漲／下跌", `${summary.emerging.upCount}／${summary.emerging.downCount}`], ["新登錄", summary.emerging.newListingCount], ["低流動性", summary.emerging.lowLiquidityCount]]),
    summary.ipo === null ? panel("IPO", [["資料狀態", null]]) : panel("IPO", [["進行中案件", summary.ipo.activeCases], ["近期審議", summary.ipo.upcomingReviews], ["7 日內競拍／申購", summary.ipo.auctionOrSubscription7d], ["30 日內預計掛牌", summary.ipo.plannedListings30d]]),
    summary.bonds === null ? panel("可轉債", [["資料狀態", null]]) : panel("可轉債", [["有效 CB", summary.bonds.activeCount], ["今日有成交", summary.bonds.tradedCount], ["今日成交總額", summary.bonds.totalTurnover], ["30 日內事件", summary.bonds.events30d], ["近期新掛牌", summary.bonds.recentListings]]),
  ].join("");
}

function renderHomeRankings(rankings) {
  if (!rankingTarget) return;
  rankingTarget.innerHTML = rankings.map((ranking) => `<section class="ranking-panel"><h3>${escapeHtml(ranking.label)}</h3><ol>${ranking.entries.map((entry) => `<li><span>${escapeHtml(entry.code)} ${escapeHtml(entry.name)}</span><strong>${formatNumber(entry.value)}</strong></li>`).join("") || '<li class="empty-cell">—</li>'}</ol></section>`).join("");
}

function eventTimelineHtml(event) {
  const labels = { emerging: "興櫃", ipo: "IPO", bonds: "CB" };
  return `<a class="home-event-card" href="${escapeAttribute(event.href)}"><time datetime="${escapeAttribute(event.date)}">${formatDate(event.date)}</time><p>${escapeHtml(labels[event.market] ?? "市場")} · ${escapeHtml(event.title)}</p>${event.code ? `<strong>${escapeHtml(event.code)}</strong>` : ""}<span aria-hidden="true">→</span></a>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
