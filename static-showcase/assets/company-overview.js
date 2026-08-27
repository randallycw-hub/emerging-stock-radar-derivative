function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function publicText(value) {
  const normalized = text(value);
  return normalized && normalized !== "-" ? normalized : null;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function display(value) {
  return publicText(value) ?? "—";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

export function formatCompanyNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("zh-Hant-TW", { maximumFractionDigits: 2 }).format(number) : "—";
}

export function formatCompanyPercent(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}%` : "—";
}

function formatDate(value) {
  const date = publicText(value);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.replaceAll("-", "/") : "—";
}

export function parseCompanyCode(value) {
  const code = text(value);
  return /^\d{4}$/.test(code) ? code : null;
}

function exactCompanyRecord(records, code) {
  return arrayValue(records).find((record) => text(record?.companyCode) === code) ?? null;
}

function revenueRecord(records, code) {
  return arrayValue(records)
    .filter((record) => text(record?.["公司代號"]) === code)
    .sort((left, right) => text(right?.["資料年月"]).localeCompare(text(left?.["資料年月"])))[0] ?? null;
}

function exactBondRecords(records, code) {
  return arrayValue(records)
    .filter((record) => text(record?.term?.issuerCode ?? record?.view?.issuerCode) === code)
    .map((record) => ({
      bondCode: publicText(record?.term?.bondCode ?? record?.view?.bondCode),
      bondName: publicText(record?.term?.bondName ?? record?.view?.bondName),
      cbClose: publicText(record?.view?.cbClose),
      cbPriceDate: publicText(record?.view?.cbPriceDate),
      premiumRate: publicText(record?.view?.premiumRate),
    }))
    .filter((record) => record.bondCode && record.bondName)
    .sort((left, right) => left.bondCode.localeCompare(right.bondCode));
}

function publicEvents(record) {
  return arrayValue(record?.events)
    .map((event) => ({ label: publicText(event?.label), date: publicText(event?.date) }))
    .filter((event) => event.label && event.date && /^\d{4}-\d{2}-\d{2}$/.test(event.date))
    .sort((left, right) => left.date.localeCompare(right.date) || left.label.localeCompare(right.label, "zh-Hant"));
}

export function buildCompanyOverview({ code, emerging = [], ipo = [], revenue = [], workbench = [] } = {}) {
  const companyCode = parseCompanyCode(code);
  if (!companyCode) return null;

  const market = exactCompanyRecord(emerging, companyCode);
  const ipoRecord = exactCompanyRecord(ipo, companyCode);
  const monthlyRevenue = revenueRecord(revenue, companyCode);
  const bonds = exactBondRecords(workbench, companyCode);
  const name = publicText(market?.companyName)
    ?? publicText(ipoRecord?.companyName)
    ?? publicText(monthlyRevenue?.["公司名稱"])
    ?? publicText(arrayValue(workbench).find((record) => text(record?.term?.issuerCode) === companyCode)?.term?.issuerName)
    ?? "—";

  return {
    code: companyCode,
    name,
    emerging: market ? {
      industryName: publicText(market.industryName),
      dailyAveragePrice: publicText(market.dailyAveragePrice),
      transactionVolume: publicText(market.transactionVolume),
    } : null,
    ipo: ipoRecord ? {
      market: publicText(ipoRecord.market),
      stage: publicText(ipoRecord.stage),
      events: publicEvents(ipoRecord),
    } : null,
    revenue: monthlyRevenue ? {
      yearMonth: publicText(monthlyRevenue["資料年月"]),
      currentMonthRevenue: publicText(monthlyRevenue["營業收入-當月營收"]),
      monthOverMonthPercent: publicText(monthlyRevenue["營業收入-上月比較增減(%)"]),
      yearOverYearPercent: publicText(monthlyRevenue["營業收入-去年同月增減(%)"]),
    } : null,
    bonds,
  };
}

function fact(label, value) {
  return `<div class="company-fact"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function renderOverview(target, overview) {
  if (!overview) {
    target.innerHTML = '<h2>請輸入 4 碼公司代號</h2><p>可從全站搜尋，或在網址加上 <code>?code=1234</code> 開啟公司整合頁。</p>';
    return;
  }
  const events = overview.ipo?.events ?? [];
  const bonds = overview.bonds;
  target.innerHTML = `
    <header class="company-overview-heading">
      <p class="section-number">COMPANY ${escapeHtml(overview.code)}</p>
      <h2>${escapeHtml(overview.name)}</h2>
      <p>以相同公司代碼彙整各市場公開資料。</p>
    </header>
    <div class="company-overview-grid">
      <section class="company-overview-card company-overview-card--emerging"><h3>興櫃市場</h3><dl>${fact("產業", display(overview.emerging?.industryName))}${fact("當日均價", formatCompanyNumber(overview.emerging?.dailyAveragePrice))}${fact("成交量", formatCompanyNumber(overview.emerging?.transactionVolume))}</dl>${overview.emerging ? `<a href="./market.html?code=${encodeURIComponent(overview.code)}">查看興櫃明細</a>` : ""}</section>
      <section class="company-overview-card company-overview-card--ipo"><h3>IPO 時程</h3><dl>${fact("市場", display(overview.ipo?.market))}${fact("目前階段", display(overview.ipo?.stage))}</dl>${events.length ? `<ol class="company-event-list">${events.map((event) => `<li><time>${escapeHtml(formatDate(event.date))}</time><span>${escapeHtml(event.label)}</span></li>`).join("")}</ol>` : '<p class="company-empty">—</p>'}${overview.ipo ? `<a href="./ipo-radar.html?q=${encodeURIComponent(overview.code)}">查看 IPO 明細</a>` : ""}</section>
      <section class="company-overview-card"><h3>月營收</h3><dl>${fact("資料年月", display(overview.revenue?.yearMonth))}${fact("當月營收", formatCompanyNumber(overview.revenue?.currentMonthRevenue))}${fact("月增率", formatCompanyPercent(overview.revenue?.monthOverMonthPercent))}${fact("年增率", formatCompanyPercent(overview.revenue?.yearOverYearPercent))}</dl>${overview.revenue ? `<a href="./emerging.html?view=revenue&q=${encodeURIComponent(overview.code)}">查看月營收明細</a>` : ""}</section>
      <section class="company-overview-card company-overview-card--bonds"><h3>相關可轉債</h3>${bonds.length ? `<div class="company-bond-list">${bonds.map((bond) => `<a href="./bonds.html?bond=${encodeURIComponent(bond.bondCode)}"><strong>${escapeHtml(bond.bondCode)} ${escapeHtml(bond.bondName)}</strong><span>收盤 ${escapeHtml(formatCompanyNumber(bond.cbClose))}　資料日 ${escapeHtml(formatDate(bond.cbPriceDate))}　溢價 ${escapeHtml(formatCompanyPercent(bond.premiumRate))}</span></a>`).join("")}</div>` : '<p class="company-empty">—</p>'}</section>
    </div>`;
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

async function loadCompanyOverview() {
  const target = document.querySelector("#company-overview-root");
  if (!target) return;
  const code = parseCompanyCode(new URLSearchParams(location.search).get("code"));
  if (!code) {
    renderOverview(target, null);
    return;
  }
  const pointer = await fetchJson(new URL("../data/current.json", import.meta.url));
  const runtime = pointer?.runtimeUrl ? await fetchJson(new URL(pointer.runtimeUrl, document.baseURI)) : null;
  if (!runtime) {
    target.innerHTML = '<p class="empty-state">公開資料讀取中</p>';
    return;
  }
  const [market, ipo, revenue, workbench] = await Promise.all([
    runtime.emergingMarketUrl ? fetchJson(new URL(runtime.emergingMarketUrl, document.baseURI)) : null,
    runtime.ipoEventsUrl ? fetchJson(new URL(runtime.ipoEventsUrl, document.baseURI)) : null,
    runtime.datasets?.["94025"] ? fetchJson(new URL(runtime.datasets["94025"], document.baseURI)) : null,
    runtime.datasets?.bondWorkbench ? fetchJson(new URL(runtime.datasets.bondWorkbench, document.baseURI)) : null,
  ]);
  renderOverview(target, buildCompanyOverview({
    code,
    emerging: market?.records ?? market,
    ipo: ipo?.records,
    revenue,
    workbench: workbench?.records,
  }));
}

if (globalThis.window && globalThis.document) loadCompanyOverview();
