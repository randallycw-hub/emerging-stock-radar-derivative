import { dateValue, loadPublicBondWorkbench, textValue } from "./bond-public-data.js";
import { projectPublicBondEvents } from "./public-event-digest.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function matchesPublicEventType(event, type) {
  if (!type || type === "all") return true;
  const value = String(event?.type ?? "");
  if (type === "conversion") return /^conversion_/u.test(value);
  if (type === "conversion-price") return value === "conversion_price_adjustment";
  if (type === "conversion-state") return value === "conversion_suspended" || value === "conversion_resumed";
  if (type === "put") return value === "put";
  if (type === "redemption") return value === "redemption";
  if (type === "listing") return value === "listing";
  if (type === "maturity") return value === "maturity";
  return false;
}

export function filterPublicBondEvents(events, { asOfDate, days = null, type = "all" } = {}) {
  const maxDays = Number.isInteger(days) && days >= 0 ? days : null;
  const asOfDay = Date.parse(`${asOfDate}T00:00:00Z`);
  return projectPublicBondEvents(events, asOfDate).filter((event) => {
    if (!matchesPublicEventType(event, type)) return false;
    if (maxDays === null) return true;
    return (Date.parse(`${event.date}T00:00:00Z`) - asOfDay) / DAY_MS <= maxDays;
  });
}

export function buildPublicBondEventRows(records, asOfDate, { days = null, type = "all" } = {}) {
  const names = new Map();
  const issuers = new Map();
  const events = [];
  for (const record of Array.isArray(records) ? records : []) {
    const code = String(record?.bondCode ?? record?.term?.bondCode ?? "").trim();
    if (!code) continue;
    names.set(code, textValue(record?.bondName ?? record?.term?.bondName));
    issuers.set(code, textValue(record?.issuerName ?? record?.term?.issuerName));
    for (const event of Array.isArray(record?.events) ? record.events : []) {
      events.push({ ...event, bondCode: code });
    }
  }
  return filterPublicBondEvents(events, { asOfDate, days, type }).map((event) => ({
    ...event,
    bondName: names.get(event.bondCode) ?? "—",
    issuerName: issuers.get(event.bondCode) ?? "—",
  }));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function renderRows(target, rows) {
  if (!rows.length) {
    target.innerHTML = '<p class="empty-state">目前沒有符合條件的公開事件。</p>';
    return;
  }
  target.innerHTML = `<div class="bond-table-shell"><table class="bond-table public-data-table"><thead><tr><th>日期</th><th>CB</th><th>公司</th><th>事件</th><th>詳情</th><th>官方來源</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${dateValue(row.date)}</td><td>${escapeHtml(row.bondCode)} ${escapeHtml(row.bondName)}</td><td>${escapeHtml(row.issuerName ?? "—")}</td><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.title)}</td><td>已核對公開來源</td></tr>`).join("")}</tbody></table></div>`;
}

async function initialize() {
  const root = document.querySelector("[data-bond-events-root]");
  const target = document.querySelector("#bond-events-list");
  const count = document.querySelector("#bond-events-count");
  const range = document.querySelector("#bond-event-range");
  const type = document.querySelector("#bond-event-type");
  const errorTarget = document.querySelector("[data-page-error]");
  if (!root || !target || !count || !range || !type) return;
  const workbench = await loadPublicBondWorkbench({ errorTarget });
  if (!workbench?.dataDate || !Array.isArray(workbench.records)) return;
  const render = () => {
    const selected = range.value === "30" || type.value === "maturity30" ? 30 : null;
    const eventType = type.value === "maturity30" ? "maturity" : type.value;
    const rows = buildPublicBondEventRows(workbench.records, workbench.dataDate, { days: selected, type: eventType });
    count.textContent = `${rows.length} 筆`;
    renderRows(target, rows);
  };
  range.addEventListener("change", render);
  type.addEventListener("change", render);
  render();
}

if (globalThis.window && globalThis.document) await initialize();
