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

function publishedText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function bondEventIdentity(event) {
  const bondCode = publishedText(event?.bondCode);
  const type = publishedText(event?.type);
  const date = event?.date;
  if (!bondCode || !type || !isPublishedIsoDate(date)) return null;

  // An official URL is the preferred identity.  The source identifier is only
  // used as a non-rendered fallback for legacy, already-verified snapshots.
  const officialReference = publishedText(event?.sourceUrl)
    ?? publishedText(event?.sourceId)
    ?? "published-event";
  return [bondCode, date, type, officialReference].join("\u001f");
}

/**
 * Collapse equivalent events before they reach any public presentation.
 * Source metadata remains internal to this helper; callers must project the
 * returned records before rendering them.
 */
export function dedupeBondEvents(events) {
  if (!Array.isArray(events)) return [];
  const seen = new Set();
  return events
    .filter((event) => {
      const identity = bondEventIdentity(event);
      if (!identity || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .slice()
    .sort((left, right) => String(left.date).localeCompare(String(right.date))
      || String(left.bondCode).localeCompare(String(right.bondCode))
      || String(left.type).localeCompare(String(right.type)));
}

/**
 * Create the deliberately small public event shape.  Internal evidence keys,
 * source ids, and completeness state are never copied into the browser view.
 */
export function projectPublicBondEvents(events, asOfDate) {
  if (!isPublishedIsoDate(asOfDate)) return [];
  return dedupeBondEvents(events)
    .filter((event) => event.date >= asOfDate)
    .map((event) => ({
      bondCode: event.bondCode,
      type: event.type,
      date: event.date,
      title: publishedText(event.title) ?? "公開事件",
    }));
}

function publicEvent({ market, date, title, href, code = null }) {
  if (!isPublishedIsoDate(date) || !publishedText(market) || !publishedText(title) || !publishedText(href)) return null;
  return {
    market,
    date,
    title: publishedText(title),
    href,
    code: publishedText(code),
  };
}

/**
 * Assemble a small public event timeline across the three markets.  The
 * returned records intentionally exclude source references and completeness
 * metadata; source provenance remains available through the relevant page.
 */
export function buildCrossMarketEventEntries(input = {}) {
  const asOfDate = input?.asOfDate;
  if (!isPublishedIsoDate(asOfDate)) return [];
  const entries = [];

  for (const event of Array.isArray(input?.emergingEvents) ? input.emergingEvents : []) {
    const projected = publicEvent({
      market: "emerging",
      date: event?.date,
      title: event?.title ?? event?.label ?? "公開異動",
      href: event?.href ?? "./emerging.html",
      code: event?.companyCode,
    });
    if (projected && projected.date >= asOfDate) entries.push(projected);
  }

  const ipoIsUsable = isPublishedIsoDate(input?.ipoDataDate)
    && Array.isArray(input?.ipoRecords)
    && Array.isArray(input?.ipoSourceManifest);
  if (ipoIsUsable) {
    const rows = input.ipoRecords.map((record) => ({
      ...record,
      events: normalizeApprovedIpoEvents(record, input.ipoSourceManifest),
    }));
    for (const { row, event } of projectActiveIpoEventEntries(rows, input.ipoDataDate)) {
      const projected = publicEvent({
        market: "ipo",
        date: event?.date,
        title: event?.label ?? "IPO 公開事件",
        href: `./ipo.html?stage=market&sort=eventDate&direction=asc&q=${encodeURIComponent(String(row?.companyCode ?? ""))}`,
        code: row?.companyCode,
      });
      if (projected && projected.date >= asOfDate) entries.push(projected);
    }
  }

  for (const record of Array.isArray(input?.bonds) ? input.bonds : []) {
    const bondCode = publishedText(record?.bondCode);
    if (!bondCode) continue;
    const events = (Array.isArray(record?.events) ? record.events : []).map((event) => ({ ...event, bondCode }));
    for (const event of projectPublicBondEvents(events, asOfDate)) {
      const projected = publicEvent({
        market: "bonds",
        date: event.date,
        title: event.title,
        href: `./bonds.html?bond=${encodeURIComponent(bondCode)}`,
        code: bondCode,
      });
      if (projected) entries.push(projected);
    }
  }

  return entries
    .sort((left, right) => left.date.localeCompare(right.date)
      || left.market.localeCompare(right.market)
      || String(left.code ?? "").localeCompare(String(right.code ?? "")))
    .filter((entry, index, all) => index === 0 || `${entry.market}\u001f${entry.date}\u001f${entry.title}\u001f${entry.code ?? ""}`
      !== `${all[index - 1].market}\u001f${all[index - 1].date}\u001f${all[index - 1].title}\u001f${all[index - 1].code ?? ""}`);
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
