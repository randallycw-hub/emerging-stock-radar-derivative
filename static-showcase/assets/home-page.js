import { formatDate, safeJsonFetch } from "./site-shell.js";

const updateTarget = document.querySelector("#last-successful-update");
const pointerUrl = new URL("../data/current.json", import.meta.url);

loadLastSuccessfulUpdate();

async function loadLastSuccessfulUpdate() {
  const pointer = await safeJsonFetch(pointerUrl, { errorTarget: updateTarget });
  if (!pointer?.runtimeUrl) return;

  const runtime = await safeJsonFetch(
    new URL(pointer.runtimeUrl, document.baseURI),
    { errorTarget: updateTarget },
  );
  if (!runtime?.manifestUrl) return;

  const manifest = await safeJsonFetch(
    new URL(runtime.manifestUrl, document.baseURI),
    { errorTarget: updateTarget },
  );
  if (!manifest) return;

  const date = manifest.market?.dataDate ?? manifest.generatedAt;
  updateTarget.textContent = date
    ? `最後成功更新：${formatDate(date)}`
    : "更新時間尚未提供";
}
