import { formatDate, formatNumber } from "./site-shell.js";
import { applyCanonicalCompanyIdentity, loadCanonicalPublicMasters } from "./canonical-identity.js";
import { loadIpoSnapshot } from "./ipo-data.js";
import { defaultIpoStage, displayIpoStage, isActiveIpoRecord, matchesIpoRecordStage, normalizeApprovedIpoEvents, projectActiveIpoEventEntries, publicCompanyHref, selectPublishedUpcomingEvents, shouldWriteIpoStage } from "./ipo-stage-filter.js";

const stageLabels = {
  A: "A 送件觀察",
  B: "B 審議進程",
  C: "C 契約／時程",
  D: "D 定價／掛牌",
  listed: "已掛牌",
  withdrawn: "已撤件",
  delayed: "延期",
  cancelled: "已取消",
};
const errorTarget = globalThis.document?.querySelector("[data-page-error]") ?? null;
const state = {
  rows: [],
  dataDate: null,
  query: "",
  market: "all",
  stage: "market",
  sortKey: "eventDate",
  direction: "asc",
  page: 1,
};

if (globalThis.window && globalThis.document) {
  initializeFromUrl();
  bindControls();
  await loadData();
}

async function loadData() {
  let snapshot = null;
  try {
    snapshot = await loadIpoSnapshot();
  } catch {
    snapshot = null;
  }
  const masters = await loadCanonicalPublicMasters({ includeBonds: false });
  if (snapshot && masters?.companies?.size) {
    applySnapshot(snapshot, masters.companies);
    if (snapshot.stale) showError("資料暫時未更新，顯示最近一次成功資料。");
    return;
  }
  showUnavailable();
}

function applySnapshot(snapshot, companies) {
  state.dataDate = validDate(snapshot.dataDate) ? snapshot.dataDate : null;
  state.rows = snapshot.records
    .map((record) => {
      const identity = applyCanonicalCompanyIdentity(record, companies);
      return identity ? { ...projectIpoRadarRecord(record, snapshot), ...identity } : null;
    })
    .filter((row) => row?.companyCode && row.companyName && !isIpoRadarExcluded(row));
  populateMarkets();
  applyStateToControls();
  render();
  document.querySelector("#ipo-radar-update-status").textContent = state.dataDate ? `資料日期 ${formatDate(state.dataDate)}` : "IPO 事件資料已載入";
}

function initializeFromUrl() {
  const params = new URLSearchParams(location.search);
  state.query = params.get("q") ?? "";
  state.market = params.get("market") ?? "all";
  state.stage = defaultIpoStage(params.get("stage"), { includeAB: true, activeOnly: true, marketFirst: true });
  state.sortKey = ["company", "stage", "eventDate", "days"].includes(params.get("sort")) ? params.get("sort") : "eventDate";
  state.direction = params.get("direction") === "desc" ? "desc" : "asc";
  state.page = positiveInteger(params.get("page"));
}

function bindControls() {
  for (const [selector, key] of [["#ipo-radar-search", "query"], ["#ipo-radar-market", "market"], ["#ipo-radar-stage", "stage"]]) {
    document.querySelector(selector).addEventListener("input", (event) => {
      state[key] = event.target.value;
      state.page = 1;
      syncUrl();
      render();
    });
  }
  document.querySelector("#ipo-radar-sort-field").addEventListener("change", (event) => {
    state.sortKey = event.target.value;
    state.page = 1;
    syncUrl();
    render();
  });
  document.querySelector("#ipo-radar-sort-direction").addEventListener("click", () => {
    state.direction = state.direction === "asc" ? "desc" : "asc";
    state.page = 1;
    syncUrl();
    render();
  });
  for (const button of document.querySelectorAll("[data-radar-sort]")) {
    button.addEventListener("click", () => {
      const key = button.dataset.radarSort;
      state.direction = state.sortKey === key && state.direction === "asc" ? "desc" : "asc";
      state.sortKey = key;
      state.page = 1;
      syncUrl();
      render();
    });
  }
  for (const button of document.querySelectorAll("[data-radar-stage]")) {
    button.addEventListener("click", () => applyStage(button.dataset.radarStage));
  }
  for (const button of document.querySelectorAll("[data-radar-summary]")) {
    button.addEventListener("click", () => {
      const stage = button.dataset.radarSummary;
      applyStage(stage);
    });
  }
  window.addEventListener("popstate", () => {
    initializeFromUrl();
    applyStateToControls();
    render();
  });
}

function applyStage(stage) {
  state.stage = defaultIpoStage(stage, { includeAB: true, activeOnly: true, marketFirst: true });
  state.page = 1;
  syncUrl();
  applyStateToControls();
  render();
  document.querySelector("#ipo-radar-filters").scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
}

function render() {
  const filtered = filteredRows();
  const sorted = sortRows(filtered);
  const size = pageSize();
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  state.page = Math.min(state.page, pages);
  const visible = sorted.slice((state.page - 1) * size, state.page * size);
  document.querySelector("#ipo-radar-result-count").textContent = `${formatNumber(sorted.length)} 家公司`;
  document.querySelector("#ipo-radar-table-body").innerHTML = visible.length ? visible.map(tableRowHtml).join("") : emptyRow();
  document.querySelector("#ipo-radar-card-list").innerHTML = visible.length ? visible.map(cardHtml).join("") : emptyCard();
  document.querySelector("[data-radar-data-date]").textContent = formatDate(state.dataDate);
  renderSummary();
  renderUpcoming();
  renderPagination(pages);
  updateSortControls();
}

function filteredRows() {
  const query = state.query.trim().toLocaleLowerCase("zh-Hant");
  return state.rows.filter((row) => {
    const matchesQuery = !query || `${row.companyCode} ${row.companyName}`.toLocaleLowerCase("zh-Hant").includes(query);
    const matchesMarket = state.market === "all" || row.market === state.market;
    const matchesStage = matchesIpoRecordStage(row, state.stage, state.dataDate);
    return matchesQuery && matchesMarket && matchesStage;
  });
}

function sortRows(rows) {
  const multiplier = state.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const comparison = state.sortKey === "company"
      ? `${left.companyCode} ${left.companyName}`.localeCompare(`${right.companyCode} ${right.companyName}`, "zh-Hant")
      : state.sortKey === "stage"
        ? stageOrder(left.stage) - stageOrder(right.stage)
        : state.sortKey === "days"
          ? compareNumbers(left.daysFromToday, right.daysFromToday)
          : compareDates(left.primaryEventDate, right.primaryEventDate);
    return comparison === 0 ? left.companyCode.localeCompare(right.companyCode) : comparison * multiplier;
  });
}

function renderSummary() {
  const activeRows = state.rows.filter((row) => isActiveIpoRecord(row, state.dataDate));
  setSummary("AB", activeRows.filter((row) => ["A", "B"].includes(row.stage)).length);
  setSummary("C", activeRows.filter((row) => row.stage === "C").length);
  setSummary("D", activeRows.filter((row) => row.stage === "D").length);
}

function renderUpcoming() {
  const entries = selectPublishedUpcomingEvents(projectActiveIpoEventEntries(state.rows, state.dataDate), state.dataDate).slice(0, 6);
  document.querySelector("#ipo-upcoming-grid").innerHTML = entries.length ? entries.map(({ row, event }) => `<article class="ranking-panel"><p>${escapeHtml(row.market)}</p><h3>${companyLink(row)}</h3><strong>${escapeHtml(event.label)}</strong><span>${formatDate(event.date)} · ${daysLabel(taipeiCalendarDistance(state.dataDate, event.date))}</span></article>`).join("") : "<p class=\"empty-cell\">目前沒有未來 7 日公開事件</p>";
}

function tableRowHtml(row) {
    return `<tr><th scope="row">${companyLink(row)}<small>${escapeHtml(row.market)}</small></th><td><span class="ipo-status ipo-status-${stageClass(row.stage)}">${escapeHtml(stageLabel(row.stage))}</span></td><td>${escapeHtml(row.primaryEventLabel)}</td><td>${formatDate(row.primaryEventDate)}</td><td>${daysLabel(row.daysFromToday)}</td><td>${escapeHtml(row.pricingStatus)}</td><td>${formatDate(row.applicationDate)}</td><td>${formatDate(row.reviewDate)}</td><td>${formatDate(row.boardDate)}</td><td>${formatDate(row.contractDate)}</td><td>${formatDate(row.auctionBidStartDate)}</td><td>${formatDate(row.subscriptionStartDate)}</td><td>${formatDate(row.listingDate)}</td><td>${daysLabel(row.daysInStage)}</td></tr>`;
}

function cardHtml(row) {
  return `<article class="ipo-card"><header><div><span>${escapeHtml(row.market)}</span><h3>${companyLink(row)}</h3></div><strong class="ipo-status ipo-status-${stageClass(row.stage)}">${escapeHtml(stageLabel(row.stage))}</strong></header><dl><div><dt>最近事件</dt><dd>${escapeHtml(row.primaryEventLabel)}</dd></div><div><dt>事件日期</dt><dd>${formatDate(row.primaryEventDate)} · ${daysLabel(row.daysFromToday)}</dd></div><div><dt>階段經過</dt><dd>${daysLabel(row.daysInStage)}</dd></div></dl><details><summary>階段日期與完整事件歷程</summary>${stageDateFacts(row)}<ol class="ipo-timeline">${row.events.map((event) => `<li><span>${escapeHtml(event.label)}</span><time>${formatDate(event.date)}</time></li>`).join("") || "<li>尚無公開資料</li>"}</ol></details></article>`;
}

function renderPagination(total) {
  const target = document.querySelector("#ipo-radar-pagination");
  target.innerHTML = `<button type="button" ${state.page === 1 ? "disabled" : ""} data-radar-page="${state.page - 1}">上一頁</button><span>第 ${state.page}／${total} 頁</span><button type="button" ${state.page === total ? "disabled" : ""} data-radar-page="${state.page + 1}">下一頁</button>`;
  for (const button of target.querySelectorAll("[data-radar-page]")) {
    button.addEventListener("click", () => {
      state.page = Number(button.dataset.radarPage);
      syncUrl();
      render();
    });
  }
}

function updateSortControls() {
  document.querySelector("#ipo-radar-sort-field").value = state.sortKey;
  const directionButton = document.querySelector("#ipo-radar-sort-direction");
  directionButton.dataset.direction = state.direction;
  directionButton.textContent = state.direction === "asc" ? "低到高 ↑" : "高到低 ↓";
  for (const button of document.querySelectorAll("[data-radar-sort]")) {
    const active = button.dataset.radarSort === state.sortKey;
    button.closest("th").setAttribute("aria-sort", active ? (state.direction === "asc" ? "ascending" : "descending") : "none");
    button.querySelector("span").textContent = active ? (state.direction === "asc" ? "↑" : "↓") : "";
  }
}

function applyStateToControls() {
  document.querySelector("#ipo-radar-search").value = state.query;
  selectExistingValue("#ipo-radar-market", state.market);
  selectExistingValue("#ipo-radar-stage", state.stage);
  updateSortControls();
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.market !== "all") params.set("market", state.market);
  if (shouldWriteIpoStage(state.stage)) params.set("stage", state.stage);
  if (state.sortKey !== "eventDate") params.set("sort", state.sortKey);
  if (state.direction !== "asc") params.set("direction", state.direction);
  if (state.page > 1) params.set("page", String(state.page));
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
}

export function projectIpoRadarRecord(record = {}, { dataDate = null, sourceManifest = [] } = {}) {
  const events = normalizeApprovedIpoEvents(record, sourceManifest);
  const primary = selectPrimaryEvent(events);
  const stage = displayIpoStage(record.stage);
  const auctionBidStartDate = approvedNestedDate(record.auction, "bidStartDate", sourceManifest, "twse-auctions");
  const subscriptionStartDate = approvedNestedDate(record.publicOffering, "subscriptionStartDate", sourceManifest, "twse-public-offerings");
  const stageDates = [
    validDate(record.applicationDate) ? record.applicationDate : null,
    validDate(record.reviewDate) ? record.reviewDate : null,
    validDate(record.boardDate) ? record.boardDate : null,
    validDate(record.contractDate) ? record.contractDate : null,
    auctionBidStartDate,
    subscriptionStartDate,
    validDate(record.listingDate) ? record.listingDate : null,
  ];
  const stageAnchor = validDate(dataDate)
    ? stageDates.filter((date) => date && date <= dataDate).sort().at(-1) ?? null
    : null;
  return {
    companyCode: String(record.companyCode ?? "").trim(),
    companyName: String(record.companyName ?? "").trim(),
    market: String(record.market ?? "其他").trim(),
    stage,
    exceptionStatus: record.exceptionStatus ?? null,
    applicationDate: validDate(record.applicationDate) ? record.applicationDate : null,
    reviewDate: validDate(record.reviewDate) ? record.reviewDate : null,
    boardDate: validDate(record.boardDate) ? record.boardDate : null,
    contractDate: validDate(record.contractDate) ? record.contractDate : null,
    auctionBidStartDate,
    subscriptionStartDate,
    listingDate: validDate(record.listingDate) ? record.listingDate : null,
    daysInStage: stageAnchor ? taipeiCalendarDistance(stageAnchor, dataDate) : null,
    pricingStatus: events.length === 0 ? "尚無公開資料" : record.finalUnderwritingPrice ? "已定價" : record.provisionalUnderwritingPrice ? "暫定價" : "待公告",
    events,
    primaryEventDate: primary?.date ?? null,
    primaryEventLabel: primary?.label ?? "尚無公開資料",
    daysFromToday: primary ? taipeiCalendarDistance(taipeiToday(), primary.date) : null,
  };
}

export function isIpoRadarExcluded(row = {}) {
  const terminal = new Set(["withdrawn", "cancelled"]);
  return terminal.has(String(row.stage ?? "")) || terminal.has(String(row.exceptionStatus ?? ""));
}

function approvedNestedDate(value, key, sourceManifest, requiredSourceId) {
  if (!value || !validDate(value[key])) return null;
  if (value.verified === true) return value[key];
  const manifestIds = new Set((Array.isArray(sourceManifest) ? sourceManifest : [])
    .map((entry) => entry?.sourceId));
  const recordId = String(value.sourceRecordId ?? "");
  const sourceMatches = requiredSourceId === "twse-auctions"
    ? /^TWSE:auction:\d{4}:/.test(recordId)
    : /^TWSE:(?:public|public-offering):\d{4}:/.test(recordId);
  return sourceMatches && manifestIds.has(requiredSourceId) ? value[key] : null;
}

function selectPrimaryEvent(events) {
  const today = taipeiToday();
  const future = events.filter((event) => event.date >= today).sort((left, right) => compareDates(left.date, right.date));
  if (future.length) return future[0];
  return [...events].sort((left, right) => compareDates(right.date, left.date))[0] ?? null;
}

function taipeiToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function taipeiCalendarDistance(today, date) {
  return Math.round((Date.UTC(...date.split("-").map(Number).map((value, index) => index === 1 ? value - 1 : value)) - Date.UTC(...today.split("-").map(Number).map((value, index) => index === 1 ? value - 1 : value))) / 86_400_000);
}

function populateMarkets() {
  const values = [...new Set(state.rows.map((row) => row.market).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-Hant"));
  document.querySelector("#ipo-radar-market").innerHTML = `<option value="all">全部市場</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
}

function showUnavailable() {
  document.querySelector("#ipo-radar-update-status").textContent = "IPO 事件資料尚未發布";
  document.querySelector("#ipo-radar-table-body").innerHTML = emptyRow("目前沒有可顯示的 IPO 進度資料");
  document.querySelector("#ipo-upcoming-grid").innerHTML = "<p class=\"empty-cell\">目前沒有近期重要事件</p>";
  showError("資料暫時無法取得");
}

function showError(message) {
  errorTarget.textContent = message;
  errorTarget.hidden = false;
}

function compareDates(left, right) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

function compareNumbers(left, right) {
  if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
  if (!Number.isFinite(left)) return 1;
  if (!Number.isFinite(right)) return -1;
  return left - right;
}

function stageOrder(stage) { const index = ["A", "B", "C", "D", "listed", "withdrawn", "delayed", "cancelled"].indexOf(stage); return index < 0 ? 99 : index; }
function stageLabel(stage) { return stageLabels[stage] ?? `未知階段（${stage}）`; }
function stageClass(stage) { return Object.hasOwn(stageLabels, stage) ? escapeHtml(stage) : "unknown"; }
function setSummary(key, value) { document.querySelector(`[data-radar-summary-count="${key}"]`).textContent = `${formatNumber(value)} 家公司`; }
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")); }
function positiveInteger(value) { return Math.max(1, Number.parseInt(value ?? "1", 10) || 1); }
function pageSize() { return matchMedia("(max-width: 900px)").matches ? 25 : 50; }
function daysLabel(days) { return Number.isFinite(days) ? `${days > 0 ? "+" : ""}${formatNumber(days)} 天` : "—"; }
function stageDateFacts(row) {
  const facts = [["送件日", row.applicationDate], ["審議日", row.reviewDate], ["董事會日", row.boardDate], ["契約日", row.contractDate], ["競拍日", row.auctionBidStartDate], ["申購日", row.subscriptionStartDate], ["掛牌日", row.listingDate]];
  return `<dl class="ipo-card-details">${facts.map(([label, date]) => `<div><dt>${label}</dt><dd>${formatDate(date)}</dd></div>`).join("")}</dl>`;
}
function emptyRow(message = "沒有符合條件的資料") { return `<tr><td colspan="14" class="empty-cell">${message}</td></tr>`; }
function emptyCard(message = "沒有符合條件的資料") { return `<p class="empty-cell">${message}</p>`; }
function selectExistingValue(selector, value) { const select = document.querySelector(selector); select.value = [...select.options].some((option) => option.value === value) ? value : "all"; }
function companyLink(row) { return `<a href="${publicCompanyHref(row.companyCode)}">${escapeHtml(row.companyCode)} ${escapeHtml(row.companyName)}</a>`; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
