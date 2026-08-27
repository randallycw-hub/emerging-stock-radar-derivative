export const DATA_CENTER_STATUS = Object.freeze({
  OK: "OK",
  WAITING_PUBLISH: "WAITING_PUBLISH",
  DELAYED: "DELAYED",
  FALLBACK: "FALLBACK",
  ERROR: "ERROR",
  NON_TRADING_DAY: "NON_TRADING_DAY",
});

export const DATA_CENTER_STATUS_LABELS = Object.freeze({
  [DATA_CENTER_STATUS.OK]: "正常",
  [DATA_CENTER_STATUS.WAITING_PUBLISH]: "等待發布",
  [DATA_CENTER_STATUS.DELAYED]: "延遲",
  [DATA_CENTER_STATUS.FALLBACK]: "使用前次快照",
  [DATA_CENTER_STATUS.ERROR]: "資料異常",
  [DATA_CENTER_STATUS.NON_TRADING_DAY]: "非交易日",
});

const taipeiTimeZone = "Asia/Taipei";
const dailyPublicationHour = 18;

function strictIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00+08:00`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function strictYearMonth(value) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return value;
}

function publishedDataDate(value, cadence) {
  return cadence === "monthly" ? strictYearMonth(value) : strictIsoDate(value);
}

function validInstant(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function taipeiParts(value) {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: taipeiTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const fields = Object.fromEntries(values.map((part) => [part.type, part.value]));
  const date = `${fields.year}-${fields.month}-${fields.day}`;
  return strictIsoDate(date) ? { date, hour: Number(fields.hour) } : null;
}

function taipeiWeekday(isoDate) {
  const date = strictIsoDate(isoDate);
  if (!date) return null;
  const weekday = new Date(`${date}T12:00:00+08:00`).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

function calendarDistance(from, to) {
  const start = strictIsoDate(from);
  const end = strictIsoDate(to);
  if (!start || !end) return null;
  return Math.round((Date.UTC(...start.split("-").map(Number)) - Date.UTC(...end.split("-").map(Number))) / 86_400_000);
}

function knownCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function rowsCount(value) {
  return Array.isArray(value) ? value.length : null;
}

function sourceDate(value) {
  const direct = strictIsoDate(value);
  if (direct) return direct;
  const instant = validInstant(value);
  return instant ? taipeiParts(instant)?.date ?? null : null;
}

function findDataset(manifest, datasetId) {
  return (Array.isArray(manifest?.datasets) ? manifest.datasets : [])
    .find((dataset) => dataset?.datasetId === datasetId) ?? null;
}

function findMarketFile(manifest, name) {
  return (Array.isArray(manifest?.market?.files) ? manifest.market.files : [])
    .find((file) => file?.name === name) ?? null;
}

function sourceUrls(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => typeof item?.sourceUrl === "string" ? item.sourceUrl : null)
    .filter((url) => {
      try {
        return new URL(url).protocol === "https:";
      } catch {
        return false;
      }
    });
}

function firstSourceUrl(value) {
  return sourceUrls([value])[0] ?? null;
}

function statusReason(status, { fallbackSnapshotId = null, dataDate = null } = {}) {
  switch (status) {
    case DATA_CENTER_STATUS.OK: return "已取得並通過建置期公開資料檢核";
    case DATA_CENTER_STATUS.WAITING_PUBLISH: return "尚在正常公開資料發布時段內";
    case DATA_CENTER_STATUS.DELAYED: return "已超過正常公開資料發布時段，尚未取得較新的已驗證資料";
    case DATA_CENTER_STATUS.FALLBACK: return fallbackSnapshotId
      ? `目前保留前次有效快照 ${fallbackSnapshotId}`
      : "目前保留前次有效快照";
    case DATA_CENTER_STATUS.ERROR: return dataDate ? "建置期資料檢核未通過" : "缺少可驗證的公開資料日期";
    case DATA_CENTER_STATUS.NON_TRADING_DAY: return "非交易日，使用最近有效資料日";
    default: return "—";
  }
}

export function projectDatasetStatus({
  dataDate = null,
  evaluatedAt = null,
  cadence = "daily",
  qaPassed = false,
  fallbackSnapshotId = null,
} = {}) {
  const evaluated = taipeiParts(evaluatedAt);
  if (!evaluated || !qaPassed) return DATA_CENTER_STATUS.ERROR;
  if (taipeiWeekday(evaluated.date) === false) return DATA_CENTER_STATUS.NON_TRADING_DAY;
  const publishedDate = publishedDataDate(dataDate, cadence);
  if (!publishedDate) return DATA_CENTER_STATUS.ERROR;
  if (cadence !== "daily") return DATA_CENTER_STATUS.OK;
  const lagDays = calendarDistance(evaluated.date, publishedDate);
  if (lagDays === null || lagDays < 0) return DATA_CENTER_STATUS.ERROR;
  if (lagDays === 0) return DATA_CENTER_STATUS.OK;
  if (fallbackSnapshotId) return DATA_CENTER_STATUS.FALLBACK;
  return evaluated.hour < dailyPublicationHour
    ? DATA_CENTER_STATUS.WAITING_PUBLISH
    : DATA_CENTER_STATUS.DELAYED;
}

function buildDataset({ id, label, source, sourceUrl = null, dataDate = null, lastSuccessAt = null, recordCount = null, cadence = "daily", qaPassed, fallbackSnapshotId = null }) {
  const status = projectDatasetStatus({ dataDate, evaluatedAt: lastSuccessAt?.evaluatedAt, cadence, qaPassed, fallbackSnapshotId });
  return {
    id,
    label,
    source,
    sourceUrl,
    dataDate: publishedDataDate(dataDate, cadence),
    lastSuccessAt: validInstant(lastSuccessAt?.value) ?? strictIsoDate(lastSuccessAt?.value),
    recordCount: knownCount(recordCount),
    cadence,
    status,
    statusLabel: DATA_CENTER_STATUS_LABELS[status],
    statusReason: statusReason(status, { fallbackSnapshotId, dataDate }),
    fallbackSnapshotId: typeof fallbackSnapshotId === "string" && fallbackSnapshotId ? fallbackSnapshotId : null,
  };
}

function systemStatus(datasets) {
  const statuses = datasets.map((dataset) => dataset.status);
  if (statuses.includes(DATA_CENTER_STATUS.ERROR)) return DATA_CENTER_STATUS.ERROR;
  if (statuses.includes(DATA_CENTER_STATUS.FALLBACK)) return DATA_CENTER_STATUS.FALLBACK;
  if (statuses.includes(DATA_CENTER_STATUS.DELAYED)) return DATA_CENTER_STATUS.DELAYED;
  if (statuses.includes(DATA_CENTER_STATUS.WAITING_PUBLISH)) return DATA_CENTER_STATUS.WAITING_PUBLISH;
  if (statuses.length > 0 && statuses.every((status) => status === DATA_CENTER_STATUS.NON_TRADING_DAY)) return DATA_CENTER_STATUS.NON_TRADING_DAY;
  return DATA_CENTER_STATUS.OK;
}

function timelineEvent(at, label, detail) {
  const date = validInstant(at) ?? strictIsoDate(at);
  return date ? { at: date, label, detail } : null;
}

function officialSourceRegistry(manifest, ipoSnapshot) {
  const direct = Array.isArray(manifest?.datasets) ? manifest.datasets : [];
  const ipo = sourceUrls(ipoSnapshot?.sourceManifest);
  const allUrls = [...sourceUrls(direct), ...ipo];
  const matching = (predicate) => allUrls.filter((url) => predicate(new URL(url).hostname));
  const entries = [
    { name: "TPEx 櫃買中心", purpose: "興櫃市場與可轉債公開資料", urls: matching((hostname) => /tpex/i.test(hostname)) },
    { name: "臺灣證券交易所", purpose: "IPO 申請、承銷與掛牌公開事件", urls: matching((hostname) => /(^|\.)twse\.com\.tw$/i.test(hostname) && !/^mopsfin\./i.test(hostname)) },
    { name: "公開資訊觀測站", purpose: "公司月營收公開資料", urls: matching((hostname) => /^mopsfin\./i.test(hostname)) },
  ].map((entry) => ({ ...entry, urls: [...new Set(entry.urls)] }))
    .filter((entry) => entry.urls.length > 0);
  return entries;
}

export function buildDataCenterStatus({
  generation,
  manifest = {},
  artifacts = {},
  evaluatedAt,
  qa = {},
  fallbackSnapshotId = null,
} = {}) {
  const evaluated = validInstant(evaluatedAt);
  const snapshotId = typeof generation === "string" ? generation.split("/").at(-1) ?? null : null;
  const qaChecks = (Array.isArray(qa.checks) ? qa.checks : [])
    .filter((check) => typeof check?.label === "string" && check.label.trim())
    .map((check) => ({ label: check.label.trim(), passed: check.passed === true }));
  const qaPassed = manifest?.market?.status === "verified" && qaChecks.length > 0 && qaChecks.every((check) => check.passed);
  const evaluatedContext = { evaluatedAt: evaluated, value: null };
  const marketDate = strictIsoDate(manifest?.market?.dataDate);
  const emerging = artifacts?.emergingMarket ?? {};
  const ipo = artifacts?.ipoEvents ?? {};
  const workbench = artifacts?.bondWorkbench ?? {};
  const revenue = artifacts?.revenue ?? {};
  const terms = findDataset(manifest, "11406");
  const revenueDataset = findDataset(manifest, "94025");
  const workbenchFile = findMarketFile(manifest, "bond-workbench.json");
  const conversionFile = findMarketFile(manifest, "conversion-prices.json");
  const supplementalFile = findMarketFile(manifest, "bond-supplemental.json");
  const eventDate = sourceDate(manifest?.market?.supplementalSources?.redemption?.dataDate)
    ?? sourceDate(manifest?.market?.supplementalSources?.underwriting?.dataDate)
    ?? marketDate;
  const datasets = [
    buildDataset({
      id: "emerging-market", label: "興櫃盤後行情", source: "TPEx 櫃買中心",
      sourceUrl: firstSourceUrl(findDataset(manifest, "emergingMarket")), dataDate: emerging.tradingDate,
      lastSuccessAt: { value: emerging.publishedAt, evaluatedAt: evaluatedContext.evaluatedAt }, recordCount: rowsCount(emerging.records), cadence: "daily", qaPassed, fallbackSnapshotId,
    }),
    buildDataset({
      id: "monthly-revenue", label: "公司月營收", source: "公開資訊觀測站",
      sourceUrl: firstSourceUrl(revenueDataset), dataDate: revenue.period,
      lastSuccessAt: { value: revenueDataset?.downloadedAt, evaluatedAt: evaluatedContext.evaluatedAt }, recordCount: rowsCount(revenue.records), cadence: "monthly", qaPassed, fallbackSnapshotId,
    }),
    buildDataset({
      id: "ipo-events", label: "IPO 公開時程", source: "TWSE／TPEx",
      sourceUrl: sourceUrls(ipo.sourceManifest)[0] ?? null, dataDate: ipo.dataDate,
      lastSuccessAt: { value: ipo.generatedAt, evaluatedAt: evaluatedContext.evaluatedAt }, recordCount: rowsCount(ipo.records), cadence: "daily", qaPassed, fallbackSnapshotId,
    }),
    buildDataset({
      id: "cb-market", label: "可轉債盤後行情", source: "TPEx 櫃買中心",
      sourceUrl: firstSourceUrl(terms), dataDate: workbench.dataDate,
      lastSuccessAt: { value: workbench.generatedAt, evaluatedAt: evaluatedContext.evaluatedAt }, recordCount: knownCount(workbenchFile?.recordCount), cadence: "daily", qaPassed, fallbackSnapshotId,
    }),
    buildDataset({
      id: "cb-terms", label: "可轉債發行條款", source: "TPEx 櫃買中心",
      sourceUrl: firstSourceUrl(terms), dataDate: sourceDate(terms?.downloadedAt),
      lastSuccessAt: { value: terms?.downloadedAt, evaluatedAt: evaluatedContext.evaluatedAt }, recordCount: knownCount(terms?.rowCount), cadence: "event", qaPassed, fallbackSnapshotId,
    }),
    buildDataset({
      id: "cb-conversion", label: "可轉債轉換價格", source: "既有官方公開來源",
      sourceUrl: firstSourceUrl(terms), dataDate: workbench.dataDate,
      lastSuccessAt: { value: workbench.generatedAt, evaluatedAt: evaluatedContext.evaluatedAt }, recordCount: knownCount(conversionFile?.recordCount), cadence: "event", qaPassed, fallbackSnapshotId,
    }),
    buildDataset({
      id: "cb-events", label: "可轉債權利事件", source: "既有官方公告來源",
      sourceUrl: firstSourceUrl(terms), dataDate: eventDate,
      lastSuccessAt: { value: manifest?.market?.generatedAt, evaluatedAt: evaluatedContext.evaluatedAt }, recordCount: knownCount(supplementalFile?.recordCount), cadence: "event", qaPassed, fallbackSnapshotId,
    }),
  ];
  const system = systemStatus(datasets);
  const normalDatasetCount = datasets.filter((dataset) => [DATA_CENTER_STATUS.OK, DATA_CENTER_STATUS.NON_TRADING_DAY].includes(dataset.status)).length;
  const timeline = [
    timelineEvent(qa.checkedAt ?? evaluated, "公開資料檢核完成", qaPassed ? `${qaChecks.filter((check) => check.passed).length} 項建置期檢核通過` : "建置期檢核未通過"),
    timelineEvent(manifest?.market?.generatedAt, "市場快照已建立", marketDate ? `市場資料日 ${marketDate}` : "—"),
    timelineEvent(ipo.generatedAt, "IPO 公開時程已整理", knownCount(rowsCount(ipo.records)) === null ? "—" : `${rowsCount(ipo.records)} 筆公開事件`),
    timelineEvent(workbench.generatedAt, "可轉債公開資料已整理", knownCount(workbenchFile?.recordCount) === null ? "—" : `${workbenchFile.recordCount} 筆資料`),
    timelineEvent(emerging.publishedAt, "興櫃盤後資料已發布", knownCount(rowsCount(emerging.records)) === null ? "—" : `${rowsCount(emerging.records)} 筆資料`),
  ].filter(Boolean).sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
  return {
    schemaVersion: 1,
    generatedAt: evaluated,
    snapshotId,
    dataDate: marketDate,
    system: {
      status: system,
      statusLabel: DATA_CENTER_STATUS_LABELS[system],
      statusReason: statusReason(system, { fallbackSnapshotId, dataDate: marketDate }),
      normalDatasetCount,
      totalDatasetCount: datasets.length,
      lastCompleteUpdateAt: validInstant(manifest?.market?.generatedAt) ?? strictIsoDate(manifest?.generatedAt),
      lastQaAt: validInstant(qa.checkedAt) ?? evaluated,
    },
    snapshot: { current: snapshotId, previous: typeof fallbackSnapshotId === "string" ? fallbackSnapshotId : null, fallbackInUse: system === DATA_CENTER_STATUS.FALLBACK },
    datasets,
    qa: { passed: qaPassed, checks: qaChecks, completedAt: validInstant(qa.checkedAt) ?? evaluated },
    timeline,
    incidents: { unresolved: [], corrected: [] },
    sources: officialSourceRegistry(manifest, ipo),
    commonStates: [
      { label: "—", description: "沒有可核對的資料，不代表 0。" },
      { label: "今日無成交", description: "當日沒有成交紀錄。" },
      { label: "前次成交", description: "明確標示最近有效成交日，不冒充今日價格。" },
      { label: "等待發布", description: "官方尚在正常發布時段內。" },
      { label: "來源延遲", description: "已超過正常更新窗口，尚未取得較新的已驗證資料。" },
      { label: "使用前次快照", description: "今日未能安全發布新版本時保留最近有效資料。" },
    ],
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function publicDate(value) {
  if (typeof value !== "string" || !value) return "—";
  const date = strictIsoDate(value.slice(0, 10));
  return date ? date.replaceAll("-", "/") : escapeHtml(value);
}

export function renderDataCenterBootstrap(status = {}) {
  const system = status?.system ?? {};
  const snapshot = status?.snapshot ?? {};
  const statusId = Object.hasOwn(DATA_CENTER_STATUS_LABELS, system.status)
    ? system.status
    : DATA_CENTER_STATUS.ERROR;
  return `<section class="data-center-safe-summary" aria-labelledby="data-center-safe-title"><div><p class="section-number">DATA CENTER / SAFE SNAPSHOT</p><h2 id="data-center-safe-title">資料營運中心</h2><p><span class="data-status data-status--${escapeHtml(statusId.toLowerCase())}">${escapeHtml(DATA_CENTER_STATUS_LABELS[statusId])}</span> ${escapeHtml(system.statusReason ?? "—")}</p></div><dl class="data-center-safe-facts"><div><dt>市場資料日</dt><dd>${publicDate(status?.dataDate)}</dd></div><div><dt>最後完整更新</dt><dd>${publicDate(system.lastCompleteUpdateAt)}</dd></div><div><dt>最後 QA</dt><dd>${publicDate(system.lastQaAt)}</dd></div><div><dt>正常資料集</dt><dd>${Number.isInteger(system.normalDatasetCount) && Number.isInteger(system.totalDatasetCount) ? `${system.normalDatasetCount} / ${system.totalDatasetCount}` : "—"}</dd></div><div><dt>快照</dt><dd>${escapeHtml(snapshot.current ?? "—")}</dd></div></dl></section>`;
}
