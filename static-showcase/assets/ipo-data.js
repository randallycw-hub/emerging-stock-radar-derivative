export async function loadIpoSnapshot({ fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(new URL("/api/ipo-events", location.origin), {
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const payload = await response.json();
      if (isSnapshot(payload)) return payload;
    }
  } catch {}

  return loadPublishedStaticSnapshot(fetchImpl);
}

async function loadPublishedStaticSnapshot(fetchImpl) {
  try {
    const pointerUrl = new URL("./data/current.json", location.href);
    const pointerResponse = await fetchImpl(pointerUrl, { headers: { Accept: "application/json" } });
    if (!pointerResponse.ok) return null;
    const pointer = await pointerResponse.json();
    if (typeof pointer?.runtimeUrl !== "string") return null;

    const runtimeResponse = await fetchImpl(new URL(pointer.runtimeUrl, location.href), { headers: { Accept: "application/json" } });
    if (!runtimeResponse.ok) return null;
    const runtime = await runtimeResponse.json();
    const snapshotUrl = typeof runtime?.ipoEventsUrl === "string"
      ? new URL(runtime.ipoEventsUrl, location.href)
      : null;
    if (!snapshotUrl) return null;

    const snapshotResponse = await fetchImpl(snapshotUrl, { headers: { Accept: "application/json" } });
    if (!snapshotResponse.ok) return null;
    const snapshot = await snapshotResponse.json();
    return isSnapshot(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

function isSnapshot(value) {
  return value?.schemaVersion === 1 && Array.isArray(value.records);
}
