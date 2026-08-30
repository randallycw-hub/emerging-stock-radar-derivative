import { loadPublicCbWorkbenchV53 } from "./bond-public-data.js";

export function buildCbMarketStats(model = {}) {
  const records = arrayValue(model?.records).filter((record) => record?.status === "active");
  const summary = model?.summary ?? {};
  const market = new Map();
  for (const record of records) {
    const label = text(record.market) || "其他";
    market.set(label, (market.get(label) ?? 0) + 1);
  }
  return {
    dataDate: isoDate(model.dataDate),
    current: {
      activeCount: finite(summary.activeCount) ?? records.length,
      tradedCount: finite(summary.tradedCount),
      turnoverAmount: finite(summary.turnoverAmount),
      weekTurnoverAmount: finite(summary.weekTurnoverAmount),
    },
    marketBreakdown: [...market.entries()].sort(([left], [right]) => left.localeCompare(right, "zh-Hant")).map(([label, count]) => ({ label, count })),
    premiumDistribution: premiumDistribution(records),
    maturityDistribution: maturityDistribution(records, model.dataDate),
  };
}

export function renderCbMarketStats(stats = {}) {
  const current = stats?.current ?? {};
  return `<div class="cb-stats-grid">
    <section class="cb-stats-panel"><header><p class="section-number">CURRENT MARKET</p><h2>今日市場</h2></header><dl class="cb-stats-current">${statFact("有效 CB", count(current.activeCount))}${statFact("今日有成交", count(current.tradedCount))}${statFact("今日成交額", amount(current.turnoverAmount))}${statFact("本週成交額", amount(current.weekTurnoverAmount))}</dl></section>
    ${distributionPanel("市場分布", stats.marketBreakdown)}
    ${distributionPanel("轉換溢價分布", stats.premiumDistribution)}
    ${distributionPanel("到期年限分布", stats.maturityDistribution)}
  </div>`;
}

function premiumDistribution(records) {
  const definitions = [
    ["折價", (value) => value < 0],
    ["0–10%", (value) => value >= 0 && value < 10],
    ["10–30%", (value) => value >= 10 && value < 30],
    ["30% 以上", (value) => value >= 30],
  ];
  const buckets = definitions.map(([label]) => ({ label, count: 0 }));
  let unavailable = 0;
  for (const record of records) {
    const premium = finite(record?.quote?.premiumRate);
    const index = premium === null ? -1 : definitions.findIndex(([, predicate]) => predicate(premium));
    if (index < 0) unavailable += 1;
    else buckets[index].count += 1;
  }
  return [...buckets, { label: "—", count: unavailable }];
}

function maturityDistribution(records, dataDate) {
  const asOf = isoDate(dataDate);
  const buckets = [
    { label: "1 年內", count: 0 },
    { label: "1–3 年", count: 0 },
    { label: "3 年以上", count: 0 },
    { label: "—", count: 0 },
  ];
  for (const record of records) {
    const maturity = isoDate(record?.terms?.maturityDate);
    if (!asOf || !maturity) { buckets[3].count += 1; continue; }
    const days = (Date.parse(`${maturity}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86400000;
    if (days < 0 || days <= 365) buckets[0].count += 1;
    else if (days <= 365 * 3) buckets[1].count += 1;
    else buckets[2].count += 1;
  }
  return buckets;
}

function distributionPanel(title, rows) {
  const values = arrayValue(rows);
  return `<section class="cb-stats-panel"><header><h2>${escapeHtml(title)}</h2></header><ol class="cb-distribution">${values.map((row) => `<li><span>${escapeHtml(row?.label ?? "—")}</span><strong>${count(row?.count)}</strong></li>`).join("")}</ol></section>`;
}

function statFact(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

async function initialize() {
  const root = document.querySelector("[data-cb-stats-root]");
  const update = document.querySelector("#cb-stats-update");
  const errorTarget = document.querySelector("[data-page-error]");
  if (!root || !update) return;
  const model = await loadPublicCbWorkbenchV53({ errorTarget });
  if (!model?.dataDate || !Array.isArray(model.records)) {
    update.textContent = "資料暫時無法取得";
    root.innerHTML = '<p class="empty-state">資料暫時無法取得</p>';
    return;
  }
  const stats = buildCbMarketStats(model);
  update.textContent = `資料日 ${dateLabel(stats.dataDate)}`;
  root.innerHTML = renderCbMarketStats(stats);
}

function count(value) {
  const number = finite(value);
  return number === null ? "—" : new Intl.NumberFormat("zh-Hant-TW", { maximumFractionDigits: 0 }).format(number);
}

function amount(value) {
  const number = finite(value);
  return number === null ? "—" : `${new Intl.NumberFormat("zh-Hant-TW", { maximumFractionDigits: 0 }).format(number)} 元`;
}

function dateLabel(value) {
  return isoDate(value)?.replaceAll("-", "/") ?? "—";
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function text(value) {
  return String(value ?? "").trim();
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

if (globalThis.window && globalThis.document) await initialize();
