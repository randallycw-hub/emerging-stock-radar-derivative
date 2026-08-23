import { formatDate, safeJsonFetch } from "./site-shell.js";
import { buildPublicEventDigest, isPublishedIsoDate } from "./public-event-digest.js";

const updateTarget = document.querySelector("#last-successful-update");
const coverageTarget = document.querySelector("#home-data-coverage");
const eventStrip = document.querySelector("#home-event-strip");
const bootstrapConfig = globalThis.window?.__OFFICIAL_SHOWCASE__ ?? {
  generationPointerUrl: new URL("../data/current.json", import.meta.url).href,
};
const pointerUrl = bootstrapConfig.generationPointerUrl;

loadHomeData();

async function loadHomeData() {
  const pointer = await safeJsonFetch(pointerUrl, { errorTarget: updateTarget });
  if (!pointer?.runtimeUrl) return renderHomeEvents({});

  const runtime = await safeJsonFetch(
    new URL(pointer.runtimeUrl, document.baseURI),
    { errorTarget: updateTarget },
  );
  if (!runtime?.manifestUrl) return renderHomeEvents({});

  const manifest = await safeJsonFetch(
    new URL(runtime.manifestUrl, document.baseURI),
    { errorTarget: updateTarget },
  );
  const workbenchUrl = runtime.datasets?.bondWorkbench;
  const ipoEventsUrl = runtime.ipoEventsUrl;
  const [workbench, ipo] = await Promise.all([
    typeof workbenchUrl === "string"
      ? safeJsonFetch(new URL(workbenchUrl, document.baseURI), { errorTarget: coverageTarget })
      : Promise.resolve(null),
    typeof ipoEventsUrl === "string"
      ? safeJsonFetch(new URL(ipoEventsUrl, document.baseURI), { errorTarget: coverageTarget })
      : Promise.resolve(null),
  ]);

  const date = manifest?.market?.dataDate ?? manifest?.generatedAt;
  updateTarget.textContent = isPublishedIsoDate(date)
    ? `最後成功更新：${formatDate(date)}`
    : "更新時間尚未提供";
  renderHomeEvents({
    asOfDate: manifest?.market?.dataDate,
    bonds: Array.isArray(workbench?.records) ? workbench.records : undefined,
    ipoRecords: Array.isArray(ipo?.records) ? ipo.records : undefined,
  });
}

function renderHomeEvents(input) {
  const digest = buildPublicEventDigest(input);
  const usableInputs = [input.bonds, input.ipoRecords].filter(Array.isArray).length;
  const dataDate = isPublishedIsoDate(input.asOfDate) ? formatDate(input.asOfDate) : "尚未提供";
  coverageTarget.textContent = `資料日期 ${dataDate} · 可用來源輸入 ${usableInputs} 項`;
  eventStrip.innerHTML = digest.map(eventCardHtml).join("");
}

function eventCardHtml(event) {
  const content = `<p>${escapeHtml(event.label)}</p>${event.state === "ready"
    ? `<strong>${event.count} 項</strong>${isPublishedIsoDate(event.nearestDate) ? `<span>最近日期 ${formatDate(event.nearestDate)}</span>` : ""}`
    : "<span>資料暫時無法讀取</span>"}`;
  if (event.state === "ready") {
    return `<a class="home-event-card" href="${escapeAttribute(event.href)}">${content}<span aria-hidden="true">→</span></a>`;
  }
  return `<article class="home-event-card home-event-card--unavailable">${content}</article>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
