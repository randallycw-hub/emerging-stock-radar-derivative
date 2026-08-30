import { loadPublicCbWorkbenchV53 } from "./bond-public-data.js";
import { publicAmount, publicNumber } from "./cb-workbench-ui.js";

export const CB_VIEW_COLUMNS = Object.freeze({
  quote: [
    ["CB 代碼／名稱", (record) => `${record.cbCode} ${record.cbName}`],
    ["標的公司", (record) => `${record.stockCode} ${record.companyName}`],
    ["CB 收盤", (record) => publicNumber(record.quote?.cbClose)],
    ["成交量", (record) => record.quote?.tradeState === "no_trade" ? "今日無成交" : publicNumber(record.quote?.volume)],
    ["成交額", (record) => publicAmount(record.quote?.turnoverAmount)],
    ["轉換價值", (record) => publicNumber(record.quote?.conversionValue)],
    ["轉換溢價率", (record) => rate(record.quote?.premiumRate)],
  ],
  terms: [
    ["CB 代碼／名稱", (record) => `${record.cbCode} ${record.cbName}`],
    ["發行額", (record) => publicAmount(record.terms?.issueAmount)],
    ["流通餘額", (record) => publicAmount(record.terms?.outstandingAmount)],
    ["餘額比例", (record) => rate(record.terms?.remainingRatio)],
    ["轉換價", (record) => publicNumber(record.quote?.conversionPrice)],
    ["發行日", (record) => dateLabel(record.terms?.issueDate)],
    ["到期日", (record) => dateLabel(record.terms?.maturityDate)],
    ["擔保", (record) => record.terms?.securedStatus ?? "—"],
    ["主辦券商", (record) => record.terms?.underwriter ?? "—"],
  ],
  events: [
    ["CB 代碼／名稱", (record) => `${record.cbCode} ${record.cbName}`],
    ["最近權利事件", (record) => nextEvent(record)?.label ?? "—"],
    ["下一事件", (record) => dateLabel(nextEvent(record)?.date)],
    ["停止轉換", (record) => hasEvent(record, "conversion_suspension") ? "已公告" : "—"],
    ["賣回", (record) => eventDate(record, "put")],
    ["提前贖回", (record) => eventDate(record, "redemption")],
    ["到期", (record) => dateLabel(record.terms?.maturityDate)],
  ],
  liquidity: [
    ["CB 代碼／名稱", (record) => `${record.cbCode} ${record.cbName}`],
    ["今日量", (record) => record.quote?.tradeState === "no_trade" ? "0" : publicNumber(record.quote?.volume)],
    ["5 日均量", (record) => publicNumber(record.liquidity?.average5)],
    ["20 日均量", (record) => publicNumber(record.liquidity?.average20)],
    ["週成交量", (record) => publicNumber(record.liquidity?.weekVolume)],
    ["近 20 日有成交天數", (record) => publicNumber(record.liquidity?.tradedDays20, 0)],
  ],
});

const QUICK_FILTERS = new Set([
  "",
  "newIssue",
  "lowPremium",
  "nearConversion",
  "rights90",
  "maturity365",
  "recentPut",
  "recentRedemption",
  "conversionSuspended",
]);

export function filterV53CbRecords(records, { query = "", quickFilter = "", dataDate = null } = {}) {
  const needle = normalizeQuery(query);
  const selected = QUICK_FILTERS.has(quickFilter) ? quickFilter : "";
  const asOfDate = isoDate(dataDate);
  const result = arrayValue(records).filter((record) => {
    if (record?.status !== "active") return false;
    if (needle && ![record.cbCode, record.cbName, record.stockCode, record.companyName]
      .some((value) => normalizeQuery(value).includes(needle))) return false;
    return meetsQuickFilter(record, selected, asOfDate);
  });
  if (selected === "lowPremium") return sortBy(result, (record) => finiteNumber(record.quote?.premiumRate));
  if (selected === "nearConversion") return sortBy(result, (record) => {
    const value = finiteNumber(record.quote?.conversionValue);
    return value === null ? null : Math.abs(value - 100);
  });
  return result;
}

function meetsQuickFilter(record, quickFilter, asOfDate) {
  if (!quickFilter) return true;
  if (!asOfDate) return false;
  if (quickFilter === "newIssue") return isWithinPriorDays(record.terms?.issueDate, asOfDate, 90);
  if (quickFilter === "lowPremium") return finiteNumber(record.quote?.premiumRate) !== null;
  if (quickFilter === "nearConversion") {
    const value = finiteNumber(record.quote?.conversionValue);
    return value !== null && Math.abs(value - 100) <= 5;
  }
  if (quickFilter === "maturity365") return isWithinDays(record.terms?.maturityDate, asOfDate, 365);
  if (quickFilter === "rights90") return arrayValue(record.events).some((event) => event?.type !== "listing" && isWithinDays(event?.date, asOfDate, 90));
  if (quickFilter === "recentPut") return arrayValue(record.events).some((event) => event?.type === "put" && isWithinDays(event?.date, asOfDate, 90));
  if (quickFilter === "recentRedemption") return arrayValue(record.events).some((event) => event?.type === "redemption" && isWithinDays(event?.date, asOfDate, 90));
  if (quickFilter === "conversionSuspended") return arrayValue(record.events).some((event) => event?.type === "conversion_suspension" && String(event.date ?? "") <= asOfDate);
  return true;
}

function sortBy(records, valueFor) {
  return records.map((record, index) => ({ record, index, value: valueFor(record) })).sort((left, right) => {
    if (left.value === null || right.value === null) return left.value === right.value ? left.index - right.index : left.value === null ? 1 : -1;
    return left.value - right.value || left.index - right.index;
  }).map((item) => item.record);
}

function renderRows(head, body, records, view) {
  const columns = CB_VIEW_COLUMNS[view] ?? CB_VIEW_COLUMNS.quote;
  head.innerHTML = `<tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr>`;
  if (!records.length) {
    body.innerHTML = `<tr><td colspan="${columns.length}" class="empty-cell">目前沒有符合條件的公開資料。</td></tr>`;
    return;
  }
  body.innerHTML = records.map((record) => `<tr>${columns.map(([label, value], index) => {
    const rendered = value(record);
    return index === 0 ? `<td><a href="./bonds.html?bond=${encodeURIComponent(record.cbCode)}">${escapeHtml(rendered)}</a></td>` : `<td data-label="${escapeHtml(label)}">${escapeHtml(rendered)}</td>`;
  }).join("")}</tr>`).join("");
}

async function initialize() {
  const form = document.querySelector("#bond-filter-form");
  const head = document.querySelector("#bond-filter-head");
  const body = document.querySelector("#bond-filter-body");
  const count = document.querySelector("#bond-filter-count");
  const tabs = document.querySelector("#bond-view-tabs");
  const clear = document.querySelector("#bond-filter-clear");
  const errorTarget = document.querySelector("[data-page-error]");
  if (!form || !head || !body || !count || !tabs || !clear) return;
  const model = await loadPublicCbWorkbenchV53({ errorTarget });
  if (!model?.dataDate || !Array.isArray(model.records)) {
    count.textContent = "資料暫時無法取得";
    body.innerHTML = '<tr><td class="empty-cell">資料暫時無法取得</td></tr>';
    return;
  }
  let activeView = viewFromUrl();
  const render = () => {
    const values = new FormData(form);
    const rows = filterV53CbRecords(model.records, {
      query: values.get("q") ?? "",
      quickFilter: String(values.get("quickFilter") ?? ""),
      dataDate: model.dataDate,
    });
    count.textContent = `${rows.length} 檔 · 資料日 ${dateLabel(model.dataDate)}`;
    renderRows(head, body, rows, activeView);
    tabs.querySelectorAll("[data-cb-view]").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.cbView === activeView)));
    clear.hidden = !String(values.get("q") ?? "") && !String(values.get("quickFilter") ?? "");
    syncUrl(activeView, values);
  };
  form.addEventListener("input", render);
  form.addEventListener("change", render);
  clear.addEventListener("click", () => {
    form.reset();
    render();
  });
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cb-view]");
    if (!button || !Object.hasOwn(CB_VIEW_COLUMNS, button.dataset.cbView)) return;
    activeView = button.dataset.cbView;
    render();
  });
  render();
}

function viewFromUrl() {
  const view = new URLSearchParams(globalThis.location?.search ?? "").get("view");
  return Object.hasOwn(CB_VIEW_COLUMNS, view) ? view : "quote";
}

function syncUrl(view, values) {
  if (!globalThis.history || !globalThis.location) return;
  const params = new URLSearchParams();
  const query = normalizeQuery(values.get("q") ?? "");
  const quickFilter = String(values.get("quickFilter") ?? "");
  if (query) params.set("q", query);
  if (QUICK_FILTERS.has(quickFilter) && quickFilter) params.set("quickFilter", quickFilter);
  if (view !== "quote") params.set("view", view);
  const search = params.size ? `?${params}` : "";
  globalThis.history.replaceState(null, "", `${globalThis.location.pathname}${search}`);
}

function nextEvent(record) {
  return arrayValue(record?.events).slice().sort((left, right) => String(left?.date ?? "").localeCompare(String(right?.date ?? "")))[0] ?? null;
}

function eventDate(record, type) {
  return dateLabel(arrayValue(record?.events).find((event) => event?.type === type)?.date);
}

function hasEvent(record, type) {
  return arrayValue(record?.events).some((event) => event?.type === type);
}

function rate(value) {
  const number = finiteNumber(value);
  return number === null ? "—" : `${publicNumber(number)}%`;
}

function isWithinDays(value, asOfDate, days) {
  const date = isoDate(value);
  if (!date) return false;
  const distance = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${asOfDate}T00:00:00Z`)) / 86400000;
  return distance >= 0 && distance <= days;
}

function isWithinPriorDays(value, asOfDate, days) {
  const date = isoDate(value);
  if (!date) return false;
  const distance = (Date.parse(`${asOfDate}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000;
  return distance >= 0 && distance <= days;
}

function dateLabel(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? String(value).replaceAll("-", "/") : "—";
}

function normalizeQuery(value) {
  return String(value ?? "").normalize("NFKC").trim().toUpperCase();
}

function isoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function finiteNumber(value) {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

if (globalThis.window && globalThis.document) await initialize();
