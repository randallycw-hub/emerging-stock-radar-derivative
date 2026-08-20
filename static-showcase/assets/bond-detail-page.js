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
    ${mobileArea("K 線圖", "overview", candleSection())}
    ${mobileArea("債券條款", "terms", termsSection(term, view))}
    ${mobileArea("法人 1／5／20 日", "institutions", institutionsSection(view, record?.fieldStates))}
    ${mobileArea("公司營運與公開財務", "company", companySection(view, assessment.strategies, record?.fieldStates))}
    ${mobileArea("事件時間軸", "terms", eventsSection(record?.events))}`;
  const violations = noAdviceViolations(html);
  if (violations.length) throw new Error(`detail UI contains prohibited content: ${violations.join(", ")}`);
  return html;
}

export function bindBondDetail(target, onClose) {
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
}

function tabButton(id, label, selected = false) { return `<button type="button" role="tab" data-detail-tab="${id}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}">${label}</button>`; }
function mobileArea(label, tab, content) { return `<details class="detail-mobile-area" open><summary>${text(label)}</summary><section class="bond-detail-section" data-detail-panel="${tab}" aria-label="${text(label)}">${content}</section></details>`; }
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
function candleSection() { return `<h3>K 線圖</h3><div id="bond-candlestick" class="bond-candlestick" role="img" aria-label="可轉債 K 線圖容器"><p>僅呈現已驗證 OHLC 資料；目前沒有可呈現的 K 線資料時不插補。</p></div>`; }
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
  return `<h3>事件時間軸</h3><ol class="detail-event-timeline">${values.length ? values.map((event) => `<li><time>${text(event.date)}</time><strong>${text(event.title)}</strong><span>${text(event.type)} · ${text(event.sourceId)}</span>${sourceLink(event.sourceUrl)}</li>`).join("") : `<li>${MISSING_WORDING}</li>`}</ol>`;
}
function sourceLink(value) { const url = verifiedHttpsUrl(value); return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">已驗證公開來源</a>` : ""; }
function verifiedHttpsUrl(value) { try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; } catch { return null; } }
function fact(label, value) { return `<div><dt>${text(label)}</dt><dd>${text(value ?? MISSING_WORDING)}</dd></div>`; }
function stateLabel(value) { return STATE_LABELS[value] ?? value ?? "pending"; }
function text(value) { return escapeHtml(value ?? MISSING_WORDING); }
