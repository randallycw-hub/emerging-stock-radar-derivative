import { renderDataCenterBootstrap } from "./data-center-status.js";
import { isPublishedIsoDate } from "./public-event-digest.js";
import { configuredPublishedPointerUrl, resolvePublishedDataUrl } from "./public-data-origin.js";

const bootstrapConfig = globalThis.window?.__OFFICIAL_SHOWCASE__ ?? {
  generationPointerUrl: new URL("../data/current.json", import.meta.url).href,
};
const pointerUrl = configuredPublishedPointerUrl(
  bootstrapConfig,
  new URL("../data/current.json", import.meta.url),
);

const legacyPublicDatasets = Object.freeze([
  Object.freeze({ label: "興櫃盤後", source: "TPEx", isAvailable: (runtime) => Boolean(runtime?.emergingMarketUrl) }),
  Object.freeze({ label: "IPO 公開時程", source: "TWSE／TPEx", isAvailable: (runtime) => Boolean(runtime?.ipoEventsUrl) }),
  Object.freeze({ label: "可轉債", source: "TPEx", isAvailable: (runtime) => Boolean(runtime?.datasets?.bondWorkbench) }),
  Object.freeze({ label: "月營收", source: "公開資訊觀測站", isAvailable: (runtime) => Boolean(runtime?.datasets?.["94025"]) }),
]);

// Keeps the V2 read-model contract available to existing public-only regression tests.
export function projectDatasetHealth(runtime = {}, manifest = {}) {
  const dataDate = isPublishedIsoDate(manifest?.market?.dataDate) ? manifest.market.dataDate : null;
  return legacyPublicDatasets.map(({ label, source, isAvailable }) => ({
    label,
    source,
    status: isAvailable(runtime) && dataDate ? "已發布" : "尚未提供",
    dataDate,
  }));
}

function validStatusSnapshot(value) {
  return value !== null
    && typeof value === "object"
    && value.schemaVersion === 1
    && typeof value.snapshotId === "string"
    && Array.isArray(value.datasets);
}

export function chooseStatusSnapshot(bootstrap, refreshed) {
  return validStatusSnapshot(refreshed) ? refreshed : bootstrap;
}

export function readEmbeddedStatus(element) {
  if (!element?.textContent) return null;
  try {
    const parsed = JSON.parse(element.textContent);
    return validStatusSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readJson(url) {
  try {
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchCurrentStatus() {
  const pointer = await readJson(pointerUrl);
  if (!/^generations\/[a-f0-9]+$/i.test(pointer?.generation ?? "")) return null;
  const url = resolvePublishedDataUrl(`./data/${pointer.generation}/data-status.json`, pointerUrl);
  const status = await readJson(url);
  return validStatusSnapshot(status) ? status : null;
}

function render(target, status) {
  if (!target || !validStatusSnapshot(status)) return false;
  target.innerHTML = renderDataCenterBootstrap(status);
  return true;
}

async function initialize() {
  const target = document.querySelector("#data-center-static-summary");
  const message = document.querySelector("#data-center-update");
  const bootstrap = readEmbeddedStatus(document.querySelector("#data-center-bootstrap"));
  if (!render(target, bootstrap)) {
    if (message) message.textContent = "目前沒有可顯示的已發布資料狀態。";
    return;
  }
  if (message) message.textContent = "目前顯示最近安全快照。";
  const refreshed = await fetchCurrentStatus();
  const selected = chooseStatusSnapshot(bootstrap, refreshed);
  render(target, selected);
  if (message && selected === bootstrap && !refreshed) {
    message.textContent = "即時狀態無法更新，仍顯示最近安全快照。";
  }
}

if (globalThis.window && globalThis.document) await initialize();
