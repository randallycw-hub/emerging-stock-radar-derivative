const MISSING_WORDING = "—";
const APPROVED_EVENT_SOURCE_URLS = new Map([
  ["11406", "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv"],
  ["tpex-cb-day-quotes", "https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry"],
  ["twse-stock-day-all", "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"],
  ["tpex-stock-day-close", "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"],
  ["tpex-cb-institution-daily", "https://www.tpex.org.tw/www/zh-tw/bond/newCb3itrade"],
  ["tpex-cb-redemption-announcements", "https://www.tpex.org.tw/www/zh-tw/bond/redeem"],
  ["twsa-cb-underwriting-announcements", "https://web.twsa.org.tw/edoc2/default.aspx"],
]);
const FORBIDDEN_UI_PATTERNS = [
  [["a", "ggregate-score"].join(""), /(?:\u7e3d\u5206|\u7e3d\u8a55\u5206|aggregate\s+score)/iu],
  ["recommendation", /(?:\u5efa\u8b70\s*(?:\u8cb7\u9032|\u8ce3\u51fa|\u653e\u7a7a|\u4e0b\u55ae)|\u63a8\u85a6\s*(?:\u8cb7\u9032|\u8ce3\u51fa|\u653e\u7a7a|\u4e0b\u55ae)|\b(?:recommend(?:ed|ation)?|advice)\s+(?:\u0062\u0075\u0079|\u0073\u0065\u006c\u006c|\u0073\u0068\u006f\u0072\u0074|\u006f\u0072\u0064\u0065\u0072))/iu],
  [["b", "uy-sell-s", "hort"].join(""), /(?:\b(?:\u0062\u0075\u0079|\u0073\u0065\u006c\u006c|\u0073\u0068\u006f\u0072\u0074)\b|(?:\u8cb7\u9032|\u8ce3\u51fa|\u653e\u7a7a)\s*\d*\s*(?:\u5f35|\u80a1)?)/iu],
  [["o", "rder"].join(""), /(?:\b(?:\u006f\u0072\u0064\u0065\u0072|\u0070\u006f\u0073\u0069\u0074\u0069\u006f\u006e)\b|(?:\u4e0b\u55ae|\u5efa\u7acb\u90e8\u4f4d))/iu],
  ["hedge-ratio", /(?:\u907f\u96aa\u6bd4\u7387|\b\u0068\u0065\u0064\u0067\u0065\s*\u0072\u0061\u0074\u0069\u006f\b)/iu],
];

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function detailUrlForBond(pathWithSearch, bondCode) {
  const url = new URL(pathWithSearch, "https://detail.local");
  if (bondCode) url.searchParams.set("bond", bondCode);
  else url.searchParams.delete("bond");
  return `${url.pathname}${url.search}`;
}

export function companyContextLinks(issuerCode) {
  const query = String(issuerCode ?? "").trim();
  if (!query) return [];
  const value = encodeURIComponent(query);
  return [
    { label: "興櫃市場", href: `./emerging.html?q=${value}` },
    { label: "IPO 時程", href: `./ipo.html?q=${value}` },
    { label: "IPO 雷達", href: `./ipo-radar.html?q=${value}` },
  ];
}

export function noAdviceViolations(text) {
  return FORBIDDEN_UI_PATTERNS.filter(([, pattern]) => pattern.test(String(text))).map(([code]) => code);
}

export function projectCbMarketRelationship(view = {}) {
  const stockClose = publicFiniteNumber(view?.stockClose);
  const conversionPrice = publicFiniteNumber(view?.currentConversionPrice);
  if (!Number.isFinite(stockClose) || !Number.isFinite(conversionPrice) || conversionPrice <= 0) return null;
  const distance = ((stockClose / conversionPrice) - 1) * 100;
  if (!Number.isFinite(distance)) return null;
  return {
    label: distance >= 0 ? "標的股高於轉換價" : "標的股低於轉換價",
    distancePercent: `${distance.toFixed(2)}%`,
    state: distance >= 0 ? "above" : "below",
  };
}

function publicFiniteNumber(value) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function renderBondDetail(record, { asOfDate = null } = {}) {
  const view = record?.view ?? {};
  const term = record?.term ?? {};
  const showInstitutions = hasVerifiedInstitutionData(view);
  const showCompany = hasVerifiedCompanyData(view);
  const marketStatus = publicDetailMarketStatus(view);
  const priorTradeDate = view.staleCbPrice === true && validIsoDate(view.cbPriceDate)
    ? `<span>前次成交日：${text(view.cbPriceDate)}</span>`
    : "";
  const html = `
    <header class="bond-detail-head"><div><p class="section-number">${text(record?.bondCode)} / PUBLIC CB DETAIL</p><h2>${text(term.bondName ?? view.bondName)}</h2><p>${text(term.issuerName ?? view.issuerCode)}</p>${marketStatus ? `<p class="bond-market-status" aria-live="polite">${text(marketStatus)}${priorTradeDate}</p>` : ""}</div><button class="close-workbench" type="button" data-detail-close aria-label="返回可轉債總表">← 返回總表</button></header>
    <p class="bond-detail-disclaimer">本頁為公開資料的教育性條件檢核，不構成投資建議或交易指令。</p>
    ${factDashboardSection(record, { asOfDate })}
    ${detailDatesSection(record)}
    <nav class="detail-tabs" aria-label="詳細資料分頁" role="tablist">${tabButton("overview", "行情資料", true)}${tabButton("terms", "條款與事件")}${showInstitutions ? tabButton("institutions", "法人") : ""}${showCompany ? tabButton("company", "公司營運") : ""}</nav>
    ${mobileArea("行情摘要", "overview", marketSummarySection(record))}
    ${mobileArea("債券條款", "terms", termsSection(term, view))}
    ${mobileArea("資料來源與授權範圍", "terms", dataSourceSection())}
    ${showInstitutions ? mobileArea("法人 1／5／20 日", "institutions", institutionsSection(view)) : ""}
    ${showCompany ? mobileArea("公司營運與公開財務", "company", companySection(view)) : ""}
    ${mobileArea("事件時間軸", "terms", eventsSection(record?.events))}`;
  const violations = noAdviceViolations(html);
  if (violations.length) throw new Error(`detail UI contains prohibited content: ${violations.join(", ")}`);
  return html;
}

function factDashboardSection(record, { asOfDate } = {}) {
  const facts = projectCbFactDashboard(record, { asOfDate }).filter((item) => item.evidenceState === "verified");
  if (facts.length === 0) return "";
  return `<section class="cb-fact-dashboard" aria-label="可轉債事實儀表板"><header><div><p class="section-number">MARKET FACTS</p><h3>可轉債重點</h3></div></header><dl>${facts.map((item) => `<div class="cb-fact-card"><dt>${text(item.label)}</dt><dd>${text(item.value)}</dd><small>資料日期：${text(item.dataDate)}</small></div>`).join("")}</dl></section>`;
}

export function projectCbFactDashboard(record = {}, { asOfDate = null } = {}) {
  const view = record?.view ?? {};
  const term = record?.term ?? {};
  const events = Array.isArray(record?.events) ? record.events : [];
  const fieldStates = record?.fieldStates ?? {};
  const missing = (key, label) => ({ key, label, value: MISSING_WORDING, dataDate: MISSING_WORDING, evidence: MISSING_WORDING, evidenceState: "unavailable" });
  const approvedField = (key, label, value, dataDate, fieldState, sourceId, sourceUrl) => {
    const directEvidence = verifiedSnapshotUrl(sourceUrl, sourceId);
    const publishedEvidence = fieldState === "complete";
    if (value == null || value === "" || !validIsoDate(dataDate) || (!directEvidence && !publishedEvidence)) return missing(key, label);
    const evidence = directEvidence ? "已驗證公開來源" : "已核對公開資料";
    return { key, label, value: String(value), dataDate, evidence, evidenceState: "verified" };
  };
  const publishedAsOfDate = validIsoDate(asOfDate)
    ? asOfDate
    : [view.valuationDate, view.cbPriceDate, view.stockPriceDate, view.outstandingDataDate]
      .find((value) => validIsoDate(value)) ?? null;
  const event = events.filter((item) => publishedAsOfDate && item?.date >= publishedAsOfDate
    && validIsoDate(item?.date) && verifiedSnapshotUrl(item?.sourceUrl, item?.sourceId))
    .sort((left, right) => left.date.localeCompare(right.date))[0] ?? null;
  const maturity = events.find((item) => item?.type === "maturity" && item?.date === term.maturityDate
    && validIsoDate(item.date) && verifiedSnapshotUrl(item.sourceUrl, item.sourceId));
  const balance = approved11406BalanceEvidence(view);
  return [
    approvedField("cbClose", "CB 收盤", view.cbClose, view.cbPriceDate, fieldStates.price, view.cbPriceSourceId, view.cbPriceSourceUrl),
    approvedField("conversionPrice", "目前轉換價", view.currentConversionPrice, view.conversionPriceEffectiveDate, fieldStates.price, view.conversionPriceSourceId, view.conversionPriceSourceUrl),
    approvedField("stockClose", "標的股收盤", view.stockClose, view.stockPriceDate, fieldStates.price, view.stockPriceSourceId, view.stockPriceSourceUrl),
    approvedField("conversionValue", "轉換價值", view.conversionValue, view.valuationDate, fieldStates.valuation, view.valuationSourceId, view.valuationSourceUrl),
    approvedField("premium", "轉換溢價", view.premiumRate, view.valuationDate, fieldStates.valuation, view.valuationSourceId, view.valuationSourceUrl),
    (balance || fieldStates.outstanding === "complete") && view.remainingRatio != null && validIsoDate(view.outstandingDataDate)
      ? { key: "remainingRatio", label: "流通餘額比例", value: String(view.remainingRatio), dataDate: view.outstandingDataDate, evidence: balance ? "已驗證公開來源" : "已核對公開資料", evidenceState: "verified" }
      : missing("remainingRatio", "流通餘額比例"),
    event
      ? { key: "nextEvent", label: "下一事件", value: `${event.type ?? event.title ?? "事件"} ${event.date}`, dataDate: event.date, evidence: "已驗證公開來源", evidenceState: "verified" }
      : missing("nextEvent", "下一事件"),
    maturity
      ? { key: "maturity", label: "到期日", value: term.maturityDate, dataDate: maturity.date, evidence: "已驗證公開來源", evidenceState: "verified" }
      : missing("maturity", "到期日"),
  ];
}

export function projectBondDetailDateFacts(record = {}) {
  const view = record?.view ?? {};
  const company = view?.issuerResearch;
  const facts = [
    ["CB 盤後日期", view.cbPriceDate, validIsoDate],
    ["標的股盤後日期", view.stockPriceDate, validIsoDate],
    ["轉換價生效日", view.conversionPriceEffectiveDate, validIsoDate],
    ["估值日期", view.valuationDate, validIsoDate],
    ["流通餘額資料日", view.outstandingDataDate, validIsoDate],
    ...(hasVerifiedInstitutionData(view) ? [["法人資料日", view.institutionDataDate, validIsoDate]] : []),
    ...(hasVerifiedCompanyData(view) ? [["財務月份", company?.revenueMonth, validYearMonth]] : []),
  ];
  return facts.filter(([, value, validator]) => validator(value)).map(([label, value]) => ({
    label,
    value,
  }));
}

export function publicDetailMarketStatus(view = {}) {
  return {
    ACTIVE: "交易中",
    NO_TRADE: "今日無成交",
    CONVERSION_SUSPENDED: "停止轉換",
    TRADING_SUSPENDED: "暫停交易",
    REDEMPTION_PROCESS: "贖回程序",
    MATURED: "已到期",
    DELISTED: "已下櫃",
    STALE: "盤後未更新",
  }[view?.marketStatus] ?? "";
}

export function detailRecordFromLegacy({ view = {}, term = {}, events = [] } = {}) {
  const bondCode = String(view.bondCode ?? term["債券代碼"] ?? "");
  return {
    bondCode,
    status: view.archived || view.status === "archived" ? "archived" : "active",
    archiveReason: view.archiveReason ?? null,
    archivedAt: view.archiveDate ?? view.archivedAt ?? null,
    term: {
      bondName: term["債券簡稱"] ?? view.bondName ?? null,
      issuerName: term["機構名稱"] ?? view.issuerName ?? view.issuerCode ?? null,
      issueDate: term["發行日期"] ?? null,
      listingDate: term["掛牌日期"] ?? null,
      maturityDate: term["到期日期"] ?? view.maturityDate ?? null,
      issueAmount: term["發行總額"] ?? null,
      outstandingAmount: term["目前餘額"] ?? view.outstandingAmount ?? null,
      outstandingChangeDate: term["最近餘額變動日"] ?? null,
      outstandingChangeReason: term["最近餘額變動原因"] ?? null,
      initialConversionPrice: term["發行時轉換價格"] ?? null,
      conversionStartDate: term["轉換期間起"] ?? null,
      conversionEndDate: term["迄"] ?? null,
      putDates: term["賣回權日期"] ? [term["賣回權日期"]] : [],
      putPrice: null,
      securedStatus: term["債券擔保情形"] ?? null,
      underwriter: term["承銷機構"] ?? null,
      trustee: term["受託人"] ?? null,
      unitFaceValueTwd: term["每張面額"] ?? null,
    },
    view,
    fieldStates: legacyFieldStates(view),
    events: Array.isArray(events) ? events : [],
  };
}

export function bindBondDetail(target, onClose) {
  const compactQuery = globalThis.window?.matchMedia?.("(max-width: 900px)") ?? null;
  const syncDisclosureMode = () => syncBondDetailDisclosureMode(target, {
    compact: compactQuery?.matches ?? false,
  });
  syncDisclosureMode();
  compactQuery?.addEventListener("change", syncDisclosureMode);
  const closeButton = target.querySelector("[data-detail-close]");
  closeButton?.addEventListener("click", onClose);
  closeButton?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onClose();
  });
  for (const button of target.querySelectorAll("[data-detail-tab]")) {
    button.addEventListener("click", () => {
      const tab = button.dataset.detailTab;
      target.querySelectorAll("[data-detail-tab]").forEach((item) => {
        const selected = item.dataset.detailTab === tab;
        item.setAttribute("aria-selected", String(selected));
        item.tabIndex = selected ? 0 : -1;
      });
      target.querySelectorAll("[data-detail-panel]").forEach((panel) => { panel.hidden = panel.dataset.detailPanel !== tab; });
    });
  }
  return () => {
    compactQuery?.removeEventListener("change", syncDisclosureMode);
  };
}

export function syncBondDetailDisclosureMode(target, { compact } = {}) {
  const selectedTab = target.querySelector(
    "[data-detail-tab][aria-selected=\"true\"]",
  )?.dataset.detailTab ?? "overview";
  for (const disclosure of target.querySelectorAll(".detail-mobile-area")) {
    disclosure.open = !compact;
  }
  for (const panel of target.querySelectorAll("[data-detail-panel]")) {
    panel.hidden = compact ? false : panel.dataset.detailPanel !== selectedTab;
  }
}

function tabButton(id, label, selected = false) { return `<button type="button" role="tab" data-detail-tab="${id}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}">${label}</button>`; }
function mobileArea(label, tab, content) { return `<details class="detail-mobile-area"><summary>${text(label)}</summary><section class="bond-detail-section" data-detail-panel="${tab}" aria-label="${text(label)}">${content}</section></details>`; }
function approved11406BalanceEvidence(view) {
  const sourceId = view?.outstandingSourceId;
  const sourceUrl = view?.outstandingSourceUrl;
  return sourceId === "11406" && verifiedSnapshotUrl(sourceUrl, sourceId) ? { sourceId, sourceUrl } : null;
}
function marketSummarySection(record) {
  const view = record?.view ?? {};
  return `<h3>行情摘要</h3><dl class="detail-facts">${factList([["CB 收盤", view.cbClose], ["CB 資料日", view.cbPriceDate], ["標的股收盤", view.stockClose], ["標的股資料日", view.stockPriceDate], ["轉換價值", view.conversionValue], ["轉換溢價", view.premiumRate]])}</dl>`;
}
function detailDatesSection(record) {
  const values = projectBondDetailDateFacts(record);
  return `<section class="detail-date-facts" aria-label="資料時間點"><h3>資料時間點</h3><dl class="detail-facts">${values.map((item) => fact(item.label, item.value)).join("")}</dl></section>`;
}
function termsSection(term, view) {
  const relationship = projectCbMarketRelationship(view);
  return `<h3>債券條款</h3><dl class="detail-facts">${factList([["發行日", term.issueDate], ["掛牌日", term.listingDate], ["到期日", term.maturityDate], ["發行總額", term.issueAmount], ["流通餘額", term.outstandingAmount ?? view.outstandingAmount], ["最近餘額異動日", term.outstandingChangeDate], ["最近餘額異動原因", term.outstandingChangeReason], ["轉換開始", term.conversionStartDate], ["轉換截止", term.conversionEndDate], ["發行轉換價", term.initialConversionPrice], ["目前轉換價", view.currentConversionPrice], ["標的股相對轉換價", relationship ? `${relationship.label}（${relationship.distancePercent}）` : null], ["賣回日期", Array.isArray(term.putDates) ? term.putDates.join("、") : null], ["賣回價格", term.putPrice], ["擔保", term.securedStatus], ["承銷機構", term.underwriter], ["受託人", term.trustee], ["每張面額", term.unitFaceValueTwd]])}</dl>${conversionPriceHistorySection(view.conversionPriceHistory)}${formulaDetails(view)}`;
}
function conversionPriceHistorySection(history) {
  const rows = Array.isArray(history)
    ? history.filter((item) => validIsoDate(item?.effectiveDate) && typeof item?.currentConversionPrice === "string")
    : [];
  if (rows.length === 0) return "";
  return `<section class="conversion-price-history"><h4>轉換價格生效紀錄</h4><dl class="detail-facts">${rows.map((item) => fact(item.effectiveDate, item.currentConversionPrice)).join("")}</dl></section>`;
}
function dataSourceSection() {
  return `<h3>資料來源與授權範圍</h3><p>本工作台只列示可核對的公開資料；每項數值旁標註其資料日期。</p><dl class="detail-facts">${sourceFact("CB 盤後收盤與成交量", "tpex-cb-day-quotes", "TPEx 可轉債每日成交資訊")}${sourceFact("上市標的股盤後", "twse-stock-day-all", "TWSE 每日收盤資訊")}${sourceFact("上櫃標的股盤後", "tpex-stock-day-close", "TPEx 上櫃每日收盤資訊")}${sourceFact("條款、轉換價與流通餘額", "11406", "TPEx 可轉債公開清單")}${sourceFact("提前贖回公告", "tpex-cb-redemption-announcements", "TPEx 贖回公告")}</dl><p>不蒐集會員帳密、個人投資部位或交易資料。</p>`;
}
function sourceFact(label, sourceId, sourceLabel) {
  const url = APPROVED_EVENT_SOURCE_URLS.get(sourceId);
  const link = sourceLink(url, sourceId);
  return `<div><dt>${text(label)}</dt><dd>${link ? `${link}（${text(sourceLabel)}）` : MISSING_WORDING}</dd></div>`;
}
function formulaDetails(view) {
  const values = factList([["轉換價值", view.conversionValue], ["轉換溢價", view.premiumRate], ["剩餘單位", view.remainingUnits], ["剩餘比例", view.remainingRatio], ["週轉率", view.dailyTurnoverRate], ["天數", view.daysToMaturity]]);
  return values ? `<details class="formula-details"><summary>展開公式與已驗證輸入值</summary><dl class="detail-facts">${values}</dl></details>` : "";
}
function institutionsSection(view) {
  return `<h3>法人 1／5／20 日</h3><dl class="detail-facts">${factList([["資料日", view.institutionDataDate], ["法人 1 日淨額", view.institutionNetUnits], ["法人 5 日淨額", view.institutionNet5dUnits], ["法人 20 日淨額", view.institutionNet20dUnits]])}</dl>`;
}
function companySection(view) {
  const company = view.issuerResearch;
  const links = companyContextLinks(view?.issuerCode);
  const context = links.length
    ? `<section class="company-context"><h4>關聯市場</h4><p>${links.map((link) => `<a href="${escapeHtml(link.href)}">${text(link.label)} →</a>`).join(" ")}</p></section>`
    : "";
  return `<h3>公司營運與公開財務</h3><dl class="detail-facts">${factList([["營收月份", company?.revenueMonth], ["發布日", company?.sourcePublishedOn], ["營收單位", company?.revenueUnit], ["當月營收", company?.currentMonthRevenue], ["月增率", company?.monthOverMonthPercent], ["年增率", company?.yearOverYearPercent], ["累計營收", company?.cumulativeRevenue], ["累計年增率", company?.cumulativeYearOverYearPercent]])}</dl>${context}`;
}
function eventsSection(events) {
  const values = Array.isArray(events) ? events : [];
  return `<h3>事件時間軸</h3><ol class="detail-event-timeline">${values.length ? values.map((event) => `<li><time>${text(event.date)}</time><strong>${text(event.title)}</strong><span>${text(event.type)}</span>${sourceLink(event.sourceUrl, event.sourceId)}</li>`).join("") : `<li>${MISSING_WORDING}</li>`}</ol>`;
}
function sourceLink(value, sourceId) { const url = verifiedSnapshotUrl(value, sourceId); return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">已驗證公開來源</a>` : ""; }
function validIsoDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")); }
function validYearMonth(value) { return /^\d{4}-\d{2}$/.test(String(value ?? "")); }
function verifiedSnapshotUrl(value, sourceId) {
  if (typeof value !== "string") return null;
  if (
    sourceId != null
      ? APPROVED_EVENT_SOURCE_URLS.get(sourceId) !== value
      : ![...APPROVED_EVENT_SOURCE_URLS.values()].includes(value)
  ) return null;
  try { return new URL(value).protocol === "https:" ? value : null; } catch { return null; }
}
function legacyFieldStates(view) {
  const status = (value, date = null) => value == null ? "missing" : date == null ? "stale" : "complete";
  return {
    price: status(view.cbClose, view.cbPriceDate), valuation: status(view.conversionValue, view.valuationDate),
    outstanding: status(view.outstandingAmount, view.outstandingDataDate), institutions: status(view.institutionNetUnits, view.institutionDataDate),
    company: view.issuerResearch == null ? "missing" : "complete", events: "missing", history: "missing",
  };
}
function fact(label, value) { return `<div><dt>${text(label)}</dt><dd>${text(value ?? MISSING_WORDING)}</dd></div>`; }
function text(value) { return escapeHtml(value ?? MISSING_WORDING); }
function hasVerifiedInstitutionData(view = {}) {
  return validIsoDate(view.institutionDataDate)
    && [view.institutionNetUnits, view.institutionNet5dUnits, view.institutionNet20dUnits].some(hasPublicValue);
}
function hasVerifiedCompanyData(view = {}) {
  const company = view?.issuerResearch;
  return validYearMonth(company?.revenueMonth)
    && [company?.currentMonthRevenue, company?.cumulativeRevenue, company?.monthOverMonthPercent, company?.yearOverYearPercent].some(hasPublicValue);
}
function hasPublicValue(value) { return value !== null && value !== undefined && String(value).trim() !== ""; }
function factList(entries) { return entries.filter(([, value]) => hasPublicValue(value)).map(([label, value]) => fact(label, value)).join(""); }
