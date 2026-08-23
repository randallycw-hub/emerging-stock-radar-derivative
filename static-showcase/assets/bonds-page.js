import {
  filterBondRecords,
  paginateBondRecords,
  parseBondListState,
  serializeBondListState,
  sortBondRecords,
} from "./bond-list-page.js";
import { bindBondDetail, detailRecordFromLegacy, renderBondDetail } from "./bond-detail-page.js";

const reasonLabels = {
  NO_CB_CLOSE: "尚無可用 CB 收盤",
  NO_STOCK_CLOSE: "尚無可用股票收盤",
  NO_CONVERSION_PRICE: "尚無已驗證轉換價",
  NO_COMMON_VALUATION_DATE: "CB 與股票沒有共同估值日",
  NO_EFFECTIVE_CONVERSION_PRICE: "估值日缺少已生效轉換價",
  SNAPSHOT_NOT_PUBLISHED: "盤後市場快照尚未發布",
};
const bootstrapConfig = globalThis.window?.__OFFICIAL_SHOWCASE__ ?? {
  generationPointerUrl: new URL("../data/current.json", import.meta.url).href,
  datasets: {},
};
const state = {
  manifest: null,
  bondTerms: [],
  views: [],
  history: [],
  workbench: [],
  sortKey: null,
  sortDirection: "asc",
  page: 1,
  archived: false,
  workbenchDeclared: false,
  workbenchUnavailable: false,
  detailOrigin: null,
};
let disposeDetail = () => {};

if (globalThis.window && globalThis.document) {
  initializeFromUrl();
  bindFilters();
  await loadAndRender();
  globalThis.window.addEventListener("popstate", () => {
    initializeFromUrl();
    renderRoute();
  });
}

async function loadAndRender() {
  const pointer = await loadJson(bootstrapConfig.generationPointerUrl, null);
  const config = pointer?.runtimeUrl
    ? await loadJson(new URL(pointer.runtimeUrl, document.baseURI), { manifestUrl: null, datasets: {} })
    : bootstrapConfig;
  const workbenchDeclared = Object.prototype.hasOwnProperty.call(
    config.datasets ?? {},
    "bondWorkbench",
  );
  const [manifest, bondTerms, market, history, workbenchResult] =
    await Promise.all([
      loadJson(config.manifestUrl, null),
      loadJson(config.datasets["11406"], []),
      loadJson(config.datasets.bondMarket, []),
      loadJson(config.datasets.bondHistory, []),
      workbenchDeclared
        ? loadDeclaredWorkbench(config.datasets.bondWorkbench)
        : Promise.resolve({ ok: true, value: null }),
    ]);
  state.manifest = manifest;
  state.bondTerms = arrayValue(bondTerms);
  const marketViews = arrayValue(market);
  state.history = arrayValue(history);
  state.workbenchDeclared = workbenchDeclared;
  state.workbenchUnavailable = workbenchDeclared && !workbenchResult.ok;
  state.workbench = state.workbenchUnavailable
    ? []
    : arrayValue(workbenchResult.value?.records);
  state.views = state.workbenchUnavailable
    ? []
    : workbenchDeclared
      ? buildBondListRecords({
        workbench: state.workbench,
        bondTerms: state.bondTerms,
      })
      : buildBondListRecords({
        views: marketViews.length === 0 ? fallbackBondViews(state.bondTerms) : marketViews,
        bondTerms: state.bondTerms,
      });
  renderRoute();
  const marketDate = state.manifest?.market?.dataDate;
  document.querySelector("#bond-update-status").textContent = marketDate
    ? `盤後資料日 ${marketDate}`
    : `資料版本 ${state.manifest?.generatedAt ?? "讀取完成"}`;
}

function initializeFromUrl() {
  const listState = parseBondListState(location.search);
  state.sortKey = new URLSearchParams(location.search).get("sort") || null;
  state.sortDirection = listState.direction;
  state.page = listState.page;
  state.archived = listState.archived;
  document.querySelector("#bond-search").value = listState.query;
  document.querySelector("#bond-archive-toggle").checked = state.archived;
}

function bindFilters() {
  document.querySelector("#bond-search").addEventListener("input", () => {
    state.page = 1;
    syncListUrl();
    renderBonds();
  });
  document.querySelector("#bond-archive-toggle").addEventListener("change", (event) => {
    state.archived = event.target.checked;
    state.page = 1;
    syncListUrl();
    renderBonds();
  });
  document.querySelector("#bond-clear-filter").addEventListener("click", () => {
    document.querySelector("#bond-search").value = "";
    state.page = 1;
    syncListUrl();
    renderBonds();
    document.querySelector("#bond-search").focus();
  });
  for (const button of document.querySelectorAll("[data-sort-key]")) {
    button.addEventListener("click", () => {
      const key = button.dataset.sortKey;
      if (state.sortKey !== key) {
        state.sortKey = key;
        state.sortDirection = "asc";
      } else if (state.sortDirection === "asc") {
        state.sortDirection = "desc";
      } else {
        state.sortKey = null;
        state.sortDirection = "asc";
      }
      state.page = 1;
      syncListUrl();
      renderBonds();
    });
  }
}

async function loadJson(url, fallback) {
  if (!url) return fallback;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.json();
  } catch {
    return fallback;
  }
}

async function loadDeclaredWorkbench(url) {
  if (typeof url !== "string" || url.length === 0) return { ok: false, value: null };
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const value = await response.json();
    if (
      value === null
      || typeof value !== "object"
      || Array.isArray(value)
      || !Array.isArray(value.records)
    ) {
      throw new Error("INVALID_WORKBENCH");
    }
    return { ok: true, value };
  } catch {
    return { ok: false, value: null };
  }
}

function arrayValue(value) {
  return Array.isArray(value) ? value : Array.isArray(value?.records) ? value.records : [];
}

export function buildBondListRecords({ views = [], workbench = [], bondTerms = [] } = {}) {
  const termsByBondCode = new Map(
    arrayValue(bondTerms)
      .filter((term) => /^\d{5,6}$/.test(String(term?.["債券代碼"] ?? "")))
      .map((term) => [String(term["債券代碼"]), term]),
  );
  if (arrayValue(workbench).length > 0) {
    return arrayValue(workbench).map((record) => {
      const view = record?.view ?? {};
      const term = record?.term ?? {};
      const legacyTerm = termsByBondCode.get(record?.bondCode);
      return {
        ...view,
        bondCode: record.bondCode,
        issuerCode: term.issuerCode ?? view.issuerCode,
        issuerName: term.issuerName ?? legacyTerm?.["機構名稱"] ?? view.issuerName ?? view.issuerCode,
        bondName: term.bondName ?? view.bondName,
        status: record.status,
        archived: record.status === "archived",
        archiveReason: record.archiveReason,
        archivedAt: record.archivedAt,
        archiveDate: record.archivedAt,
      };
    });
  }
  return arrayValue(views).map((view) => {
    const term = termsByBondCode.get(view.bondCode);
    return {
      ...view,
      issuerName: term?.["機構名稱"] ?? view.issuerName ?? view.issuerCode,
    };
  });
}

function fallbackBondViews(rows) {
  const today = state.manifest?.generatedAt ?? "";
  return rows
    .filter((row) => /^\d{5,6}$/.test(String(row["債券代碼"] ?? "")))
    .map((row) => ({
      bondCode: String(row["債券代碼"]),
      issuerCode: String(row["機構代碼"] ?? ""),
      bondName: String(row["債券簡稱"] ?? "未命名可轉債"),
      cbClose: null,
      cbPriceDate: null,
      cbTradeUnits: "0",
      stockClose: null,
      stockPriceDate: null,
      currentConversionPrice: null,
      conversionPriceEffectiveDate: null,
      valuationDate: null,
      valuationCbClose: null,
      valuationStockClose: null,
      conversionValue: null,
      premiumRate: null,
      outstandingAmount: row["目前餘額"] || null,
      outstandingReductionRate: null,
      maturityDate: formatDate(row["到期日期"]),
      daysToMaturity: daysBetween(today, formatDate(row["到期日期"])),
      nextPutDate: row["賣回權日期"] ? formatDate(row["賣回權日期"]) : null,
      daysToNextPut: row["賣回權日期"]
        ? daysBetween(today, formatDate(row["賣回權日期"]))
        : null,
      nextEventType: row["賣回權日期"] ? "put" : "maturity",
      nextEventDate: row["賣回權日期"]
        ? formatDate(row["賣回權日期"])
        : formatDate(row["到期日期"]),
      daysToNextEvent: daysBetween(
        today,
        row["賣回權日期"]
          ? formatDate(row["賣回權日期"])
          : formatDate(row["到期日期"]),
      ),
      staleCbPrice: false,
      missingReasons: ["SNAPSHOT_NOT_PUBLISHED"],
    }));
}

function renderBonds() {
  if (state.workbenchUnavailable) {
    const message = "可轉債工作台資料目前無法使用；請稍後再試。";
    setText("#bond-result-count", "資料無法使用");
    document.querySelector("#bond-clear-filter").hidden = true;
    document.querySelector("#bond-table-body").innerHTML = `<tr><td colspan="10" class="empty-cell">${message}</td></tr>`;
    document.querySelector("#bond-card-list").innerHTML = `<p class="empty-cell">${message}</p>`;
    document.querySelector("#bond-pagination").innerHTML = "";
    return;
  }
  const prepared = state.views.map((view) => ({ ...view, issuerName: termFor(view.bondCode)?.["機構名稱"] ?? view.issuerName ?? view.issuerCode }));
  const filtered = filterBondRecords(prepared, {
    query: document.querySelector("#bond-search").value,
    archived: state.archived,
  });
  const ordered = state.sortKey ? sortBondRecords(filtered, { key: state.sortKey, direction: state.sortDirection }) : filtered;
  const pagination = paginateBondRecords(ordered, state.page);
  state.page = pagination.page;
  const visible = pagination.records;
  const noResults = ordered.length === 0;

  setText("#bond-result-count", `${pagination.total} 檔 · 第 ${state.page}/${pagination.pageCount} 頁`);
  document.querySelector("#bond-clear-filter").hidden = !noResults || !document.querySelector("#bond-search").value.trim();
  document.querySelector("#bond-table-body").innerHTML = visible.length
    ? visible.map(renderBondRow).join("")
    : '<tr><td colspan="10" class="empty-cell">沒有符合條件的可轉債；可清除搜尋條件後再試。</td></tr>';
  document.querySelector("#bond-card-list").innerHTML = visible.length
    ? visible.map(renderBondCard).join("")
    : '<p class="empty-cell">沒有符合條件的可轉債；可清除搜尋條件後再試。</p>';
  updateSortHeaders();
  renderPagination(pagination.pageCount);
  bindBondOpeners();
}

function renderBondRow(view) {
  const term = termFor(view.bondCode);
  const reason = firstReason(view);
  const presentation = bondListPresentation(view);
  return `<tr tabindex="0" data-bond-code="${escapeHtml(view.bondCode)}" aria-label="查看 ${escapeHtml(view.bondName)} 詳細資料">
    <td>${metric(`${view.bondCode} · ${view.bondName}`, `${view.issuerCode} ${term?.["機構名稱"] ?? ""}`)}</td>
    <td>${priceMetric(view.cbClose, view.cbPriceDate, view.staleCbPrice ? "非當日成交" : "")}</td>
    <td>${priceMetric(view.conversionValue, view.valuationDate, "估值日", "metric-violet")}</td>
    <td>${rateMetric(view.premiumRate, view.valuationDate, reason)}</td>
    <td>${priceMetric(view.stockClose, view.stockPriceDate)}</td>
    <td>${priceMetric(view.currentConversionPrice, view.conversionPriceEffectiveDate, "生效日")}</td>
    <td>${metric(presentation.remainingRatio, "流通餘額比例")}</td>
    <td>${eventMetric(view)}</td>
    <td>${metric(view.valuationDate ?? view.cbPriceDate, "資料日期")}</td>
    <td>${metric(view.archived || view.status === "archived" ? "封存" : presentation.qualityLabel, view.archived || view.status === "archived" ? `${view.archiveReason ?? "封存"} · ${view.archiveDate ?? view.archivedAt ?? "日期未提供"}` : firstReason(view) || "已驗證")}</td>
  </tr>`;
}

function renderBondCard(view) {
  const presentation = bondListPresentation(view);
  return `<button class="bond-card" type="button" data-bond-code="${escapeHtml(view.bondCode)}">
    <header><strong>${escapeHtml(view.bondCode)} · ${escapeHtml(view.bondName)}</strong><span>${view.staleCbPrice ? "非當日成交" : ""}</span></header>
    <span class="bond-card-grid">
      ${cardMetric("CB 收盤", valueOrDash(view.cbClose), view.cbPriceDate)}
      ${cardMetric("轉換價值", valueOrDash(view.conversionValue), view.valuationDate)}
      ${cardMetric("轉換溢價率", view.premiumRate === null ? "—" : signedRate(view.premiumRate), view.valuationDate)}
      ${cardMetric("標的股收盤", valueOrDash(view.stockClose), view.stockPriceDate)}
      ${cardMetric("目前轉換價", valueOrDash(view.currentConversionPrice), view.conversionPriceEffectiveDate)}
      ${cardMetric("流通餘額比例", presentation.remainingRatio, "流通餘額比例")}
      ${cardMetric("下一事件", presentation.eventLabel, presentation.eventDate)}
      ${cardMetric("資料日期", view.valuationDate ?? view.cbPriceDate, "資料日期")}
      ${cardMetric("資料品質", view.archived || view.status === "archived" ? "封存" : presentation.qualityLabel, view.archived || view.status === "archived" ? `${view.archiveReason ?? "封存"} · ${view.archiveDate ?? view.archivedAt ?? "日期未提供"}` : firstReason(view) || "已驗證")}
    </span>
  </button>`;
}

function bindBondOpeners() {
  for (const element of document.querySelectorAll("[data-bond-code]")) {
    const open = () => openBond(element.dataset.bondCode, element);
    element.addEventListener("click", open);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  }
}

function updateSortHeaders() {
  for (const button of document.querySelectorAll("[data-sort-key]")) {
    const active = button.dataset.sortKey === state.sortKey;
    const heading = button.closest("th");
    heading.setAttribute("aria-sort", active
      ? state.sortDirection === "desc" ? "descending" : "ascending"
      : "none");
    button.querySelector("span").textContent = active
      ? state.sortDirection === "desc" ? "↓" : "↑"
      : "";
  }
}

function renderPagination(pageCount) {
  const target = document.querySelector("#bond-pagination");
  if (pageCount <= 1) {
    target.innerHTML = "";
    return;
  }
  target.innerHTML = `
    <button type="button" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""}>上一頁</button>
    <span>第 ${state.page} / ${pageCount} 頁</span>
    <button type="button" data-page="${state.page + 1}" ${state.page === pageCount ? "disabled" : ""}>下一頁</button>`;
  for (const button of target.querySelectorAll("[data-page]")) {
    button.addEventListener("click", () => {
      state.page = Number(button.dataset.page);
      syncListUrl();
      renderBonds();
      document.querySelector("#bond-market-heading").focus?.();
    });
  }
}

function syncListUrl({ push = false } = {}) {
  const search = serializeBondListState({
    query: document.querySelector("#bond-search").value,
    archived: state.archived,
    sortKey: state.sortKey,
    direction: state.sortDirection,
    page: state.page,
  });
  const url = `${location.pathname}${search}`;
  history[push ? "pushState" : "replaceState"](null, "", url);
}

function openBond(code, origin = null) {
  state.detailOrigin = origin
    ? { bondCode: code, tagName: origin.tagName ?? null }
    : null;
  const params = new URLSearchParams(location.search);
  params.set("bond", code);
  history.pushState(null, "", `${location.pathname}?${params}`);
  renderRoute();
}

function renderRoute() {
  const code = new URLSearchParams(location.search).get("bond");
  const target = document.querySelector("#bond-workbench");
  const list = document.querySelector("#bond-list-view");
  disposeDetail();
  disposeDetail = () => {};
  if (!code) {
    target.hidden = true;
    target.innerHTML = "";
    list.hidden = false;
    renderBonds();
    return;
  }
  if (state.workbenchUnavailable) {
    target.hidden = false;
    list.hidden = true;
    target.innerHTML = '<p class="empty-cell">可轉債工作台資料目前無法使用；請稍後再試。</p><button class="close-workbench" type="button">返回可轉債總表</button>';
    const closeButton = target.querySelector(".close-workbench");
    closeButton.addEventListener("click", closeDetail);
    closeButton.focus();
    return;
  }
  const view = state.views.find((candidate) => candidate.bondCode === code);
  if (!view) {
    target.hidden = false;
    list.hidden = true;
    target.innerHTML = `<p class="empty-cell">找不到代碼 ${escapeHtml(code)} 的可轉債資料。</p><button class="close-workbench" type="button">返回可轉債總表</button>`;
    target.querySelector(".close-workbench").addEventListener("click", closeDetail);
    target.querySelector(".close-workbench").focus();
    return;
  }
  const detail = state.workbench.find((candidate) => candidate.bondCode === code)
    ?? detailRecordFromLegacy({ view, term: termFor(view.bondCode) ?? {}, events: [] });
  target.innerHTML = renderBondDetail(detail);
  disposeDetail = bindBondDetail(target, closeDetail, { history: state.history.filter((point) => point.bondCode === code), events: detail.events, archived: detail.status === "archived" });
  target.hidden = false;
  list.hidden = true;
  target.querySelector("[data-detail-close]")?.focus();
}

function closeDetail() {
  const origin = state.detailOrigin;
  state.detailOrigin = null;
  const params = new URLSearchParams(location.search);
  params.delete("bond");
  history.pushState(null, "", `${location.pathname}?${params}`);
  initializeFromUrl();
  renderRoute();
  const candidates = [...document.querySelectorAll("[data-bond-code]")];
  const focusTarget = candidates.find((element) => (
    element.dataset.bondCode === origin?.bondCode
    && (origin.tagName === null || element.tagName === origin.tagName)
    && element.getClientRects().length > 0
  )) ?? document.querySelector("#bond-search");
  focusTarget?.focus();
}

function metric(main, sub, className = "") {
  return `<span class="metric-main ${className}">${escapeHtml(valueOrDash(main))}</span><span class="metric-sub">${escapeHtml(valueOrDash(sub))}</span>`;
}

function priceMetric(value, date, note = "", className = "") {
  return metric(valueOrDash(value), [date, note].filter(Boolean).join(" · ") || "資料暫缺", className);
}

function rateMetric(value, date, reason) {
  if (value === null || value === undefined) return metric("—", reason || "資料暫缺", "metric-alert");
  const number = Number(value);
  const icon = number > 0 ? "▲" : number < 0 ? "▼" : "•";
  return metric(`${icon} ${signedRate(value)}`, date ? `估值日 ${date}` : "", number > 0 ? "metric-alert" : "metric-violet");
}

function eventMetric(view) {
  const presentation = bondListPresentation(view);
  return metric(presentation.eventLabel, presentation.eventDate);
}

export function bondListPresentation(view = {}) {
  const eventLabels = { redemption: "贖回", put: "賣回", maturity: "到期" };
  const eventTypeLabel = eventLabels[view.nextEventType] ?? "事件";
  const eventLabel = Number.isInteger(view.daysToNextEvent)
    ? `${eventTypeLabel} ${view.daysToNextEvent} 天`
    : eventTypeLabel;
  return {
    remainingRatio: plainRate(view.remainingRatio),
    eventLabel: view.nextEventDate ? eventLabel : "資料暫缺",
    eventDate: view.nextEventDate ?? "資料暫缺",
    qualityLabel: view.dataQuality === "complete" && !view.missingReasons?.length
      ? "可用"
      : "待補",
  };
}

function cardMetric(label, value, sub) {
  return `<span><span>${escapeHtml(label)}</span><strong>${escapeHtml(valueOrDash(value))}</strong><small>${escapeHtml(sub ?? "資料暫缺")}</small></span>`;
}

function firstReason(view) {
  return reasonLabels[view.missingReasons?.[0]] ?? (view.missingReasons?.length ? "資料暫缺" : "");
}

function termFor(code) {
  return state.bondTerms.find((row) => String(row["債券代碼"]) === code);
}

function signedRate(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${number > 0 ? "+" : ""}${number.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}%`;
}

function plainRate(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${number.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}%`;
}

function formatDate(value) {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value).trim();
  let match;
  if ((match = /^(\d{4})(\d{2})(\d{2})$/.exec(text))) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  if ((match = /^(\d{3})(\d{2})(\d{2})$/.exec(text))) {
    return `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  }
  if ((match = /^(\d{3})\/(\d{2})\/(\d{2})$/.exec(text))) {
    return `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  }
  if ((match = /^(\d{3})(\d{2})$/.exec(text))) {
    return `${Number(match[1]) + 1911}-${match[2]}`;
  }
  return text;
}

function daysBetween(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
