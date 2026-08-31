export async function loadIpoSnapshot({ fetchImpl = fetch } = {}) {
  const published = await loadPublishedStaticSnapshot(fetchImpl);
  if (published) return published;
  try {
    const response = await fetchImpl(new URL("/api/ipo-events", location.origin), {
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const payload = await response.json();
      if (isSnapshot(payload)) return payload;
    }
  } catch {}

  return null;
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
    if (typeof runtime?.v56MarketDataUrl === "string") {
      const v56Response = await fetchImpl(new URL(runtime.v56MarketDataUrl, location.href), { headers: { Accept: "application/json" } });
      if (v56Response.ok) {
        const v56Snapshot = snapshotFromV56Model(await v56Response.json());
        if (v56Snapshot) return v56Snapshot;
      }
    }
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

/** Converts the staging-only V5.6 model into the existing public IPO shape. */
export function snapshotFromV56Model(model) {
  if (model?.schemaVersion !== 3 || !isIsoDate(model?.dataDate) || !Array.isArray(model?.ipoPipeline?.records)) return null;
  const records = model.ipoPipeline.records.flatMap((record) => {
    const companyCode = text(record?.stockCode);
    const companyName = text(record?.companyName);
    if (!/^\d{4}$/.test(companyCode) || !companyName) return [];
    return [{
      companyCode,
      companyName,
      market: text(record?.market),
      stage: text(record?.stage),
      exceptionStatus: textOrNull(record?.exceptionStatus),
      applicationDate: dateOrNull(record?.applicationDate),
      reviewDate: dateOrNull(record?.reviewDate),
      boardDate: dateOrNull(record?.boardDate),
      contractDate: dateOrNull(record?.contractDate),
      listingDate: dateOrNull(record?.listingDate),
      provisionalUnderwritingPrice: finiteOrNull(record?.provisionalUnderwritingPrice),
      finalUnderwritingPrice: finiteOrNull(record?.offerPrice),
      underwriter: textOrNull(record?.underwriter),
      auction: projectOfferingFacts(record?.auction, ["bidStartDate", "bidEndDate", "auctionOpenDate"]),
      publicOffering: projectOfferingFacts(record?.publicOffering, ["subscriptionStartDate", "subscriptionEndDate", "drawDate"]),
      events: (Array.isArray(record?.events) ? record.events : []).flatMap((event) => {
        const date = dateOrNull(event?.date);
        const label = text(event?.label);
        if (!date || !label || event?.verified !== true) return [];
        return [{ date, kind: text(event?.kind) || label, label, verified: true }];
      }),
    }];
  });
  return {
    schemaVersion: 1,
    dataDate: model.dataDate,
    generatedAt: typeof model?.generatedAt === "string" ? model.generatedAt : null,
    sourceManifest: [],
    records,
  };
}

function projectOfferingFacts(record, dateKeys) {
  if (record?.verified !== true) return null;
  const result = { verified: true };
  for (const key of dateKeys) result[key] = dateOrNull(record?.[key]);
  result.listingDate = dateOrNull(record?.listingDate);
  if (Object.hasOwn(record ?? {}, "minimumBidPrice")) result.minimumBidPrice = finiteOrNull(record.minimumBidPrice);
  if (Object.hasOwn(record ?? {}, "provisionalUnderwritingPrice")) result.provisionalUnderwritingPrice = finiteOrNull(record.provisionalUnderwritingPrice);
  if (Object.hasOwn(record ?? {}, "finalUnderwritingPrice")) result.finalUnderwritingPrice = finiteOrNull(record.finalUnderwritingPrice);
  return result;
}

function isSnapshot(value) {
  return value?.schemaVersion === 1 && Array.isArray(value.records);
}

function finiteOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dateOrNull(value) {
  return isIsoDate(value) ? value : null;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function textOrNull(value) {
  const result = text(value);
  return result || null;
}
