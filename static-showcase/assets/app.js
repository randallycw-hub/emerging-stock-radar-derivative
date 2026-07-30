const labels = [
  "CB 代碼／名稱",
  "CB 收盤價",
  "股票收盤價",
  "目前轉換價",
  "轉換價值",
  "轉換溢價率",
  "CB 成交量",
  "流通餘額",
  "到期／賣回事件",
];
const workbenchSections = [
  "交易摘要",
  "價格日期與估值日",
  "價格走勢",
  "轉換與餘額",
  "契約生命週期",
  "發行條款",
  "公告與文件",
  "資料來源",
];
const reasonLabels = {
  NO_CB_CLOSE: "尚無可用 CB 收盤",
  NO_STOCK_CLOSE: "尚無可用股票收盤",
  NO_CONVERSION_PRICE: "尚無已驗證轉換價",
  NO_COMMON_VALUATION_DATE: "CB 與股票沒有共同估值日",
  NO_EFFECTIVE_CONVERSION_PRICE: "估值日缺少已生效轉換價",
  SNAPSHOT_NOT_PUBLISHED: "盤後市場快照尚未發布",
};
const config = window.__OFFICIAL_SHOWCASE__ ?? {
  manifestUrl: "./data/manifest.json",
  datasets: {},
};
const state = {
  manifest: null,
  revenue: [],
  bondTerms: [],
  ipo: [],
  views: [],
  conversions: [],
  history: [],
};

initializeTheme();
bindFilters();
await loadAndRender();
window.addEventListener("hashchange", renderHashRoute);

async function loadAndRender() {
  const [manifest, revenue, bondTerms, ipo, market, conversions, history] =
    await Promise.all([
      loadJson(config.manifestUrl, null),
      loadJson(config.datasets["94025"], []),
      loadJson(config.datasets["11406"], []),
      loadJson(config.datasets["11586"], []),
      loadJson(config.datasets.bondMarket, []),
      loadJson(config.datasets.conversionPrices, []),
      loadJson(config.datasets.bondHistory, []),
    ]);
  state.manifest = manifest;
  state.revenue = arrayValue(revenue);
  state.bondTerms = arrayValue(bondTerms);
  state.ipo = arrayValue(ipo);
  state.views = arrayValue(market);
  state.conversions = arrayValue(conversions);
  state.history = arrayValue(history);

  if (state.views.length === 0) state.views = fallbackBondViews(state.bondTerms);
  renderSummary();
  renderBonds();
  renderEmerging();
  renderIpo();
  renderHashRoute();
  const marketDate = state.manifest?.market?.requestedDate;
  document.querySelector("#update-status").textContent = marketDate
    ? `盤後資料日 ${marketDate}`
    : `資料版本 ${state.manifest?.generatedAt ?? "讀取完成"}`;
}

function initializeTheme() {
  document.querySelector("#theme-toggle").addEventListener("click", () => {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("market-theme", next); } catch {}
  });
}

function bindFilters() {
  for (const selector of ["#bond-search", "#bond-preset"]) {
    document.querySelector(selector).addEventListener("input", renderBonds);
  }
}

async function loadJson(url, fallback) {
  if (!url) return fallback;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.json();
  } catch {
    return fallback;
  }
}

function arrayValue(value) {
  return Array.isArray(value) ? value : Array.isArray(value?.records) ? value.records : [];
}

function fallbackBondViews(rows) {
  const today = state.manifest?.generatedAt ?? "";
  return rows
    .filter((row) => /^\d{5,6}$/.test(String(row["債券代碼"] ?? "")))
    .map((row) => ({
      bondCode: String(row["債券代碼"]),
      issuerCode: String(row["機構代碼"] ?? ""),
      bondName: String(row["債券簡稱"] ?? "未命名可轉債"),
      cbClose: null,
      cbPriceDate: null,
      cbTradeUnits: "0",
      stockClose: null,
      stockPriceDate: null,
      currentConversionPrice: null,
      conversionPriceEffectiveDate: null,
      valuationDate: null,
      valuationCbClose: null,
      valuationStockClose: null,
      conversionValue: null,
      premiumRate: null,
      outstandingAmount: row["目前餘額"] || null,
      outstandingReductionRate: null,
      maturityDate: formatDate(row["到期日期"]),
      daysToMaturity: daysBetween(today, formatDate(row["到期日期"])),
      nextPutDate: row["賣回權日期"] ? formatDate(row["賣回權日期"]) : null,
      daysToNextPut: row["賣回權日期"]
        ? daysBetween(today, formatDate(row["賣回權日期"]))
        : null,
      staleCbPrice: false,
      missingReasons: ["SNAPSHOT_NOT_PUBLISHED"],
    }));
}

function renderSummary() {
  const priced = state.views.filter((view) => view.cbClose !== null).length;
  setText("#summary-bonds", formatNumber(state.views.length));
  setText("#summary-priced", formatNumber(priced));
  setText("#summary-emerging", formatNumber(state.revenue.length));
  setText(
    "#summary-date",
    state.manifest?.market?.requestedDate ?? state.manifest?.generatedAt ?? "—",
  );
}

function renderBonds() {
  const query = document.querySelector("#bond-search").value.trim().toLowerCase();
  const preset = document.querySelector("#bond-preset").value;
  const rows = state.views.filter((view) => {
    const term = termFor(view.bondCode);
    const haystack = [
      view.bondCode,
      view.bondName,
      view.issuerCode,
      term?.["機構名稱"],
    ].join(" ").toLowerCase();
    return haystack.includes(query) && matchesPreset(view, preset);
  });
  setText("#bond-result-count", `${rows.length} 檔`);
  document.querySelector("#bond-table-body").innerHTML = rows.length
    ? rows.map(renderBondRow).join("")
    : '<tr><td colspan="9" class="empty-cell">沒有符合條件的可轉債</td></tr>';
  document.querySelector("#bond-card-list").innerHTML = rows.length
    ? rows.map(renderBondCard).join("")
    : '<p class="empty-cell">沒有符合條件的可轉債</p>';
  bindBondOpeners();
}

function renderBondRow(view) {
  const term = termFor(view.bondCode);
  const reason = firstReason(view);
  return `<tr tabindex="0" data-bond-code="${escapeHtml(view.bondCode)}" aria-label="查看 ${escapeHtml(view.bondName)} 詳細資料">
    <td>${metric(`${view.bondCode} · ${view.bondName}`, `${view.issuerCode} ${term?.["機構名稱"] ?? ""}`)}</td>
    <td>${priceMetric(view.cbClose, view.cbPriceDate, view.staleCbPrice ? "非當日成交" : "")}</td>
    <td>${priceMetric(view.stockClose, view.stockPriceDate)}</td>
    <td>${priceMetric(view.currentConversionPrice, view.conversionPriceEffectiveDate, "生效日")}</td>
    <td>${priceMetric(view.conversionValue, view.valuationDate, "估值日", "metric-violet")}</td>
    <td>${rateMetric(view.premiumRate, view.valuationDate, reason)}</td>
    <td>${metric(formatNumber(view.cbTradeUnits), view.cbTradeUnits === "0" ? "當日無成交" : "交易單位")}</td>
    <td>${metric(formatMoney(view.outstandingAmount), view.outstandingReductionRate === null ? "資料暫缺" : `流通減少 ${signedRate(view.outstandingReductionRate)}`)}</td>
    <td>${eventMetric(view)}</td>
  </tr>`;
}

function renderBondCard(view) {
  return `<button class="bond-card" type="button" data-bond-code="${escapeHtml(view.bondCode)}">
    <header><strong>${escapeHtml(view.bondCode)} · ${escapeHtml(view.bondName)}</strong><span>${view.staleCbPrice ? "非當日成交" : ""}</span></header>
    <span class="bond-card-grid">
      ${cardMetric("CB 收盤", valueOrDash(view.cbClose), view.cbPriceDate)}
      ${cardMetric("股票收盤", valueOrDash(view.stockClose), view.stockPriceDate)}
      ${cardMetric("目前轉換價", valueOrDash(view.currentConversionPrice), view.conversionPriceEffectiveDate)}
      ${cardMetric("轉換價值", valueOrDash(view.conversionValue), view.valuationDate)}
      ${cardMetric("轉換溢價率", view.premiumRate === null ? "—" : signedRate(view.premiumRate), view.valuationDate)}
      ${cardMetric("最近事件", eventLabel(view), eventDate(view))}
    </span>
  </button>`;
}

function bindBondOpeners() {
  for (const element of document.querySelectorAll("[data-bond-code]")) {
    const open = () => {
      location.hash = `bond=${encodeURIComponent(element.dataset.bondCode)}`;
    };
    element.addEventListener("click", open);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  }
}

function matchesPreset(view, preset) {
  if (preset === "low-price") return numberValue(view.cbClose) < 100;
  if (preset === "low-premium") return numberValue(view.premiumRate) < 5;
  if (preset === "near-parity") {
    const value = numberValue(view.conversionValue);
    return value >= 95 && value <= 105;
  }
  if (preset === "maturity") return view.daysToMaturity >= 0 && view.daysToMaturity <= 365;
  if (preset === "put") return view.daysToNextPut >= 0 && view.daysToNextPut <= 90;
  if (preset === "no-trade") return String(view.cbTradeUnits) === "0";
  if (preset === "missing") return view.missingReasons?.length > 0;
  return true;
}

function renderHashRoute() {
  const match = /^#bond=(.+)$/.exec(location.hash);
  const target = document.querySelector("#bond-workbench");
  if (!match) {
    target.hidden = true;
    target.innerHTML = "";
    return;
  }
  const code = decodeURIComponent(match[1]);
  const view = state.views.find((candidate) => candidate.bondCode === code);
  if (!view) return;
  renderWorkbench(view);
  target.hidden = false;
  target.scrollIntoView({ block: "start" });
}

function renderWorkbench(view) {
  const target = document.querySelector("#bond-workbench");
  const term = termFor(view.bondCode) ?? {};
  const conversion = state.conversions.find((value) => value.bondCode === view.bondCode);
  const historyPoints = state.history.filter(
    (point) => point.bondCode === view.bondCode,
  );
  target.innerHTML = `
    <header class="workbench-head">
      <div><p class="section-number">${escapeHtml(view.bondCode)} / BOND WORKBENCH</p><h2>${escapeHtml(view.bondName)}</h2><p>${escapeHtml(term["機構名稱"] ?? view.issuerCode)}</p></div>
      <button class="close-workbench" type="button" aria-label="關閉單檔詳細資料">關閉 ×</button>
    </header>
    <section aria-label="${workbenchSections[0]}" class="workbench-summary">
      ${summaryMetric("CB 收盤", view.cbClose, view.cbPriceDate)}
      ${summaryMetric("股票收盤", view.stockClose, view.stockPriceDate)}
      ${summaryMetric("目前轉換價", view.currentConversionPrice, view.conversionPriceEffectiveDate)}
      ${summaryMetric("轉換價值", view.conversionValue, view.valuationDate)}
      ${view.valuationDate === null ? "" : summaryMetric("轉換溢價率", signedRate(view.premiumRate), view.valuationDate)}
    </section>
    <div class="workbench-grid">
      ${panel(workbenchSections[1], [
        ["CB 價格日", view.cbPriceDate],
        ["股票價格日", view.stockPriceDate],
        ["轉換價生效日", view.conversionPriceEffectiveDate],
        ["共同估值日", view.valuationDate],
      ])}
      <section class="workbench-panel"><h3>${workbenchSections[2]}</h3>
        <div class="history-ranges"><button type="button">1M</button><button type="button">3M</button><button type="button">6M</button><button type="button">1Y</button></div>
        <p>${historyPoints.length ? `已載入 ${historyPoints.length} 個已驗證日資料點` : "目前區間尚無可驗證歷史資料；不插補價格。"}</p>
      </section>
      ${panel(workbenchSections[3], [
        ["發行時轉換價", term["發行時轉換價格"]],
        ["目前轉換價", view.currentConversionPrice],
        ["發行總額", formatMoney(term["發行總額"])],
        ["流通餘額", formatMoney(view.outstandingAmount)],
        ["流通減少率", view.outstandingReductionRate === null ? null : signedRate(view.outstandingReductionRate)],
      ])}
      ${panel(workbenchSections[4], [
        ["發行日", formatDate(term["發行日期"])],
        ["掛牌日", formatDate(term["掛牌日期"])],
        ["轉換開始", formatDate(term["轉換期間起"])],
        ["最近賣回", view.nextPutDate],
        ["轉換截止", formatDate(term["迄"])],
        ["到期日", view.maturityDate],
      ])}
      ${panel(workbenchSections[5], [
        ["票面利率", term["票面利率"] ? `${term["票面利率"]}%` : null],
        ["擔保", term["有無擔保"] === "1" ? term["債券擔保情形"] || "有擔保" : "無擔保"],
        ["承銷商", term["承銷機構"]],
        ["受託人", term["受託人"]],
        ["募集方式", term["募集方式"]],
      ])}
      <section class="workbench-panel"><h3>${workbenchSections[6]}</h3><div class="document-links">
        ${conversion?.officialDetailUrl ? `<a href="${escapeHtml(conversion.officialDetailUrl)}" target="_blank" rel="noopener noreferrer">發行資料明細</a>` : ""}
        <a href="https://www.tpex.org.tw/zh-tw/bond/info/statistics-cb/day-quotes.html" target="_blank" rel="noopener noreferrer">可轉債行情查詢</a>
      </div></section>
      ${panel(workbenchSections[7], [
        ["條款資料", "證券櫃檯買賣中心 11406"],
        ["CB 行情", "證券櫃檯買賣中心盤後查詢"],
        ["股票收盤", "證券交易所／證券櫃檯買賣中心"],
        ["轉換價", "公開資訊觀測站發行資料"],
        ["擷取版本", state.manifest?.market?.generatedAt ?? state.manifest?.generatedAt],
      ])}
    </div>`;
  target.querySelector(".close-workbench").addEventListener("click", () => {
    window.history.replaceState(
      null,
      "",
      location.pathname + location.search + "#bonds",
    );
    target.hidden = true;
  });
}

function renderEmerging() {
  document.querySelector("#emerging-table-body").innerHTML = state.revenue.length
    ? state.revenue.slice(0, 120).map((row) => `<tr>
      <td>${escapeHtml(row["公司代號"])}</td><td>${escapeHtml(row["公司名稱"])}</td>
      <td>${escapeHtml(row["產業別"])}</td><td>${formatMoney(row["營業收入-當月營收"])}</td>
      <td>${row["營業收入-去年同月增減(%)"] === "" ? "—" : signedRate(row["營業收入-去年同月增減(%)"])}</td>
      <td>${formatDate(row["資料年月"])}</td></tr>`).join("")
    : '<tr><td colspan="6">資料暫缺</td></tr>';
}

function renderIpo() {
  document.querySelector("#ipo-table-body").innerHTML = state.ipo.length
    ? state.ipo.slice(0, 160).map((row) => `<tr>
      <td>${escapeHtml(`${row["公司代號"] ?? ""} ${row["公司簡稱"] ?? ""}`)}</td>
      <td>${formatDate(row["申請日期"])}</td>
      <td>${formatDate(row["上市審議委員會審議日期"])}</td>
      <td>${formatDate(row["交易所董事會通過上市日期"])}</td>
      <td>${formatDate(row["上市契約報請主管機關備查(主管機關核准)日期"])}</td>
      <td>${formatDate(row["股票上市買賣日期"])}</td></tr>`).join("")
    : '<tr><td colspan="6">資料暫缺</td></tr>';
}

function panel(title, entries) {
  return `<section class="workbench-panel"><h3>${escapeHtml(title)}</h3><dl>${entries.map(([label, value]) =>
    `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(valueOrDash(value))}</dd></div>`
  ).join("")}</dl></section>`;
}

function summaryMetric(label, value, date) {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(valueOrDash(value))}</strong><small>${escapeHtml(date ?? "資料暫缺")}</small></article>`;
}

function metric(main, sub, className = "") {
  return `<span class="metric-main ${className}">${escapeHtml(valueOrDash(main))}</span><span class="metric-sub">${escapeHtml(valueOrDash(sub))}</span>`;
}

function priceMetric(value, date, note = "", className = "") {
  return metric(valueOrDash(value), [date, note].filter(Boolean).join(" · ") || "資料暫缺", className);
}

function rateMetric(value, date, reason) {
  if (value === null || value === undefined) return metric("—", reason || "資料暫缺", "metric-alert");
  const number = Number(value);
  const icon = number > 0 ? "▲" : number < 0 ? "▼" : "•";
  return metric(`${icon} ${signedRate(value)}`, date ? `估值日 ${date}` : "", number > 0 ? "metric-alert" : "metric-violet");
}

function eventMetric(view) {
  return metric(eventLabel(view), eventDate(view));
}

function eventLabel(view) {
  return view.nextPutDate ? `賣回 ${view.daysToNextPut} 天` : `到期 ${view.daysToMaturity} 天`;
}

function eventDate(view) {
  return view.nextPutDate ?? view.maturityDate ?? "資料暫缺";
}

function cardMetric(label, value, sub) {
  return `<span><span>${escapeHtml(label)}</span><strong>${escapeHtml(valueOrDash(value))}</strong><small>${escapeHtml(sub ?? "資料暫缺")}</small></span>`;
}

function firstReason(view) {
  return reasonLabels[view.missingReasons?.[0]] ?? (view.missingReasons?.length ? "資料暫缺" : "");
}

function termFor(code) {
  return state.bondTerms.find((row) => String(row["債券代碼"]) === code);
}

function signedRate(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${number > 0 ? "+" : ""}${number.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}%`;
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(String(value).replaceAll(",", ""));
  if (!Number.isFinite(number)) return String(value);
  if (Math.abs(number) >= 100000000) {
    return `${(number / 100000000).toLocaleString("zh-TW", { maximumFractionDigits: 2 })} 億`;
  }
  if (Math.abs(number) >= 10000) {
    return `${(number / 10000).toLocaleString("zh-TW", { maximumFractionDigits: 1 })} 萬`;
  }
  return number.toLocaleString("zh-TW");
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("zh-TW") : "—";
}

function formatDate(value) {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value).trim();
  let match;
  if ((match = /^(\d{4})(\d{2})(\d{2})$/.exec(text))) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  if ((match = /^(\d{3})(\d{2})(\d{2})$/.exec(text))) {
    return `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  }
  if ((match = /^(\d{3})\/(\d{2})\/(\d{2})$/.exec(text))) {
    return `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  }
  if ((match = /^(\d{3})(\d{2})$/.exec(text))) {
    return `${Number(match[1]) + 1911}-${match[2]}`;
  }
  return text;
}

function daysBetween(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return Number.POSITIVE_INFINITY;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
}

function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

void labels;
