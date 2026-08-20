import { bindCandlestickChart } from "./bond-candlestick-chart.js";

const DIMENSION_LABELS = {
  price: "價格研究維度", days: "天數研究維度", premium: "溢價研究維度",
  remaining: "餘額研究維度", spread: "價差研究維度", liquidity: "流動性研究維度",
};
const STRATEGY_LABELS = {
  stock_bond_relative: "股債相對條件", maturity_put: "到期賣回條件", equity_relative: "現股相對觀察",
  stock_equivalent: "等同現股條件", arbitrage: "套利條件", dynamic_hedge: "動態避險條件",
};
const STATE_LABELS = {
  favorable: "條件符合", met: "條件符合", watch: "條件未符合", risk: "條件未符合", not_met: "條件未符合",
  partial: "待確認", pending: "待確認", complete: "complete", stale: "stale", date_mismatch: "date_mismatch", missing: "missing", accumulating: "accumulating",
};
const MISSING_WORDING = "目前無核准公開資料／待確認";
const APPROVED_EVENT_SOURCE_URLS = new Map([
  ["11406", "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv"],
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

export function noAdviceViolations(text) {
  return FORBIDDEN_UI_PATTERNS.filter(([, pattern]) => pattern.test(String(text))).map(([code]) => code);
}

export function renderBondDetail(record) {
  const view = record?.view ?? {};
  const term = record?.term ?? {};
  const assessment = record?.assessment ?? { dimensions: [], strategies: [] };
  const dataDate = view.valuationDate ?? view.cbPriceDate ?? term.outstandingDataDate ?? null;
  const html = `
    <header class="bond-detail-head"><div><p class="section-number">${text(record?.bondCode)} / PUBLIC CB DETAIL</p><h2>${text(term.bondName ?? view.bondName)}</h2><p>${text(term.issuerName ?? view.issuerCode)}</p></div><button class="close-workbench" type="button" data-detail-close aria-label="返回可轉債總表">← 返回總表</button></header>
    <p class="bond-detail-disclaimer">本頁為公開資料的教育性條件檢核，不構成投資建議或交易指令。</p>
    <nav class="detail-tabs" aria-label="詳細資料分頁" role="tablist">${tabButton("overview", "總覽", true)}${tabButton("terms", "條款與事件")}${tabButton("institutions", "法人")}${tabButton("company", "公司營運")}</nav>
    ${mobileArea("債券識別與資料完整性", "overview", identitySection(record, dataDate))}
    ${mobileArea("風險與缺漏提醒", "overview", riskSection(view, record?.fieldStates))}
    ${mobileArea("六項研究維度", "overview", assessmentSection("六項研究維度", "dimension", assessment.dimensions, DIMENSION_LABELS))}
    ${mobileArea("六項策略條件", "overview", assessmentSection("六項策略條件", "strategy", assessment.strategies, STRATEGY_LABELS))}
    ${mobileArea("K 線圖", "overview", candleSection(record))}
    ${mobileArea("債券條款", "terms", termsSection(term, view))}
    ${mobileArea("法人 1／5／20 日", "institutions", institutionsSection(view, record?.fieldStates))}
    ${mobileArea("公司營運與公開財務", "company", companySection(view, assessment.strategies, record?.fieldStates))}
    ${mobileArea("事件時間軸", "terms", eventsSection(record?.events))}`;
  const violations = noAdviceViolations(html);
  if (violations.length) throw new Error(`detail UI contains prohibited content: ${violations.join(", ")}`);
  return html;
}

export function detailRecordFromLegacy({ view = {}, term = {}, events = [] } = {}) {
  const bondCode = String(view.bondCode ?? term["債券代碼"] ?? "");
  const dataDate = view.valuationDate ?? view.cbPriceDate ?? null;
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
    view: { ...view, missingReasons: [...(view.missingReasons ?? []), "UNVERIFIED_WORKBENCH_SNAPSHOT"] },
    fieldStates: legacyFieldStates(view),
    assessment: legacyAssessment(dataDate),
    events: Array.isArray(events) ? events : [],
  };
}

export function bindBondDetail(target, onClose, chartOptions = {}) {
  target.querySelector("[data-detail-close]")?.addEventListener("click", onClose);
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
  bindCandlestickChart(target, { ...parseChartData(stored), ...chartOptions });
}

function tabButton(id, label, selected = false) { return `<button type="button" role="tab" data-detail-tab="${id}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}">${label}</button>`; }
function mobileArea(label, tab, content) { return `<details class="detail-mobile-area"><summary>${text(label)}</summary><section class="bond-detail-section" data-detail-panel="${tab}" aria-label="${text(label)}">${content}</section></details>`; }
function identitySection(record, dataDate) {
  const view = record?.view ?? {};
  return `<h3>債券識別與資料完整性</h3><dl class="detail-facts">${fact("債券代碼", record?.bondCode)}${fact("狀態", record?.status === "archived" ? "封存" : "active")}${fact("封存原因", record?.archiveReason)}${fact("封存日", record?.archivedAt)}${fact("資料日", dataDate)}${fact("資料完整性", view.dataQuality ?? record?.fieldStates?.price)}</dl>`;
}
function riskSection(view, fieldStates = {}) {
  const reminders = [...(Array.isArray(view.missingReasons) ? view.missingReasons : []), ...Object.entries(fieldStates).filter(([, value]) => value === "missing" || value === "date_mismatch").map(([key, value]) => `${key}: ${value}`)];
  return `<h3>風險與缺漏提醒</h3><p>${reminders.length ? text(reminders.join("；")) : "公開資料欄位已依資料日列示；仍請自行確認適用性。"}</p><p>${reminders.length ? MISSING_WORDING : "缺漏欄位不以零值代替。"}</p>`;
}
function assessmentSection(title, cardClass, sections, labels) {
  const cards = Array.isArray(sections) ? sections : [];
  return `<h3>${text(title)}</h3><div class="detail-condition-grid">${cards.map((section) => `<article class="${cardClass}-card detail-condition-card"><header><h4>${text(labels[section.code] ?? section.code)}</h4><span>${text(stateLabel(section.state))}</span></header>${(Array.isArray(section.checks) ? section.checks : []).map(renderCheck).join("")}</article>`).join("")}</div>`;
}
function renderCheck(check) {
  const missing = check?.actual === null || check?.actual === undefined || !check?.dataDate || !check?.sourceId;
  return `<dl class="condition-check">${fact("完整規則", check?.label)}${fact("實際值", missing ? MISSING_WORDING : check.actual)}${fact("門檻", check?.threshold)}${fact("結果", stateLabel(check?.state))}${fact("資料日", check?.dataDate ?? MISSING_WORDING)}${fact("來源 ID", check?.sourceId ?? MISSING_WORDING)}${fact("狀態", check?.state ?? "pending")}${fact("缺漏原因", check?.missingReason)}</dl>`;
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
    <script type="application/json" data-chart-data>${chartData}</script>
    <p>僅呈現已驗證 OHLC 資料；缺漏日期不插補，資料不足時顯示資料累積中。</p>
  </section>`;
}
function parseChartData(value) { try { return JSON.parse(value ?? "{}"); } catch { return {}; } }
function termsSection(term, view) {
  return `<h3>債券條款</h3><dl class="detail-facts">${fact("發行日", term.issueDate)}${fact("掛牌日", term.listingDate)}${fact("到期日", term.maturityDate)}${fact("發行總額", term.issueAmount)}${fact("流通餘額", term.outstandingAmount ?? view.outstandingAmount)}${fact("轉換開始", term.conversionStartDate)}${fact("轉換截止", term.conversionEndDate)}${fact("發行轉換價", term.initialConversionPrice)}${fact("目前轉換價", view.currentConversionPrice)}${fact("賣回日期", Array.isArray(term.putDates) ? term.putDates.join("、") : null)}${fact("賣回價格", term.putPrice)}${fact("擔保", term.securedStatus)}</dl>${formulaDetails(view)}`;
}
function formulaDetails(view) { return `<details class="formula-details"><summary>展開公式與已驗證輸入值</summary><dl class="detail-facts">${fact("轉換價值", view.conversionValue)}${fact("轉換溢價", view.premiumRate)}${fact("剩餘單位", view.remainingUnits)}${fact("剩餘比例", view.remainingRatio)}${fact("週轉率", view.dailyTurnoverRate)}${fact("天數", view.daysToMaturity)}</dl><p>轉換價值與轉換溢價僅依同日公開欄位檢核；不同資料日維持待確認。</p></details>`; }
function institutionsSection(view, fieldStates = {}) {
  const unavailable = view.institutionNetUnits === null || view.institutionNetUnits === undefined;
  return `<h3>法人 1／5／20 日</h3><dl class="detail-facts">${fact("資料日", view.institutionDataDate)}${fact("資料狀態", fieldStates.institutions)}${fact("法人 1 日淨額", unavailable ? MISSING_WORDING : view.institutionNetUnits)}${fact("法人 5 日淨額", unavailable ? MISSING_WORDING : view.institutionNet5dUnits)}${fact("法人 20 日淨額", unavailable ? MISSING_WORDING : view.institutionNet20dUnits)}</dl>`;
}
function companySection(view, strategies, fieldStates = {}) {
  const company = view.issuerResearch;
  const financialChecks = (Array.isArray(strategies) ? strategies : []).find((item) => item.code === "equity_relative")?.checks ?? [];
  return `<h3>公司營運與公開財務</h3><dl class="detail-facts">${fact("營收月份", company?.revenueMonth)}${fact("發布日", company?.sourcePublishedOn)}${fact("營收單位", company?.revenueUnit)}${fact("當月營收", company?.currentMonthRevenue)}${fact("月增率", company?.monthOverMonthPercent)}${fact("年增率", company?.yearOverYearPercent)}${fact("累計營收", company?.cumulativeRevenue)}${fact("累計年增率", company?.cumulativeYearOverYearPercent)}${fact("資料狀態", fieldStates.company)}</dl><div class="public-financial-checks">${financialChecks.map(renderCheck).join("") || `<p>${MISSING_WORDING}</p>`}</div>`;
}
function eventsSection(events) {
  const values = Array.isArray(events) ? events : [];
  return `<h3>事件時間軸</h3><ol class="detail-event-timeline">${values.length ? values.map((event) => `<li><time>${text(event.date)}</time><strong>${text(event.title)}</strong><span>${text(event.type)} · ${text(event.sourceId)}</span>${sourceLink(event.sourceUrl, event.sourceId)}</li>`).join("") : `<li>${MISSING_WORDING}</li>`}</ol>`;
}
function sourceLink(value, sourceId) { const url = verifiedSnapshotUrl(value, sourceId); return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">已驗證公開來源</a>` : ""; }
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
function legacyAssessment(dataDate) {
  const dimensions = Object.keys(DIMENSION_LABELS).map((code) => legacySection(code));
  const strategies = Object.keys(STRATEGY_LABELS).map((code) => legacySection(code));
  return { dimensions, strategies };
  function legacySection(code) {
    return { code, state: "pending", checks: [{ code: `${code}_pending`, label: "公開資料條件檢核", state: "pending", actual: null, threshold: MISSING_WORDING, dataDate, sourceId: null, missingReason: "UNVERIFIED_WORKBENCH_SNAPSHOT" }] };
  }
}
function fact(label, value) { return `<div><dt>${text(label)}</dt><dd>${text(value ?? MISSING_WORDING)}</dd></div>`; }
function stateLabel(value) { return STATE_LABELS[value] ?? value ?? "pending"; }
function text(value) { return escapeHtml(value ?? MISSING_WORDING); }
