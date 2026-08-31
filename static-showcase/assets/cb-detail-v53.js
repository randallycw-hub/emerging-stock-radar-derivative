import { EVENT_TYPE_LABELS, isOfficialSourceUrl } from "./cb-workbench-v53.js";
import { chartDataState, mountLightweightCbChart } from "./lightweight-charts-adapter.js";

export const CB_DETAIL_TABS = Object.freeze([
  ["overview", "概況"],
  ["valuation", "估值"],
  ["liquidity", "流動性"],
  ["terms", "條款"],
  ["period", "期間"],
  ["events", "事件"],
]);

export function renderCbDetailV53(record = {}, { companyBonds = [], rightsEvents = [], history = [] } = {}) {
  const code = text(record.cbCode);
  const name = text(record.cbName) || "—";
  const quote = record.quote ?? {};
  const terms = record.terms ?? {};
  const liquidity = record.liquidity ?? {};
  const siblings = arrayValue(companyBonds)
    .filter((item) => item?.status === "active" && text(item?.stockCode) === text(record.stockCode) && text(item?.cbCode) !== code)
    .sort((left, right) => text(left.cbCode).localeCompare(text(right.cbCode)));
  return `<header class="cb-detail-head"><div><p class="section-number">${escapeHtml(code)} / CB WORKBENCH</p><h2>${escapeHtml(name)}</h2><p>${escapeHtml(text(record.stockCode))} ${escapeHtml(text(record.companyName))}</p></div><button class="close-workbench" type="button" data-detail-close aria-label="返回可轉債市場總覽">← 返回市場總覽</button></header>
    ${redemptionNotice(record.rights?.redemption, rightsEvents, code)}
    <nav class="detail-tabs cb-detail-tabs" aria-label="可轉債詳細資料分頁" role="tablist">${CB_DETAIL_TABS.map(([key, label], index) => tabButton(key, label, index === 0)).join("")}</nav>
    ${tabPanel("overview", overviewPanel(record, history, siblings))}
    ${tabPanel("valuation", valuationPanel(record))}
    ${tabPanel("liquidity", liquidityPanel(quote, liquidity))}
    ${tabPanel("terms", termsPanel(terms))}
    ${tabPanel("period", periodPanel(terms, quote))}
    ${tabPanel("events", eventsPanel(record.events, rightsEvents, code))}
  `;
}

function redemptionNotice(right, rightsEvents, cbCode) {
  const active = arrayValue(rightsEvents)
    .filter((event) => event?.marketScope === "cb" && text(event?.cbCode) === cbCode && event?.eventType === "early_redemption" && ["active", "deadline_soon"].includes(text(event?.status)) && isOfficialSourceUrl(event?.sourceUrl))
    .sort((left, right) => primaryEventDate(left).localeCompare(primaryEventDate(right)))[0] ?? null;
  if (active) return redemptionEventNotice(active);
  if (!right || !isOfficialSourceUrl(right.sourceUrl) || !isoDate(right.announcementDate)) return "";
  const facts = [
    ["公告日", date(right.announcementDate)],
    ["最後交易日", date(right.lastTradingDate)],
    ["贖回日", date(right.redemptionDate)],
    ["贖回價格", price(right.redemptionPrice)],
    ["流通餘額", amount(right.outstandingBalance)],
  ].filter(([, value]) => value !== "—");
  return `<aside class="cb-redemption-notice" role="note"><h3>提前贖回公告</h3>${right.summary ? `<p>${escapeHtml(right.summary)}</p>` : ""}${facts.length ? `<dl class="detail-facts cb-detail-facts">${facts.map(([label, value]) => fact(label, value)).join("")}</dl>` : ""}<p><a href="${escapeHtml(right.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看官方公告</a></p></aside>`;
}

function redemptionEventNotice(event) {
  const details = event?.eventDetails ?? {};
  const facts = [
    ["公告日", date(event.announcementDate)],
    ["受理期間", dateRange(event.startDate, event.endDate)],
    ["最後轉換日", date(event.lastConversionDate)],
    ["收回基準日", date(event.recordDate)],
    ["最後交易日", date(event.lastTradingDate)],
    ["收回價格", price(event.price)],
    ["收回比例", percent(details.redemptionPricePercent)],
  ].filter(([, value]) => value !== "—");
  return `<aside class="cb-redemption-notice is-${escapeHtml(text(event.status))}" role="alert"><h3>提前贖回${escapeHtml(statusLabel(event.status))}</h3>${event.reason ? `<p>${escapeHtml(event.reason)}</p>` : ""}${facts.length ? `<dl class="detail-facts cb-detail-facts">${facts.map(([label, value]) => fact(label, value)).join("")}</dl>` : ""}<p><a href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看官方公告</a></p></aside>`;
}

export function bindCbDetailV53(target, onClose, { history = [], events = [] } = {}) {
  const close = target.querySelector("[data-detail-close]");
  close?.addEventListener("click", onClose);
  close?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onClose();
  });
  for (const button of target.querySelectorAll("[data-cb-detail-tab]")) {
    button.addEventListener("click", () => activateTab(target, button.dataset.cbDetailTab));
  }
  let disposed = false;
  let chart = null;
  const host = target.querySelector("[data-cb-lightweight-chart]");
  if (host) {
    mountLightweightCbChart(host, { candles: history, events }).then((mounted) => {
      if (disposed) mounted.dispose();
      else chart = mounted;
    });
  }
  for (const item of target.querySelectorAll("[data-cb-chart-event-date]")) {
    item.addEventListener("click", () => {
      activateTab(target, "overview");
      chart?.focusDate(item.dataset.cbChartEventDate);
    });
  }
  return () => {
    disposed = true;
    chart?.dispose();
  };
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
  return `<section id="cb-detail-${key}" class="cb-detail-panel" data-cb-detail-panel="${key}" role="tabpanel"${key === "overview" ? "" : " hidden"}>${content}</section>`;
}

function overviewPanel(record, history, siblings) {
  const quote = record.quote ?? {};
  const chart = chartDataState(history) === "ready"
    ? `<section class="cb-lightweight-chart"><header><h3>價格與成交量</h3><p>僅使用已驗證的官方 OHLCV；紅漲綠跌。</p></header><div data-cb-lightweight-chart aria-label="${escapeHtml(text(record.cbCode))} K 線與成交量圖"></div></section>`
    : '<p class="empty-state">目前沒有足夠的已驗證 OHLCV 資料可繪製 K 線。</p>';
  const noTrade = isNoTrade(quote);
  const tradeFacts = noTrade
    ? `${fact("最後成交日", date(quote.lastTradeDate ?? quote.dataDate))}${fact("最後成交價", price(quote.lastPrice ?? quote.cbClose))}${fact("最後成交量", quantity(quote.lastVolume, "張"))}`
    : fact("CB 收盤", price(quote.cbClose));
  return `<h3>概況</h3><dl class="detail-facts cb-detail-facts">${fact("交易狀態", tradeLabel(quote))}${fact("市場快照日", date(quote.snapshotDataDate ?? quote.dataDate))}${tradeFacts}${fact("標的股收盤", price(quote.stockClose))}</dl>${chart}${companyContext(record, siblings)}`;
}

function valuationPanel(record) {
  const quote = record?.quote ?? {};
  const history = arrayValue(record?.conversionPriceHistory)
    .filter((entry) => isoDate(entry?.effectiveDate) && isOfficialSourceUrl(entry?.sourceUrl))
    .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate));
  const historyHtml = history.length === 0
    ? ""
    : `<section class="cb-conversion-history"><h4>轉換價歷程</h4><div class="table-scroll"><table><thead><tr><th>生效日</th><th>原轉換價</th><th>新轉換價</th><th>變動類型</th><th>來源</th></tr></thead><tbody>${history.map((entry) => `<tr><td>${escapeHtml(date(entry.effectiveDate))}</td><td>${escapeHtml(price(entry.previousConversionPrice))}</td><td>${escapeHtml(price(entry.currentConversionPrice))}</td><td>${escapeHtml(text(entry.changeType) || "轉換價調整")}</td><td><a href="${escapeHtml(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方公告</a></td></tr>`).join("")}</tbody></table></div></section>`;
  return `<h3>估值</h3><dl class="detail-facts cb-detail-facts">${fact("目前轉換價", price(quote.conversionPrice))}${fact("轉換價值", price(quote.conversionValue))}${fact("轉換溢價", percent(quote.premiumRate))}${fact("資料日", date(quote.dataDate))}</dl>${historyHtml}`;
}

function liquidityPanel(quote, liquidity) {
  const lastTradeFacts = isNoTrade(quote)
    ? `${fact("最後成交日", date(quote.lastTradeDate ?? quote.dataDate))}${fact("最後成交價", price(quote.lastPrice ?? quote.cbClose))}${fact("最後成交量", quantity(quote.lastVolume, "張"))}`
    : "";
  return `<h3>流動性</h3><dl class="detail-facts cb-detail-facts">${fact("交易狀態", tradeLabel(quote))}${fact("今日成交量", quantity(quote.volume, "張"))}${fact("今日成交額", amount(quote.turnoverAmount))}${lastTradeFacts}${fact("5 日平均成交量", quantity(liquidity.average5, "張"))}${fact("20 日平均成交量", quantity(liquidity.average20, "張"))}${fact("本週成交量", quantity(liquidity.weekVolume, "張"))}${fact("近 20 交易日有成交", quantity(liquidity.tradedDays20, "日"))}</dl>`;
}

function isNoTrade(quote) {
  return quote?.tradeState === "NO_TRADE_TODAY" || quote?.tradeState === "no_trade";
}

function tradeLabel(quote) {
  if (quote?.tradeState === "TRADED_TODAY" || quote?.tradeState === "traded") return "今日有成交";
  if (isNoTrade(quote)) return "今日無成交";
  return quote?.tradeState === "DATA_ERROR" ? "資料暫時無法取得" : "—";
}

function termsPanel(terms) {
  const putDates = arrayValue(terms.putDates).map(date).filter((value) => value !== "—").join("、") || "—";
  return `<h3>條款</h3><dl class="detail-facts cb-detail-facts">${fact("發行日", date(terms.issueDate))}${fact("掛牌日", date(terms.listingDate))}${fact("到期日", date(terms.maturityDate))}${fact("發行總額", amount(terms.issueAmount))}${fact("流通餘額", amount(terms.outstandingAmount))}${fact("餘額資料日", date(terms.outstandingDataDate))}${fact("流通餘額比例", percent(terms.remainingRatio))}${fact("擔保", text(terms.securedStatus) || "—")}${fact("承銷機構", text(terms.underwriter) || "—")}${fact("受託人", text(terms.trustee) || "—")}${fact("轉換期間", dateRange(terms.conversionStartDate, terms.conversionEndDate))}${fact("賣回日", putDates)}${fact("賣回價格", price(terms.putPrice))}</dl>`;
}

function periodPanel(terms, quote) {
  return `<h3>期間</h3><dl class="detail-facts cb-detail-facts">${fact("發行日", date(terms.issueDate))}${fact("掛牌日", date(terms.listingDate))}${fact("到期日", date(terms.maturityDate))}${fact("轉換期間", dateRange(terms.conversionStartDate, terms.conversionEndDate))}${fact("資料日", date(quote.dataDate))}</dl>`;
}

function eventsPanel(events, rightsEvents, cbCode) {
  const canonical = arrayValue(rightsEvents)
    .filter((event) => event?.marketScope === "cb" && text(event?.cbCode) === cbCode && isOfficialSourceUrl(event?.sourceUrl))
    .map((event) => ({
      id: text(event.eventId),
      date: primaryEventDate(event),
      label: canonicalEventLabel(event.eventType),
      title: text(event.title) || null,
      status: text(event.status),
      sourceUrl: event.sourceUrl,
    }))
    .filter((event) => event.id && isoDate(event.date));
  const knownTypes = new Set(canonical.map((event) => `${event.date}:${event.label}`));
  const legacy = arrayValue(events)
    .filter((event) => isOfficialSourceUrl(event?.sourceUrl))
    .map((event) => ({ ...event, status: "" }))
    .filter((event) => !knownTypes.has(`${event.date}:${event.label ?? EVENT_TYPE_LABELS[event.type] ?? "公開事件"}`));
  const rows = [...canonical, ...legacy].sort((left, right) => String(left.date).localeCompare(String(right.date)) || String(left.label).localeCompare(String(right.label)));
  if (!rows.length) return "<h3>事件</h3><p class=\"empty-state\">目前沒有已公布的可轉債事件。</p>";
  return `<h3>事件</h3><ol class="detail-event-timeline">${rows.map((event) => `<li data-cb-chart-event-date="${escapeHtml(event.date)}"><time>${escapeHtml(date(event.date))}</time><strong>${escapeHtml(event.label ?? EVENT_TYPE_LABELS[event.type] ?? "公開事件")}</strong>${event.status ? `<span>${escapeHtml(statusLabel(event.status))}</span>` : ""}${event.title ? `<span>${escapeHtml(event.title)}</span>` : ""}<a href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方公告</a></li>`).join("")}</ol>`;
}

function primaryEventDate(event) {
  return isoDate(event?.deadlineDate) ?? isoDate(event?.effectiveDate) ?? isoDate(event?.startDate) ?? isoDate(event?.endDate) ?? isoDate(event?.announcementDate) ?? "";
}

function canonicalEventLabel(type) {
  return ({
    early_redemption: "提前贖回",
    suspension: "停止轉換",
    put: "賣回",
    maturity: "到期",
    conversion_price_adjustment: "轉換價調整",
    listing: "掛牌",
  })[text(type)] ?? "公開事件";
}

function statusLabel(status) {
  return ({ active: "進行中", deadline_soon: "（期限將近）", upcoming: "（即將發生）", completed: "（已完成）" })[text(status)] ?? "";
}

function companyContext(record, siblings) {
  const companyUrl = text(record.stockCode) ? `./company.html?code=${encodeURIComponent(record.stockCode)}` : null;
  const related = siblings.length
    ? `<section class="cb-company-bonds"><h4>同公司其他 CB</h4><ol>${siblings.map((bond) => `<li><a href="./bonds.html?bond=${encodeURIComponent(bond.cbCode)}">${escapeHtml(bond.cbCode)} ${escapeHtml(bond.cbName)}</a></li>`).join("")}</ol></section>`
    : "";
  return `<section class="cb-company-context"><h3>公司關聯</h3><dl class="detail-facts cb-detail-facts">${fact("公司", text(record.companyName) || "—")}${fact("股票代碼", text(record.stockCode) || "—")}${fact("市場", text(record.market) || "—")}${fact("產業", text(record.industry) || "—")}</dl>${companyUrl ? `<p><a class="cb-company-link" href="${companyUrl}">前往公司研究頁 →</a></p>` : ""}${related}</section>`;
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
