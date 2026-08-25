import { applyPublicBondScreener, filterBondRecords, normalizeBondQuery } from "./bond-list-page.js";
import { dateValue, loadPublicBondWorkbench, numberValue, publicBondRecords } from "./bond-public-data.js";

export function filterPublicBondRows(records, { query = "", screener = "", asOfDate = null } = {}) {
  return applyPublicBondScreener(filterBondRecords(records, { query }), screener, { asOfDate });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function renderRows(target, rows) {
  if (!rows.length) {
    target.innerHTML = '<tr><td colspan="7" class="empty-cell">目前沒有符合條件的公開資料。</td></tr>';
    return;
  }
  target.innerHTML = rows.map((row) => `<tr>
    <td><a href="./bonds.html?bond=${encodeURIComponent(row.bondCode)}">${escapeHtml(row.bondCode)} ${escapeHtml(row.bondName)}</a></td>
    <td>${escapeHtml(row.issuerCode)} ${escapeHtml(row.issuerName)}</td>
    <td>${numberValue(row.cbClose)}</td>
    <td>${numberValue(row.conversionValue)}</td>
    <td>${numberValue(row.premiumRate)}%</td>
    <td>${numberValue(row.remainingRatio)}%</td>
    <td>${dateValue(row.nextEventDate)}</td>
  </tr>`).join("");
}

async function initialize() {
  const form = document.querySelector("#bond-filter-form");
  const target = document.querySelector("#bond-filter-body");
  const count = document.querySelector("#bond-filter-count");
  const errorTarget = document.querySelector("[data-page-error]");
  if (!form || !target || !count) return;
  const workbench = await loadPublicBondWorkbench({ errorTarget });
  const records = publicBondRecords(workbench);
  const asOfDate = workbench?.dataDate ?? null;
  const render = () => {
    const values = new FormData(form);
    const rows = filterPublicBondRows(records, {
      query: normalizeBondQuery(values.get("q") ?? ""),
      screener: String(values.get("screener") ?? ""),
      asOfDate,
    });
    count.textContent = `${rows.length} 筆`;
    renderRows(target, rows);
  };
  form.addEventListener("input", render);
  form.addEventListener("change", render);
  render();
}

if (globalThis.window && globalThis.document) await initialize();
