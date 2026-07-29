const fmtDate = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`;
  if (/^\d{7}$/.test(text)) return `${Number(text.slice(0, 3)) + 1911}-${text.slice(3, 5)}-${text.slice(5)}`;
  return text;
};
const val = (row, key) => String(row?.[key] ?? "").trim() || "—";
const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("zh-TW") : val({ value }, "value");
};
const cell = (value, muted = false) => `<td${muted ? ' class="muted"' : ""}>${value}</td>`;
const setRows = (selector, rows) => { document.querySelector(selector).innerHTML = rows.join(""); };

try {
  const manifest = await fetch("./data/manifest.json").then((response) => response.json());
  const [revenue, bonds, ipo] = await Promise.all(manifest.datasets.map((dataset) => fetch(`./data/${dataset.datasetId}.json`).then((response) => response.json())));
  document.querySelector(".badge").textContent = "官方快照｜2026-07-30（非即時）";
  document.querySelector(".hero h2").textContent = "官方資料快照已匯入，等待正式同步";
  document.querySelector(".hero p").textContent = "本頁使用 2026-07-30 下載的官方原始資料快照；資料來源、下載日期、雜湊與筆數均保留，正式自動同步仍需完成發布核准。";
  const summary = document.querySelectorAll(".summary strong");
  summary[0].textContent = bonds.length;
  summary[1].textContent = revenue.length;
  summary[2].textContent = ipo.length;
  summary[3].textContent = manifest.generatedAt;

  setRows("#bonds tbody", bonds.map((row) => [
    cell(`${val(row, "債券代碼")} ${val(row, "債券簡稱")}`), cell(`${val(row, "機構代碼")} ${val(row, "機構名稱")}`),
    cell(fmtDate(row["發行日期"])), cell(fmtDate(row["到期日期"])), cell(num(row["發行總額"])), cell(num(row["目前餘額"])),
    cell(`${val(row, "票面利率")} %`), cell(val(row, "發行時轉換價格")), cell(`${fmtDate(row["轉換期間起"])}～${fmtDate(row["迄"])}`),
    cell(fmtDate(row["賣回權日期"]), true), cell(val(row, "賣回權價格"), true), cell(fmtDate(row["資料日期"])), cell("11406 官方快照"), cell(val(row, "債券種類")),
  ].join(""))); 
  setRows("#emerging tbody", revenue.map((row) => [
    cell(val(row, "公司代號")), cell(val(row, "公司名稱")), cell(val(row, "產業別")), cell(num(row["營業收入-當月營收"])),
    cell(`${val(row, "營業收入-去年同月增減(%)")} %`), cell(num(row["累計營業收入-當月累計營收"])), cell(fmtDate(row["資料年月"])), cell("94025 官方快照"),
  ].join("")));
  setRows("#ipo tbody", ipo.map((row) => [
    cell(val(row, "公司代號")), cell(val(row, "公司簡稱")), cell(fmtDate(row["申請日期"])), cell(fmtDate(row["上市審議委員會審議日期"])),
    cell(fmtDate(row["交易所董事會通過上市日期"])), cell(fmtDate(row["上市契約報請主管機關備查(主管機關核准)日期"])), cell(fmtDate(row["股票上市買賣日期"])), cell(val(row, "承銷商")),
  ].join("")));
  const sourceNote = document.querySelector("#sources .note");
  sourceNote.innerHTML = `<strong>官方快照狀態：</strong>94025 ${revenue.length} 筆、11406 ${bonds.length} 筆、11586 ${ipo.length} 筆；每份資料均附來源 URL、下載日期與 SHA-256。這是本機匯入快照，不代表已啟用正式自動同步。`;
} catch (error) {
  console.error("official snapshot load failed", error);
}
