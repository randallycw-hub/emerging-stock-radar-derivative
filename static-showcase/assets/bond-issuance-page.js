import { loadPublicCbWorkbenchV53, publicBondRecords } from "./bond-public-data.js";
import { isOfficialSourceUrl } from "./cb-workbench-v53.js";
import { publicAmount } from "./cb-workbench-ui.js";

const PIPELINE_STAGES = Object.freeze([
  ["announcementDate", "公告"],
  ["filingDate", "送件"],
  ["effectiveDate", "生效"],
  ["auctionOrBookbuildingDate", "詢圈／競拍"],
  ["pricingDate", "定價"],
  ["listingDate", "掛牌"],
  ["asoDate", "CBAS 拆解"],
]);

export function buildV53IssuancePipeline(issuance = {}) {
  return PIPELINE_STAGES.map(([stage, name]) => {
    const date = isoDate(issuance?.stages?.[stage]);
    return { stage, name, date, state: date ? "confirmed" : "pending", label: date ? date.replaceAll("-", "/") : "待公告" };
  });
}

export function buildBondIssuanceRows(workbench) {
  return publicBondRecords(workbench)
    .sort((left, right) => String(right.issueDate ?? "").localeCompare(String(left.issueDate ?? "")) || left.bondCode.localeCompare(right.bondCode, "zh-Hant"))
    .map((record) => ({
      bondCode: record.bondCode,
      bondName: record.bondName,
      issuerCode: record.issuerCode,
      issuerName: record.issuerName,
      issueDate: record.issueDate,
      listingDate: record.listingDate,
      maturityDate: record.maturityDate,
      issueAmount: record.issueAmount,
      securedStatus: record.securedStatus,
      underwriter: record.underwriter,
      trustee: record.trustee,
      progress: record.listingDate ? "已掛牌" : record.issueDate ? "已發行" : "已公告公開條款",
    }));
}

function filterIssuance(records, { query = "", stage = "", days = "" } = {}, dataDate) {
  const needle = normalizeQuery(query);
  const maxDays = days === "7" || days === "30" ? Number(days) : null;
  return arrayValue(records).filter((record) => {
    if (needle && ![record.cbCode, record.cbName, record.stockCode, record.companyName].some((value) => normalizeQuery(value).includes(needle))) return false;
    if (stage && record.currentStage !== stage) return false;
    const listingDate = record.stages?.listingDate;
    return maxDays === null || isWithinDays(listingDate, dataDate, maxDays);
  });
}

function renderRows(target, records) {
  if (!records.length) {
    target.innerHTML = '<tr><td colspan="10" class="empty-cell">目前沒有符合條件的已公布發行案件。</td></tr>';
    return;
  }
  target.innerHTML = records.map((record) => {
    const pipeline = buildV53IssuancePipeline(record);
    const source = isOfficialSourceUrl(record.sourceUrl)
      ? `<a href="${escapeHtml(record.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方公告</a>`
      : "—";
    return `<tr>
      <td><a href="./bonds.html?bond=${encodeURIComponent(record.cbCode)}"><strong>${escapeHtml(record.cbCode)}</strong><span>${escapeHtml(record.cbName)}</span></a></td>
      <td>${escapeHtml(record.stockCode)} ${escapeHtml(record.companyName)}</td>
      <td>${publicAmount(record.terms?.issueAmount)}</td>
      <td>${escapeHtml(record.terms?.securedStatus ?? "—")}</td>
      <td>${escapeHtml(record.terms?.underwriter ?? "—")}</td>
      <td>${escapeHtml(record.terms?.trustee ?? "—")}</td>
      <td>${dateLabel(record.terms?.issueDate)}</td>
      <td>${dateLabel(record.stages?.listingDate)}</td>
      <td>${dateLabel(record.terms?.maturityDate)}</td>
      <td><ol class="cb-pipeline" aria-label="${escapeHtml(`${record.cbCode} 發行進度`)}">${pipeline.map((node) => `<li class="${node.state}"><span>${escapeHtml(node.name)}</span><time>${escapeHtml(node.label)}</time></li>`).join("")}</ol>${source}</td>
    </tr>`;
  }).join("");
}

async function initialize() {
  const form = document.querySelector("#bond-issuance-form");
  const target = document.querySelector("#bond-issuance-body");
  const count = document.querySelector("#bond-issuance-count");
  const errorTarget = document.querySelector("[data-page-error]");
  if (!form || !target || !count) return;
  const model = await loadPublicCbWorkbenchV53({ errorTarget });
  if (!model?.dataDate || !Array.isArray(model.issuance)) {
    count.textContent = "資料暫時無法取得";
    target.innerHTML = '<tr><td colspan="10" class="empty-cell">資料暫時無法取得</td></tr>';
    return;
  }
  const render = () => {
    const values = new FormData(form);
    const records = filterIssuance(model.issuance, {
      query: values.get("q") ?? "",
      stage: String(values.get("stage") ?? ""),
      days: String(values.get("days") ?? ""),
    }, model.dataDate);
    count.textContent = `${records.length} 件 · 資料日 ${dateLabel(model.dataDate)}`;
    renderRows(target, records);
  };
  form.addEventListener("input", render);
  form.addEventListener("change", render);
  render();
}

function isWithinDays(value, asOfDate, days) {
  const date = isoDate(value);
  if (!date || !isoDate(asOfDate)) return false;
  const difference = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${asOfDate}T00:00:00Z`)) / 86400000;
  return difference >= 0 && difference <= days;
}

function dateLabel(value) {
  return isoDate(value)?.replaceAll("-", "/") ?? "—";
}

function isoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function normalizeQuery(value) {
  return String(value ?? "").normalize("NFKC").trim().toUpperCase();
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

if (globalThis.window && globalThis.document) await initialize();
