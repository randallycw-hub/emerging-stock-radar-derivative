import { formatDate, formatNumber, safeJsonFetch } from "./site-shell.js";
import { emergingDailyAverageLabel } from "./emerging-market-display.js";

export function parsePublicCompanyCode(value) {
  return /^\d{4}$/.test(String(value ?? "")) ? String(value) : null;
}

if (typeof document !== "undefined") {
  await initializeEmergingDetail();
}

async function initializeEmergingDetail() {
  const root = document.querySelector("#emerging-detail-root");
  const errorTarget = document.querySelector("[data-page-error]");
  const companyCode = parsePublicCompanyCode(new URLSearchParams(location.search).get("code"));
  if (companyCode === null) {
    root.innerHTML = "<p class=\"empty-cell\">請由興櫃市場選擇公司。</p>";
    return;
  }
  const pointer = await safeJsonFetch(new URL("../data/current.json", import.meta.url), { errorTarget });
  const runtime = pointer?.runtimeUrl
    ? await safeJsonFetch(new URL(pointer.runtimeUrl, document.baseURI), { errorTarget })
    : null;
  if (!runtime?.emergingMarketUrl || !runtime?.ipoEventsUrl) {
    root.innerHTML = "<p class=\"empty-cell\">—</p>";
    return;
  }
  const [market, ipo] = await Promise.all([
    safeJsonFetch(new URL(runtime.emergingMarketUrl, document.baseURI), { errorTarget }),
    safeJsonFetch(new URL(runtime.ipoEventsUrl, document.baseURI), { errorTarget }),
  ]);
  const company = (Array.isArray(market?.records) ? market.records : []).find(
    (record) => record?.companyCode === companyCode,
  );
  if (!company) {
    root.innerHTML = "<p class=\"empty-cell\">查無該公司已發布的盤後資料。</p>";
    return;
  }
  const ipoRecord = (Array.isArray(ipo?.records) ? ipo.records : []).find(
    (record) => record?.companyCode === companyCode,
  );
  root.innerHTML = detailHtml(company, ipoRecord);
}

function detailHtml(company, ipoRecord) {
  const events = Array.isArray(ipoRecord?.events) ? ipoRecord.events : [];
  return `<header class="section-heading"><div><p class="section-number">${escapeHtml(company.companyCode)}</p><h2>${escapeHtml(company.companyName)}</h2></div><p class="update-status">資料日期 ${formatDate(company.tradingDate)}</p></header>
    <section class="detail-panel"><h3>盤後市場</h3><dl class="detail-grid">
      ${detailItem("本日成交均價（盤後）", dailyAverage(company))}
      ${detailItem("均價漲跌", signed(company.averageChange, "%", company.averageChangePercent))}
      ${detailItem("最高／最低", `${number(company.dailyHighPrice)}／${number(company.dailyLowPrice)}`)}
      ${detailItem("成交股數", number(company.transactionVolume))}
      ${detailItem("估算成交金額（盤後）", number(company.estimatedTransactionAmount))}
      ${detailItem("產業", escapeHtml(company.industryName ?? "—"))}
    </dl></section>
    <section class="detail-panel"><h3>IPO 進度</h3><dl class="detail-grid">
      ${detailItem("目前階段", escapeHtml(ipoRecord?.stage ?? "—"))}
      ${detailItem("申請日期", formatDate(ipoRecord?.applicationDate))}
    </dl><ol class="event-list">${events.map((event) => `<li><time>${formatDate(event?.date)}</time>${escapeHtml(event?.label ?? "—")}</li>`).join("") || "<li>—</li>"}</ol></section>
    <section class="detail-panel"><h3>歷史區間資料</h3><dl class="detail-grid">
      ${detailItem("5 日", "—")}${detailItem("20 日", "—")}${detailItem("60 日", "—")}
    </dl></section>`;
}

function dailyAverage(company) {
  return emergingDailyAverageLabel(company) ?? number(company.dailyAveragePrice);
}

function detailItem(label, value) {
  return `<div><dt>${label}</dt><dd>${value}</dd></div>`;
}

function number(value) {
  return formatNumber(value, { maximumFractionDigits: 2 });
}

function signed(value, suffix, percent) {
  const amount = value === null || value === undefined ? "—" : `${Number(value) > 0 ? "+" : ""}${number(value)}`;
  const ratio = percent === null || percent === undefined ? "—" : `${Number(percent) > 0 ? "+" : ""}${number(percent)}${suffix}`;
  return `${amount}／${ratio}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
