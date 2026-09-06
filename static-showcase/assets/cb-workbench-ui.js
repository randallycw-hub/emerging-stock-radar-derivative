const RANKING_METRICS = Object.freeze({
  volume: { label: "日成交量", value: (record) => record?.quote?.volume ?? null },
  average5: { label: "近 5 筆日均量", value: (record) => record?.liquidity?.average5 ?? null },
  average20: { label: "近 20 筆日均量", value: (record) => record?.liquidity?.average20 ?? null },
  turnoverAmount: { label: "成交額", value: (record) => record?.quote?.turnoverAmount ?? null },
});

export { RANKING_METRICS };

export function rankCbRecords(records, metric = "volume") {
  const definition = RANKING_METRICS[metric] ?? RANKING_METRICS.volume;
  return arrayValue(records).map((record, index) => ({ record, index, value: finiteNumber(definition.value(record)) }))
    .sort((left, right) => {
      if (left.value === null || right.value === null) {
        return left.value === right.value ? left.index - right.index : left.value === null ? 1 : -1;
      }
      return right.value - left.value || left.index - right.index;
    })
    .map(({ record }) => record);
}

export function buildCbHeatmapPoints(records) {
  return arrayValue(records).map((record) => {
    const premiumRate = finiteNumber(record?.quote?.premiumRate);
    const conversionValue = finiteNumber(record?.quote?.conversionValue);
    const volume = finiteNumber(record?.quote?.volume);
    const cbCode = text(record?.cbCode);
    if (!cbCode || premiumRate === null || conversionValue === null || volume === null) return null;
    return {
      cbCode,
      cbName: text(record?.cbName),
      stockCode: text(record?.stockCode),
      companyName: text(record?.companyName),
      x: premiumRate,
      y: conversionValue,
      size: volume,
      detailHref: `./bonds.html?bond=${encodeURIComponent(cbCode)}`,
    };
  }).filter(Boolean);
}

export function renderMarketOverview(model, { metric = "volume" } = {}) {
  const definition = RANKING_METRICS[metric] ?? RANKING_METRICS.volume;
  const records = arrayValue(model?.records).filter((record) => record?.status === "active");
  const summary = model?.summary ?? {};
  const events = arrayValue(model?.events)
    .map(normalizeOverviewEvent)
    .filter((event) => event !== null && event.date >= model?.dataDate)
    .sort((left, right) => left.date.localeCompare(right.date) || text(left.cbCode).localeCompare(text(right.cbCode)))
    .slice(0, 6);
  const issuance = arrayValue(model?.issuance).filter((item) => item?.stages?.listingDate >= model?.dataDate).slice(0, 6);
  const ranking = rankCbRecords(records, metric).slice(0, 10);
  const heatmap = buildCbHeatmapPoints(records);
  return `<section class="cb-market-overview" data-cb-market-overview aria-label="可轉債市場總覽">
    <section class="cb-market-summary cb-market-summary--workspace" aria-label="市場快覽">
      ${summaryCard("已掛牌 CB", publicNumber(summary.listedCount ?? summary.activeCount), summary.upcomingCount ? `另有 ${summary.upcomingCount} 檔即將掛牌，可於發行頁查看` : "有效掛牌清單", "active")}
      ${summaryCard("該資料日有成交", publicNumber(summary.tradedCount), dateLabel(model?.dataDate), "traded")}
      ${summaryCard("單日成交額", publicAmount(summary.turnoverAmount), dateLabel(model?.dataDate), "turnover")}
      ${summaryCard("當週已收錄成交額", publicAmount(summary.weekTurnoverAmount), `${text(summary.weekPeriod) || "—"}${summary.weekObservedDayCount != null ? ` · 已收錄 ${summary.weekObservedDayCount} 日` : ''}`, "week")}
    </section>
    <nav class="cb-workspace-tabs" aria-label="可轉債快速篩選">
      <a href="./bonds-filter.html?quickFilter=lowPremium">轉換溢價率由低到高 →</a>
      <a href="./bonds-filter.html?quickFilter=newIssue">近 90 日發行 →</a>
      <a href="./bonds-filter.html?quickFilter=maturity365&sort=maturity">一年內到期 →</a>
      <a href="./bonds-filter.html?quickFilter=rights90&view=events">近期權利事件 →</a>
    </nav>
    <section class="cb-overview-panel" aria-labelledby="cb-ranking-heading">
      <header class="cb-overview-heading"><div><p class="section-number">TURNOVER RANKING</p><h2 id="cb-ranking-heading">成交排行</h2></div><div class="cb-rank-controls" aria-label="成交排行指標">${Object.entries(RANKING_METRICS).map(([key, item]) => `<button type="button" data-cb-overview-metric="${key}" aria-pressed="${key === metric}">${escapeHtml(item.label)}</button>`).join("")}</div></header>
      <div class="cb-ranking-table">${renderRanking(ranking, definition)}</div>
      <a class="workspace-more" href="./bonds-filter.html?sort=volume&direction=desc">查看完整可轉債清單 →</a>
    </section>
    <section class="cb-overview-grid">
      ${renderEventPanel(events)}
      ${renderIssuancePanel(issuance)}
    </section>
    ${renderHeatmap(heatmap)}
  </section>`;
}

export function publicNumber(value, digits = 2) {
  const number = finiteNumber(value);
  return number === null ? "—" : new Intl.NumberFormat("zh-TW", { maximumFractionDigits: digits }).format(number);
}

export function publicAmount(value) {
  const number = finiteNumber(value);
  if (number === null) return "—";
  if (Math.abs(number) >= 100000000) return `${publicNumber(number / 100000000, 2)} 億`;
  if (Math.abs(number) >= 10000) return `${publicNumber(number / 10000, 2)} 萬`;
  return publicNumber(number, 0);
}

function renderRanking(records, definition) {
  if (records.length === 0) return '<p class="empty-state">目前沒有可顯示的公開行情。</p>';
  return `<ol class="cb-research-cards">${records.map((record, index) => `<li>
    <header><span class="cb-rank">${index + 1}</span>
    <a href="./bonds.html?bond=${encodeURIComponent(text(record.cbCode))}"><strong>${escapeHtml(text(record.cbCode))} ${escapeHtml(text(record.cbName))}</strong><small>${escapeHtml(text(record.stockCode))} ${escapeHtml(text(record.companyName))}</small></a>
    <span class="cb-rank-value">${escapeHtml(publicNumber(definition.value(record)))}<small>${escapeHtml(definition.label)}${definition.label.includes('量') ? '（張）' : '（元）'}</small></span></header>
    <dl><div><dt>CB 收盤${record.quote?.isLatestSnapshot === false && record.quote?.cbClose != null ? `（${dateLabel(record.quote.dataDate)}）` : ''}</dt><dd>${publicNumber(record.quote?.cbClose)}</dd></div><div><dt>轉換價值</dt><dd>${publicNumber(record.quote?.stockConversionValue ?? record.quote?.conversionValue)}</dd></div><div><dt>轉換溢價率</dt><dd>${publicNumber(record.quote?.premiumRate)}${finiteNumber(record.quote?.premiumRate) === null ? '' : '%'}</dd></div></dl>
    <footer><span>到期 ${dateLabel(record.terms?.maturityDate)}</span><a href="./bonds.html?bond=${encodeURIComponent(text(record.cbCode))}">條款與完整明細 →</a></footer>
  </li>`).join("")}</ol>`;
}

function renderEventPanel(events) {
  return `<section class="cb-overview-panel" aria-labelledby="cb-events-heading"><header class="cb-overview-heading"><div><p class="section-number">UPCOMING EVENTS</p><h2 id="cb-events-heading">近期事件</h2></div><a href="./bonds-events.html">查看行事曆</a></header>${events.length ? `<ol class="cb-mini-list">${events.map((event) => `<li><time datetime="${escapeHtml(event.date)}">${escapeHtml(dateLabel(event.date))}</time><a href="./bonds.html?bond=${encodeURIComponent(text(event.cbCode))}">${escapeHtml(text(event.cbCode))} ${escapeHtml(text(event.cbName))}</a><span>${escapeHtml(text(event.label))}</span></li>`).join("")}</ol>` : '<p class="empty-state">近期沒有已公布的事件。</p>'}</section>`;
}

function normalizeOverviewEvent(event) {
  const date = [event?.date, event?.effectiveDate, event?.startDate, event?.deadlineDate, event?.endDate, event?.announcementDate]
    .find((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")));
  const label = text(event?.label) || text(event?.title);
  return date && label ? { ...event, date, label } : null;
}

function renderIssuancePanel(issuance) {
  return `<section class="cb-overview-panel" aria-labelledby="cb-issuance-heading"><header class="cb-overview-heading"><div><p class="section-number">ISSUANCE</p><h2 id="cb-issuance-heading">近期發行</h2></div><a href="./bonds-issuance.html">查看發行進度</a></header>${issuance.length ? `<ol class="cb-mini-list">${issuance.map((item) => `<li><time datetime="${escapeHtml(item.stages.listingDate)}">${escapeHtml(dateLabel(item.stages.listingDate))}</time><a href="./bonds.html?bond=${encodeURIComponent(text(item.cbCode))}">${escapeHtml(text(item.cbCode))} ${escapeHtml(text(item.cbName))}</a><span>新掛牌</span></li>`).join("")}</ol>` : '<p class="empty-state">目前沒有近期已公布的掛牌案件。</p>'}</section>`;
}

function renderHeatmap(points) {
  if (!points.length) return '<section class="cb-overview-panel cb-heatmap" data-cb-heatmap><header class="cb-overview-heading"><div><p class="section-number">OBJECTIVE EXPLORER</p><h2>熱力圖</h2></div></header><p class="empty-state">尚無同日估值資料可建立熱力圖。</p></section>';
  const xRange = rangeFor(points.map((point) => point.x));
  const yRange = rangeFor(points.map((point) => point.y));
  const maxSize = Math.max(...points.map((point) => point.size), 1);
  const labelledCodes = new Set([...points]
    .sort((left, right) => right.size - left.size || left.cbCode.localeCompare(right.cbCode))
    .slice(0, 8)
    .map((point) => point.cbCode));
  return `<section class="cb-overview-panel cb-heatmap" data-cb-heatmap aria-labelledby="cb-heatmap-heading"><header class="cb-overview-heading"><div><p class="section-number">OBJECTIVE EXPLORER</p><h2 id="cb-heatmap-heading">熱力圖</h2></div><p>X 軸：轉換溢價率 · Y 軸：轉換價值</p></header><div class="cb-heatmap-plot" role="list">${points.map((point) => { const labelled = labelledCodes.has(point.cbCode); return `<a role="listitem" href="${point.detailHref}" class="cb-heatmap-point"${labelled ? ` data-heatmap-label="${escapeHtml(point.cbCode)}"` : ""} data-heatmap-name="${escapeHtml(point.cbCode)}" style="--x:${scaled(point.x, xRange)}%;--y:${scaled(point.y, yRange)}%;--size:${10 + Math.round(point.size / maxSize * 18)}px" aria-label="${escapeHtml(`${point.cbCode} ${point.cbName}，轉換溢價率 ${publicNumber(point.x)}%，轉換價值 ${publicNumber(point.y)}，成交量 ${publicNumber(point.size)}`)}">${labelled ? `<span>${escapeHtml(point.cbCode)}</span>` : ""}</a>`; }).join("")}</div><p class="cb-heatmap-legend">泡泡大小代表成交量；僅標示成交量前 8 名，其餘可滑過或點選查看。</p></section>`;
}

function summaryCard(label, value, note, tone) {
  return `<article class="cb-summary-card cb-summary-card--${escapeHtml(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function rangeFor(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? [min - 1, max + 1] : [min, max];
}

function scaled(value, [min, max]) {
  return Math.max(6, Math.min(94, (value - min) / (max - min) * 88 + 6));
}

function dateLabel(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? String(value).replaceAll("-", "/") : "—";
}

function finiteNumber(value) {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}
