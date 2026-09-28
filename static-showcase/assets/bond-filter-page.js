import { loadPublicCbOverview } from "./bond-public-data.js";
import { publicAmount, publicInstitutionName, publicNumber } from "./cb-workbench-ui.js";
import { CB_SECURED_VALUES, readValidatedCbConditions, strictIsoDate, validCbRangeNumber } from './cb-filter-state.js';

const BASE_CB_VIEWS = {
  quote: [
    ["CB 代碼／名稱", (record) => `${record.cbCode} ${record.cbName}`],
    ["標的公司", (record) => `${record.stockCode} ${record.companyName}`],
    ["CB 收盤／最近成交", (record) => record.quote?.tradeState === "NOT_YET_LISTED" ? "尚未掛牌" : publicNumber(record.quote?.cbClose), "close", record => record.quote?.dataDate],
    ["標的股收盤", record => publicNumber(record.quote?.stockClose), "stockClose", record => record.quote?.stockPriceDate],
    ["轉換價", record => publicNumber(record.quote?.conversionPrice), "conversionPrice", record => record.quote?.conversionPriceEffectiveDate],
    ["成交量", (record) => record.quote?.tradeState === "NOT_YET_LISTED" ? "尚未掛牌" : ["no_trade","NO_TRADE_TODAY"].includes(record.quote?.tradeState) ? "當日無成交" : publicNumber(record.quote?.volume), "volume"],
    ["成交額", (record) => publicAmount(record.quote?.turnoverAmount)],
    ["轉換價值", (record) => publicNumber(record.quote?.stockConversionValue ?? record.quote?.conversionValue), "conversionValue", record => record.quote?.stockConversionValueDate ?? record.quote?.valuationDate],
    ["轉換溢價率", (record) => rate(record.quote?.premiumRate), "premium", record => record.quote?.valuationDate],
  ],
  terms: [
    ["CB 代碼／名稱", (record) => `${record.cbCode} ${record.cbName}`],
    ["標的公司", (record) => `${record.stockCode} ${record.companyName}`],
    ["發行總額", (record) => publicAmount(record.terms?.issueAmount)],
    ["流通餘額", (record) => publicAmount(record.terms?.outstandingAmount)],
    ["剩餘比率", (record) => rate(record.terms?.remainingRatio)],
    ["轉換價", (record) => publicNumber(record.quote?.conversionPrice)],
    ["發行日", (record) => dateLabel(record.terms?.issueDate)],
    ["到期日", (record) => dateLabel(record.terms?.maturityDate)],
    ["擔保狀態", (record) => record.terms?.securedStatus ?? "—"],
    ["承銷商", (record) => publicInstitutionName(record.terms?.underwriter)],
    ["受託機構", (record) => publicInstitutionName(record.terms?.trustee)],
  ],
  period: [
    ["CB 代碼／名稱", record => `${record.cbCode} ${record.cbName}`],
    ["標的公司", record => `${record.stockCode} ${record.companyName}`],
    ["掛牌日", record => dateLabel(record.terms?.listingDate)],
    ["到期日", record => dateLabel(record.terms?.maturityDate), "maturity"],
    ["轉換開始日", record => dateLabel(record.terms?.conversionStartDate)],
    ["轉換截止日", record => dateLabel(record.terms?.conversionEndDate)],
    ["流通餘額", record => publicAmount(record.terms?.outstandingAmount), "outstanding"],
    ["剩餘比率", record => rate(record.terms?.remainingRatio), "remaining"],
    ["餘額資料日", record => dateLabel(record.terms?.outstandingDataDate)],
    ["賣回日", record => arrayValue(record.terms?.putDates).map(dateLabel).join("、") || "—"],
    ["賣回價格", record => publicNumber(record.terms?.putPrice)],
  ],
  events: [
    ["CB 代碼／名稱", (record) => `${record.cbCode} ${record.cbName}`],
    ["標的公司", (record) => `${record.stockCode} ${record.companyName}`],
    ["最近權利事件", (record, asOfDate) => nextPublishedCbEvent(record, asOfDate)?.label ?? "—"],
    ["下一事件", (record, asOfDate) => dateLabel(nextPublishedCbEvent(record, asOfDate)?.date)],
    ["停止轉換", (record) => hasEvent(record, "conversion_suspension") ? "已公告" : "—"],
    ["賣回", (record) => eventDate(record, "put")],
    ["提前贖回", (record) => eventDate(record, "redemption")],
    ["到期", (record) => dateLabel(record.terms?.maturityDate)],
  ],
  liquidity: [
    ["CB 代碼／名稱", (record) => `${record.cbCode} ${record.cbName}`],
    ["標的公司", (record) => `${record.stockCode} ${record.companyName}`],
    ["當日成交量", (record) => publicNumber(record.quote?.volume)],
    ["近 5 筆日均量", (record) => publicNumber(record.liquidity?.average5)],
    ["近 20 筆日均量", (record) => publicNumber(record.liquidity?.average20)],
    ["當週已收錄量", (record) => publicNumber(record.liquidity?.weekVolume)],
    ["近 20 筆有成交天數", (record) => publicNumber(record.liquidity?.tradedDays20, 0)],
  ],
};

// Reuse the same values, dates and sort keys across the compact and full views.
export const CB_VIEW_COLUMNS = Object.freeze({
  quote: BASE_CB_VIEWS.quote,
  overview: [
    ["CB／標的", record => {
      const bond = [record.cbCode, record.cbName].filter(Boolean).join(" ");
      const stock = [record.stockCode, record.companyName].filter(Boolean).join(" ") || "—";
      return `${bond} · ${stock}`;
    }, "code"],
    BASE_CB_VIEWS.quote[2],
    BASE_CB_VIEWS.quote[3],
    BASE_CB_VIEWS.quote[4],
    BASE_CB_VIEWS.quote[7],
    BASE_CB_VIEWS.quote[8],
    [...BASE_CB_VIEWS.period[7], record => record.terms?.outstandingDataDate],
    ["下一權利事件", (record, asOfDate) => {
      const event = nextPublishedCbEvent(record, asOfDate);
      return event ? `${event.label || "權利事件"} ${dateLabel(event.date)}` : "—";
    }],
    BASE_CB_VIEWS.period[3],
    ["CB 明細", () => ""],
  ],
  terms: BASE_CB_VIEWS.terms,
  period: BASE_CB_VIEWS.period,
  events: BASE_CB_VIEWS.events,
  liquidity: BASE_CB_VIEWS.liquidity,
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

const SORT_VALUES = Object.freeze({
  code: record => record.cbCode,
  stockClose: record => finiteNumber(record.quote?.stockClose),
  conversionPrice: record => finiteNumber(record.quote?.conversionPrice),
  conversionValue: record => finiteNumber(record.quote?.stockConversionValue ?? record.quote?.conversionValue),
  outstanding: record => finiteNumber(record.terms?.outstandingAmount),
  remaining: record => finiteNumber(record.terms?.remainingRatio),
  close: record => finiteNumber(record.quote?.cbClose),
  volume: record => finiteNumber(record.quote?.volume),
  premium: record => finiteNumber(record.quote?.premiumRate),
  maturity: record => isoDate(record.terms?.maturityDate),
});

const RANGE_FIELDS = Object.freeze({
  priceMin: [record => finiteNumber(record.quote?.cbClose), 'min'],
  priceMax: [record => finiteNumber(record.quote?.cbClose), 'max'],
  premiumMin: [record => finiteNumber(record.quote?.premiumRate), 'min'],
  premiumMax: [record => finiteNumber(record.quote?.premiumRate), 'max'],
  remainingMin: [record => finiteNumber(record.terms?.remainingRatio), 'min'],
  remainingMax: [record => finiteNumber(record.terms?.remainingRatio), 'max'],
  conversionPriceMin: [record => finiteNumber(record.quote?.conversionPrice), 'min'],
  conversionPriceMax: [record => finiteNumber(record.quote?.conversionPrice), 'max'],
  conversionValueMin: [record => finiteNumber(record.quote?.stockConversionValue ?? record.quote?.conversionValue), 'min'],
  conversionValueMax: [record => finiteNumber(record.quote?.stockConversionValue ?? record.quote?.conversionValue), 'max'],
  stockPriceMin: [record => finiteNumber(record.quote?.stockClose), 'min'],
  stockPriceMax: [record => finiteNumber(record.quote?.stockClose), 'max'],
  maturityDaysMin: [(record, asOfDate) => maturityDays(record, asOfDate), 'min'],
  maturityDaysMax: [(record, asOfDate) => maturityDays(record, asOfDate), 'max'],
  issueFrom: [record => isoDate(record.terms?.issueDate), 'min', 'date'],
  issueTo: [record => isoDate(record.terms?.issueDate), 'max', 'date'],
  maturityFrom: [record => isoDate(record.terms?.maturityDate), 'min', 'date'],
  maturityTo: [record => isoDate(record.terms?.maturityDate), 'max', 'date'],
});

function readRanges(params) {
  return readValidatedCbConditions(params);
}

export function readCbFilterState(search = '') {
  const params = new URLSearchParams(search);
  const quickFilter = params.get('quickFilter') ?? '';
  const view = params.get('view');
  const sort = params.get('sort') ?? '';
  const secured = params.get('secured') ?? 'all';
  return {q:normalizeQuery(params.get('q') ?? ''),quickFilter:QUICK_FILTERS.has(quickFilter) ? quickFilter : '', secured:CB_SECURED_VALUES.has(secured) ? secured : 'all',
    view:Object.hasOwn(CB_VIEW_COLUMNS,view) ? view : 'overview',sort:Object.hasOwn(SORT_VALUES,sort) ? sort : '',
    direction:params.get('direction') === 'desc' ? 'desc' : 'asc', ...readRanges(params)};
}

export function sortCbDatabase(records, key, direction = 'asc') {
  if (!Object.hasOwn(SORT_VALUES,key)) return records;
  const value = SORT_VALUES[key];
  return records.slice().sort((a,b)=>{
    const left=value(a), right=value(b);
    if (left == null || right == null) return left == null ? right == null ? 0 : 1 : -1;
    const order = typeof left === 'number' ? left-right : String(left).localeCompare(String(right),'zh-Hant',{numeric:true});
    return (direction === 'desc' ? -1 : 1)*order;
  });
}

export function cbFilterRecords(model) {
  const types = {early_redemption:'redemption',suspension:'conversion_suspension',put:'put',maturity:'maturity',listing:'listing',conversion_price_adjustment:'conversion_price_change'};
  const grouped = new Map();
  for (const event of arrayValue(model.events)) {
    if (event.marketScope !== 'cb' || !Object.hasOwn(types,event.eventType)) continue;
    const date = event.deadlineDate ?? event.effectiveDate ?? event.startDate ?? event.announcementDate;
    if (!isoDate(date)) continue;
    const items = grouped.get(event.cbCode) ?? [];
    items.push({...event,type:types[event.eventType],date,label:event.title});
    grouped.set(event.cbCode,items);
  }
  return arrayValue(model.records).map(record => ({...record,events:grouped.get(record.cbCode) ?? record.events}));
}

export function filterV53CbRecords(records, { query = "", quickFilter = "", dataDate = null, ranges = {}, secured = 'all' } = {}) {
  const needle = normalizeQuery(query);
  const selected = QUICK_FILTERS.has(quickFilter) ? quickFilter : "";
  const asOfDate = isoDate(dataDate);
  const result = arrayValue(records).filter((record) => {
    if (record?.status !== "active") return false;
    if (needle && ![record.cbCode, record.cbName, record.stockCode, record.companyName]
      .some((value) => normalizeQuery(value).includes(needle))) return false;
    if (secured === 'secured' && !['有擔保'].includes(record.terms?.securedStatus)) return false;
    if (secured === 'unsecured' && !['無擔保'].includes(record.terms?.securedStatus)) return false;
    return meetsQuickFilter(record, selected, asOfDate) && Object.entries(RANGE_FIELDS).every(([key, [read, bound, type]]) => {
      const limit = type === 'date' ? strictIsoDate(ranges[key]) : validCbRangeNumber(key, ranges[key]);
      if (limit === null) return true;
      const value = read(record, asOfDate);
      return value !== null && (bound === 'min' ? value >= limit : value <= limit);
    });
  });
  if (selected === "lowPremium") return sortBy(result, (record) => finiteNumber(record.quote?.premiumRate));
  if (selected === "nearConversion") return sortBy(result, (record) => {
    const value = finiteNumber(record.quote?.stockConversionValue ?? record.quote?.conversionValue);
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
    const value = finiteNumber(record.quote?.stockConversionValue ?? record.quote?.conversionValue);
    return value !== null && Math.abs(value - 100) <= 5;
  }
  if (quickFilter === "maturity365") return isWithinDays(record.terms?.maturityDate, asOfDate, 365);
  if (quickFilter === "rights90") return arrayValue(record.events).some((event) => event?.type !== "listing" && isWithinDays(event?.date, asOfDate, 90));
  if (quickFilter === "recentPut") return arrayValue(record.events).some((event) => event?.type === "put" && isWithinDays(event?.date, asOfDate, 90));
  if (quickFilter === "recentRedemption") return arrayValue(record.events).some((event) => event?.type === "redemption" && isWithinDays(event?.date, asOfDate, 90));
  if (quickFilter === "conversionSuspended") return arrayValue(record.events).some((event) => event?.type === "conversion_suspension" && isoDate(event.startDate ?? event.date) && isoDate(event.endDate) && (event.startDate ?? event.date) <= asOfDate && event.endDate >= asOfDate);
  return true;
}

function sortBy(records, valueFor) {
  return records.map((record, index) => ({ record, index, value: valueFor(record) })).sort((left, right) => {
    if (left.value === null || right.value === null) return left.value === right.value ? left.index - right.index : left.value === null ? 1 : -1;
    return left.value - right.value || left.index - right.index;
  }).map((item) => item.record);
}

export function cbPresetRanges(key, dataDate) {
  const numeric = {
    remainingLow: { remainingMin: '', remainingMax: '30' },
    remainingHigh: { remainingMin: '80', remainingMax: '' },
    price106: { priceMin: '', priceMax: '106' },
    value130: { conversionValueMin: '130', conversionValueMax: '' },
  };
  if (Object.hasOwn(numeric, key)) return numeric[key];
  if (!isoDate(dataDate)) return null;
  if (key === 'issue90') {
    const from = new Date(`${dataDate}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 90);
    return { issueFrom: from.toISOString().slice(0, 10), issueTo: dataDate };
  }
  if (key === 'maturity90') return { maturityDaysMin: '0', maturityDaysMax: '90' };
  return null;
}

export function cbOverviewSummary(records, dataDate) {
  const active = arrayValue(records).filter(record => record?.status === 'active');
  let maturity6Months = null;
  if (isoDate(dataDate)) {
    const date = new Date(`${dataDate}T00:00:00Z`);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 7, 0));
    last.setUTCDate(Math.min(date.getUTCDate(), last.getUTCDate()));
    const end = last.toISOString().slice(0, 10);
    maturity6Months = active.filter(record => {
      const maturity = isoDate(record.terms?.maturityDate);
      return maturity && maturity >= dataDate && maturity <= end;
    }).length;
  }
  return { bonds: active.length, issuers: new Set(active.map(record => record.stockCode).filter(Boolean)).size, maturity6Months };
}

function detailHref(record, filterSearch) {
  const query = new URLSearchParams({ bond: record.cbCode, from: 'database', list: filterSearch.replace(/^\?/, '') });
  return `./bonds.html?${escapeHtml(query.toString())}`;
}

function datedColumn(record, column, asOfDate) {
  const rendered = column[1](record, asOfDate);
  const valueDate = column[3]?.(record);
  return escapeHtml(rendered) + (rendered !== '—' && rendered !== '尚未掛牌' && isoDate(valueDate)
    ? `<time datetime="${escapeHtml(valueDate)}">${dateLabel(valueDate)}</time>` : '');
}

export function renderCbOverviewFacts(record, filterSearch = '') {
  const terms = record.terms ?? {};
  const facts = [
    ...BASE_CB_VIEWS.quote.slice(2, 5), ...BASE_CB_VIEWS.quote.slice(7),
    BASE_CB_VIEWS.terms[2], BASE_CB_VIEWS.period[6],
    [...BASE_CB_VIEWS.period[7], () => terms.outstandingDataDate],
    BASE_CB_VIEWS.terms[6], BASE_CB_VIEWS.period[2], BASE_CB_VIEWS.period[3],
    BASE_CB_VIEWS.period[4], BASE_CB_VIEWS.period[5],
    ["初始轉換價", () => publicNumber(terms.initialConversionPrice)],
    ...BASE_CB_VIEWS.terms.slice(8), ...BASE_CB_VIEWS.period.slice(9),
  ];
  return `<section class="cb-inline-facts" aria-label="${escapeHtml(record.cbCode)} 債券明細">
    <header><h3>${escapeHtml(record.cbCode)} ${escapeHtml(record.cbName)}</h3><a href="${detailHref(record, filterSearch)}">完整明細與官方來源 →</a></header>
    <dl>${facts.map(column => `<div><dt>${escapeHtml(column[0])}</dt><dd>${datedColumn(record, column)}</dd></div>`).join('')}</dl>
    <p>價格下方為成交／估值日期，轉換價下方為生效日，剩餘比率下方為餘額資料日。— 表示資料未提供。</p>
  </section>`;
}

export function renderCbDatabaseCards(records, { view = 'overview', asOfDate, filterSearch = '' } = {}) {
  if (!records.length) return '<p class="empty-cell">目前沒有符合條件的公開資料。</p>';
  const columns = CB_VIEW_COLUMNS[view] ?? CB_VIEW_COLUMNS.overview;
  return records.map(record => `<details class="cb-database-card">
    <summary><span><strong>${escapeHtml(record.cbName)} <small>${escapeHtml(record.cbCode)}</small></strong><span>${escapeHtml(record.stockCode)} ${escapeHtml(record.companyName)}</span><span>剩餘比率 ${rate(record.terms?.remainingRatio)} · ${escapeHtml(record.terms?.securedStatus ?? '—')}</span></span><span class="cb-card-price"><small>CB 收盤／最近成交</small><strong>${datedColumn(record, BASE_CB_VIEWS.quote[2])}</strong><small class="cb-card-expand-label">展開明細</small><small class="cb-card-collapse-label">收合明細</small></span></summary>
    ${view === 'overview' ? renderCbOverviewFacts(record, filterSearch) : `<dl class="cb-card-view-facts">${columns.slice(2).map(column => `<div><dt>${escapeHtml(column[0])}</dt><dd>${datedColumn(record, column, asOfDate)}</dd></div>`).join('')}</dl><a class="cb-card-detail-link" href="${detailHref(record, filterSearch)}">完整明細與官方來源 →</a>`}
  </details>`).join('');
}

export function renderCbDatabaseTable(records, { view = 'overview', asOfDate, sort = '', direction = 'asc', filterSearch = '', expandedCode = null } = {}) {
  const columns = CB_VIEW_COLUMNS[view] ?? CB_VIEW_COLUMNS.overview;
  const isOverview = columns === CB_VIEW_COLUMNS.overview;
  const head = `<tr>${columns.map(([label, , sortKey], index) => {
    const key = !isOverview && index === 0 ? 'code' : sortKey;
    const active = key && key === sort;
    return `<th scope="col"${active ? ` aria-sort="${direction === 'desc' ? 'descending' : 'ascending'}"` : ''}>${key ? `<button type="button" data-cb-sort="${key}">${escapeHtml(label)} <span aria-hidden="true">${active ? direction === 'desc' ? '↓' : '↑' : '↕'}</span></button>` : escapeHtml(label)}</th>`;
  }).join("")}</tr>`;
  if (!records.length) {
    return { head, body: `<tr><td colspan="${columns.length}" class="empty-cell">目前沒有符合條件的公開資料。</td></tr>` };
  }
  const body = records.map((record) => {
    const expanded = isOverview && record.cbCode === expandedCode;
    const panelId = `cb-inline-${encodeURIComponent(record.cbCode)}`;
    return `<tr>${columns.map((column, index) => {
      if (isOverview && index === columns.length - 1) return `<td><button type="button" aria-label="${escapeHtml(record.cbCode)} 明細" aria-expanded="${expanded}"${expanded ? ` aria-controls="${panelId}"` : ''} data-cb-expand="${escapeHtml(record.cbCode)}">${expanded ? '收合' : '展開'}</button></td>`;
      const rendered = datedColumn(record, column, asOfDate);
      const link = index === 0;
      return `<td data-label="${escapeHtml(column[0])}">${link ? `<a href="${detailHref(record, filterSearch)}">${rendered}</a>` : rendered}</td>`;
    }).join("")}</tr>${expanded ? `<tr class="cb-inline-row"><td colspan="${columns.length}"><div id="${panelId}">${renderCbOverviewFacts(record, filterSearch)}</div></td></tr>` : ''}`;
  }).join("");
  return { head, body };
}

async function initialize() {
  const form = document.querySelector("#bond-filter-form");
  const head = document.querySelector("#bond-filter-head");
  const body = document.querySelector("#bond-filter-body");
  const count = document.querySelector("#bond-filter-count");
  const tabs = document.querySelector("#bond-view-tabs");
  const clear = document.querySelector("#bond-filter-clear");
  const cards = document.querySelector("#bond-filter-cards");
  const errorTarget = document.querySelector("[data-page-error]");
  if (!form || !head || !body || !count || !tabs || !clear) return;
  const model = await loadPublicCbOverview({ errorTarget });
  if (!model?.dataDate || !Array.isArray(model.records)) {
    count.textContent = "資料暫時無法取得";
    body.innerHTML = '<tr><td class="empty-cell">資料暫時無法取得</td></tr>';
    if (cards) cards.innerHTML = '<p class="empty-cell">資料暫時無法取得</p>';
    return;
  }
  let activeView;
  let expandedCode = null;
  const restore = () => {
    const state = readCbFilterState(globalThis.location?.search);
    activeView = state.view;
    for (const key of ['q','quickFilter','secured','sort','direction', ...Object.keys(RANGE_FIELDS)]) {
      const control = form.elements.namedItem(key);
      if (control) control.value = state[key] ?? '';
    }
    if (Object.keys(RANGE_FIELDS).some(key => state[key] !== undefined)) form.querySelector('.cb-range-filters').open = true;
  };
  restore();
  const filterRecords = cbFilterRecords(model);
  const summary = cbOverviewSummary(filterRecords, model.dataDate);
  for (const [key, value] of Object.entries(summary)) {
    const target = document.querySelector(`[data-cb-summary="${key}"]`);
    if (target) target.textContent = publicNumber(value, 0);
  }
  document.querySelector('#cb-summary-date').textContent = `全體有效債券 · 期間條件基準日 ${dateLabel(model.dataDate)}；統計不隨篩選變動。`;
  const render = () => {
    const values = new FormData(form);
    const rows = sortCbDatabase(filterV53CbRecords(filterRecords, {
      query: values.get("q") ?? "",
      quickFilter: String(values.get("quickFilter") ?? ""),
      secured: String(values.get('secured') ?? 'all'),
      dataDate: model.dataDate,
      ranges: readRanges(values),
    }), String(values.get('sort') ?? ''), String(values.get('direction') ?? 'asc'));
    count.textContent = `${rows.length} 檔 · 資料日 ${dateLabel(model.dataDate)}`;
    syncUrl(activeView, values);
    if (!rows.some(row => row.cbCode === expandedCode)) expandedCode = null;
    const options = { view: activeView, asOfDate: model.dataDate, sort: values.get('sort'), direction: values.get('direction'), filterSearch: globalThis.location?.search ?? '', expandedCode };
    const rendered = renderCbDatabaseTable(rows, options);
    head.innerHTML = rendered.head;
    body.innerHTML = rendered.body;
    if (cards) cards.innerHTML = renderCbDatabaseCards(rows, options);
    form.querySelectorAll('[data-cb-preset]').forEach(button => {
      const ranges = cbPresetRanges(button.dataset.cbPreset, model.dataDate);
      button.setAttribute('aria-pressed', String(Boolean(ranges) && Object.entries(ranges).every(([key, value]) => String(values.get(key) ?? '') === value)));
    });
    document.querySelector('#cb-database-panel')?.setAttribute('aria-labelledby', `cb-view-${activeView}`);
    tabs.querySelectorAll("[data-cb-view]").forEach((button) => {
      const selected = button.dataset.cbView === activeView;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    clear.hidden = !['q','quickFilter','sort', ...Object.keys(RANGE_FIELDS)].some(key => String(values.get(key) ?? '')) && String(values.get('secured') ?? 'all') === 'all';
  };
  form.addEventListener("input", render);
  form.addEventListener("change", render);
  form.addEventListener('submit', event => { event.preventDefault(); render(); });
  clear.addEventListener("click", () => {
    form.reset();
    render();
  });
  form.addEventListener('click', event => {
    const button = event.target.closest('[data-cb-preset]');
    if (!button) return;
    const ranges = cbPresetRanges(button.dataset.cbPreset, model.dataDate);
    if (!ranges) return;
    for (const [key, value] of Object.entries(ranges)) form.elements.namedItem(key).value = value;
    form.querySelector('.cb-range-filters').open = true;
    render();
  });
  const focusExpandedButton = code => [...body.querySelectorAll('[data-cb-expand]')].find(button => button.dataset.cbExpand === code)?.focus({ preventScroll: true });
  body.addEventListener('click', event => {
    const button = event.target.closest('[data-cb-expand]');
    if (!button) return;
    const code = button.dataset.cbExpand;
    expandedCode = expandedCode === code ? null : code;
    render();
    focusExpandedButton(code);
  });
  body.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !expandedCode) return;
    const code = expandedCode;
    expandedCode = null;
    render();
    focusExpandedButton(code);
  });
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cb-view]");
    if (!button || !Object.hasOwn(CB_VIEW_COLUMNS, button.dataset.cbView)) return;
    activeView = button.dataset.cbView;
    render();
  });
  tabs.addEventListener('keydown', event => {
    const buttons = [...tabs.querySelectorAll('[data-cb-view]')];
    const index = buttons.indexOf(event.target);
    if (index < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].click(); buttons[next].focus();
  });
  head.addEventListener('click', event => {
    const key = event.target.closest('[data-cb-sort]')?.dataset.cbSort;
    if (!Object.hasOwn(SORT_VALUES, key)) return;
    form.elements.direction.value = form.elements.sort.value === key && form.elements.direction.value === 'asc' ? 'desc' : 'asc';
    form.elements.sort.value = key;
    render();
    head.querySelector(`[data-cb-sort="${key}"]`)?.focus();
  });
  globalThis.addEventListener?.('popstate', () => { restore(); render(); });
  render();
}

function syncUrl(view, values) {
  if (!globalThis.history || !globalThis.location) return;
  const params = new URLSearchParams();
  const query = normalizeQuery(values.get("q") ?? "");
  const quickFilter = String(values.get("quickFilter") ?? "");
  if (query) params.set("q", query);
  if (QUICK_FILTERS.has(quickFilter) && quickFilter) params.set("quickFilter", quickFilter);
  const secured = String(values.get('secured') ?? 'all');
  if (CB_SECURED_VALUES.has(secured) && secured !== 'all') params.set('secured', secured);
  if (view !== "overview") params.set("view", view);
  for (const [key, value] of Object.entries(readRanges(values))) params.set(key, value);
  if (Object.hasOwn(SORT_VALUES, values.get('sort'))) {
    params.set('sort',values.get('sort'));
    if (values.get('direction') === 'desc') params.set('direction','desc');
  }
  const search = params.size ? `?${params}` : "";
  globalThis.history.replaceState(null, "", `${globalThis.location.pathname}${search}`);
}

export function nextPublishedCbEvent(record, asOfDate) {
  return arrayValue(record?.events).filter(event => isoDate(event.date) && (!isoDate(asOfDate) || event.date >= asOfDate)).sort((left, right) => left.date.localeCompare(right.date))[0] ?? null;
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

function maturityDays(record, asOfDate) {
  const maturity = isoDate(record.terms?.maturityDate);
  if (!maturity || !asOfDate) return null;
  return (Date.parse(`${maturity}T00:00:00Z`) - Date.parse(`${asOfDate}T00:00:00Z`)) / 86400000;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

if (globalThis.window && globalThis.document) await initialize();
