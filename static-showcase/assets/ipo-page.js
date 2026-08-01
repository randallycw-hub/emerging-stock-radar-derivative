import { formatDate, formatNumber, safeJsonFetch } from "./site-shell.js";
import { sortRows } from "./table-sort.js";

const pointerUrl = new URL("../data/current.json", import.meta.url);
const errorTarget = document.querySelector("[data-page-error]");
const stageLabels = {
  applied: "已申請",
  listing_review_completed: "審議已完成",
  board_approved: "董事會已通過",
  contract_filed_or_regulator_approved: "契約已核准／備查",
  listed_for_trading: "已掛牌",
  withdrawn: "已撤件",
};
const state = {
  rows: [],
  snapshotDownloadedAt: null,
  query: "",
  market: "all",
  status: "all",
  year: "all",
  sortKey: "eventDate",
  sortDirection: "desc",
  page: 1,
};

initializeFromUrl();
bindControls();
await loadData();

async function loadData() {
  const pointer = await safeJsonFetch(pointerUrl, { errorTarget });
  if (!pointer?.runtimeUrl) {
    showUnavailable();
    return;
  }
  const runtime = await safeJsonFetch(new URL(pointer.runtimeUrl, document.baseURI), { errorTarget });
  if (!runtime?.datasets?.["11586"]) {
    showUnavailable();
    return;
  }
  const [records, manifest] = await Promise.all([
    safeJsonFetch(new URL(runtime.datasets["11586"], document.baseURI), { errorTarget }),
    safeJsonFetch(new URL(runtime.manifestUrl, document.baseURI), { errorTarget }),
  ]);
  state.snapshotDownloadedAt = manifest?.datasets?.find((dataset) => dataset.datasetId === "11586")?.downloadedAt
    ?? manifest?.generatedAt
    ?? null;
  state.rows = arrayValue(records).map((row) => normalizeIpoRow(row, state.snapshotDownloadedAt));
  populateFilters();
  applyStateToControls();
  renderRows();
  document.querySelector("#ipo-update-status").textContent = state.snapshotDownloadedAt
    ? `本站擷取 ${formatDate(state.snapshotDownloadedAt)}`
    : "IPO 行程資料已載入";
}

function initializeFromUrl() {
  const params = new URLSearchParams(location.search);
  state.query = params.get("q") ?? "";
  state.market = params.get("market") ?? "all";
  state.status = params.get("status") ?? "all";
  state.year = params.get("year") ?? "all";
  state.sortKey = params.get("sort") ?? "eventDate";
  state.sortDirection = params.get("direction") === "asc" ? "asc" : "desc";
  state.page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
}

function bindControls() {
  for (const [selector, key] of [
    ["#ipo-search", "query"],
    ["#ipo-market", "market"],
    ["#ipo-status", "status"],
    ["#ipo-year", "year"],
  ]) {
    document.querySelector(selector).addEventListener("input", (event) => {
      state[key] = event.target.value;
      state.page = 1;
      syncUrl();
      renderRows();
    });
  }
  document.querySelector("#ipo-sort-field").addEventListener("change", (event) => {
    state.sortKey = event.target.value;
    state.sortDirection = "desc";
    state.page = 1;
    updateSortControls();
    syncUrl();
    renderRows();
  });
  document.querySelector("#ipo-sort-direction").addEventListener("click", () => {
    state.sortDirection = state.sortDirection === "desc" ? "asc" : "desc";
    state.page = 1;
    updateSortControls();
    syncUrl();
    renderRows();
  });
  for (const button of document.querySelectorAll("[data-ipo-sort]")) {
    button.addEventListener("click", () => {
      const key = button.dataset.ipoSort;
      state.sortDirection = state.sortKey === key && state.sortDirection === "desc" ? "asc" : "desc";
      state.sortKey = key;
      state.page = 1;
      document.querySelector("#ipo-sort-field").value = key;
      updateSortControls();
      syncUrl();
      renderRows();
    });
  }
  window.addEventListener("popstate", () => {
    initializeFromUrl();
    applyStateToControls();
    renderRows();
  });
}

function renderRows() {
  const filtered = filteredRows();
  const sorted = sortRows(
    filtered.map((row) => ({ ...row, bondCode: row.companyCode })),
    { key: state.sortKey, direction: state.sortDirection, type: "text" },
  );
  const size = pageSize();
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  state.page = Math.min(state.page, pages);
  const visible = sorted.slice((state.page - 1) * size, state.page * size);
  document.querySelector("#ipo-result-count").textContent = `${formatNumber(sorted.length)} 筆`;
  document.querySelector("#ipo-table-body").innerHTML = visible.length ? visible.map(tableRowHtml).join("") : emptyRow();
  document.querySelector("#ipo-card-list").innerHTML = visible.map(cardHtml).join("");
  renderSummary(filtered);
  renderPagination(state.page, pages);
  updateSortControls();
}

function filteredRows() {
  const query = state.query.trim().toLocaleLowerCase("zh-Hant");
  return state.rows.filter((row) => {
    const matchesQuery = !query || `${row.companyCode} ${row.companyName} ${row.underwriter}`.toLocaleLowerCase("zh-Hant").includes(query);
    const matchesMarket = state.market === "all" || row.market === state.market;
    const matchesStatus = state.status === "all" || row.stage === state.status;
    const matchesYear = state.year === "all" || row.eventDate?.slice(0, 4) === state.year;
    return matchesQuery && matchesMarket && matchesStatus && matchesYear;
  });
}

function tableRowHtml(row) {
  return `<tr><th scope="row"><span class="metric-main">${escapeHtml(row.companyCode)}</span>${escapeHtml(row.companyName)}</th><td>${escapeHtml(row.market)}</td><td><span class="ipo-status ipo-status-${escapeHtml(row.stage)}">${escapeHtml(stageLabels[row.stage])}</span></td><td>${formatDate(row.applicationDate)}</td><td>${formatDate(row.reviewDate)}</td><td>${formatDate(row.boardDate)}</td><td>${formatDate(row.filingDate)}</td><td>${formatDate(row.listingDate)}</td><td>${escapeHtml(row.underwriter || "—")}</td><td>${escapeHtml(row.note || "—")}</td><td>${formatDate(row.snapshotDownloadedAt)}</td></tr>`;
}

function cardHtml(row) {
  const events = [
    ["申請", row.applicationDate],
    ["審議", row.reviewDate],
    ["董事會", row.boardDate],
    ["核准／備查", row.filingDate],
    ["掛牌", row.listingDate],
  ];
  return `<article class="ipo-card"><header><div><span>${escapeHtml(row.market)}</span><h3>${escapeHtml(row.companyCode)} ${escapeHtml(row.companyName)}</h3></div><strong class="ipo-status ipo-status-${escapeHtml(row.stage)}">${escapeHtml(stageLabels[row.stage])}</strong></header><ol class="ipo-timeline">${events.map(([label, date]) => `<li class="${date ? "is-complete" : ""}"><span>${label}</span><time>${formatDate(date)}</time></li>`).join("")}</ol><footer><span>承銷商：${escapeHtml(row.underwriter || "—")}</span><span>備註：${escapeHtml(row.note || "—")}</span><span>本站擷取：${formatDate(row.snapshotDownloadedAt)}</span></footer></article>`;
}

function normalizeIpoRow(row, snapshotDownloadedAt) {
  const applicationDate = officialDate(row.applicationDate ?? row["申請日期"]);
  const reviewDate = officialDate(row.listingReviewDate ?? row.reviewDate ?? row["上市審議委員會審議日期"]);
  const boardDate = officialDate(row.boardApprovalDate ?? row.boardDate ?? row["交易所董事會通過上市日期"]);
  const filingDate = officialDate(row.listingContractApprovalOrFilingDate ?? row.filingDate ?? row["上市契約報請主管機關備查(主管機關核准)日期"]);
  const listingDate = officialDate(row.listingDate ?? row["股票上市買賣日期"]);
  const note = String(row.note ?? row["備註"] ?? "").trim();
  const stage = deriveStage({ applicationDate, reviewDate, boardDate, filingDate, listingDate, note, stage: row.stage });
  return {
    companyCode: String(row.companyCode ?? row["公司代號"] ?? "").trim(),
    companyName: String(row.companyName ?? row["公司簡稱"] ?? "").trim(),
    market: String(row.market ?? "上市").trim(),
    applicationDate,
    reviewDate,
    boardDate,
    filingDate,
    listingDate,
    eventDate: listingDate ?? filingDate ?? boardDate ?? reviewDate ?? applicationDate,
    stage,
    underwriter: arrayOrText(row.underwriters ?? row.underwriter ?? row["承銷商"]),
    note,
    snapshotDownloadedAt,
  };
}

function deriveStage(row) {
  if (row.stage && stageLabels[row.stage]) return row.stage;
  if (/撤件|撤回/.test(row.note)) return "withdrawn";
  if (row.listingDate) return "listed_for_trading";
  if (row.filingDate) return "contract_filed_or_regulator_approved";
  if (row.boardDate) return "board_approved";
  if (row.reviewDate) return "listing_review_completed";
  return "applied";
}

function populateFilters() {
  replaceOptions("#ipo-market", "全部市場", unique(state.rows.map((row) => row.market)));
  replaceOptions("#ipo-status", "全部進度", unique(state.rows.map((row) => row.stage)), stageLabels);
  replaceOptions("#ipo-year", "全部年份", unique(state.rows.map((row) => row.eventDate?.slice(0, 4))).sort().reverse());
}

function replaceOptions(selector, allLabel, values, labels = {}) {
  document.querySelector(selector).innerHTML = `<option value="all">${allLabel}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(labels[value] ?? value)}</option>`).join("")}`;
}

function applyStateToControls() {
  document.querySelector("#ipo-search").value = state.query;
  selectExistingValue("#ipo-market", state.market);
  selectExistingValue("#ipo-status", state.status);
  selectExistingValue("#ipo-year", state.year);
  selectExistingValue("#ipo-sort-field", state.sortKey);
  updateSortControls();
}

function updateSortControls() {
  const directionButton = document.querySelector("#ipo-sort-direction");
  directionButton.dataset.direction = state.sortDirection;
  directionButton.textContent = state.sortDirection === "desc" ? "新到舊 ↓" : "舊到新 ↑";
  for (const button of document.querySelectorAll("[data-ipo-sort]")) {
    const active = button.dataset.ipoSort === state.sortKey;
    button.closest("th").setAttribute("aria-sort", active ? (state.sortDirection === "desc" ? "descending" : "ascending") : "none");
    button.querySelector("span").textContent = active ? (state.sortDirection === "desc" ? "↓" : "↑") : "";
  }
}

function renderSummary(rows) {
  setSummary("total", formatNumber(rows.length));
  setSummary("review", formatNumber(rows.filter((row) => ["applied", "listing_review_completed"].includes(row.stage)).length));
  setSummary("approved", formatNumber(rows.filter((row) => ["board_approved", "contract_filed_or_regulator_approved"].includes(row.stage)).length));
  setSummary("listed", formatNumber(rows.filter((row) => row.stage === "listed_for_trading").length));
  setSummary("withdrawn", formatNumber(rows.filter((row) => row.stage === "withdrawn").length));
}

function renderPagination(current, total) {
  const target = document.querySelector("#ipo-pagination");
  target.innerHTML = `<button type="button" ${current === 1 ? "disabled" : ""} data-page="${current - 1}">上一頁</button><span>第 ${current}／${total} 頁</span><button type="button" ${current === total ? "disabled" : ""} data-page="${current + 1}">下一頁</button>`;
  for (const button of target.querySelectorAll("[data-page]")) {
    button.addEventListener("click", () => {
      state.page = Number(button.dataset.page);
      syncUrl();
      renderRows();
    });
  }
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.market !== "all") params.set("market", state.market);
  if (state.status !== "all") params.set("status", state.status);
  if (state.year !== "all") params.set("year", state.year);
  if (state.sortKey !== "eventDate") params.set("sort", state.sortKey);
  if (state.sortDirection !== "desc") params.set("direction", state.sortDirection);
  if (state.page > 1) params.set("page", String(state.page));
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
}

function officialDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{3})(\d{2})(\d{2})$/);
  if (!match) return null;
  return `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
}

function arrayOrText(value) {
  if (Array.isArray(value)) return value.map((item) => item?.name ?? item).filter(Boolean).join("、");
  return String(value ?? "").trim();
}

function showUnavailable() {
  document.querySelector("#ipo-update-status").textContent = "IPO 行程資料尚未發布";
  document.querySelector("#ipo-table-body").innerHTML = emptyRow("目前沒有可顯示的 IPO 行程資料");
}

function pageSize() {
  return matchMedia("(max-width: 900px)").matches ? 25 : 50;
}

function setSummary(key, value) {
  document.querySelector(`[data-ipo-summary="${key}"]`).textContent = value;
}

function selectExistingValue(selector, value) {
  const select = document.querySelector(selector);
  select.value = [...select.options].some((option) => option.value === value) ? value : select.options[0]?.value ?? "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function emptyRow(message = "沒有符合條件的資料") {
  return `<tr><td colspan="11" class="empty-cell">${message}</td></tr>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
