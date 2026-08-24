import { normalizeApprovedIpoEvents, projectActiveIpoEventEntries } from "./ipo-stage-filter.js";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

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
    const projectedRows = ipoRecords.map((record) => ({
      ...record,
      events: normalizeApprovedIpoEvents(record, ipoSourceManifest),
    }));
    ipoDates.push(...projectActiveIpoEventEntries(projectedRows, ipoDataDate)
      .filter(({ row }) => row.stage === "C" || row.stage === "D")
      .map(({ event }) => event.date));
  }

  const common = [
    item("ipo-recent", "近期 IPO 事件", ipoDates.length, ipoDates, "./ipo.html?stage=market&sort=eventDate&direction=asc", hasIpoInputs ? "ready" : "unavailable"),
  ];

  if (!Array.isArray(input?.bonds) || !hasAsOfDate) {
    return common.concat([
      item("bond-rights-90", "90 日內權利事件", null, [], "./bonds.html?event=rights90", "unavailable"),
      item("bond-maturity-365", "365 日內到期事件", null, [], "./bonds.html?event=maturity365", "unavailable"),
    ]);
  }

  const asOfDay = dayNumber(asOfDate);
  const rightsDates = [];
  const maturityDates = [];
  for (const bond of input.bonds) {
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
  ]);
}
