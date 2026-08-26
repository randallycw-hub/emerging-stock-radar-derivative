import { dateValue, loadPublicBondWorkbench, numberValue, publicBondRecords } from "./bond-public-data.js";

export function buildBondIssuanceRows(workbench) {
  return publicBondRecords(workbench)
    .sort((left, right) => String(right.issueDate ?? "").localeCompare(String(left.issueDate ?? ""))
      || left.bondCode.localeCompare(right.bondCode, "zh-Hant"))
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function renderRows(target, rows) {
  if (!rows.length) {
    target.innerHTML = '<tr><td colspan="10" class="empty-cell">目前沒有可顯示的公開發行案件。</td></tr>';
    return;
  }
  target.innerHTML = rows.map((row) => `<tr>
    <td><strong>${escapeHtml(row.bondCode)}</strong><span>${escapeHtml(row.bondName)}</span></td>
    <td>${escapeHtml(row.issuerCode)} ${escapeHtml(row.issuerName)}</td>
    <td>${dateValue(row.issueDate)}</td>
    <td>${dateValue(row.listingDate)}</td>
    <td>${dateValue(row.maturityDate)}</td>
    <td>${numberValue(row.issueAmount, 0)}</td>
    <td>${escapeHtml(row.securedStatus ?? "—")}</td>
    <td>${escapeHtml(row.underwriter ?? "—")}</td>
    <td>${escapeHtml(row.trustee ?? "—")}</td>
    <td>${escapeHtml(row.progress)}</td>
  </tr>`).join("");
}

async function initialize() {
  const target = document.querySelector("#bond-issuance-body");
  const count = document.querySelector("#bond-issuance-count");
  const errorTarget = document.querySelector("[data-page-error]");
  if (!target || !count) return;
  const workbench = await loadPublicBondWorkbench({ errorTarget });
  const rows = buildBondIssuanceRows(workbench);
  count.textContent = `${rows.length} 筆`;
  renderRows(target, rows);
}

if (globalThis.window && globalThis.document) await initialize();
