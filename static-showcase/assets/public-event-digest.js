const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_IPO_WINDOW_DAYS = 365;
const ACTIVE_IPO_STAGES = new Set(["A", "B", "C", "D"]);
const APPROVED_IPO_SOURCE_IDS = new Set([
  "twse-applications",
  "tpex-applications",
  "tpex-ipo-listings",
  "twse-auctions",
  "twse-public-offerings",
]);

export function isPublishedIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return false;
  const date = new Date(timestamp);
  return date.toISOString().slice(0, 10) === value;
}

function dayNumber(value) {
  return Date.parse(`${value}T00:00:00Z`) / DAY_MS;
}

function nearestDate(dates) {
  return dates.length ? dates.slice().sort()[0] : null;
}

function item(id, label, count, dates, href, state = "ready") {
  return { id, label, count, nearestDate: nearestDate(dates), href, state };
}

export function buildPublicEventDigest(input = {}) {
  const asOfDate = input?.asOfDate;
  const hasAsOfDate = isPublishedIsoDate(asOfDate);
  const ipoDataDate = input?.ipoDataDate;
  const ipoRecords = input?.ipoRecords;
  const ipoSourceManifest = input?.ipoSourceManifest;
  const hasIpoInputs = isPublishedIsoDate(ipoDataDate)
    && Array.isArray(ipoRecords)
    && Array.isArray(ipoSourceManifest);
  const ipoDates = [];

  if (hasIpoInputs) {
    const manifestSourceIds = new Set(ipoSourceManifest
      .map((entry) => entry?.sourceId)
      .filter((sourceId) => APPROVED_IPO_SOURCE_IDS.has(sourceId)));
    for (const record of ipoRecords) {
      if (!isActiveIpoRecord(record, ipoDataDate, manifestSourceIds)) continue;
      for (const event of approvedIpoEvents(record, manifestSourceIds)) {
        ipoDates.push(event.date);
      }
    }
  }

  const common = [
    item("ipo-recent", "近期 IPO 事件", ipoDates.length, ipoDates, "./ipo.html?stage=active&sort=eventDate&direction=asc", hasIpoInputs ? "ready" : "unavailable"),
  ];

  if (!Array.isArray(input?.bonds) || !hasAsOfDate) {
    return common.concat([
      item("bond-rights-90", "90 日內權利事件", null, [], "./bonds.html?event=rights90", "unavailable"),
      item("bond-maturity-365", "365 日內到期事件", null, [], "./bonds.html?event=maturity365", "unavailable"),
      item("bond-pending", "資料待補可轉債", null, [], "./bonds.html?quality=pending", "unavailable"),
    ]);
  }

  const asOfDay = dayNumber(asOfDate);
  const rightsDates = [];
  const maturityDates = [];
  let pendingCount = 0;
  for (const bond of input.bonds) {
    if (bond?.dataQuality !== "complete") pendingCount += 1;
    if (isPublishedIsoDate(bond?.nextEventDate)) {
      const days = dayNumber(bond.nextEventDate) - asOfDay;
      if (days >= 0 && days <= 90) rightsDates.push(bond.nextEventDate);
    }
    if (isPublishedIsoDate(bond?.maturityDate)) {
      const days = dayNumber(bond.maturityDate) - asOfDay;
      if (days >= 0 && days <= 365) maturityDates.push(bond.maturityDate);
    }
  }
  return common.concat([
    item("bond-rights-90", "90 日內權利事件", rightsDates.length, rightsDates, "./bonds.html?event=rights90"),
    item("bond-maturity-365", "365 日內到期事件", maturityDates.length, maturityDates, "./bonds.html?event=maturity365"),
    item("bond-pending", "資料待補可轉債", pendingCount, [], "./bonds.html?quality=pending"),
  ]);
}

function approvedIpoEvents(record, manifestSourceIds) {
  if (!Array.isArray(record?.events)) return [];
  return record.events.filter((event) => (
    isPublishedIsoDate(event?.date)
    && Array.isArray(event?.sourceRecordIds)
    && event.sourceRecordIds.some((recordId) => {
      const sourceId = ipoSourceIdForRecordId(recordId);
      return sourceId !== null && manifestSourceIds.has(sourceId);
    })
  ));
}

function isActiveIpoRecord(record, dataDate, manifestSourceIds) {
  if (!ACTIVE_IPO_STAGES.has(record?.stage) || record?.exceptionStatus) return false;
  const events = approvedIpoEvents(record, manifestSourceIds);
  if (events.length === 0) return false;
  const latestDate = events.map((event) => event.date).sort().at(-1);
  return dayNumber(dataDate) - dayNumber(latestDate) <= ACTIVE_IPO_WINDOW_DAYS;
}

function ipoSourceIdForRecordId(recordId) {
  const value = String(recordId ?? "");
  if (/^TWSE:auction:\d{4}:/.test(value)) return "twse-auctions";
  if (/^TWSE:(?:public|public-offering):\d{4}:/.test(value)) return "twse-public-offerings";
  if (/^TPEx:ipo-no-limit:\d{4}:/i.test(value)) return "tpex-ipo-listings";
  if (/^TWSE:\d{4}:/.test(value)) return "twse-applications";
  if (/^TPEx:\d{4}:/.test(value)) return "tpex-applications";
  return null;
}
