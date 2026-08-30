import { loadPublicCbWorkbenchV53 } from "./bond-public-data.js";
import { EVENT_TYPE_LABELS, isOfficialSourceUrl } from "./cb-workbench-v53.js";
import { projectPublicBondEvents } from "./public-event-digest.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function matchesPublicEventType(event, type) {
  if (!type || type === "all") return true;
  const value = String(event?.type ?? "");
  if (type === "conversion") return /^conversion_/u.test(value);
  if (type === "conversion-price") return value === "conversion_price_adjustment" || value === "conversion_adjustment";
  if (type === "conversion-state") return value === "conversion_suspended" || value === "conversion_suspension" || value === "conversion_resumed";
  return ["put", "redemption", "listing", "maturity"].includes(type) && value === type;
}

// Kept as a small, legacy-compatible public projection for the cross-market digest.
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
    for (const event of Array.isArray(record?.events) ? record.events : []) events.push({ ...event, bondCode: code });
  }
  return filterPublicBondEvents(events, { asOfDate, days, type }).map((event) => ({
    ...event,
    bondName: names.get(event.bondCode) ?? "—",
    issuerName: issuers.get(event.bondCode) ?? "—",
  }));
}

export function filterV53CbEvents(events, { asOfDate, days = null, type = "all", query = "" } = {}) {
  const today = isoDate(asOfDate);
  const maxDays = Number.isInteger(days) && days >= 0 ? days : null;
  const needle = normalizeQuery(query);
  if (!today) return [];
  return arrayValue(events)
    .map(projectV54CbEvent)
    .filter(Boolean)
    .filter((event) => {
      const date = isoDate(event?.date);
      if (!date || date < today || !isOfficialSourceUrl(event?.sourceUrl) || !matchesV53EventType(event, type)) return false;
      if (maxDays !== null && daysBetween(today, date) > maxDays) return false;
      return !needle || [event.cbCode, event.cbName, event.stockCode, event.companyName, event.label, event.title]
        .some((value) => normalizeQuery(value).includes(needle));
    })
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date) || String(left.cbCode).localeCompare(String(right.cbCode), "zh-Hant") || String(left.type).localeCompare(String(right.type)));
}

function projectV54CbEvent(event) {
  if (isoDate(event?.date)) return event;
  if (event?.marketScope !== "cb") return null;
  const date = isoDate(event?.effectiveDate ?? event?.announcementDate ?? event?.startDate ?? event?.endDate ?? event?.deadlineDate);
  const type = v54EventType(event?.eventType);
  const cbCode = String(event?.cbCode ?? "").trim();
  const cbName = String(event?.instrumentName ?? "").trim();
  const companyName = String(event?.companyName ?? "").trim();
  if (!date || !type || !cbCode || !cbName || !companyName || !isOfficialSourceUrl(event?.sourceUrl)) return null;
  return {
    cbCode,
    cbName,
    stockCode: String(event?.stockCode ?? "").trim(),
    companyName,
    type,
    label: EVENT_TYPE_LABELS[type] ?? "公開事件",
    date,
    title: String(event?.title ?? "").trim() || null,
    sourceUrl: event.sourceUrl,
  };
}

function v54EventType(value) {
  const mapping = {
    cb_listing: "listing",
    cb_early_redemption: "redemption",
    cb_put: "put",
    cb_maturity: "maturity",
    cb_conversion_suspension: "conversion_suspension",
    cb_conversion_price_change: "conversion_adjustment",
  };
  return mapping[String(value ?? "").trim()] ?? null;
}

export function groupV53CbEventsByDate(events) {
  const groups = new Map();
  for (const event of arrayValue(events)) {
    const date = isoDate(event?.date);
    if (!date) continue;
    const values = groups.get(date) ?? [];
    values.push(event);
    groups.set(date, values);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({ date, events: values }));
}

function matchesV53EventType(event, type) {
  return !type || type === "all" || String(event?.type ?? "") === type;
}

function renderList(target, events) {
  if (!events.length) {
    target.innerHTML = '<p class="empty-state">目前沒有符合條件的公開事件。</p>';
    return;
  }
  target.innerHTML = `<div class="cb-event-list">${groupV53CbEventsByDate(events).map(({ date, events: sameDay }) => `<section><h3><time datetime="${date}">${dateLabel(date)}</time></h3><ol>${sameDay.map((event) => `<li><a href="./bonds.html?bond=${encodeURIComponent(event.cbCode)}"><strong>${escapeHtml(event.cbCode)} ${escapeHtml(event.cbName)}</strong></a><span>${escapeHtml(event.companyName)} · ${escapeHtml(event.label ?? EVENT_TYPE_LABELS[event.type] ?? "公開事件")}</span>${event.title ? `<small>${escapeHtml(event.title)}</small>` : ""}<a class="cb-official-link" href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方公告</a></li>`).join("")}</ol></section>`).join("")}</div>`;
}

function renderCalendar(target, events, asOfDate) {
  const month = String(asOfDate).slice(0, 7);
  const first = new Date(`${month}-01T00:00:00Z`);
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const points = new Map(groupV53CbEventsByDate(events).map(({ date, events: items }) => [date, items]));
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const value = date.toISOString().slice(0, 10);
    const items = points.get(value) ?? [];
    return `<li class="${value.startsWith(month) ? "" : "outside"}"><time datetime="${value}">${date.getUTCDate()}</time>${items.length ? `<ol>${items.map((event) => `<li><a href="./bonds.html?bond=${encodeURIComponent(event.cbCode)}" title="${escapeHtml(`${event.cbCode} ${event.cbName} ${event.label ?? EVENT_TYPE_LABELS[event.type] ?? "公開事件"}`)}">${escapeHtml(event.cbCode)} ${escapeHtml(event.label ?? EVENT_TYPE_LABELS[event.type] ?? "公開事件")}</a></li>`).join("")}</ol>` : ""}</li>`;
  });
  target.innerHTML = `<div class="cb-event-calendar"><header><h3>${month.replace("-", " 年 ")} 月</h3><p>僅列出已核對官方連結的公開事件。</p></header><ol class="cb-calendar-weekdays"><li>一</li><li>二</li><li>三</li><li>四</li><li>五</li><li>六</li><li>日</li></ol><ol class="cb-calendar-days">${cells.join("")}</ol></div>`;
}

async function initialize() {
  const root = document.querySelector("[data-bond-events-root]");
  const target = document.querySelector("#bond-events-list");
  const count = document.querySelector("#bond-events-count");
  const form = document.querySelector("#bond-events-form");
  const viewTabs = document.querySelector("#bond-event-view-tabs");
  const errorTarget = document.querySelector("[data-page-error]");
  if (!root || !target || !count || !form || !viewTabs) return;
  const model = await loadPublicCbWorkbenchV53({ errorTarget });
  if (!model?.dataDate || !Array.isArray(model.events)) {
    count.textContent = "資料暫時無法取得";
    target.innerHTML = '<p class="empty-state">資料暫時無法取得</p>';
    return;
  }
  let view = "list";
  const render = () => {
    const values = new FormData(form);
    const range = String(values.get("range") ?? "30");
    const days = range === "today" ? 0 : range === "7" ? 7 : range === "30" ? 30 : daysToMonthEnd(model.dataDate);
    const events = filterV53CbEvents(model.events, {
      asOfDate: model.dataDate,
      days,
      type: String(values.get("type") ?? "all"),
      query: values.get("q") ?? "",
    });
    count.textContent = `${events.length} 筆 · 資料日 ${dateLabel(model.dataDate)}`;
    if (view === "calendar") renderCalendar(target, events, model.dataDate);
    else renderList(target, events);
  };
  form.addEventListener("input", render);
  form.addEventListener("change", render);
  viewTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-event-view]");
    if (!button) return;
    view = button.dataset.eventView === "calendar" ? "calendar" : "list";
    for (const item of viewTabs.querySelectorAll("[data-event-view]")) item.setAttribute("aria-pressed", String(item === button));
    render();
  });
  render();
}

function daysBetween(left, right) {
  return (Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / DAY_MS;
}

function daysToMonthEnd(value) {
  const date = new Date(`${value}T00:00:00Z`);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return Math.max(0, daysBetween(value, end.toISOString().slice(0, 10)));
}

function dateLabel(value) {
  return isoDate(value)?.replaceAll("-", "/") ?? "—";
}

function isoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function normalizeQuery(value) {
  return String(value ?? "").normalize("NFKC").trim().toUpperCase();
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function textValue(value) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

if (globalThis.window && globalThis.document) await initialize();
