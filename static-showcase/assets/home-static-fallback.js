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
