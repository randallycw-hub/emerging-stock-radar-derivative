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

async function initialize() {
  const update = document.querySelector("#data-center-update");
  const summary = document.querySelector("#data-center-summary");
  if (!update || !summary) return;
  const pointer = await safeJsonFetch(bootstrapConfig.generationPointerUrl, { errorTarget: update });
  const runtime = pointer?.runtimeUrl
    ? await safeJsonFetch(new URL(pointer.runtimeUrl, document.baseURI), { errorTarget: update })
    : null;
  const manifest = runtime?.manifestUrl
    ? await safeJsonFetch(new URL(runtime.manifestUrl, document.baseURI), { errorTarget: update })
    : null;
  const values = projectDataCenterSummary(manifest);
  update.textContent = values.dataDate ? `資料日期：${formatDate(values.dataDate)}` : "資料日期：—";
  summary.innerHTML = `<div><dt>市場資料日期</dt><dd>${values.dataDate ? formatDate(values.dataDate) : "—"}</dd></div><div><dt>最近更新</dt><dd>${values.generatedAt ? formatDate(values.generatedAt) : "—"}</dd></div><div><dt>公開資料檢核</dt><dd>${values.status ?? "—"}</dd></div><div><dt>資料範圍</dt><dd>興櫃、IPO、可轉債與公司月營收</dd></div>`;
}

if (globalThis.window && globalThis.document) await initialize();
