import {
  applyPublicBondScreener,
  buildBondSearchSuggestions,
  filterBondRecords,
  paginateBondRecords,
  parseBondListState,
  serializeBondListState,
  sortBondRecords,
} from "./bond-list-page.js";
import { bindBondDetail, detailRecordFromLegacy, renderBondDetail } from "./bond-detail-page.js";
import { applyCanonicalBondIdentity, indexCanonicalBonds } from "./canonical-identity.js";
import { RANKING_METRICS, renderMarketOverview } from "./cb-workbench-ui.js";
import { bindCbDetailV53, renderCbDetailV53 } from "./cb-detail-v53.js";

const bootstrapConfig = globalThis.window?.__OFFICIAL_SHOWCASE__ ?? {
  generationPointerUrl: new URL("../data/current.json", import.meta.url).href,
  datasets: {},
};
const state = {
  manifest: null,
  bondTerms: [],
  views: [],
  history: [],
  conversionPrices: [],
  canonicalBonds: new Map(),
  workbench: [],
  sortKey: null,
  sortDirection: "asc",
  page: 1,
  archived: false,
  event: "",
  maturityBefore: "",
  remainingMax: null,
  secured: "",
  screener: "",
  workbenchDeclared: false,
  workbenchUnavailable: false,
  workbenchAsOfDate: null,
  v53Model: null,
  v56Model: null,
  overviewMetric: "volume",
  detailOrigin: null,
  suggestions: [],
  highlightedSuggestion: -1,
};
let disposeDetail = () => {};

export function bondShortcutState(shortcut) {
  const screeners = {
    "recent-issue": "recent90",
    "low-premium": "lowPremium",
    "near-conversion": "conversion100",
    "low-price": "cheap",
  };
  if (screeners[shortcut]) return { screener: screeners[shortcut] };
  if (shortcut === "upcoming-rights") return { screener: "", event: "rights90" };
  return null;
}

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
  const [manifest, bondTerms, history, conversionPrices, workbenchResult, cbMaster, v53Model, v56Model] =
    await Promise.all([
      loadJson(config.manifestUrl, null),
      loadJson(config.datasets["11406"], []),
      loadJson(config.datasets.bondHistory, []),
      loadJson(config.datasets.conversionPrices, []),
      workbenchDeclared
        ? loadDeclaredWorkbench(config.datasets.bondWorkbench)
        : Promise.resolve({ ok: true, value: null }),
      typeof config.cbMasterUrl === "string"
        ? loadJson(config.cbMasterUrl, [])
        : Promise.resolve([]),
      typeof (config.cbWorkbenchV55Url ?? config.cbWorkbenchV54Url ?? config.cbWorkbenchV53Url) === "string"
        ? loadJson(config.cbWorkbenchV55Url ?? config.cbWorkbenchV54Url ?? config.cbWorkbenchV53Url, null)
        : Promise.resolve(null),
      typeof config.v56MarketDataUrl === "string"
        ? loadJson(config.v56MarketDataUrl, null)
        : Promise.resolve(null),
    ]);
  state.manifest = manifest;
  state.bondTerms = arrayValue(bondTerms);
  state.history = arrayValue(history);
  state.conversionPrices = arrayValue(conversionPrices);
  state.canonicalBonds = indexCanonicalBonds(cbMaster);
  state.workbenchDeclared = workbenchDeclared;
  state.workbenchUnavailable = !workbenchDeclared || !workbenchResult.ok || state.canonicalBonds.size === 0;
  state.workbenchAsOfDate = validPublishedDate(workbenchResult.value?.dataDate)
    ? workbenchResult.value.dataDate
    : null;
  state.workbench = state.workbenchUnavailable
    ? []
    : arrayValue(workbenchResult.value?.records);
  state.views = state.workbenchUnavailable
    ? []
    : buildBondListRecords({
      workbench: state.workbench,
      bondTerms: state.bondTerms,
      history: state.history,
      cbMaster,
    });
  state.v53Model = (v53Model?.schemaVersion === 1 || v53Model?.schemaVersion === 2) && Array.isArray(v53Model?.records)
    ? v53Model
    : null;
  state.v56Model = v56Model?.schemaVersion === 3 && validPublishedDate(v56Model?.dataDate)
    ? v56Model
    : null;
  updateSearchSuggestions();
  renderRoute();
  const marketDate = state.manifest?.market?.dataDate;
  document.querySelector("#bond-update-status").textContent = marketDate
    ? `盤後資料日 ${marketDate}`
    : "資料暫時無法取得";
}

function initializeFromUrl() {
  const listState = parseBondListState(location.search);
  state.sortKey = new URLSearchParams(location.search).get("sort") || null;
  state.sortDirection = listState.direction;
  state.page = listState.page;
  state.archived = listState.archived;
  state.event = listState.event;
  state.maturityBefore = listState.maturityBefore;
  state.remainingMax = listState.remainingMax;
  state.secured = listState.secured;
  state.screener = listState.screener;
  document.querySelector("#bond-search").value = listState.query;
  document.querySelector("#bond-archive-toggle").checked = state.archived;
  setControlValue("#bond-maturity-before", state.maturityBefore);
  setControlValue("#bond-remaining-max", state.remainingMax ?? "");
  setControlValue("#bond-secured", state.secured);
  setControlValue("#bond-public-screener", state.screener);
  updateBondShortcutStates();
}

function bindFilters() {
  const search = document.querySelector("#bond-search");
  search.addEventListener("input", () => {
    state.page = 1;
    syncListUrl();
    updateSearchSuggestions();
    renderBonds();
  });
  search.addEventListener("keydown", handleSearchKeydown);
  document.querySelector("#bond-archive-toggle").addEventListener("change", (event) => {
    state.archived = event.target.checked;
    state.page = 1;
    syncListUrl();
    renderBonds();
  });
  document.querySelector("#bond-clear-filter").addEventListener("click", () => {
    clearBondFilters();
    document.querySelector("#bond-search").focus();
  });
  for (const selector of ["#bond-maturity-before", "#bond-remaining-max", "#bond-secured", "#bond-public-screener"]) {
    document.querySelector(selector)?.addEventListener("change", (event) => {
      if (selector === "#bond-public-screener") {
        state.screener = event.target.value;
        state.sortKey = null;
        state.sortDirection = "asc";
      }
      state.page = 1;
      syncListUrl();
      renderBonds();
    });
  }
  for (const button of document.querySelectorAll("[data-bond-shortcut]")) {
    button.addEventListener("click", () => {
      const shortcut = button.dataset.bondShortcut;
      const shortcutState = bondShortcutState(shortcut);
      if (shortcutState) {
        state.screener = shortcutState.screener;
        state.event = shortcutState.event ?? "";
        state.sortKey = null;
        state.sortDirection = "asc";
        setControlValue("#bond-public-screener", state.screener);
      } else if (shortcut === "rights90" || shortcut === "maturity365") {
        state.event = state.event === shortcut ? "" : shortcut;
      } else if (shortcut === "clear") {
        clearBondFilters();
        return;
      }
      state.page = 1;
      syncListUrl();
      renderBonds();
    });
  }
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

function validPublishedDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

export function buildBondListRecords({ views = [], workbench = [], bondTerms = [], history = [], cbMaster = [] } = {}) {
  const canonicalBonds = indexCanonicalBonds(cbMaster);
  const canonicalIdentity = (record) => {
    if (canonicalBonds.size === 0) return record;
    const identity = applyCanonicalBondIdentity(record, canonicalBonds);
    return identity ? { ...record, ...identity } : null;
  };
  const turnoverByBondDate = new Map(
    arrayValue(history)
      .filter((point) => (
        /^\d{5,6}$/.test(String(point?.bondCode ?? ""))
        && validPublishedDate(point?.date)
        && /^\d+$/.test(String(point?.cbTurnover ?? ""))
      ))
      .map((point) => [`${point.bondCode}:${point.date}`, String(point.cbTurnover)]),
  );
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
      return canonicalIdentity({
        ...view,
        ...canonicalListFieldsForLegacyView(view),
        bondCode: record.bondCode,
        issuerCode: term.issuerCode ?? view.issuerCode,
        issuerName: term.issuerName ?? legacyTerm?.["機構名稱"] ?? view.issuerName ?? view.issuerCode,
        bondName: term.bondName ?? view.bondName,
        issueAmount: term.issueAmount ?? null,
        outstandingAmount: term.outstandingAmount ?? view.outstandingAmount ?? null,
        outstandingDataDate: term.outstandingDataDate ?? view.outstandingDataDate ?? null,
        maturityDate: term.maturityDate ?? view.maturityDate ?? null,
        cbTurnoverAmount: turnoverByBondDate.get(`${record.bondCode}:${view.cbPriceDate}`) ?? null,
        status: record.status,
        archived: record.status === "archived",
        archiveReason: record.archiveReason,
        archivedAt: record.archivedAt,
        archiveDate: record.archivedAt,
      });
    }).filter(Boolean);
  }
  return arrayValue(views).map((view) => {
    const term = termsByBondCode.get(view.bondCode);
    return canonicalIdentity({
      ...view,
      ...canonicalListFieldsForLegacyView(view),
      issuerName: term?.["機構名稱"] ?? view.issuerName ?? view.issuerCode,
      issueAmount: term?.["發行總額"] ?? null,
      outstandingAmount: term?.["目前餘額"] ?? view.outstandingAmount ?? null,
      outstandingDataDate: term?.["餘額資料日期"] ?? view.outstandingDataDate ?? null,
      maturityDate: term?.["到期日期"] ?? view.maturityDate ?? null,
      cbTurnoverAmount: turnoverByBondDate.get(`${view.bondCode}:${view.cbPriceDate}`) ?? null,
    });
  }).filter(Boolean);
}

export function buildV56CbMarketSections(model = {}) {
  if (model?.schemaVersion !== 3 || !validPublishedDate(model?.dataDate)) {
    return { dataDate: null, changes: [], performance: [] };
  }
  const names = new Map(arrayValue(model?.cbMaster).map((record) => [record?.cbCode, record?.cbName]));
  const changes = arrayValue(model?.dailyChanges)
    .filter((record) => record?.entityType === "cb" && typeof record?.entityId === "string")
    .map((record) => ({
      cbCode: record.entityId,
      cbName: names.get(record.entityId) ?? null,
      label: v56ChangeLabel(record.changeType),
      oldValue: record.oldValue ?? null,
      newValue: record.newValue ?? null,
      date: validPublishedDate(record.effectiveDate) ? record.effectiveDate : model.dataDate,
    }))
    .sort((left, right) => left.date.localeCompare(right.date) || left.cbCode.localeCompare(right.cbCode));
  const performance = arrayValue(model?.performance)
    .filter((record) => record?.entityType === "cb" && typeof record?.cbCode === "string" && record?.periods && typeof record.periods === "object")
    .map((record) => ({
      cbCode: record.cbCode,
      cbName: names.get(record.cbCode) ?? null,
      periods: {
        "1D": finitePublicNumber(record.periods["1D"]),
        "1W": finitePublicNumber(record.periods["1W"]),
        "1M": finitePublicNumber(record.periods["1M"]),
        "3M": finitePublicNumber(record.periods["3M"]),
        "6M": finitePublicNumber(record.periods["6M"]),
        YTD: finitePublicNumber(record.periods.YTD),
      },
    }))
    .filter((record) => Object.values(record.periods).some((value) => value !== null))
    .sort((left, right) => v56PerformanceSortValue(right.periods["1D"]) - v56PerformanceSortValue(left.periods["1D"]) || left.cbCode.localeCompare(right.cbCode));
  return { dataDate: model.dataDate, changes, performance };
}

function canonicalListFieldsForLegacyView(view) {
  const has = (key) => Object.hasOwn(view, key);
  const reduction = Number(view.outstandingReductionRate);
  const remainingRatio = has("remainingRatio")
    ? view.remainingRatio
    : view.outstandingReductionRate === null
      || view.outstandingReductionRate === undefined
      || view.outstandingReductionRate === ""
      || !Number.isFinite(reduction)
        ? null
        : String(Number((100 - reduction).toFixed(8)));
  const usesPut = Boolean(view.nextPutDate);
  const legacyEventType = usesPut ? "put" : "maturity";
  const legacyEventDate = usesPut ? view.nextPutDate : view.maturityDate ?? null;
  const legacyDaysToNextEvent = usesPut
    ? view.daysToNextPut ?? null
    : view.daysToMaturity ?? null;
  const dataQuality = has("dataQuality")
    ? view.dataQuality
    : view.cbClose !== null
      && view.cbClose !== undefined
      && view.cbClose !== ""
      && Array.isArray(view.missingReasons)
      && view.missingReasons.length === 0
        ? "complete"
        : "partial";
  const marketStatus = has("marketStatus")
    ? view.marketStatus
    : view.redemptionEvent !== null && view.redemptionEvent !== undefined
      ? "REDEMPTION_PROCESS"
      : Number(view.daysToMaturity) <= 0
        ? "MATURED"
        : view.staleCbPrice === true
          ? "STALE"
          : String(view.cbTradeUnits ?? "") === "0"
            ? "NO_TRADE"
            : "ACTIVE";
  return {
    remainingRatio,
    nextEventType: has("nextEventType")
      ? view.nextEventType
      : legacyEventType,
    nextEventDate: has("nextEventDate")
      ? view.nextEventDate
      : legacyEventDate,
    daysToNextEvent: has("daysToNextEvent")
      ? view.daysToNextEvent
      : legacyDaysToNextEvent,
    dataQuality,
    marketStatus,
  };
}

function renderBonds() {
  if (state.workbenchUnavailable) {
    const message = "可轉債工作台資料目前無法使用；請稍後再試。";
    setText("#bond-result-count", "資料無法使用");
    document.querySelector("#bond-clear-filter").hidden = true;
    document.querySelector("#bond-table-body").innerHTML = `<tr><td colspan="13" class="empty-cell">${message}</td></tr>`;
    document.querySelector("#bond-card-list").innerHTML = `<p class="empty-cell">${message}</p>`;
    document.querySelector("#bond-pagination").innerHTML = "";
    return;
  }
  const prepared = state.views.map((view) => {
    const term = termFor(view.bondCode);
    return {
      ...view,
      issuerName: term?.["機構名稱"] ?? view.issuerName ?? view.issuerCode,
      securedStatus: view.securedStatus ?? term?.securedStatus ?? term?.["有無擔保"] ?? null,
      issueDate: term?.["發行日期"] ?? null,
    };
  });
  const filters = currentBondFilters();
  const filtered = filterBondRecords(prepared, filters);
  const screened = applyPublicBondScreener(filtered, state.screener, { asOfDate: state.workbenchAsOfDate });
  const ordered = state.sortKey ? sortBondRecords(screened, { key: state.sortKey, direction: state.sortDirection }) : screened;
  const pagination = paginateBondRecords(ordered, state.page);
  state.page = pagination.page;
  const visible = pagination.records;
  const noResults = ordered.length === 0;

  setText("#bond-result-count", `${pagination.total} 檔 · 第 ${state.page}/${pagination.pageCount} 頁`);
  document.querySelector("#bond-clear-filter").hidden = !noResults || activeBondConditions(filters).length === 0;
  const activeConditions = activeBondConditions(filters);
  const emptyMessage = activeConditions.length
    ? `沒有符合條件的可轉債；目前條件：${activeConditions.join("、")}。可清除所有條件後再試。`
    : "沒有符合條件的可轉債；可清除搜尋條件後再試。";
  document.querySelector("#bond-table-body").innerHTML = visible.length
    ? visible.map(renderBondRow).join("")
    : `<tr><td colspan="13" class="empty-cell">${escapeHtml(emptyMessage)}</td></tr>`;
  document.querySelector("#bond-card-list").innerHTML = visible.length
    ? visible.map(renderBondCard).join("")
    : `<p class="empty-cell">${escapeHtml(emptyMessage)}</p>`;
  updateSortHeaders();
  updateBondShortcutStates();
  renderPagination(pagination.pageCount);
  bindBondOpeners();
}

function renderBondRow(view) {
  const term = termFor(view.bondCode);
  const presentation = bondListPresentation(view);
  const marketStatus = bondMarketStatusPresentation(view);
  const issuerLabel = [
    marketStatus,
    `${view.issuerCode} ${term?.["機構名稱"] ?? ""}`.trim(),
  ].filter(Boolean).join(" · ");
  const issuerCode = String(view.issuerCode ?? "").trim();
  const issuerContext = /^\d{4}$/.test(issuerCode)
    ? `<a data-company-context href="./company.html?code=${encodeURIComponent(issuerCode)}">${escapeHtml(issuerLabel)}</a>`
    : escapeHtml(issuerLabel);
  return `<tr tabindex="0" data-bond-code="${escapeHtml(view.bondCode)}" aria-label="查看 ${escapeHtml(view.bondName)} 詳細資料">
    <td><span class="metric-main">${escapeHtml(valueOrDash(`${view.bondCode} · ${view.bondName}`))}</span><span class="metric-sub">${issuerContext}</span></td>
    <td>${priceMetric(view.cbClose, view.cbPriceDate, view.staleCbPrice ? "前次成交" : "")}</td>
    <td>${quantityMetric(view.cbTradeUnits, "張", view.cbPriceDate)}</td>
    <td>${amountMetric(view.cbTurnoverAmount, view.cbPriceDate)}</td>
    <td>${priceMetric(view.conversionValue, view.valuationDate, "估值日", "metric-violet")}</td>
    <td>${rateMetric(view.premiumRate, view.valuationDate)}</td>
    <td>${priceMetric(view.stockClose, view.stockPriceDate)}</td>
    <td>${priceMetric(view.currentConversionPrice, view.conversionPriceEffectiveDate, "生效日")}</td>
    <td>${amountMetric(view.outstandingAmount, view.outstandingDataDate, "流通餘額")}</td>
    <td>${metric(presentation.remainingRatio, "流通餘額比例")}</td>
    <td>${metric(view.maturityDate, "到期日")}</td>
    <td>${amountMetric(view.issueAmount, null, "發行總額")}</td>
    <td>${eventMetric(view)}</td>
  </tr>`;
}

function renderBondCard(view) {
  const presentation = bondListPresentation(view);
  const marketStatus = bondMarketStatusPresentation(view);
  return `<button class="bond-card" type="button" data-bond-code="${escapeHtml(view.bondCode)}">
    <header><strong>${escapeHtml(view.bondCode)} · ${escapeHtml(view.bondName)}</strong><span>${escapeHtml(marketStatus)}</span></header>
    <span class="bond-card-grid">
      ${cardMetric("CB 收盤", valueOrDash(view.cbClose), view.cbPriceDate)}
      ${cardMetric("成交量", quantityText(view.cbTradeUnits, "張"), view.cbPriceDate)}
      ${cardMetric("成交金額", numberText(view.cbTurnoverAmount), view.cbPriceDate)}
      ${cardMetric("轉換價值", valueOrDash(view.conversionValue), view.valuationDate)}
      ${cardMetric("轉換溢價率", view.premiumRate === null ? "—" : signedRate(view.premiumRate), view.valuationDate)}
      ${cardMetric("標的股收盤", valueOrDash(view.stockClose), view.stockPriceDate)}
      ${cardMetric("目前轉換價", valueOrDash(view.currentConversionPrice), view.conversionPriceEffectiveDate)}
      ${cardMetric("流通餘額", numberText(view.outstandingAmount), view.outstandingDataDate)}
      ${cardMetric("流通餘額比例", presentation.remainingRatio, "流通餘額比例")}
      ${cardMetric("到期日", view.maturityDate, "到期日")}
      ${cardMetric("發行總額", numberText(view.issueAmount), "發行總額")}
      ${cardMetric("下一事件", presentation.eventLabel, presentation.eventDate)}
    </span>
  </button>`;
}

function bindBondOpeners() {
  for (const element of document.querySelectorAll("[data-bond-code]")) {
    const open = (event) => {
      if (event?.target?.closest("[data-company-context]")) return;
      openBond(element.dataset.bondCode, element);
    };
    element.addEventListener("click", open);
    element.addEventListener("keydown", (event) => {
      if (event.target.closest("[data-company-context]")) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  }
}

function handleSearchKeydown(event) {
  if (event.key === "Escape") {
    closeSearchSuggestions();
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
  if (event.key === "Enter" && state.highlightedSuggestion < 0) return;
  event.preventDefault();
  if (event.key === "Enter") {
    const selected = state.suggestions[state.highlightedSuggestion];
    if (selected) openBond(selected.bondCode, event.currentTarget);
    return;
  }
  if (state.suggestions.length === 0) return;
  const step = event.key === "ArrowDown" ? 1 : -1;
  state.highlightedSuggestion = (state.highlightedSuggestion + step + state.suggestions.length) % state.suggestions.length;
  renderSearchSuggestions();
}

function updateSearchSuggestions() {
  const query = document.querySelector("#bond-search")?.value ?? "";
  state.suggestions = buildBondSearchSuggestions(searchableBondRecords(), query);
  state.highlightedSuggestion = state.suggestions.findIndex((item) => item.exact);
  renderSearchSuggestions();
}

function searchableBondRecords() {
  return state.views.map((view) => {
    const term = termFor(view.bondCode);
    return {
      ...view,
      issuerCode: view.issuerCode ?? term?.["機構代碼"] ?? "",
      issuerName: view.issuerName ?? term?.["機構名稱"] ?? "",
    };
  });
}

function renderSearchSuggestions() {
  const input = document.querySelector("#bond-search");
  const target = document.querySelector("#bond-search-suggestions");
  if (!input || !target) return;
  const open = state.suggestions.length > 0;
  input.setAttribute("aria-expanded", String(open));
  if (!open) {
    input.removeAttribute("aria-activedescendant");
    target.hidden = true;
    target.innerHTML = "";
    return;
  }
  const activeId = state.highlightedSuggestion >= 0 ? `bond-suggestion-${state.highlightedSuggestion}` : null;
  if (activeId) input.setAttribute("aria-activedescendant", activeId);
  else input.removeAttribute("aria-activedescendant");
  target.hidden = false;
  target.innerHTML = state.suggestions.map((item, index) => `<button type="button" id="bond-suggestion-${index}" role="option" aria-selected="${index === state.highlightedSuggestion}" data-bond-suggestion="${escapeHtml(item.bondCode)}"><strong>${escapeHtml(item.bondCode)} · ${escapeHtml(item.bondName)}</strong><span>${escapeHtml(item.issuerCode)} ${escapeHtml(item.issuerName)}</span></button>`).join("");
  for (const button of target.querySelectorAll("[data-bond-suggestion]")) {
    button.addEventListener("click", () => openBond(button.dataset.bondSuggestion, input));
  }
}

function closeSearchSuggestions() {
  state.suggestions = [];
  state.highlightedSuggestion = -1;
  renderSearchSuggestions();
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
    ...currentBondFilters(),
    sortKey: state.sortKey,
    direction: state.sortDirection,
    page: state.page,
  });
  const url = `${location.pathname}${search}`;
  history[push ? "pushState" : "replaceState"](null, "", url);
}

function currentBondFilters() {
  return {
    query: document.querySelector("#bond-search").value,
    archived: state.archived,
    event: state.event,
    maturityBefore: controlValue("#bond-maturity-before", state.maturityBefore),
    remainingMax: controlValue("#bond-remaining-max", state.remainingMax ?? ""),
    secured: controlValue("#bond-secured", state.secured),
    screener: state.screener,
  };
}

function controlValue(selector, fallback = "") {
  return document.querySelector(selector)?.value ?? fallback;
}

function setControlValue(selector, value) {
  const control = document.querySelector(selector);
  if (control) control.value = value;
}

function activeBondConditions(filters) {
  const labels = [];
  const screenerLabels = {
    recent90: "近 90 日發行",
    maturity365: "365 日內到期",
    converted75: "已轉換逾 75%",
    cheap: "低 CB 收盤價",
    conversion100: "轉換價值接近 100",
    lowPremium: "低轉換溢價",
  };
  if (filters.query.trim()) labels.push(`搜尋「${filters.query.trim()}」`);
  if (screenerLabels[filters.screener]) labels.push(screenerLabels[filters.screener]);
  if (filters.archived) labels.push("顯示封存可轉債");
  if (filters.event === "rights90") labels.push("90 日內權利事件");
  if (filters.event === "maturity365") labels.push("365 日內到期");
  if (filters.maturityBefore) labels.push(`到期日不晚於 ${filters.maturityBefore}`);
  if (filters.remainingMax !== "" && filters.remainingMax !== null) labels.push(`流通餘額比例不高於 ${filters.remainingMax}%`);
  if (filters.secured) labels.push(`擔保情形：${filters.secured}`);
  return labels;
}

function updateBondShortcutStates() {
  for (const button of document.querySelectorAll("[data-bond-shortcut]")) {
    const shortcut = button.dataset.bondShortcut;
    const shortcutState = bondShortcutState(shortcut);
    const pressed = shortcutState
      ? state.screener === shortcutState.screener && state.event === (shortcutState.event ?? "")
      : shortcut === state.event;
    button.setAttribute("aria-pressed", String(pressed));
  }
}

function clearBondFilters() {
  document.querySelector("#bond-search").value = "";
  document.querySelector("#bond-archive-toggle").checked = false;
  setControlValue("#bond-maturity-before", "");
  setControlValue("#bond-remaining-max", "");
  setControlValue("#bond-secured", "");
  setControlValue("#bond-public-screener", "");
  state.archived = false;
  state.event = "";
  state.maturityBefore = "";
  state.remainingMax = null;
  state.secured = "";
  state.screener = "";
  state.page = 1;
  closeSearchSuggestions();
  syncListUrl();
  renderBonds();
}

function openBond(code, origin = null) {
  state.detailOrigin = origin
    ? { bondCode: code, tagName: origin.tagName ?? null }
    : null;
  const params = new URLSearchParams(location.search);
  params.set("bond", code);
  closeSearchSuggestions();
  history.pushState(null, "", `${location.pathname}?${params}`);
  renderRoute();
}

function renderRoute() {
  const code = new URLSearchParams(location.search).get("bond");
  const target = document.querySelector("#bond-workbench");
  const list = document.querySelector("#bond-list-view");
  const overview = document.querySelector("#cb-market-overview");
  disposeDetail();
  disposeDetail = () => {};
  if (!code) {
    target.hidden = true;
    target.innerHTML = "";
    list.hidden = true;
    if (overview) {
      overview.hidden = false;
      renderOverview();
      renderV56MarketSections();
    } else {
      list.hidden = false;
      renderBonds();
    }
    return;
  }
  if (overview) overview.hidden = true;
  setV56MarketSectionsHidden(true);
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
  const detailRecord = state.workbench.find((candidate) => candidate.bondCode === code)
    ?? detailRecordFromLegacy({ view, term: termFor(view.bondCode) ?? {}, events: [] });
  const identity = applyCanonicalBondIdentity(detailRecord, state.canonicalBonds);
  const canonicalDetail = identity
    ? {
      ...detailRecord,
      bondCode: identity.bondCode,
      term: { ...detailRecord.term, bondName: identity.bondName, issuerCode: identity.issuerCode, issuerName: identity.issuerName },
      view: { ...detailRecord.view, bondName: identity.bondName, issuerCode: identity.issuerCode, issuerName: identity.issuerName, market: identity.market },
    }
    : detailRecord;
  const detail = detailWithValuationConversionEvidence(canonicalDetail, state.conversionPrices);
  const v53Record = state.v53Model?.records?.find((candidate) => candidate.cbCode === code) ?? null;
  if (v53Record) {
    const companyBonds = state.v53Model.records.filter((candidate) => candidate.stockCode === v53Record.stockCode && candidate.status === "active");
    const cbHistory = state.history.filter((point) => point?.bondCode === code);
    const cbEvents = state.v53Model.events.filter((event) => event?.cbCode === code);
    target.innerHTML = renderCbDetailV53(v53Record, {
      companyBonds,
      rightsEvents: state.v53Model.events,
      history: cbHistory,
    });
    disposeDetail = bindCbDetailV53(target, closeDetail, { history: cbHistory, events: cbEvents });
  } else {
    target.innerHTML = renderBondDetail(detail, { asOfDate: state.workbenchAsOfDate });
    disposeDetail = bindBondDetail(target, closeDetail);
  }
  target.hidden = false;
  list.hidden = true;
  target.querySelector("[data-detail-close]")?.focus();
}

function renderOverview() {
  const root = document.querySelector("#cb-market-overview");
  if (!root) return;
  if (!state.v53Model) {
    root.innerHTML = '<p class="empty-state">資料暫時無法取得</p>';
    return;
  }
  root.innerHTML = renderMarketOverview(state.v53Model, { metric: state.overviewMetric });
  for (const control of root.querySelectorAll("[data-cb-overview-metric]")) {
    control.addEventListener("click", () => {
      const metric = control.dataset.cbOverviewMetric;
      if (!Object.hasOwn(RANKING_METRICS, metric)) return;
      state.overviewMetric = metric;
      renderOverview();
    });
  }
}

function renderV56MarketSections() {
  const changesTarget = document.querySelector("#cb-today-changes");
  const performanceTarget = document.querySelector("#cb-market-performance");
  if (!changesTarget || !performanceTarget) return;
  const sections = buildV56CbMarketSections(state.v56Model ?? {});
  if (sections.dataDate === null) {
    setV56MarketSectionsHidden(true);
    return;
  }
  changesTarget.hidden = false;
  performanceTarget.hidden = false;
  changesTarget.innerHTML = `<header class="section-heading"><div><p class="section-number">DAILY CHANGES</p><h2>今日異動</h2></div><p class="update-status">資料日期 ${escapeHtml(sections.dataDate)}</p></header>${sections.changes.length ? `<ol class="cb-v56-change-list">${sections.changes.slice(0, 16).map((change) => `<li><a href="./bonds.html?bond=${encodeURIComponent(change.cbCode)}"><time datetime="${escapeHtml(change.date)}">${escapeHtml(change.date)}</time><strong>${escapeHtml(change.cbCode)} ${escapeHtml(change.cbName ?? "")}</strong><span>${escapeHtml(change.label)}</span><b>${escapeHtml(v56OldToNew(change.oldValue, change.newValue))}</b></a></li>`).join("")}</ol>` : '<p class="empty-state">本次已驗證快照與前一份快照相比，沒有可公開的可轉債欄位異動。</p>'}`;
  performanceTarget.innerHTML = `<header class="section-heading"><div><p class="section-number">MARKET PERFORMANCE</p><h2>市場表現</h2></div><p class="update-status">以有效交易日計算</p></header>${sections.performance.length ? `<div class="cb-v56-performance-table"><table><thead><tr><th>CB</th><th>1D</th><th>1W</th><th>1M</th><th>3M</th><th>6M</th><th>YTD</th></tr></thead><tbody>${sections.performance.slice(0, 30).map((entry) => `<tr><th><a href="./bonds.html?bond=${encodeURIComponent(entry.cbCode)}">${escapeHtml(entry.cbCode)} ${escapeHtml(entry.cbName ?? "")}</a></th>${["1D", "1W", "1M", "3M", "6M", "YTD"].map((period) => `<td class="${entry.periods[period] === null ? "" : entry.periods[period] >= 0 ? "market-up" : "market-down"}">${escapeHtml(v56Percent(entry.periods[period]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">尚無足夠的已驗證有效交易日歷史可產生市場表現。</p>'}`;
  renderInstitutionSection();
}

function renderInstitutionSection() {
  const target = document.querySelector("#cb-market-institutions");
  const navLink = document.querySelector("[data-cb-institution-link]");
  const records = state.v53Model?.records ?? [];
  const available = records.some((record) => finitePublicNumber(record?.institution?.netBuySell) !== null);
  if (!target || !navLink) return;
  target.hidden = !available;
  navLink.hidden = !available;
  if (!available) return;
  const rows = records
    .map((record) => ({ cbCode: record.cbCode, cbName: record.cbName, value: finitePublicNumber(record?.institution?.netBuySell) }))
    .filter((record) => record.value !== null)
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
  target.innerHTML = `<header class="section-heading"><div><p class="section-number">INSTITUTIONAL FLOW</p><h2>法人動向</h2></div></header><ol class="cb-v56-change-list">${rows.map((row) => `<li><a href="./bonds.html?bond=${encodeURIComponent(row.cbCode)}"><strong>${escapeHtml(row.cbCode)} ${escapeHtml(row.cbName ?? "")}</strong><b>${escapeHtml(numberText(row.value))}</b></a></li>`).join("")}</ol>`;
}

function setV56MarketSectionsHidden(hidden) {
  for (const selector of ["#cb-today-changes", "#cb-market-performance", "#cb-market-institutions"]) {
    const target = document.querySelector(selector);
    if (target) target.hidden = hidden;
  }
  const link = document.querySelector("[data-cb-institution-link]");
  if (link) link.hidden = hidden || !link.innerHTML;
}

function v56ChangeLabel(type) {
  return ({
    conversion_price_changed: "轉換價調整",
    outstanding_changed: "流通餘額異動",
    new_early_redemption: "提前贖回公告",
  })[type] ?? "可轉債異動";
}

function v56OldToNew(oldValue, newValue) {
  return `${oldValue === null ? "—" : numberText(oldValue)} → ${newValue === null ? "—" : numberText(newValue)}`;
}

function v56Percent(value) {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function finitePublicNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function v56PerformanceSortValue(value) {
  return value === null ? -1 : Math.abs(value);
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
  )) ?? document.querySelector("[data-cb-overview-metric]") ?? document.querySelector("#bond-search");
  focusTarget?.focus();
}

function metric(main, sub, className = "") {
  return `<span class="metric-main ${className}">${escapeHtml(valueOrDash(main))}</span><span class="metric-sub">${escapeHtml(valueOrDash(sub))}</span>`;
}

function priceMetric(value, date, note = "", className = "") {
  return metric(valueOrDash(value), [date, note].filter(Boolean).join(" · "), className);
}

function rateMetric(value, date) {
  if (value === null || value === undefined) return metric("—", "", "metric-alert");
  const number = Number(value);
  const icon = number > 0 ? "▲" : number < 0 ? "▼" : "•";
  return metric(`${icon} ${signedRate(value)}`, date ? `估值日 ${date}` : "", number > 0 ? "metric-alert" : "metric-violet");
}

function quantityMetric(value, unit, date) {
  return metric(quantityText(value, unit), date ?? "");
}

function amountMetric(value, date, note = "") {
  return metric(numberText(value), [date, note].filter(Boolean).join(" · "));
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
    eventLabel: view.nextEventDate ? eventLabel : "—",
    eventDate: view.nextEventDate ?? "—",
  };
}

export function bondMarketStatusPresentation(view = {}) {
  const status = view.marketStatus;
  return {
    ACTIVE: "交易中",
    NO_TRADE: "今日無成交",
    CONVERSION_SUSPENDED: "停止轉換",
    TRADING_SUSPENDED: "暫停交易",
    REDEMPTION_PROCESS: "贖回程序",
    MATURED: "已到期",
    DELISTED: "已下櫃",
    STALE: "盤後未更新",
  }[status] ?? "";
}

export function detailWithValuationConversionEvidence(record = {}, conversionPrices = []) {
  const view = record?.view ?? {};
  const valuationDate = view.valuationDate;
  const bondCode = String(record?.bondCode ?? view.bondCode ?? "");
  const applied = Array.isArray(conversionPrices)
    ? conversionPrices
      .filter((item) => (
        String(item?.bondCode ?? "") === bondCode
        && typeof item?.effectiveDate === "string"
        && typeof valuationDate === "string"
        && item.effectiveDate <= valuationDate
      ))
      .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate))[0]
    : undefined;
  const conversionPriceHistory = Array.isArray(conversionPrices)
    ? conversionPrices
      .filter((item) => (
        String(item?.bondCode ?? "") === bondCode
        && typeof item?.effectiveDate === "string"
        && /^\d{4}-\d{2}-\d{2}$/.test(item.effectiveDate)
        && typeof item?.currentConversionPrice === "string"
      ))
      .map((item) => ({
        effectiveDate: item.effectiveDate,
        currentConversionPrice: item.currentConversionPrice,
      }))
      .sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate))
    : [];
  return {
    ...record,
    view: {
      ...view,
      valuationConversionPrice: applied?.currentConversionPrice ?? null,
      valuationConversionPriceEffectiveDate: applied?.effectiveDate ?? null,
      conversionPriceHistory,
    },
  };
}

function cardMetric(label, value, sub) {
  return `<span><span>${escapeHtml(label)}</span><strong>${escapeHtml(valueOrDash(value))}</strong><small>${escapeHtml(valueOrDash(sub))}</small></span>`;
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

function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function quantityText(value, unit) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString("zh-TW")} ${unit}` : "—";
}

function numberText(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("zh-TW", { maximumFractionDigits: 2 }) : "—";
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
