import { EVENT_TYPE_LABELS, isOfficialSourceUrl } from "./cb-workbench-v53.js";
import { CB_SECURED_VALUES, readValidatedCbConditions } from './cb-filter-state.js';
import { publicInstitutionName } from "./cb-workbench-ui.js";

const CB_DAILY_QUOTES_URL = "https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry";
const TWSE_DAILY_STOCK_CLOSE_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
const TPEX_DAILY_STOCK_CLOSE_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes";
const TPEX_CB_TERMS_URL = "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv";

export const CB_DETAIL_TABS = Object.freeze([
  ["overview", "交易概況"],
  ["terms", "條款與估值"],
  ["events", "權利事件"],
  ["company", "標的公司"],
]);

export function cbDatabaseReturnUrl(search = '') {
  const params = new URLSearchParams(search);
  if (params.get('from') !== 'database') return null;
  const list = new URLSearchParams(params.get('list') ?? '');
  const safe = new URLSearchParams();
  const q = list.get('q')?.trim().slice(0,200);
  if (q) safe.set('q',q);
  const quickFilter = list.get('quickFilter');
  if (['newIssue','lowPremium','nearConversion','rights90','maturity365','recentPut','recentRedemption','conversionSuspended'].includes(quickFilter)) safe.set('quickFilter',quickFilter);
  const view = list.get('view');
  if (['overview','quote','terms','period','events','liquidity'].includes(view)) safe.set('view',view);
  const sort = list.get('sort');
  if (['code','stockClose','conversionPrice','conversionValue','outstanding','remaining','close','volume','premium','maturity'].includes(sort)) {
    safe.set('sort',sort);
    if (list.get('direction') === 'desc') safe.set('direction','desc');
  }
  const secured = list.get('secured');
  if (CB_SECURED_VALUES.has(secured) && secured !== 'all') safe.set('secured', secured);
  for (const [key,value] of Object.entries(readValidatedCbConditions(list))) safe.set(key,value);
  return `./bonds-filter.html${safe.size ? `?${safe}` : ''}`;
}

export function renderCbDetailV53(record = {}, { companyBonds = [], rightsEvents = [], returnSearch = '' } = {}) {
  const code = text(record.cbCode);
  const name = text(record.cbName) || "—";
  const quote = record.quote ?? {};
  const terms = record.terms ?? {};
  const liquidity = record.liquidity ?? {};
  const siblings = arrayValue(companyBonds)
    .filter((item) => item?.status === "active" && text(item?.stockCode) === text(record.stockCode) && text(item?.cbCode) !== code)
    .sort((left, right) => text(left.cbCode).localeCompare(text(right.cbCode)));
  const returnLabel = cbDatabaseReturnUrl(returnSearch) ? '返回全部 CB' : '返回市場總覽';
  return `<header class="cb-detail-head"><div><p class="section-number">${escapeHtml(code)} · 可轉債</p><h2>${escapeHtml(name)}</h2><p>${escapeHtml(text(record.stockCode))} ${escapeHtml(text(record.companyName))}</p></div><button class="close-workbench" type="button" data-detail-close aria-label="${returnLabel}">← ${returnLabel}</button></header>
    ${summaryFacts(quote)}
    ${redemptionNotice(record.rights?.redemption, rightsEvents, code)}
    <nav class="detail-tabs cb-detail-tabs" aria-label="可轉債詳細資料分頁" role="tablist">${CB_DETAIL_TABS.map(([key, label], index) => tabButton(key, label, index === 0)).join("")}</nav>
    ${tabPanel("overview", overviewPanel(record) + (quote.tradeState === "NOT_YET_LISTED" ? '' : liquidityPanel(liquidity)))}
    ${tabPanel("terms", termsPanel(terms, quote.snapshotDataDate) + valuationPanel(record))}
    ${tabPanel("events", eventsPanel(record.events, rightsEvents, code))}
    ${tabPanel("company", companyContext(record, siblings))}
    ${sourceLinks(record)}
  `;
}

function summaryFacts(quote) {
  const cell = (label, value, stamp, prefix = '資料日') => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd><small>${escapeHtml(prefix)} ${escapeHtml(date(stamp))}</small></div>`;
  const notYetListed = quote.tradeState === "NOT_YET_LISTED";
  const historical = !notYetListed && (isNoTrade(quote) || quote.isLatestSnapshot === false);
  return `<dl class="cb-detail-summary" aria-label="可轉債核心數據">${
    cell(historical ? '最近成交價' : 'CB 收盤', notYetListed ? '尚未掛牌' : price(quote.cbClose), quote.dataDate)
  }${cell('標的股收盤', price(quote.stockClose), quote.stockPriceDate)}${
    cell('轉換價', price(quote.conversionPrice), quote.conversionPriceEffectiveDate, '生效日')
  }${cell('轉換價值', price(quote.stockConversionValue ?? quote.conversionValue), quote.stockConversionValueDate ?? quote.valuationDate, '計算日')}${
    cell('轉換溢價率', percent(quote.premiumRate), quote.valuationDate, '計算日')
  }${cell('當日成交量', quantity(quote.volume, '張'), quote.snapshotDataDate ?? quote.dataDate)}</dl>`;
}

function sourceLinks(record) {
  const quote = record.quote ?? {};
  const terms = record.terms ?? {};
  const sources = [];
  if (finite(quote.cbClose) !== null && isoDate(quote.dataDate)) {
    sources.push(sourceItem("CB 行情", CB_DAILY_QUOTES_URL, "TPEx 可轉債每日成交資訊", "資料日", quote.dataDate));
  }
  const stockUrl = record.market === "上市" ? TWSE_DAILY_STOCK_CLOSE_URL : record.market === "上櫃" ? TPEX_DAILY_STOCK_CLOSE_URL : null;
  const stockLabel = record.market === "上市" ? "TWSE 每日收盤資訊" : record.market === "上櫃" ? "TPEx 上櫃每日收盤資訊" : null;
  if (stockUrl && stockLabel && finite(quote.stockClose) !== null && isoDate(quote.stockPriceDate)) {
    sources.push(sourceItem("標的股行情", stockUrl, stockLabel, "資料日", quote.stockPriceDate));
  }
  const conversionSource = record.conversionPriceSource;
  if (conversionSource && conversionSource.effectiveDate === quote.conversionPriceEffectiveDate && finite(quote.conversionPrice) !== null && isoDate(conversionSource.effectiveDate) && isOfficialSourceUrl(conversionSource.sourceUrl)) {
    sources.push(sourceItem("轉換價來源", conversionSource.sourceUrl, "公開資訊觀測站", "生效日", conversionSource.effectiveDate));
  }
  if (isoDate(terms.officialDataDate)) {
    sources.push(sourceItem("發行條款", TPEX_CB_TERMS_URL, "TPEx 債券基本資料", "資料日", terms.officialDataDate));
  }
  return sources.length ? `<section class="cb-detail-sources" aria-label="資料來源"><strong>資料來源</strong>${sources.join("")}</section>` : '';
}

function sourceItem(label, url, sourceName, dateLabel, stamp) {
  if (!isOfficialSourceUrl(url) || !isoDate(stamp)) return "";
  return `<span class="cb-detail-source-item"><span>${escapeHtml(label)}</span><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceName)}</a><small>${escapeHtml(dateLabel)} ${escapeHtml(date(stamp))}</small></span>`;
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

export function bindCbDetailV53(target, onClose, { matchMedia = globalThis.matchMedia?.bind(globalThis) } = {}) {
  const close = target.querySelector("[data-detail-close]");
  close?.addEventListener("click", onClose);
  close?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onClose();
  });
  for (const button of target.querySelectorAll("[data-cb-detail-tab]")) {
    button.addEventListener("click", () => activateTab(target, button.dataset.cbDetailTab));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...target.querySelectorAll('[data-cb-detail-tab]')];
      const index = buttons.indexOf(button);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      activateTab(target, buttons[next].dataset.cbDetailTab);
      buttons[next].focus();
    });
  }
  const media = matchMedia?.("(max-width: 900px)") ?? null;
  const syncResponsiveMode = (event) => syncCbDetailResponsiveMode(target, { compact: Boolean(event?.matches ?? media?.matches) });
  syncResponsiveMode(media);
  if (typeof media?.addEventListener === "function") media.addEventListener("change", syncResponsiveMode);
  else media?.addListener?.(syncResponsiveMode);
  return () => {
    if (typeof media?.removeEventListener === "function") media.removeEventListener("change", syncResponsiveMode);
    else media?.removeListener?.(syncResponsiveMode);
  };
}

function activateTab(target, tab) {
  for (const button of target.querySelectorAll("[data-cb-detail-tab]")) {
    const selected = button.dataset.cbDetailTab === tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  syncCbDetailResponsiveMode(target, { compact: target.dataset.cbDetailCompact === "true" });
}

export function syncCbDetailResponsiveMode(target, { compact = false } = {}) {
  const selected = [...target.querySelectorAll("[data-cb-detail-tab]")]
    .find((button) => button.getAttribute("aria-selected") === "true")?.dataset.cbDetailTab ?? "overview";
  target.dataset.cbDetailCompact = String(Boolean(compact));
  for (const panel of target.querySelectorAll("[data-cb-detail-panel]")) {
    panel.hidden = panel.dataset.cbDetailPanel !== selected;
  }
}

function tabButton(key, label, selected) {
  return `<button id="cb-detail-tab-${key}" type="button" role="tab" data-cb-detail-tab="${key}" aria-controls="cb-detail-${key}" aria-selected="${selected}"${selected ? "" : ' tabindex="-1"'}>${label}</button>`;
}

function tabPanel(key, content) {
  return `<section id="cb-detail-${key}" class="cb-detail-panel" data-cb-detail-panel="${key}" role="tabpanel" aria-labelledby="cb-detail-tab-${key}" tabindex="0"${key === "overview" ? "" : " hidden"}>${content}</section>`;
}

function overviewPanel(record) {
  const quote = record.quote ?? {};
  const noTrade = isNoTrade(quote);
  const tradeFacts = noTrade
    ? `${fact("最後成交日", date(quote.lastTradeDate ?? quote.dataDate))}${fact("最後成交價", price(quote.lastPrice ?? quote.cbClose))}${fact("最後成交量", quantity(quote.lastVolume, "張"))}`
    : '';
  return `<h3>盤後交易</h3><dl class="detail-facts cb-detail-facts">${fact("交易狀態", tradeLabel(quote))}${fact("交易日期", date(quote.snapshotDataDate ?? quote.dataDate))}${fact("成交金額", amount(quote.turnoverAmount))}${tradeFacts}</dl>`;
}

function valuationPanel(record) {
  const quote = record?.quote ?? {};
  const history = arrayValue(record?.conversionPriceHistory)
    .filter((entry) => isoDate(entry?.effectiveDate) && isOfficialSourceUrl(entry?.sourceUrl))
    .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate));
  const historyHtml = history.length === 0
    ? ""
    : `<section class="cb-conversion-history"><h4>轉換價歷程</h4><div class="table-scroll"><table><thead><tr><th>生效日</th><th>原轉換價</th><th>新轉換價</th><th>變動類型</th><th>來源</th></tr></thead><tbody>${history.map((entry) => `<tr><td>${escapeHtml(date(entry.effectiveDate))}</td><td>${escapeHtml(price(entry.previousConversionPrice))}</td><td>${escapeHtml(price(entry.currentConversionPrice))}</td><td>${escapeHtml(text(entry.changeType) || "轉換價調整")}</td><td><a href="${escapeHtml(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方公告</a></td></tr>`).join("")}</tbody></table></div></section>`;
  return `<h3>估值</h3><dl class="detail-facts cb-detail-facts">${fact("目前轉換價", price(quote.conversionPrice))}${fact("轉換價生效日", date(quote.conversionPriceEffectiveDate))}${fact("轉換價值", price(quote.stockConversionValue ?? quote.conversionValue))}${fact("轉換價值計算日", date(quote.stockConversionValueDate ?? quote.valuationDate))}${fact("轉換溢價", percent(quote.premiumRate))}${fact("溢價計算日", date(quote.valuationDate))}</dl><p class="field-note">轉換價值＝標的股收盤價 ÷ 有效轉換價 × 100；溢價率僅使用同日股價與 CB 成交價計算。</p>${historyHtml}`;
}

function liquidityPanel(liquidity) {
  return `<h3>成交量統計</h3><dl class="detail-facts cb-detail-facts">${fact("近 5 筆平均成交量", quantity(liquidity.average5, "張"))}${fact("近 20 筆平均成交量", quantity(liquidity.average20, "張"))}${fact("本週成交量（已收錄）", quantity(liquidity.weekVolume, "張"))}${fact("近 20 筆有成交天數", quantity(liquidity.tradedDays20, "日"))}</dl>`;
}

function isNoTrade(quote) {
  return quote?.tradeState === "NO_TRADE_TODAY" || quote?.tradeState === "no_trade";
}

function tradeLabel(quote) {
  if (quote?.tradeState === "NOT_YET_LISTED") return "尚未掛牌";
  if (quote?.tradeState === "TRADED_TODAY" || quote?.tradeState === "traded") return "當日有成交";
  if (isNoTrade(quote)) return "當日無成交";
  return quote?.tradeState === "DATA_ERROR" ? "資料暫時無法取得" : "—";
}

function termsPanel(terms, dataDate) {
  const putDates = arrayValue(terms.putDates).map(date).filter((value) => value !== "—").join("、") || "—";
  const coupon = text(terms.couponRate);
  const extra = [
    ['票面利率', coupon ? finite(coupon.replace(/%$/, '')) === null ? coupon : `${numberFormat(Number(coupon.replace(/%$/, '')))}%` : '—'],
    ['發行時轉換價', price(terms.initialConversionPrice)],
    ['擔保說明', text(terms.securityDescription) || '—'],
    ['募集方式', text(terms.offeringMethod) || '—'],
    ['最近餘額異動日', date(terms.outstandingChangeDate)],
    ['餘額異動原因', text(terms.outstandingChangeReason) || '—'],
  ].filter(([,value]) => value !== '—').map(([label,value]) => fact(label,value)).join('');
  return `<h3>發行條款</h3><dl class="detail-facts cb-detail-facts">${fact(isoDate(dataDate) && isoDate(terms.issueDate) > dataDate ? "預定發行日" : "發行日", date(terms.issueDate))}${fact(isoDate(dataDate) && isoDate(terms.listingDate) > dataDate ? "預定掛牌日" : "掛牌日", date(terms.listingDate))}${fact("到期日", date(terms.maturityDate))}${fact("發行總額", amount(terms.issueAmount))}${fact("流通餘額", amount(terms.outstandingAmount))}${fact("餘額資料日", date(terms.outstandingDataDate))}${fact("剩餘比率", percent(terms.remainingRatio))}${fact("擔保狀態", text(terms.securedStatus) || "—")}${fact("承銷商", publicInstitutionName(terms.underwriter))}${fact("受託機構", publicInstitutionName(terms.trustee))}${fact("轉換期間", dateRange(terms.conversionStartDate, terms.conversionEndDate))}${fact("賣回日", putDates)}${fact("賣回價格", price(terms.putPrice))}${extra}${fact('條款資料日', date(terms.officialDataDate ?? terms.outstandingDataDate))}</dl>`;
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
  return `<h3>事件</h3><ol class="detail-event-timeline">${rows.map((event) => `<li><time>${escapeHtml(date(event.date))}</time><strong>${escapeHtml(event.label ?? EVENT_TYPE_LABELS[event.type] ?? "公開事件")}</strong>${event.status ? `<span>${escapeHtml(statusLabel(event.status))}</span>` : ""}${event.title ? `<span>${escapeHtml(event.title)}</span>` : ""}<a href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方公告</a></li>`).join("")}</ol>`;
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
    ? `<section class="cb-company-bonds"><h4>同公司 CB 比較</h4><ol>${siblings.map(companyBondComparison).join("")}</ol></section>`
    : "";
  return `<section class="cb-company-context"><h3>標的公司資料</h3><dl class="detail-facts cb-detail-facts">${fact("公司", text(record.companyName) || "—")}${fact("股票代碼", text(record.stockCode) || "—")}${fact("市場", text(record.market) || "—")}${fact("產業", text(record.industry) || "—")}</dl><p class="field-note">此處為標的股票與發行公司資料；不與 CB 成交量或 CB 法人交易混用。</p>${companyUrl ? `<p><a class="cb-company-link" href="${companyUrl}">前往公司研究頁 →</a></p>` : ""}${related}</section>`;
}

function companyBondComparison(bond) {
  const quote = bond.quote ?? {};
  const terms = bond.terms ?? {};
  const identity = `${text(bond.cbCode)} ${text(bond.cbName) || "—"}`;
  return `<li class="cb-company-bond-card"><a href="./bonds.html?bond=${encodeURIComponent(bond.cbCode)}" aria-label="${escapeHtml(identity)}"><strong>${escapeHtml(text(bond.cbCode))}</strong><span>${escapeHtml(text(bond.cbName) || "—")}</span></a><dl>${datedComparisonFact("CB 收盤", price(quote.cbClose), quote.dataDate)}${datedComparisonFact("轉換溢價率", percent(quote.premiumRate), quote.valuationDate)}${datedComparisonFact("到期日", date(terms.maturityDate), terms.maturityDate, "日期")}</dl></li>`;
}

function datedComparisonFact(label, value, stamp, prefix = "資料日") {
  const dateLabel = date(stamp);
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>${dateLabel === "—" ? "" : `<small>${escapeHtml(prefix)} ${escapeHtml(dateLabel)}</small>`}</div>`;
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
