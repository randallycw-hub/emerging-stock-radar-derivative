import { formatDate, formatNumber } from "./site-shell.js";
import { loadIpoSnapshot } from "./ipo-data.js";

const APPROVED_SOURCES = new Set(["twse-auctions", "twse-public-offerings", "tpex-ipo-listings"]);

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

function sourceIdForRecordId(value) {
  const recordId = String(value ?? "");
  if (/^TWSE:auction:\d{4}:/u.test(recordId)) return "twse-auctions";
  if (/^TWSE:(?:public|public-offering):\d{4}:/u.test(recordId)) return "twse-public-offerings";
  if (/^TPEx:ipo-no-limit:\d{4}:/iu.test(recordId)) return "tpex-ipo-listings";
  return null;
}

function officialRecord(record, sourceIds) {
  if (record?.verified === true) return true;
  const sourceId = sourceIdForRecordId(record?.sourceRecordId);
  return sourceId !== null && sourceIds.has(sourceId);
}

function textOrNull(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function decimalOrNull(value) {
  const text = textOrNull(value);
  return text && /^\d+(?:\.\d+)?$/u.test(text) ? text : null;
}

function dateOrNull(value) {
  return validDate(value) ? value : null;
}

function offeringPrice(record, hasOfficialFacts) {
  if (!hasOfficialFacts) return null;
  return decimalOrNull(record?.finalUnderwritingPrice)
    ?? decimalOrNull(record?.auction?.finalUnderwritingPrice)
    ?? decimalOrNull(record?.publicOffering?.finalUnderwritingPrice)
    ?? decimalOrNull(record?.provisionalUnderwritingPrice)
    ?? decimalOrNull(record?.publicOffering?.provisionalUnderwritingPrice)
    ?? decimalOrNull(record?.auction?.minimumBidPrice);
}

export function projectPublicOfferings(snapshot = {}) {
  if (!validDate(snapshot?.dataDate) || !Array.isArray(snapshot?.records)) return [];
  const sourceIds = new Set((Array.isArray(snapshot?.sourceManifest) ? snapshot.sourceManifest : [])
    .map((source) => source?.sourceId)
    .filter((sourceId) => APPROVED_SOURCES.has(sourceId)));
  return snapshot.records.flatMap((record) => {
    if (record?.exceptionStatus === "withdrawn" || record?.exceptionStatus === "cancelled" || record?.stage === "withdrawn" || record?.stage === "cancelled") return [];
    const auctionVerified = officialRecord(record?.auction, sourceIds);
    const subscriptionVerified = officialRecord(record?.publicOffering, sourceIds);
    if (!auctionVerified && !subscriptionVerified) return [];
    const hasOfficialFacts = auctionVerified || subscriptionVerified;
    const row = {
      companyCode: textOrNull(record?.companyCode),
      companyName: textOrNull(record?.companyName),
      market: textOrNull(record?.market),
      bidStartDate: auctionVerified ? dateOrNull(record?.auction?.bidStartDate) : null,
      bidEndDate: auctionVerified ? dateOrNull(record?.auction?.bidEndDate) : null,
      auctionOpenDate: auctionVerified ? dateOrNull(record?.auction?.auctionOpenDate) : null,
      underwritingPrice: offeringPrice(record, hasOfficialFacts),
      subscriptionStartDate: subscriptionVerified ? dateOrNull(record?.publicOffering?.subscriptionStartDate) : null,
      subscriptionEndDate: subscriptionVerified ? dateOrNull(record?.publicOffering?.subscriptionEndDate) : null,
      drawDate: subscriptionVerified ? dateOrNull(record?.publicOffering?.drawDate) : null,
      listingDate: subscriptionVerified ? dateOrNull(record?.publicOffering?.listingDate) : dateOrNull(record?.listingDate),
      underwriter: hasOfficialFacts ? textOrNull(record?.underwriter) : null,
      asOfDate: snapshot.dataDate,
    };
    return row.companyCode && row.companyName && row.market ? [row] : [];
  }).sort((left, right) => `${left.auctionOpenDate ?? left.subscriptionStartDate ?? left.listingDate ?? "9999-99-99"}:${left.companyCode}`
    .localeCompare(`${right.auctionOpenDate ?? right.subscriptionStartDate ?? right.listingDate ?? "9999-99-99"}:${right.companyCode}`, "zh-Hant"));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function priceValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${formatNumber(parsed, { maximumFractionDigits: 2 })} 元` : "—";
}

function dateRange(start, end) {
  const values = [dateOrNull(start), dateOrNull(end)].filter(Boolean);
  return values.length === 2 ? `${formatDate(values[0])} ～ ${formatDate(values[1])}` : values.length === 1 ? formatDate(values[0]) : "—";
}

function rowHtml(row) {
  return `<tr><th scope="row">${escapeHtml(row.companyCode)} ${escapeHtml(row.companyName)}<small>${escapeHtml(row.market)}</small></th><td>${formatDate(row.bidStartDate)}</td><td>${formatDate(row.bidEndDate)}</td><td>${formatDate(row.auctionOpenDate)}</td><td>${priceValue(row.underwritingPrice)}</td><td>${dateRange(row.subscriptionStartDate, row.subscriptionEndDate)}</td><td>${formatDate(row.drawDate)}</td><td>${formatDate(row.listingDate)}</td><td>${escapeHtml(row.underwriter ?? "—")}</td><td>${formatDate(row.asOfDate)}</td></tr>`;
}

async function initialize() {
  const body = document.querySelector("#ipo-offering-body");
  const count = document.querySelector("#ipo-offering-count");
  const status = document.querySelector("#ipo-offering-status");
  const error = document.querySelector("[data-page-error]");
  if (!body || !count || !status) return;
  const snapshot = await loadIpoSnapshot();
  const rows = projectPublicOfferings(snapshot ?? {});
  const dataDate = rows[0]?.asOfDate ?? null;
  status.textContent = dataDate ? `資料日期 ${formatDate(dataDate)}` : "IPO 公開資料尚未發布";
  count.textContent = `${formatNumber(rows.length)} 家公司`;
  body.innerHTML = rows.length ? rows.map(rowHtml).join("") : '<tr><td colspan="10" class="empty-cell">目前沒有可顯示的競拍／申購公開資料。</td></tr>';
  if (!snapshot && error) {
    error.textContent = "資料暫時無法讀取，目前沒有可顯示的資料。";
    error.hidden = false;
  }
}

if (globalThis.window && globalThis.document) await initialize();
