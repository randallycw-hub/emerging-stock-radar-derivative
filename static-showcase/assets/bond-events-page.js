import { dateValue, loadPublicBondWorkbench, textValue } from "./bond-public-data.js";
import { projectPublicBondEvents } from "./public-event-digest.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function filterPublicBondEvents(events, { asOfDate, days = null } = {}) {
  const maxDays = Number.isInteger(days) && days >= 0 ? days : null;
  const asOfDay = Date.parse(`${asOfDate}T00:00:00Z`);
  return projectPublicBondEvents(events, asOfDate).filter((event) => {
    if (maxDays === null) return true;
    return (Date.parse(`${event.date}T00:00:00Z`) - asOfDay) / DAY_MS <= maxDays;
  });
}

export function buildPublicBondEventRows(records, asOfDate, days = null) {
  const names = new Map();
  const events = [];
  for (const record of Array.isArray(records) ? records : []) {
    const code = String(record?.bondCode ?? record?.term?.bondCode ?? "").trim();
    if (!code) continue;
    names.set(code, textValue(record?.bondName ?? record?.term?.bondName));
    for (const event of Array.isArray(record?.events) ? record.events : []) {
      events.push({ ...event, bondCode: code });
    }
  }
  return filterPublicBondEvents(events, { asOfDate, days }).map((event) => ({
    ...event,
    bondName: names.get(event.bondCode) ?? "—",
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
  target.innerHTML = `<div class="public-event-list">${rows.map((row) => `<article>
    <time datetime="${escapeHtml(row.date)}">${dateValue(row.date)}</time>
    <div><strong>${escapeHtml(row.bondCode)} ${escapeHtml(row.bondName)}</strong><p>${escapeHtml(row.title)} · ${escapeHtml(row.type)}</p></div>
  </article>`).join("")}</div>`;
}

async function initialize() {
  const root = document.querySelector("[data-bond-events-root]");
  const target = document.querySelector("#bond-events-list");
  const count = document.querySelector("#bond-events-count");
  const range = document.querySelector("#bond-event-range");
  const errorTarget = document.querySelector("[data-page-error]");
  if (!root || !target || !count || !range) return;
  const workbench = await loadPublicBondWorkbench({ errorTarget });
  if (!workbench?.dataDate || !Array.isArray(workbench.records)) return;
  const render = () => {
    const selected = range.value === "30" ? 30 : null;
    const rows = buildPublicBondEventRows(workbench.records, workbench.dataDate, selected);
    count.textContent = `${rows.length} 筆`;
    renderRows(target, rows);
  };
  range.addEventListener("change", render);
  render();
}

if (globalThis.window && globalThis.document) await initialize();
