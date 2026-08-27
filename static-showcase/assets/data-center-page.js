import { formatDate, safeJsonFetch } from "./site-shell.js";
import { isPublishedIsoDate } from "./public-event-digest.js";

const bootstrapConfig = globalThis.window?.__OFFICIAL_SHOWCASE__ ?? {
  generationPointerUrl: new URL("../data/current.json", import.meta.url).href,
};

export function projectDataCenterSummary(manifest = {}) {
  const dataDate = manifest?.market?.dataDate;
  const generatedAt = typeof manifest?.generatedAt === "string" && !Number.isNaN(Date.parse(manifest.generatedAt))
    ? manifest.generatedAt
    : null;
  return {
    dataDate: isPublishedIsoDate(dataDate) ? dataDate : null,
    generatedAt,
    status: manifest?.status === "official-static-snapshot" ? "已發布公開快照" : null,
  };
}

const PUBLIC_DATASETS = Object.freeze([
  Object.freeze({ label: "興櫃盤後", source: "TPEx", isAvailable: (runtime) => Boolean(runtime?.emergingMarketUrl) }),
  Object.freeze({ label: "IPO 公開時程", source: "TWSE／TPEx", isAvailable: (runtime) => Boolean(runtime?.ipoEventsUrl) }),
  Object.freeze({ label: "可轉債", source: "TPEx", isAvailable: (runtime) => Boolean(runtime?.datasets?.bondWorkbench) }),
  Object.freeze({ label: "月營收", source: "公開資訊觀測站", isAvailable: (runtime) => Boolean(runtime?.datasets?.["94025"]) }),
]);

export function projectDatasetHealth(runtime = {}, manifest = {}) {
  const dataDate = isPublishedIsoDate(manifest?.market?.dataDate) ? manifest.market.dataDate : null;
  return PUBLIC_DATASETS.map(({ label, source, isAvailable }) => ({
    label,
    source,
    status: isAvailable(runtime) && dataDate ? "已發布" : "尚未提供",
    dataDate,
  }));
}

function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function renderDatasetHealth(target, datasets) {
  if (!target) return;
  target.innerHTML = datasets.map((dataset) => `<article class="data-dataset-card"><h3>${safeText(dataset.label)}</h3><dl><div><dt>來源</dt><dd>${safeText(dataset.source)}</dd></div><div><dt>資料日期</dt><dd>${dataset.dataDate ? safeText(formatDate(dataset.dataDate)) : "—"}</dd></div><div><dt>狀態</dt><dd class="data-status data-status--${dataset.status === "已發布" ? "published" : "unavailable"}">${safeText(dataset.status)}</dd></div></dl></article>`).join("");
}

function renderUpdateLog(target, values) {
  if (!target) return;
  target.innerHTML = values.dataDate
    ? `<li><time>${safeText(formatDate(values.dataDate))}</time><span>公開資料已更新</span></li>${values.generatedAt ? `<li><time>${safeText(formatDate(values.generatedAt))}</time><span>本站資料快照已建立</span></li>` : ""}`
    : "<li><span>目前尚無可顯示的更新紀錄。</span></li>";
}

async function initialize() {
  const update = document.querySelector("#data-center-update");
  const summary = document.querySelector("#data-center-summary");
  const datasets = document.querySelector("#data-center-datasets");
  const updateLog = document.querySelector("#data-center-update-log");
  if (!update || !summary) return;
  const pointer = await safeJsonFetch(bootstrapConfig.generationPointerUrl, { errorTarget: update });
  const runtime = pointer?.runtimeUrl
    ? await safeJsonFetch(new URL(pointer.runtimeUrl, document.baseURI), { errorTarget: update })
    : null;
  const manifest = runtime?.manifestUrl
    ? await safeJsonFetch(new URL(runtime.manifestUrl, document.baseURI), { errorTarget: update })
    : null;
  const values = projectDataCenterSummary(manifest);
  renderDatasetHealth(datasets, projectDatasetHealth(runtime, manifest));
  renderUpdateLog(updateLog, values);
  update.textContent = values.dataDate ? `資料日期：${formatDate(values.dataDate)}` : "資料日期：—";
  summary.innerHTML = `<div><dt>市場資料日期</dt><dd>${values.dataDate ? formatDate(values.dataDate) : "—"}</dd></div><div><dt>最近更新</dt><dd>${values.generatedAt ? formatDate(values.generatedAt) : "—"}</dd></div><div><dt>公開資料檢核</dt><dd>${values.status ?? "—"}</dd></div><div><dt>資料範圍</dt><dd>興櫃、IPO、可轉債與公司月營收</dd></div>`;
}

if (globalThis.window && globalThis.document) await initialize();
