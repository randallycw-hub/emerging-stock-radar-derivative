import { EVENT_TYPE_LABELS, isOfficialSourceUrl } from "./cb-workbench-v53.js";

export const CB_DETAIL_TABS = Object.freeze([
  ["quote", "行情"],
  ["liquidity", "流動性"],
  ["terms", "條款"],
  ["events", "事件"],
  ["company", "公司"],
]);

export function renderCbDetailV53(record = {}, { companyBonds = [] } = {}) {
  const code = text(record.cbCode);
  const name = text(record.cbName) || "—";
  const quote = record.quote ?? {};
  const terms = record.terms ?? {};
  const liquidity = record.liquidity ?? {};
  const siblings = arrayValue(companyBonds)
    .filter((item) => item?.status === "active" && text(item?.stockCode) === text(record.stockCode) && text(item?.cbCode) !== code)
    .sort((left, right) => text(left.cbCode).localeCompare(text(right.cbCode)));
  return `<header class="cb-detail-head"><div><p class="section-number">${escapeHtml(code)} / CB WORKBENCH</p><h2>${escapeHtml(name)}</h2><p>${escapeHtml(text(record.stockCode))} ${escapeHtml(text(record.companyName))}</p></div><button class="close-workbench" type="button" data-detail-close aria-label="返回可轉債市場總覽">← 返回市場總覽</button></header>
    <nav class="detail-tabs cb-detail-tabs" aria-label="可轉債詳細資料分頁" role="tablist">${CB_DETAIL_TABS.map(([key, label], index) => tabButton(key, label, index === 0)).join("")}</nav>
    ${tabPanel("quote", quotePanel(quote))}
    ${tabPanel("liquidity", liquidityPanel(quote, liquidity))}
    ${tabPanel("terms", termsPanel(terms))}
    ${tabPanel("events", eventsPanel(record.events))}
    ${tabPanel("company", companyPanel(record, siblings))}`;
}

export function bindCbDetailV53(target, onClose) {
  const close = target.querySelector("[data-detail-close]");
  close?.addEventListener("click", onClose);
  for (const button of target.querySelectorAll("[data-cb-detail-tab]")) {
    button.addEventListener("click", () => activateTab(target, button.dataset.cbDetailTab));
  }
  return () => {};
}

function activateTab(target, tab) {
  for (const button of target.querySelectorAll("[data-cb-detail-tab]")) {
    const selected = button.dataset.cbDetailTab === tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  for (const panel of target.querySelectorAll("[data-cb-detail-panel]")) panel.hidden = panel.dataset.cbDetailPanel !== tab;
}

function tabButton(key, label, selected) {
  return `<button type="button" role="tab" data-cb-detail-tab="${key}" aria-controls="cb-detail-${key}" aria-selected="${selected}"${selected ? "" : ' tabindex="-1"'}>${label}</button>`;
}

function tabPanel(key, content) {
  return `<section id="cb-detail-${key}" class="cb-detail-panel" data-cb-detail-panel="${key}" role="tabpanel"${key === "quote" ? "" : " hidden"}>${content}</section>`;
}

function quotePanel(quote) {
  return `<h3>行情</h3><dl class="detail-facts cb-detail-facts">${fact("CB 收盤", price(quote.cbClose))}${fact("標的股收盤", price(quote.stockClose))}${fact("目前轉換價", price(quote.conversionPrice))}${fact("轉換價值", price(quote.conversionValue))}${fact("轉換溢價", percent(quote.premiumRate))}${fact("資料日", date(quote.dataDate))}</dl>`;
}

function liquidityPanel(quote, liquidity) {
  const trade = quote.tradeState === "no_trade" ? "今日無成交" : quote.tradeState === "unavailable" ? "—" : "今日有成交";
  return `<h3>流動性</h3><dl class="detail-facts cb-detail-facts">${fact("交易狀態", trade)}${fact("成交量", quantity(quote.volume, "張"))}${fact("成交額", amount(quote.turnoverAmount))}${fact("5 日平均成交量", quantity(liquidity.average5, "張"))}${fact("20 日平均成交量", quantity(liquidity.average20, "張"))}${fact("本週成交量", quantity(liquidity.weekVolume, "張"))}${fact("近 20 日成交天數", quantity(liquidity.tradedDays20, "日"))}</dl>`;
}

function termsPanel(terms) {
  const putDates = arrayValue(terms.putDates).map(date).filter((value) => value !== "—").join("、") || "—";
  return `<h3>條款</h3><dl class="detail-facts cb-detail-facts">${fact("發行日", date(terms.issueDate))}${fact("掛牌日", date(terms.listingDate))}${fact("到期日", date(terms.maturityDate))}${fact("發行總額", amount(terms.issueAmount))}${fact("流通餘額", amount(terms.outstandingAmount))}${fact("餘額資料日", date(terms.outstandingDataDate))}${fact("流通餘額比例", percent(terms.remainingRatio))}${fact("擔保", text(terms.securedStatus) || "—")}${fact("承銷機構", text(terms.underwriter) || "—")}${fact("受託人", text(terms.trustee) || "—")}${fact("轉換期間", dateRange(terms.conversionStartDate, terms.conversionEndDate))}${fact("賣回日", putDates)}${fact("賣回價格", price(terms.putPrice))}</dl>`;
}

function eventsPanel(events) {
  const rows = arrayValue(events).filter((event) => isOfficialSourceUrl(event?.sourceUrl));
  if (!rows.length) return "<h3>事件</h3><p class=\"empty-state\">目前沒有已公布的可轉債事件。</p>";
  return `<h3>事件</h3><ol class="detail-event-timeline">${rows.map((event) => `<li><time>${escapeHtml(date(event.date))}</time><strong>${escapeHtml(event.label ?? EVENT_TYPE_LABELS[event.type] ?? "公開事件")}</strong>${event.title ? `<span>${escapeHtml(event.title)}</span>` : ""}<a href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方公告</a></li>`).join("")}</ol>`;
}

function companyPanel(record, siblings) {
  const companyUrl = text(record.stockCode) ? `./company.html?code=${encodeURIComponent(record.stockCode)}` : null;
  const related = siblings.length
    ? `<section class="cb-company-bonds"><h4>同公司其他 CB</h4><ol>${siblings.map((bond) => `<li><a href="./bonds.html?bond=${encodeURIComponent(bond.cbCode)}">${escapeHtml(bond.cbCode)} ${escapeHtml(bond.cbName)}</a></li>`).join("")}</ol></section>`
    : "";
  return `<h3>公司</h3><dl class="detail-facts cb-detail-facts">${fact("公司", text(record.companyName) || "—")}${fact("股票代碼", text(record.stockCode) || "—")}${fact("市場", text(record.market) || "—")}${fact("產業", text(record.industry) || "—")}</dl>${companyUrl ? `<p><a class="cb-company-link" href="${companyUrl}">前往公司研究頁 →</a></p>` : ""}${related}`;
}

function fact(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function price(value) {
  const number = finite(value);
  return number === null ? "—" : `${numberFormat(number)} 元`;
}

function amount(value) {
  const number = finite(value);
  return number === null ? "—" : `${numberFormat(number)} 元`;
}

function quantity(value, unit) {
  const number = finite(value);
  return number === null ? "—" : `${numberFormat(number)} ${unit}`;
}

function percent(value) {
  const number = finite(value);
  return number === null ? "—" : `${number.toFixed(2)}%`;
}

function date(value) {
  return isoDate(value)?.replaceAll("-", "/") ?? "—";
}

function dateRange(start, end) {
  const left = date(start);
  const right = date(end);
  return left === "—" && right === "—" ? "—" : `${left} 至 ${right}`;
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberFormat(value) {
  return new Intl.NumberFormat("zh-Hant-TW", { maximumFractionDigits: 2 }).format(value);
}

function isoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return null;
  const result = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value ? null : value;
}

function text(value) {
  return String(value ?? "").trim();
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}
