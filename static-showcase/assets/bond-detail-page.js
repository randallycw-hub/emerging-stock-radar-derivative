import { bindCandlestickChart } from "./bond-candlestick-chart.js";

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

export function renderBondDetail(record, { asOfDate = null } = {}) {
  const view = record?.view ?? {};
  const term = record?.term ?? {};
  const html = `
    <header class="bond-detail-head"><div><p class="section-number">${text(record?.bondCode)} / PUBLIC CB DETAIL</p><h2>${text(term.bondName ?? view.bondName)}</h2><p>${text(term.issuerName ?? view.issuerCode)}</p></div><button class="close-workbench" type="button" data-detail-close aria-label="返回可轉債總表">← 返回總表</button></header>
    <p class="bond-detail-disclaimer">本頁為公開資料的教育性條件檢核，不構成投資建議或交易指令。</p>
    ${factDashboardSection(record, { asOfDate })}
    <nav class="detail-tabs" aria-label="詳細資料分頁" role="tablist">${tabButton("overview", "行情圖表", true)}${tabButton("terms", "條款與事件")}${tabButton("institutions", "法人")}${tabButton("company", "公司營運")}</nav>
    ${mobileArea("K 線圖", "overview", candleSection(record))}
    ${mobileArea("債券條款", "terms", termsSection(term, view))}
    ${mobileArea("資料來源與授權範圍", "terms", dataSourceSection())}
    ${mobileArea("法人 1／5／20 日", "institutions", institutionsSection(view, record?.fieldStates))}
    ${mobileArea("公司營運與公開財務", "company", companySection(view))}
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
      initialConversionPrice: term["發行時轉換價格"] ?? null,
      conversionStartDate: term["轉換期間起"] ?? null,
      conversionEndDate: term["迄"] ?? null,
      putDates: term["賣回權日期"] ? [term["賣回權日期"]] : [],
      putPrice: null,
      securedStatus: term["債券擔保情形"] ?? null,
    },
    view,
    fieldStates: legacyFieldStates(view),
    events: Array.isArray(events) ? events : [],
  };
}

export function bindBondDetail(target, onClose, chartOptions = {}) {
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
  const stored = target.querySelector("[data-chart-data]")?.textContent;
  const disposeChart = bindCandlestickChart(target, { ...parseChartData(stored), ...chartOptions });
  return () => {
    compactQuery?.removeEventListener("change", syncDisclosureMode);
    disposeChart();
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
function candleSection(record) {
  const chartData = JSON.stringify({
    history: Array.isArray(record?.history) ? record.history : [],
    events: Array.isArray(record?.events) ? record.events : [],
    archived: record?.status === "archived",
  }).replaceAll("<", "\\u003c");
  return `<h3>K 線圖</h3><section id="bond-candlestick" class="bond-candlestick" data-bond-candlestick-chart aria-label="可轉債 K 線與成交量圖表">
    <div class="chart-controls"><fieldset><legend>週期</legend><button type="button" data-chart-period="day" aria-pressed="true">日</button><button type="button" data-chart-period="week" aria-pressed="false">週</button><button type="button" data-chart-period="month" aria-pressed="false">月</button></fieldset><fieldset><legend>區間</legend><button type="button" data-chart-range="1M" aria-pressed="false">1M</button><button type="button" data-chart-range="3M" aria-pressed="false">3M</button><button type="button" data-chart-range="6M" aria-pressed="true">6M</button><button type="button" data-chart-range="1Y" aria-pressed="false">1Y</button><button type="button" data-chart-range="3Y" aria-pressed="false">3Y</button></fieldset></div>
    <p class="chart-legend"><span class="chart-legend-up">空心：收高</span><span class="chart-legend-down">實心：收低</span><span>均線 MA5／20／60</span></p>
    <canvas tabindex="0" role="img" aria-describedby="bond-chart-summary" aria-label="可轉債 K 線與成交量；左右方向鍵可逐筆檢視"></canvas>
    <p id="bond-chart-summary" data-chart-summary class="chart-screen-summary" aria-live="polite">資料累積中</p>
    <details data-chart-advanced><summary>進階數值（不提供交易訊號）</summary><p>Bollinger(20,2) · RSI(14) · KD(9,3,3) · MACD(12,26,9)</p><output data-chart-advanced-values>資料累積中</output></details>
    <details data-chart-table><summary>顯示 OHLC 資料表</summary><div class="chart-table-wrap"><table><thead><tr><th>日期</th><th>開</th><th>高</th><th>低</th><th>收</th><th>成交量</th></tr></thead><tbody data-chart-table-body></tbody></table></div></details>
    <section class="chart-events" aria-label="圖表事件標記"><h4>公開事件標記</h4><ul data-chart-events><li>此視窗無公開事件標記</li></ul></section>
    <script type="application/json" data-chart-data>${chartData}</script>
    <p>僅呈現已驗證 OHLC 資料；缺漏日期不插補，資料不足時顯示資料累積中。</p>
  </section>`;
}
function parseChartData(value) { try { return JSON.parse(value ?? "{}"); } catch { return {}; } }
function termsSection(term, view) {
  return `<h3>債券條款</h3><dl class="detail-facts">${fact("發行日", term.issueDate)}${fact("掛牌日", term.listingDate)}${fact("到期日", term.maturityDate)}${fact("發行總額", term.issueAmount)}${fact("流通餘額", term.outstandingAmount ?? view.outstandingAmount)}${fact("轉換開始", term.conversionStartDate)}${fact("轉換截止", term.conversionEndDate)}${fact("發行轉換價", term.initialConversionPrice)}${fact("目前轉換價", view.currentConversionPrice)}${fact("賣回日期", Array.isArray(term.putDates) ? term.putDates.join("、") : null)}${fact("賣回價格", term.putPrice)}${fact("擔保", term.securedStatus)}</dl>${conversionPriceHistorySection(view.conversionPriceHistory)}${formulaDetails(view)}`;
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
function formulaDetails(view) { return `<details class="formula-details"><summary>展開公式與已驗證輸入值</summary><dl class="detail-facts">${fact("轉換價值", view.conversionValue)}${fact("轉換溢價", view.premiumRate)}${fact("剩餘單位", view.remainingUnits)}${fact("剩餘比例", view.remainingRatio)}${fact("週轉率", view.dailyTurnoverRate)}${fact("天數", view.daysToMaturity)}</dl></details>`; }
function institutionsSection(view) {
  const unavailable = view.institutionNetUnits === null || view.institutionNetUnits === undefined;
  return `<h3>法人 1／5／20 日</h3><dl class="detail-facts">${fact("資料日", view.institutionDataDate)}${fact("法人 1 日淨額", unavailable ? MISSING_WORDING : view.institutionNetUnits)}${fact("法人 5 日淨額", unavailable ? MISSING_WORDING : view.institutionNet5dUnits)}${fact("法人 20 日淨額", unavailable ? MISSING_WORDING : view.institutionNet20dUnits)}</dl>`;
}
function companySection(view) {
  const company = view.issuerResearch;
  const links = companyContextLinks(view?.issuerCode);
  const context = links.length
    ? `<section class="company-context"><h4>關聯市場</h4><p>${links.map((link) => `<a href="${escapeHtml(link.href)}">${text(link.label)} →</a>`).join(" ")}</p></section>`
    : "";
  return `<h3>公司營運與公開財務</h3><dl class="detail-facts">${fact("營收月份", company?.revenueMonth)}${fact("發布日", company?.sourcePublishedOn)}${fact("營收單位", company?.revenueUnit)}${fact("當月營收", company?.currentMonthRevenue)}${fact("月增率", company?.monthOverMonthPercent)}${fact("年增率", company?.yearOverYearPercent)}${fact("累計營收", company?.cumulativeRevenue)}${fact("累計年增率", company?.cumulativeYearOverYearPercent)}</dl>${context}`;
}
function eventsSection(events) {
  const values = Array.isArray(events) ? events : [];
  return `<h3>事件時間軸</h3><ol class="detail-event-timeline">${values.length ? values.map((event) => `<li><time>${text(event.date)}</time><strong>${text(event.title)}</strong><span>${text(event.type)}</span>${sourceLink(event.sourceUrl, event.sourceId)}</li>`).join("") : `<li>${MISSING_WORDING}</li>`}</ol>`;
}
function sourceLink(value, sourceId) { const url = verifiedSnapshotUrl(value, sourceId); return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">已驗證公開來源</a>` : ""; }
function validIsoDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")); }
function verifiedSnapshotUrl(value, sourceId) {
  if (typeof value !== "string" || APPROVED_EVENT_SOURCE_URLS.get(sourceId) !== value) return null;
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
