import { formatDate, formatNumber, marketDetailHref, safeJsonFetch } from "./site-shell.js";
import { applyCanonicalCompanyIdentity, indexCanonicalCompanies } from "./canonical-identity.js";
import { countPublishedPositive, publicNumber, sumPublishedValues } from "./public-data-state.js";
import { emergingDailyAverageLabel } from "./emerging-market-display.js";
import { sortRows } from "./table-sort.js";
import { mapV56EmergingRows } from "./v56-page-data.js";

const pointerUrl = new URL("../data/current.json", import.meta.url);
const errorTarget = document.querySelector("[data-page-error]");
const marketSortKeys = new Set([...document.querySelectorAll("[data-market-sort]")].map((button) => button.dataset.marketSort));
export const viewAliases = Object.freeze({
  rankings: "summary",
  market: "all",
  summary: "summary",
  price: "price",
  volume: "volume",
  revenue: "revenue",
  all: "all",
});
const state = {
  market: [],
  monthlyRevenue: [],
  view: "summary",
  query: "",
  industry: "all",
  application: "all",
  marketDirection: "all",
  sortKey: "companyCode",
  sortDirection: "asc",
  revenueSortKey: "companyCode",
  revenueSortDirection: "asc",
  page: 1,
  revenuePage: 1,
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
  if (!runtime) {
    showUnavailable();
    return;
  }

  const [marketArtifact, monthlyRevenue, companyMaster, v56Model] = await Promise.all([
    safeJsonFetch(new URL(runtime.emergingMarketUrl, document.baseURI), { errorTarget }),
    safeJsonFetch(new URL(runtime.datasets?.["94025"], document.baseURI), { errorTarget }),
    typeof runtime.companyMasterUrl === "string"
      ? safeJsonFetch(new URL(runtime.companyMasterUrl, document.baseURI), { errorTarget })
      : Promise.resolve(null),
    typeof runtime.v56MarketDataUrl === "string"
      ? safeJsonFetch(new URL(runtime.v56MarketDataUrl, document.baseURI), { errorTarget })
      : Promise.resolve(null),
  ]);
  const companies = indexCanonicalCompanies(companyMaster);
  if (companies.size === 0) {
    showUnavailable();
    return;
  }
  const sharedV56Market = mapV56EmergingRows(v56Model);
  const useV56Market = v56Model?.schemaVersion === 3 && Array.isArray(v56Model?.emerging?.records);
  state.market = (useV56Market ? sharedV56Market : arrayValue(marketArtifact?.records ?? marketArtifact))
    .map((row) => {
      const identity = applyCanonicalCompanyIdentity(row, companies);
      return identity ? { ...row, ...identity } : null;
    })
    .filter(Boolean);
  state.monthlyRevenue = arrayValue(monthlyRevenue)
    .map(normalizeRevenueRow)
    .map((row) => {
      const identity = applyCanonicalCompanyIdentity(row, companies);
      return identity ? { ...row, ...identity } : null;
    })
    .filter(Boolean);
  populateFilterOptions();
  applyStateToControls();
  render();

  const tradingDate = useV56Market ? v56Model.dataDate : marketArtifact?.tradingDate ?? latestTradingDate(state.market);
  document.querySelector("#emerging-update-status").textContent = tradingDate
    ? `盤後資料日 ${formatDate(tradingDate)}${useV56Market ? " · 已驗證共同快照" : ""}`
    : "盤後市場資料尚未發布";
}

function initializeFromUrl() {
  const params = new URLSearchParams(location.search);
  state.view = viewAliases[params.get("view")] ?? "summary";
  state.query = params.get("q") ?? "";
  state.industry = params.get("industry") ?? "all";
  state.application = params.get("application") ?? "all";
  state.marketDirection = params.get("direction") ?? "all";
  const sortKey = params.get("sort");
  state.sortKey = marketSortKeys.has(sortKey) ? sortKey : "companyCode";
  state.sortDirection = params.get("directionSort") === "desc" ? "desc" : "asc";
  state.revenueSortKey = params.get("revenueSort") ?? "companyCode";
  state.revenueSortDirection = params.get("revenueDirectionSort") === "desc" ? "desc" : "asc";
  state.page = positiveInteger(params.get("page"));
  state.revenuePage = positiveInteger(params.get("revenuePage"));
  if (!sortKey) applyViewPreset();
}

function bindControls() {
  for (const button of document.querySelectorAll("[data-emerging-view]")) {
    button.addEventListener("click", () => {
      state.view = button.dataset.emergingView;
      applyViewPreset();
      syncUrl();
      render();
    });
  }
  for (const [selector, key] of [
    ["#emerging-search", "query"],
    ["#emerging-industry", "industry"],
    ["#emerging-application", "application"],
    ["#emerging-direction", "marketDirection"],
  ]) {
    document.querySelector(selector).addEventListener("input", (event) => {
      state[key] = event.target.value;
      state.page = 1;
      state.revenuePage = 1;
      syncUrl();
      render();
    });
  }
  document.querySelector("#emerging-sort-field").addEventListener("change", (event) => {
    state.sortKey = event.target.value;
    state.sortDirection = "desc";
    state.page = 1;
    updateSortControls();
    syncUrl();
    renderMarketTable();
  });
  document.querySelector("#emerging-sort-direction").addEventListener("click", () => {
    state.sortDirection = state.sortDirection === "desc" ? "asc" : "desc";
    state.page = 1;
    updateSortControls();
    syncUrl();
    renderMarketTable();
  });
  for (const button of document.querySelectorAll("[data-market-sort]")) {
    button.addEventListener("click", () => {
      const key = button.dataset.marketSort;
      state.sortDirection = state.sortKey === key && state.sortDirection === "desc" ? "asc" : "desc";
      state.sortKey = key;
      state.page = 1;
      document.querySelector("#emerging-sort-field").value = key;
      updateSortControls();
      syncUrl();
      renderMarketTable();
    });
  }
  for (const button of document.querySelectorAll("[data-revenue-sort]")) {
    button.addEventListener("click", () => {
      const key = button.dataset.revenueSort;
      state.revenueSortDirection = state.revenueSortKey === key && state.revenueSortDirection === "desc" ? "asc" : "desc";
      state.revenueSortKey = key;
      state.revenuePage = 1;
      updateRevenueSortControls();
      syncUrl();
      renderRevenue();
    });
  }
  window.addEventListener("popstate", () => {
    initializeFromUrl();
    applyStateToControls();
    render();
  });
}

function render() {
  const rankingsSelected = state.view === "summary";
  const marketSelected = state.view === "price" || state.view === "volume" || state.view === "all";
  document.querySelector("#summary-view").hidden = !rankingsSelected;
  document.querySelector("#market-view").hidden = !marketSelected;
  document.querySelector("#revenue-view").hidden = state.view !== "revenue";
  for (const button of document.querySelectorAll("[data-emerging-view]")) {
    button.setAttribute("aria-selected", String(button.dataset.emergingView === state.view));
    button.tabIndex = button.dataset.emergingView === state.view ? 0 : -1;
  }
  if (rankingsSelected || marketSelected) {
    renderBreadthAndRankings();
    if (marketSelected) renderMarketTable();
  } else {
    renderRevenue();
  }
}

function applyViewPreset() {
  if (state.view === "price") {
    state.sortKey = "averageChangePercent";
    state.sortDirection = "desc";
  }
  if (state.view === "volume") {
    state.sortKey = "transactionVolume";
    state.sortDirection = "desc";
  }
}

function renderBreadthAndRankings() {
  const rows = currentDateRows();
  const count = (direction) => rows.filter((row) => row.direction === direction).length;
  const effective = rows.every((row) => publicNumber(row.dailyAveragePrice) !== null)
    ? rows.length
    : null;
  const traded = countPublishedPositive(rows, (row) => row.transactionVolume);
  const lowLiquidity = traded === null ? null : rows.length - traded;
  const totalVolume = sumDecimal(rows, "transactionVolume");
  const totalAmount = sumDecimal(rows, "estimatedTransactionAmount");
  setBreadth("companies", formatNumber(rows.length));
  setBreadth("effective", formatNumber(effective));
  setBreadth("traded", formatNumber(traded));
  setBreadth("low-liquidity", formatNumber(lowLiquidity));
  setBreadth("directions", `${count("up")}／${count("down")}／${count("flat")}`);
  setBreadth("volume", formatNumber(totalVolume));
  setBreadth("amount", formatNumber(totalAmount, { maximumFractionDigits: 0 }));

  const rankings = [
    ["漲幅排行", ranked(rows.filter((row) => positiveNumber(row.averageChangePercent)), "averageChangePercent", "desc"), "percent"],
    ["跌幅排行", ranked(rows.filter((row) => {
      const value = publicNumber(row.averageChangePercent);
      return value !== null && value < 0;
    }), "averageChangePercent", "asc"), "percent"],
    ["成交股數排行", ranked(rows, "transactionVolume", "desc"), "number"],
    ["估算成交金額排行", ranked(rows, "estimatedTransactionAmount", "desc"), "number"],
  ];
  document.querySelector("#emerging-rankings").innerHTML = rankings.map(([title, items, format]) => `
    <section class="ranking-panel"><h3>${title}</h3><ol>${items.map((row) => `
      <li><button type="button" data-rank-company="${escapeHtml(row.companyCode)}"><span>${escapeHtml(row.companyCode)} ${escapeHtml(row.companyName)}</span><strong>${format === "percent" ? formatPercent(row.averageChangePercent) : formatNumber(row[title.includes("金額") ? "estimatedTransactionAmount" : "transactionVolume"], { maximumFractionDigits: 0 })}</strong></button></li>
    `).join("") || "<li class=\"empty-cell\">—</li>"}</ol></section>
  `).join("");
  for (const button of document.querySelectorAll("[data-rank-company]")) {
    button.addEventListener("click", () => {
      state.query = button.dataset.rankCompany;
      state.page = 1;
      document.querySelector("#emerging-search").value = state.query;
      syncUrl();
      renderMarketTable();
      document.querySelector("#emerging-filters").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function renderMarketTable() {
  const filtered = filteredMarketRows();
  const type = document.querySelector(`[data-market-sort="${CSS.escape(state.sortKey)}"]`)?.dataset.sortType ?? "number";
  const sorted = sortRows(
    filtered.map((row) => ({ ...row, bondCode: row.companyCode })),
    { key: state.sortKey, direction: state.sortDirection, type },
  );
  const size = pageSize();
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  state.page = Math.min(state.page, pages);
  const visible = sorted.slice((state.page - 1) * size, state.page * size);
  document.querySelector("#emerging-result-count").textContent = `${formatNumber(sorted.length)} 筆`;
  document.querySelector("#emerging-table-body").innerHTML = visible.length ? visible.map(marketRowHtml).join("") : emptyRow(10);
  document.querySelector("#emerging-card-list").innerHTML = visible.map(marketCardHtml).join("");
  renderPagination("#emerging-pagination", state.page, pages, (page) => {
    state.page = page;
    syncUrl();
    renderMarketTable();
  });
  updateSortControls();
}

function renderRevenue() {
  const query = state.query.trim().toLocaleLowerCase("zh-Hant");
  const rows = state.monthlyRevenue.filter((row) => {
    const matchesQuery = !query || `${row.companyCode} ${row.companyName}`.toLocaleLowerCase("zh-Hant").includes(query);
    const matchesIndustry = state.industry === "all" || row.industryName === state.industry;
    return matchesQuery && matchesIndustry;
  });
  const type = document.querySelector(`[data-revenue-sort="${CSS.escape(state.revenueSortKey)}"]`)?.dataset.sortType ?? "number";
  const sorted = sortRows(
    rows.map((row) => ({ ...row, bondCode: row.companyCode })),
    { key: state.revenueSortKey, direction: state.revenueSortDirection, type },
  );
  const size = pageSize();
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  state.revenuePage = Math.min(state.revenuePage, pages);
  const visible = sorted.slice((state.revenuePage - 1) * size, state.revenuePage * size);
  document.querySelector("#revenue-period").textContent = visible[0]?.yearMonth ? `資料年月 ${formatRocMonth(visible[0].yearMonth)}` : "尚無月營收資料";
  document.querySelector("#emerging-revenue-body").innerHTML = visible.length ? visible.map(revenueRowHtml).join("") : emptyRow(8);
  updateRevenueSortControls();
  renderPagination("#revenue-pagination", state.revenuePage, pages, (page) => {
    state.revenuePage = page;
    syncUrl();
    renderRevenue();
  });
}

function filteredMarketRows() {
  const query = state.query.trim().toLocaleLowerCase("zh-Hant");
  return currentDateRows().filter((row) => {
    const matchesQuery = !query || `${row.companyCode} ${row.companyName}`.toLocaleLowerCase("zh-Hant").includes(query);
    const matchesIndustry = state.industry === "all" || (row.industryName ?? "未分類") === state.industry;
    const matchesApplication = state.application === "all" || (row.applyingStatus || "未申請") === state.application;
    const matchesDirection = state.marketDirection === "all" || row.direction === state.marketDirection;
    return matchesQuery && matchesIndustry && matchesApplication && matchesDirection;
  });
}

function marketRowHtml(row) {
  return `<tr id="company-${escapeHtml(row.companyCode)}">
    <th scope="row"><a href="${marketDetailHref(row.companyCode)}"><span class="metric-main">${escapeHtml(row.companyCode)}</span>${escapeHtml(row.companyName)}</a></th>
    <td>${escapeHtml(row.industryName ?? "未分類")}</td>
    <td>${formatEmergingDailyAverage(row)}</td>
    <td>${formatNumber(row.previousAveragePrice, { maximumFractionDigits: 2 })}</td>
    <td class="market-${escapeHtml(row.direction)}">${formatSigned(row.averageChange)}<small>${formatPercent(row.averageChangePercent)}</small></td>
    <td>${formatNumber(row.dailyHighPrice, { maximumFractionDigits: 2 })}</td>
    <td>${formatNumber(row.dailyLowPrice, { maximumFractionDigits: 2 })}</td>
    <td>${formatNumber(row.transactionVolume)}</td>
    <td>${formatNumber(row.estimatedTransactionAmount, { maximumFractionDigits: 0 })}</td>
    <td>${escapeHtml(row.applyingStatus || "未申請")}</td>
  </tr>`;
}

function marketCardHtml(row) {
  return `<article class="market-card" id="card-${escapeHtml(row.companyCode)}"><header><strong>${escapeHtml(row.companyCode)} ${escapeHtml(row.companyName)}</strong><span>${escapeHtml(row.industryName ?? "未分類")}</span></header><dl>
    <div><dt>本日成交均價（盤後）</dt><dd>${formatEmergingDailyAverage(row)}</dd></div>
    <div><dt>前日成交均價（盤後）</dt><dd>${formatNumber(row.previousAveragePrice, { maximumFractionDigits: 2 })}</dd></div>
    <div><dt>均價漲跌</dt><dd class="market-${escapeHtml(row.direction)}">${formatSigned(row.averageChange)}／${formatPercent(row.averageChangePercent)}</dd></div>
    <div><dt>最高／最低</dt><dd>${formatNumber(row.dailyHighPrice, { maximumFractionDigits: 2 })}／${formatNumber(row.dailyLowPrice, { maximumFractionDigits: 2 })}</dd></div>
    <div><dt>成交股數</dt><dd>${formatNumber(row.transactionVolume)}</dd></div>
    <div><dt>估算成交金額（盤後）</dt><dd>${formatNumber(row.estimatedTransactionAmount, { maximumFractionDigits: 0 })}</dd></div>
  </dl></article>`;
}

function revenueRowHtml(row) {
  return `<tr><th scope="row"><span class="metric-main">${escapeHtml(row.companyCode)}</span>${escapeHtml(row.companyName)}</th><td>${escapeHtml(row.industryName || "未分類")}</td><td>${escapeHtml(formatRocMonth(row.yearMonth))}</td><td>${formatNumber(row.monthRevenue)}</td><td>${formatPercent(row.monthChangePercent)}</td><td>${formatPercent(row.yearChangePercent)}</td><td>${formatNumber(row.cumulativeRevenue)}</td><td>${formatPercent(row.cumulativeChangePercent)}</td></tr>`;
}

function populateFilterOptions() {
  replaceOptions("#emerging-industry", "全部產業", unique([
    ...state.market.map((row) => row.industryName ?? "未分類"),
    ...state.monthlyRevenue.map((row) => row.industryName ?? "未分類"),
  ]));
  replaceOptions("#emerging-application", "全部狀態", unique(state.market.map((row) => row.applyingStatus || "未申請")));
}

function replaceOptions(selector, allLabel, values) {
  document.querySelector(selector).innerHTML = `<option value="all">${allLabel}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
}

function applyStateToControls() {
  document.querySelector("#emerging-search").value = state.query;
  selectExistingValue("#emerging-industry", state.industry);
  selectExistingValue("#emerging-application", state.application);
  selectExistingValue("#emerging-direction", state.marketDirection);
  selectExistingValue("#emerging-sort-field", state.sortKey);
  updateSortControls();
  updateRevenueSortControls();
}

function updateRevenueSortControls() {
  for (const button of document.querySelectorAll("[data-revenue-sort]")) {
    const active = button.dataset.revenueSort === state.revenueSortKey;
    const th = button.closest("th");
    th.setAttribute("aria-sort", active ? (state.revenueSortDirection === "desc" ? "descending" : "ascending") : "none");
    button.querySelector("span").textContent = active ? (state.revenueSortDirection === "desc" ? "↓" : "↑") : "";
  }
}

function updateSortControls() {
  const directionButton = document.querySelector("#emerging-sort-direction");
  directionButton.dataset.direction = state.sortDirection;
  directionButton.textContent = state.sortDirection === "desc" ? "高到低 ↓" : "低到高 ↑";
  for (const button of document.querySelectorAll("[data-market-sort]")) {
    const active = button.dataset.marketSort === state.sortKey;
    const th = button.closest("th");
    th.setAttribute("aria-sort", active ? (state.sortDirection === "desc" ? "descending" : "ascending") : "none");
    button.querySelector("span").textContent = active ? (state.sortDirection === "desc" ? "↓" : "↑") : "";
  }
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.view !== "summary") params.set("view", state.view);
  if (state.query) params.set("q", state.query);
  if (state.industry !== "all") params.set("industry", state.industry);
  if (state.application !== "all") params.set("application", state.application);
  if (state.marketDirection !== "all") params.set("direction", state.marketDirection);
  if (state.sortKey !== "companyCode") params.set("sort", state.sortKey);
  if (state.sortDirection !== "asc") params.set("directionSort", state.sortDirection);
  if (state.revenueSortKey !== "companyCode") params.set("revenueSort", state.revenueSortKey);
  if (state.revenueSortDirection !== "asc") params.set("revenueDirectionSort", state.revenueSortDirection);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.revenuePage > 1) params.set("revenuePage", String(state.revenuePage));
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
}

function renderPagination(selector, current, total, onSelect) {
  const target = document.querySelector(selector);
  if (!target) return;
  target.innerHTML = `<button type="button" ${current === 1 ? "disabled" : ""} data-page="${current - 1}">上一頁</button><span>第 ${current}／${total} 頁</span><button type="button" ${current === total ? "disabled" : ""} data-page="${current + 1}">下一頁</button>`;
  for (const button of target.querySelectorAll("[data-page]")) {
    button.addEventListener("click", () => onSelect(Number(button.dataset.page)));
  }
}

function currentDateRows() {
  const date = latestTradingDate(state.market);
  return state.market.filter((row) => row.tradingDate === date);
}

function ranked(rows, key, direction) {
  return sortRows(rows.map((row) => ({ ...row, bondCode: row.companyCode })), { key, direction, type: "number" }).slice(0, 5);
}

function normalizeRevenueRow(row) {
  return {
    companyCode: row.companyCode ?? row["公司代號"] ?? "",
    companyName: row.companyName ?? row["公司名稱"] ?? "",
    industryName: row.industryName ?? row["產業別"] ?? null,
    yearMonth: row.yearMonth ?? row["資料年月"] ?? "",
    monthRevenue: row.monthRevenue ?? row["營業收入-當月營收"] ?? null,
    monthChangePercent: row.monthChangePercent ?? row["營業收入-上月比較增減(%)"] ?? null,
    yearChangePercent: row.yearChangePercent ?? row["營業收入-去年同月增減(%)"] ?? null,
    cumulativeRevenue: row.cumulativeRevenue ?? row["累計營業收入-當月累計營收"] ?? null,
    cumulativeChangePercent: row.cumulativeChangePercent ?? row["累計營業收入-前期比較增減(%)"] ?? null,
  };
}

function showUnavailable() {
  document.querySelector("#emerging-update-status").textContent = "盤後市場資料尚未發布";
  document.querySelector("#emerging-table-body").innerHTML = emptyRow(10, "目前沒有可顯示的盤後市場資料");
  document.querySelector("#emerging-revenue-body").innerHTML = emptyRow(8, "目前沒有可顯示的月營收資料");
}

function pageSize() {
  return matchMedia("(max-width: 900px)").matches ? 25 : 50;
}

function latestTradingDate(rows) {
  return rows.map((row) => row.tradingDate).filter(Boolean).sort().at(-1) ?? null;
}

function sumDecimal(rows, key) {
  return sumPublishedValues(rows, (row) => {
    const value = row?.[key];
    return typeof value === "string" ? value.replaceAll(",", "") : value;
  });
}

function positiveNumber(value) {
  const normalized = typeof value === "string" ? value.replaceAll(",", "") : value;
  const number = publicNumber(normalized);
  return number !== null && number > 0;
}

function formatSigned(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number > 0 ? "+" : ""}${formatNumber(number, { maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number > 0 ? "+" : ""}${formatNumber(number, { maximumFractionDigits: 2 })}%`;
}

function formatEmergingDailyAverage(row) {
  const label = emergingDailyAverageLabel(row);
  return label ?? formatNumber(row.dailyAveragePrice, { maximumFractionDigits: 2 });
}

function formatRocMonth(value) {
  const match = String(value ?? "").match(/^(\d{3})(\d{2})$/);
  return match ? `${Number(match[1]) + 1911}/${match[2]}` : value || "—";
}

function setBreadth(key, value) {
  document.querySelector(`[data-breadth="${key}"]`).textContent = value;
}

function selectExistingValue(selector, value) {
  const select = document.querySelector(selector);
  select.value = [...select.options].some((option) => option.value === value) ? value : select.options[0]?.value ?? "";
}

function positiveInteger(value) {
  return Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function emptyRow(columns, message = "沒有符合條件的資料") {
  return `<tr><td colspan="${columns}" class="empty-cell">${message}</td></tr>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
