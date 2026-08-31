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
]);

const ISSUANCE_CATEGORIES = Object.freeze({
  in_progress: "進行中",
  upcoming: "即將發行",
  recent_listing: "最近掛牌",
});

const ISSUANCE_WINDOW_DAYS = 90;

export function buildV53IssuancePipeline(issuance = {}) {
  return PIPELINE_STAGES.flatMap(([stage, name]) => {
    const date = isoDate(issuance?.stages?.[stage]);
    return date ? [{ stage, name, date, state: "confirmed", label: date.replaceAll("-", "/") }] : [];
  });
}

export function selectV57IssuanceRecords(records, { query = "", status = "all" } = {}, dataDate) {
  const needle = normalizeQuery(query);
  const allowedStatus = Object.hasOwn(ISSUANCE_CATEGORIES, status) ? status : "all";
  return arrayValue(records)
    .map((record) => ({ ...record, category: issuanceCategory(record, dataDate) }))
    .filter((record) => record.category !== null)
    .filter((record) => allowedStatus === "all" || record.category === allowedStatus)
    .filter((record) => !needle || [record.cbCode, record.cbName, record.stockCode, record.companyName].some((value) => normalizeQuery(value).includes(needle)))
    .sort(compareIssuanceRows)
    .slice(0, 30);
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

function renderRows(target, records) {
  if (!records.length) {
    target.innerHTML = '<tr><td colspan="10" class="empty-cell">目前沒有符合條件的已公布發行案件。</td></tr>';
    return;
  }
  target.innerHTML = records.map((record) => {
    const pipeline = buildV53IssuancePipeline(record);
    const category = ISSUANCE_CATEGORIES[record.category] ?? "已公布案件";
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
      <td><p class="issuance-category">${escapeHtml(category)}</p><ol class="cb-pipeline" aria-label="${escapeHtml(`${record.cbCode} 發行進度`)}">${pipeline.map((node) => `<li class="${node.state}"><span>${escapeHtml(node.name)}</span><time>${escapeHtml(node.label)}</time></li>`).join("")}</ol>${source}</td>
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
    const records = selectV57IssuanceRecords(model.issuance, {
      query: values.get("q") ?? "",
      status: String(values.get("status") ?? "all"),
    }, model.dataDate);
    syncUrl({ query: values.get("q") ?? "", status: values.get("status") ?? "all" });
    count.textContent = `${records.length} 件（最多顯示 30 件）· 資料日 ${dateLabel(model.dataDate)}`;
    renderRows(target, records);
  };
  const initial = new URL(globalThis.location.href).searchParams;
  form.elements.q.value = initial.get("q") ?? "";
  form.elements.status.value = initial.get("status") && Object.hasOwn(ISSUANCE_CATEGORIES, initial.get("status")) ? initial.get("status") : "all";
  form.addEventListener("input", render);
  form.addEventListener("change", render);
  render();
}

function issuanceCategory(record, dataDate) {
  const snapshotDate = isoDate(dataDate);
  if (!snapshotDate) return null;
  const listingDate = isoDate(record?.stages?.listingDate);
  if (listingDate) {
    const difference = daysBetween(snapshotDate, listingDate);
    if (difference >= 0 && difference <= ISSUANCE_WINDOW_DAYS) return "upcoming";
    if (difference < 0 && difference >= -ISSUANCE_WINDOW_DAYS) return "recent_listing";
    return null;
  }
  return buildV53IssuancePipeline(record).length ? "in_progress" : null;
}

function compareIssuanceRows(left, right) {
  const order = { in_progress: 0, upcoming: 1, recent_listing: 2 };
  const categoryDifference = order[left.category] - order[right.category];
  if (categoryDifference !== 0) return categoryDifference;
  const leftDate = issuanceSortDate(left);
  const rightDate = issuanceSortDate(right);
  if (left.category === "recent_listing") return String(rightDate ?? "").localeCompare(String(leftDate ?? "")) || left.cbCode.localeCompare(right.cbCode, "zh-Hant");
  return String(leftDate ?? "").localeCompare(String(rightDate ?? "")) || left.cbCode.localeCompare(right.cbCode, "zh-Hant");
}

function issuanceSortDate(record) {
  return isoDate(record?.stages?.listingDate) ?? buildV53IssuancePipeline(record).at(-1)?.date ?? null;
}

function daysBetween(from, to) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
}

function syncUrl({ query, status }) {
  if (!globalThis.history || !globalThis.location) return;
  const url = new URL(globalThis.location.href);
  url.searchParams.delete("q");
  url.searchParams.delete("status");
  if (normalizeQuery(query)) url.searchParams.set("q", String(query).trim());
  if (Object.hasOwn(ISSUANCE_CATEGORIES, status)) url.searchParams.set("status", status);
  globalThis.history.replaceState(null, "", url);
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
