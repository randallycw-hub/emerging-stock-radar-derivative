import { formatDate, formatNumber } from "./site-shell.js";
import { loadIpoSnapshot } from "./ipo-data.js";
import { defaultIpoStage, displayIpoStage, matchesIpoRecordStage, normalizeApprovedIpoEvents, projectActiveIpoEventEntries, shouldWriteIpoStage } from "./ipo-stage-filter.js";
import { sortRows } from "./table-sort.js";

const stageLabels = { active: "進行中", market: "交易事件優先", A: "送件待審", B: "審議後", C: "契約後", D: "競拍／買賣", listed: "已掛牌", withdrawn: "已撤件", delayed: "延期", cancelled: "已取消" };
const stageOrder = { A: 1, B: 2, C: 4, D: 5, listed: 6, withdrawn: 7, delayed: 7, cancelled: 7 };
const errorTarget = globalThis.document?.querySelector("[data-page-error]") ?? null;
const state = { rows: [], dataDate: null, query: "", market: "all", stage: "market", event: "all", year: "all", view: "list", sortKey: "eventDate", direction: "asc", page: 1 };
const sortTypes = { companyCode: "text", stage: "number", eventDate: "text", distanceDays: "number", auctionOpenDate: "text", listingDate: "text" };
const lifecycleDefinitions = [
  ["announcement", "公告", /(?:announcement|公告)/iu],
  ["submission", "送件", /(?:application_submitted|submission|送件|申請)/iu],
  ["effective", "核准／生效", /(?:contract_approved|effective|核准|生效)/iu],
  ["auction", "詢圈或競拍", /(?:auction|bookbuild|詢圈|競拍)/iu],
  ["pricing", "轉換價確認", /(?:pricing|price|定價|轉換價)/iu],
  ["listing", "掛牌", /(?:listing_date|listing|掛牌|上市)/iu],
];
const approvedIpoSourceIds = new Set(["twse-applications", "tpex-applications", "tpex-ipo-listings", "twse-auctions", "twse-public-offerings"]);
const activeIpoStages = new Set(["A", "B", "C", "D"]);

if (globalThis.document) {
  initializeFromUrl();
  bindControls();
  bindStagePanels();
  await loadData();
}

async function loadData() {
  let snapshot = null;
  try { snapshot = await loadIpoSnapshot(); } catch { snapshot = null; }
  if (snapshot) {
    applySnapshot(snapshot);
    if (snapshot.stale) showError("資料暫時未更新，顯示最近一次成功資料。");
    return;
  }
  showUnavailable();
}

function applySnapshot(snapshot) {
  state.dataDate = validDate(snapshot.dataDate) ? snapshot.dataDate : null;
  state.rows = snapshot.records.map((record) => normalizeIpoRecord(record, { dataDate: state.dataDate, sourceManifest: snapshot.sourceManifest })).filter((row) => row.companyCode && row.companyName);
  populateFilters();
  applyStateToControls();
  render();
  document.querySelector("#ipo-update-status").textContent = state.dataDate ? `資料日期 ${formatDate(state.dataDate)}` : "IPO 事件資料已載入";
}

function initializeFromUrl() {
  const params = new URLSearchParams(location.search);
  state.query = params.get("q") ?? "";
  state.market = params.get("market") ?? "all";
  state.stage = defaultIpoStage(params.get("stage"), { marketFirst: true });
  state.event = params.get("event") ?? "all";
  state.year = /^\d{4}$/.test(params.get("year") ?? "") ? params.get("year") : "all";
  state.view = params.get("view") === "month" ? "month" : "list";
  state.sortKey = Object.hasOwn(sortTypes, params.get("sort")) ? params.get("sort") : "eventDate";
  state.direction = params.get("direction") === "desc" ? "desc" : "asc";
  state.page = positiveInteger(params.get("page"));
}

function bindControls() {
  for (const [selector, key] of [["#ipo-search", "query"], ["#ipo-market", "market"], ["#ipo-stage", "stage"], ["#ipo-event", "event"], ["#ipo-year", "year"]]) {
    document.querySelector(selector).addEventListener("input", (event) => { state[key] = event.target.value; state.page = 1; syncUrl(); render(); });
  }
  document.querySelector("#ipo-sort-field").addEventListener("change", (event) => { state.sortKey = event.target.value; state.page = 1; syncUrl(); render(); });
  document.querySelector("#ipo-sort-direction").addEventListener("click", () => { state.direction = state.direction === "asc" ? "desc" : "asc"; state.page = 1; syncUrl(); render(); });
  for (const button of document.querySelectorAll("[data-ipo-sort]")) {
    button.addEventListener("click", () => { const key = button.dataset.ipoSort; state.direction = state.sortKey === key && state.direction === "asc" ? "desc" : "asc"; state.sortKey = key; state.page = 1; syncUrl(); render(); });
  }
  for (const button of document.querySelectorAll("[data-ipo-view]")) {
    button.addEventListener("click", () => { state.view = button.dataset.ipoView; syncUrl(); render(); });
  }
  window.addEventListener("popstate", () => { initializeFromUrl(); applyStateToControls(); render(); });
}

function bindStagePanels() {
  for (const panel of document.querySelectorAll("[data-ipo-stage-count]")) {
    const activate = () => {
      const stage = panel.dataset.stage;
      state.stage = stage === "board" ? "B" : stage;
      state.page = 1;
      syncUrl();
      applyStateToControls();
      render();
      document.querySelector("#ipo-filters").scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    };
    panel.addEventListener("click", activate);
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  }
}

function render() {
  const filtered = filterIpoCalendarRows(state.rows, state, state.dataDate);
  const filteredEvents = filteredEventEntries(filtered, state, state.dataDate);
  const sorted = sortRows(filtered, { key: state.sortKey === "stage" ? "stageOrder" : state.sortKey, direction: state.direction, type: state.sortKey === "stage" ? sortTypes.stage : sortTypes[state.sortKey] });
  const size = pageSize();
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  state.page = Math.min(state.page, pages);
  const visible = sorted.slice((state.page - 1) * size, state.page * size);
  document.querySelector("#ipo-result-count").textContent = `${formatNumber(sorted.length)} 家公司 · ${formatNumber(filteredEvents.length)} 筆事件`;
  document.querySelector("#ipo-table-body").innerHTML = visible.length ? visible.map(tableRowHtml).join("") : emptyRow();
  document.querySelector("#ipo-card-list").innerHTML = visible.length ? visible.map(cardHtml).join("") : emptyCard();
  renderMonthView(filteredEvents);
  renderUpcoming(filteredEvents);
  renderStageSummary();
  renderPagination(pages);
  updateSortControls();
}

function renderStageSummary() {
  const counts = { A: 0, B: 0, board: 0, C: 0, D: 0 };
  for (const row of state.rows) {
    if (!matchesIpoCalendarStage(row, "active", state.dataDate)) continue;
    const stage = row.stage === "B" && row.events.some((event) => /董事會/.test(event.label)) ? "board" : row.stage;
    if (Object.hasOwn(counts, stage)) counts[stage] += 1;
  }
  for (const [stage, count] of Object.entries(counts)) {
    const target = document.querySelector(`[data-ipo-stage-count="${stage}"] b`);
    if (target) target.textContent = `${formatNumber(count)} 家公司`;
  }
}

export function filterIpoCalendarRows(rows, filters, dataDate) {
  const query = filters.query.trim().toLocaleLowerCase("zh-Hant");
  return rows.filter((row) => {
    const matchesCompany = (!query || `${row.companyCode} ${row.companyName} ${row.underwriter}`.toLocaleLowerCase("zh-Hant").includes(query))
      && (filters.market === "all" || row.market === filters.market)
      && matchesIpoCalendarStage(row, filters.stage, dataDate);
    if (!matchesCompany) return false;
    if (filters.event === "all" && filters.year === "all") return true;
    return row.events.some((event) => (filters.event === "all" || event.kind === filters.event)
      && (filters.year === "all" || event.date.slice(0, 4) === filters.year));
  });
}

function filteredEventEntries(rows, filters, dataDate) {
  const entries = filters.stage === "all"
    ? rows.flatMap((row) => row.events.map((event) => ({ row, event })))
    : projectActiveIpoEventEntries(rows, dataDate);
  return entries.filter(({ event }) => (filters.event === "all" || event.kind === filters.event)
    && (filters.year === "all" || event.date.slice(0, 4) === filters.year));
}

function renderUpcoming(entries) {
  const today = taipeiToday();
  const upcoming = entries.filter(({ event }) => event.date >= today).sort((left, right) => left.event.date.localeCompare(right.event.date) || left.row.companyCode.localeCompare(right.row.companyCode)).slice(0, 6);
  document.querySelector("#ipo-upcoming-grid").innerHTML = upcoming.length ? upcoming.map(({ row, event }) => `<article class="ranking-panel"><p>${escapeHtml(row.market)}</p><h3>${escapeHtml(row.companyCode)} ${escapeHtml(row.companyName)}</h3><strong>${escapeHtml(event.label)}</strong><span>${formatDate(event.date)} · ${daysLabel(taipeiCalendarDistance(taipeiToday(), event.date))}</span></article>`).join("") : "<p class=\"empty-cell\">目前沒有未來關鍵事件</p>";
}

function renderMonthView(entries) {
  const groups = new Map();
  for (const { row, event } of entries) {
    const month = event.date.slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push({ row, event });
  }
  const target = document.querySelector("#ipo-month-view");
  target.innerHTML = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([month, events]) => `<section><h3>${month.replace("-", " 年 ")} 月</h3><ol>${events.sort((left, right) => left.event.date.localeCompare(right.event.date) || left.row.companyCode.localeCompare(right.row.companyCode)).map(({ row, event }) => `<li><time>${formatDate(event.date)}</time><strong>${escapeHtml(row.companyCode)} ${escapeHtml(row.companyName)}</strong><span>${escapeHtml(event.label)} · ${escapeHtml(row.market)}</span></li>`).join("")}</ol></section>`).join("") || "<p class=\"empty-cell\">沒有符合條件的事件</p>";
}

function tableRowHtml(row) {
  return `<tr><th scope="row"><span class="metric-main">${escapeHtml(row.companyCode)}</span>${escapeHtml(row.companyName)}</th><td>${escapeHtml(row.market)}</td><td><span class="ipo-status ipo-status-${stageClass(row.stage)}">${escapeHtml(stageLabel(row.stage))}</span></td><td>${escapeHtml(row.primaryEventLabel)}</td><td>${formatDate(row.primaryEventDate)}</td><td>${daysLabel(row.distanceDays)}</td><td>${escapeHtml(pricingStatus(row))}</td><td>${escapeHtml(auctionStatus(row))}</td><td>${formatDate(row.listingDate)}</td><td>${timelineSummary(row)}</td></tr>`;
}

function timelineSummary(row) {
  return `<details class="ipo-lifecycle"><summary>檢視生命週期與完整事件</summary>${timelineFacts(row)}${lifecycleHtml(row)}<ol class="ipo-timeline">${row.events.map(eventHtml).join("") || "<li>尚無公開資料</li>"}</ol></details>`;
}

function cardHtml(row) {
  return `<article class="ipo-card"><header><div><span>${escapeHtml(row.market)}</span><h3>${escapeHtml(row.companyCode)} ${escapeHtml(row.companyName)}</h3></div><strong class="ipo-status ipo-status-${stageClass(row.stage)}">${escapeHtml(stageLabel(row.stage))}</strong></header><dl><div><dt>最近事件</dt><dd>${escapeHtml(row.primaryEventLabel)}</dd></div><div><dt>事件日期</dt><dd>${formatDate(row.primaryEventDate)} · ${daysLabel(row.distanceDays)}</dd></div></dl><details><summary>承銷與完整歷程</summary>${timelineHtml(row)}</details></article>`;
}

function timelineHtml(row) {
  const evidence = projectIpoEvidence(row);
  const underwriter = evidence.underwriter ? `<div><dt>承銷商</dt><dd>${escapeHtml(evidence.underwriter)}</dd></div>` : "";
  const issuance = evidence.issuance ? `<div><dt>發行資訊</dt><dd>${escapeHtml(evidence.issuance)}</dd></div>` : "";
  const auction = evidence.auction ? `<div><dt>競拍進度</dt><dd>${escapeHtml(evidence.auction)}</dd></div>` : "";
  return `${timelineFacts(row, `${underwriter}${issuance}${auction}`)}${lifecycleHtml(row)}<details class="ipo-full-timeline"><summary>完整事件</summary><ol class="ipo-timeline">${row.events.map(eventHtml).join("") || "<li>尚無公開資料</li>"}</ol></details>`;
}

export function normalizeIpoRecord(record, { dataDate = null, sourceManifest = [] } = {}) {
  const manifestSourceIds = approvedManifestSourceIds(sourceManifest);
  const events = normalizeApprovedIpoEvents(record, sourceManifest);
  const primary = selectPrimaryEvent(events);
  const stage = displayIpoStage(record.stage);
  const auctionSourceId = approvedSourceIdForRecordIds([record.auction?.sourceRecordId], manifestSourceIds);
  const publicOfferingSourceId = approvedSourceIdForRecordIds([record.publicOffering?.sourceRecordId], manifestSourceIds);
  return { companyCode: String(record.companyCode ?? "").trim(), companyName: String(record.companyName ?? "").trim(), market: String(record.market ?? "其他").trim(), stage, exceptionStatus: record.exceptionStatus ?? null, stageOrder: stageOrder[stage] ?? 99, underwriter: String(record.underwriter ?? "").trim(), events, primaryEventDate: primary?.date ?? null, primaryEventLabel: primary?.label ?? "尚無公開資料", distanceDays: primary ? taipeiCalendarDistance(taipeiToday(), primary.date) : null, auctionOpenDate: validDate(record.auction?.auctionOpenDate) ? record.auction.auctionOpenDate : null, auction: record.auction ?? null, auctionSourceId, auctionVerified: record.auction?.verified === true || auctionSourceId !== null, publicOffering: record.publicOffering ?? null, publicOfferingSourceId, publicOfferingVerified: record.publicOffering?.verified === true || publicOfferingSourceId !== null, applicationDate: validDate(record.applicationDate) ? record.applicationDate : null, listingDate: validDate(record.listingDate) ? record.listingDate : null, dataDate, hasProvisionalPricing: Boolean(record.provisionalUnderwritingPrice), hasFinalPricing: Boolean(record.finalUnderwritingPrice) };
}

export function projectIpoLifecycle(row, today = taipeiToday()) {
  const events = Array.isArray(row?.events) ? row.events.map(normalizeLifecycleEvent).filter(Boolean) : [];
  return lifecycleDefinitions.map(([key, label, pattern]) => {
    const event = events.filter((candidate) => pattern.test(`${candidate.kind} ${candidate.label}`)).sort((left, right) => left.date.localeCompare(right.date))[0];
    return event ? { key, label, date: event.date, sourceId: event.sourceId, state: event.date <= today ? "complete" : "upcoming" } : { key, label, date: null, sourceId: null, state: "unavailable" };
  });
}

function normalizeLifecycleEvent(event) {
  if (!validDate(event?.date)) return null;
  const label = String(event.label ?? event.type ?? event.kind ?? "").trim();
  const kind = String(event.kind ?? event.type ?? label).trim();
  if (!label || !kind) return null;
  const sourceId = String(event.sourceId ?? "").trim();
  if (event?.verified !== true && !approvedIpoSourceIds.has(sourceId)) return null;
  return { date: event.date, label, kind, sourceId: sourceId || null };
}
function lifecycleHtml(row) { return `<ol class="ipo-lifecycle-list">${projectIpoLifecycle(row).map((step) => `<li class="is-${step.state}"><span>${escapeHtml(step.label)}</span><time>${step.date ? formatDate(step.date) : "尚無公開資料"}</time></li>`).join("")}</ol>`; }
function eventHtml(event) { return `<li class="${event.date <= taipeiToday() ? "is-complete" : ""}"><span>${escapeHtml(event.label)}</span><time>${formatDate(event.date)}</time></li>`; }
function eventSummary(row, direction) { const today = taipeiToday(); const events = [...row.events].sort((left, right) => left.date.localeCompare(right.date)); const event = direction === "next" ? events.find((value) => value.date >= today) : events.filter((value) => value.date <= today).at(-1); return event ? `${escapeHtml(event.label)} ${formatDate(event.date)}` : "尚無公開資料"; }
function hasOfficialEvidence(row, kind = null) { return row.events.some((event) => (event.verified === true || event.sourceId) && (!kind || new RegExp(kind, "iu").test(`${event.kind} ${event.label}`))); }
export function projectIpoEvidence(row) {
  const underwriter = hasOfficialEvidence(row) && row.underwriter ? row.underwriter : null;
  const issuance = row.publicOfferingVerified && row.publicOffering ? row.publicOffering.label ?? "已公告" : null;
  const auction = row.auctionVerified && row.auction ? auctionStatus(row) : null;
  return { underwriter, issuance, auction };
}
function timelineFacts(row, extra = "") { return `<dl class="ipo-card-details"><div><dt>最近事件</dt><dd>${eventSummary(row, "recent")}</dd></div><div><dt>下一已知事件</dt><dd>${eventSummary(row, "next")}</dd></div><div><dt>資料日期</dt><dd>${formatDate(row.dataDate)}</dd></div>${extra}</dl>`; }

function selectPrimaryEvent(events) { const today = taipeiToday(); const future = events.filter((event) => event.date >= today).sort((left, right) => left.date.localeCompare(right.date)); return future[0] ?? [...events].sort((left, right) => right.date.localeCompare(left.date))[0] ?? null; }
function pricingStatus(row) { if (!hasOfficialEvidence(row)) return "尚無公開資料"; return row.hasFinalPricing ? "已公告" : row.hasProvisionalPricing ? "暫定公告" : "—"; }
function auctionStatus(row) { if (!row.auction || !row.auctionVerified) return "尚無公開資料"; if (row.auction.cancelled) return "已取消"; if (validDate(row.auction.auctionOpenDate)) return `已開標 ${formatDate(row.auction.auctionOpenDate)}`; if (validDate(row.auction.bidStartDate)) return `投標 ${formatDate(row.auction.bidStartDate)}`; return "待公告"; }
function populateFilters() { replaceOptions("#ipo-market", "全部市場", unique(state.rows.map((row) => row.market))); replaceOptions("#ipo-stage", "全部歷程", ["market", "active", ...unique(state.rows.map((row) => row.stage).filter((stage) => activeIpoStages.has(stage)))], stageLabels); replaceOptions("#ipo-event", "全部事件", unique(state.rows.flatMap((row) => row.events.map((event) => event.kind))), Object.fromEntries(state.rows.flatMap((row) => row.events.map((event) => [event.kind, event.label])))); replaceOptions("#ipo-year", "全部年份", unique(state.rows.flatMap((row) => row.events.map((event) => event.date.slice(0, 4)))).sort().reverse()); }
function replaceOptions(selector, allLabel, values, labels = {}) { document.querySelector(selector).innerHTML = `<option value="all">${allLabel}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(labels[value] ?? value)}</option>`).join("")}`; }
function renderPagination(total) { const target = document.querySelector("#ipo-pagination"); target.innerHTML = `<button type="button" ${state.page === 1 ? "disabled" : ""} data-page="${state.page - 1}">上一頁</button><span>第 ${state.page}／${total} 頁</span><button type="button" ${state.page === total ? "disabled" : ""} data-page="${state.page + 1}">下一頁</button>`; for (const button of target.querySelectorAll("[data-page]")) button.addEventListener("click", () => { state.page = Number(button.dataset.page); syncUrl(); render(); }); }
function applyStateToControls() { document.querySelector("#ipo-search").value = state.query; selectExistingValue("#ipo-market", state.market); selectExistingValue("#ipo-stage", state.stage); selectExistingValue("#ipo-event", state.event); selectExistingValue("#ipo-year", state.year); updateSortControls(); }
function updateSortControls() { document.querySelector("#ipo-sort-field").value = state.sortKey; const button = document.querySelector("#ipo-sort-direction"); button.dataset.direction = state.direction; button.textContent = state.direction === "asc" ? "近到遠 ↑" : "遠到近 ↓"; for (const sortButton of document.querySelectorAll("[data-ipo-sort]")) { const active = sortButton.dataset.ipoSort === state.sortKey; sortButton.closest("th").setAttribute("aria-sort", active ? (state.direction === "asc" ? "ascending" : "descending") : "none"); sortButton.querySelector("span").textContent = active ? (state.direction === "asc" ? "↑" : "↓") : ""; } for (const viewButton of document.querySelectorAll("[data-ipo-view]")) viewButton.setAttribute("aria-selected", String(viewButton.dataset.ipoView === state.view)); document.querySelector("#ipo-list-view").hidden = state.view !== "list"; document.querySelector("#ipo-month-view").hidden = state.view !== "month"; }
function syncUrl() { const params = new URLSearchParams(); if (state.query) params.set("q", state.query); if (state.market !== "all") params.set("market", state.market); if (shouldWriteIpoStage(state.stage)) params.set("stage", state.stage); if (state.event !== "all") params.set("event", state.event); if (state.year !== "all") params.set("year", state.year); if (state.view !== "list") params.set("view", state.view); if (state.sortKey !== "eventDate") params.set("sort", state.sortKey); if (state.direction !== "asc") params.set("direction", state.direction); if (state.page > 1) params.set("page", String(state.page)); history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`); }
function showUnavailable() { document.querySelector("#ipo-update-status").textContent = "IPO 事件資料尚未發布"; document.querySelector("#ipo-table-body").innerHTML = emptyRow("目前沒有可顯示的 IPO 時程資料"); document.querySelector("#ipo-card-list").innerHTML = emptyCard("目前沒有可顯示的 IPO 時程資料"); document.querySelector("#ipo-upcoming-grid").innerHTML = "<p class=\"empty-cell\">目前沒有未來關鍵事件</p>"; showError("資料暫時無法讀取，目前沒有可顯示的資料。"); }
function showError(message) { if (errorTarget) { errorTarget.textContent = message; errorTarget.hidden = false; } }
function taipeiToday() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); return `${value.year}-${value.month}-${value.day}`; }
function taipeiCalendarDistance(today, date) { return Math.round((Date.UTC(...date.split("-").map(Number).map((value, index) => index === 1 ? value - 1 : value)) - Date.UTC(...today.split("-").map(Number).map((value, index) => index === 1 ? value - 1 : value))) / 86_400_000); }
function stageLabel(stage) { return stageLabels[stage] ?? `未知階段（${stage}）`; }
function stageClass(stage) { return Object.hasOwn(stageLabels, stage) ? escapeHtml(stage) : "unknown"; }
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")); }
function positiveInteger(value) { return Math.max(1, Number.parseInt(value ?? "1", 10) || 1); }
function pageSize() { return matchMedia("(max-width: 900px)").matches ? 25 : 50; }
function daysLabel(days) { return Number.isFinite(days) ? `${days > 0 ? "+" : ""}${formatNumber(days)} 天` : "—"; }
  function emptyRow(message = "沒有符合條件的資料") { return `<tr><td colspan="10" class="empty-cell">${message}</td></tr>`; }
function emptyCard(message = "沒有符合條件的資料") { return `<p class="empty-cell">${message}</p>`; }
function selectExistingValue(selector, value) { const select = document.querySelector(selector); select.value = [...select.options].some((option) => option.value === value) ? value : "all"; }
function unique(values) { return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-Hant")); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function approvedManifestSourceIds(sourceManifest) { return new Set((Array.isArray(sourceManifest) ? sourceManifest : []).map((entry) => entry?.sourceId).filter((sourceId) => approvedIpoSourceIds.has(sourceId))); }
function approvedSourceIdForRecordIds(recordIds, manifestSourceIds) { for (const recordId of Array.isArray(recordIds) ? recordIds : []) { const sourceId = sourceIdForRecordId(recordId); if (sourceId && manifestSourceIds.has(sourceId)) return sourceId; } return null; }
function sourceIdForRecordId(recordId) { const value = String(recordId ?? ""); if (/^TWSE:auction:\d{4}:/.test(value)) return "twse-auctions"; if (/^TWSE:(?:public|public-offering):\d{4}:/.test(value)) return "twse-public-offerings"; if (/^TPEx:ipo-no-limit:\d{4}:/i.test(value)) return "tpex-ipo-listings"; if (/^TWSE:\d{4}:/.test(value)) return "twse-applications"; if (/^TPEx:\d{4}:/.test(value)) return "tpex-applications"; return null; }
export function matchesIpoCalendarStage(row, selectedStage, dataDate) { return matchesIpoRecordStage(row, selectedStage, dataDate); }
