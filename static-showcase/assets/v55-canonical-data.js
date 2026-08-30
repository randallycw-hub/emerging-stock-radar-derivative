import {
  buildV54CanonicalData,
  validateV54CanonicalData,
} from "./v54-canonical-data.js";
import { isOfficialSourceUrl } from "./cb-workbench-v53.js";

export const V55_CB_EVENT_TYPE_LABELS = Object.freeze({
  early_redemption: "提前贖回",
  suspension: "停止轉換",
  put: "賣回權",
  maturity: "到期日",
  conversion_price_adjustment: "轉換價調整",
  listing: "掛牌",
});

const CB_TYPE_MAP = Object.freeze({
  cb_early_redemption: "early_redemption",
  cb_conversion_suspension: "suspension",
  cb_put: "put",
  cb_maturity: "maturity",
  cb_conversion_price_change: "conversion_price_adjustment",
  cb_listing: "listing",
});

const EVENT_STATUSES = new Set(["upcoming", "active", "deadline_soon", "completed", "cancelled"]);

export function buildV55CanonicalData(input = {}) {
  const v54 = buildV54CanonicalData(input);
  return buildV55CanonicalDataFromV54({
    canonical: v54,
    rightsEvents: input.rightsEvents ?? null,
  });
}

export function buildV55CanonicalDataFromV54({ canonical, rightsEvents = null } = {}) {
  validateV54CanonicalData(canonical);
  const events = projectV55CanonicalEvents({
    baseEvents: canonical.events,
    rightsEvents,
    records: canonical.records,
    dataDate: canonical.dataDate,
  });
  const model = {
    schemaVersion: 2,
    dataDate: canonical.dataDate,
    generatedAt: canonical.generatedAt,
    datasets: canonical.datasets,
    records: canonical.records,
    summary: canonical.summary,
    issuance: canonical.issuance,
    events,
    masters: canonical.masters,
  };
  validateV55CanonicalData(model);
  return deepFreeze(model);
}

export function projectV55CanonicalEvents({ baseEvents = [], rightsEvents = null, records = [], dataDate } = {}) {
  const rights = projectCbRightsEvents({ rightsEvents, records, dataDate });
  const enrichedBondCodes = new Set(rights.map((event) => event.cbCode));
  const projectedBase = recordsOf(baseEvents)
    .filter((event) => !(event?.eventType === "cb_early_redemption" && enrichedBondCodes.has(text(event?.cbCode))))
    .map((event) => projectBaseEvent(event, dataDate))
    .filter(Boolean);
  return dedupeEvents([...projectedBase, ...rights]);
}

export function projectCbRightsEvents({ rightsEvents, records = [], dataDate } = {}) {
  const identityByBond = new Map(recordsOf(records).map((record) => [text(record?.cbCode), record]));
  return recordsOf(rightsEvents?.events).flatMap((source) => {
    if (!isOfficialSourceUrl(source?.sourceUrl) || !bondCode(source?.bondCode) || !isIsoDate(source?.announcementDate)) return [];
    const record = identityByBond.get(source.bondCode) ?? null;
    const stockCode = text(record?.stockCode) || text(source?.issuerCode);
    const companyName = text(record?.companyName) || text(source?.issuerName);
    const cbName = text(record?.cbName) || text(source?.bondName);
    if (!stockCode || !companyName || !cbName) return [];
    const event = {
      eventId: text(source.eventId),
      eventType: "early_redemption",
      marketScope: "cb",
      stockCode,
      cbCode: source.bondCode,
      companyName,
      cbName,
      instrumentName: cbName,
      announcementDate: source.announcementDate,
      startDate: isoOrNull(source.acceptStartDate),
      endDate: isoOrNull(source.acceptEndDate),
      effectiveDate: firstIso(source.recordDate, source.lastTradingDate, source.acceptEndDate),
      deadlineDate: firstIso(source.acceptEndDate, source.recordDate, source.lastTradingDate, source.lastConversionDate),
      lastConversionDate: isoOrNull(source.lastConversionDate),
      lastTradingDate: isoOrNull(source.lastTradingDate),
      recordDate: isoOrNull(source.recordDate),
      price: decimalOrNull(source.redemptionPrice),
      reason: textOrNull(source.reason),
      status: classifyV55CbEventStatus(source, dataDate),
      title: `${cbName}提前贖回`,
      summary: textOrNull(source.reason),
      source: "官方公開資料",
      sourceUrl: source.sourceUrl,
      publishedAt: null,
      fetchedAt: textOrNull(source.fetchedAt),
      dataDate: isIsoDate(dataDate) ? dataDate : source.announcementDate,
      eventDetails: {
        acceptanceStartDate: isoOrNull(source.acceptStartDate),
        acceptanceEndDate: isoOrNull(source.acceptEndDate),
        brokerAcceptanceStartDate: isoOrNull(source.brokerAcceptStartDate),
        brokerAcceptanceEndDate: isoOrNull(source.brokerAcceptEndDate),
        redemptionPricePercent: decimalOrNull(source.redemptionPricePercent),
      },
    };
    return text(event.eventId) ? [event] : [];
  });
}

export function classifyV55CbEventStatus(event, asOfDate) {
  const asOf = isIsoDate(asOfDate) ? asOfDate : isoOrNull(event?.announcementDate);
  if (!asOf) return "upcoming";
  const keyDates = [
    event?.brokerAcceptEndDate,
    event?.acceptEndDate,
    event?.recordDate,
    event?.lastTradingDate,
    event?.lastConversionDate,
  ].map(isoOrNull).filter(Boolean);
  const latest = [...keyDates].sort().at(-1) ?? isoOrNull(event?.announcementDate);
  if (latest && latest < asOf) return "completed";
  if (keyDates.some((date) => date >= asOf && daysBetween(date, asOf) <= 3)) return "deadline_soon";
  const start = isoOrNull(event?.acceptStartDate) ?? isoOrNull(event?.brokerAcceptStartDate);
  const end = isoOrNull(event?.acceptEndDate) ?? isoOrNull(event?.lastTradingDate) ?? isoOrNull(event?.lastConversionDate);
  if (start && end && start <= asOf && end >= asOf) return "active";
  return "upcoming";
}

export function validateV55CanonicalData(value) {
  if (!isRecord(value) || value.schemaVersion !== 2 || !isIsoDate(value.dataDate) || !Array.isArray(value.records) || !Array.isArray(value.events)) {
    throw new TypeError("V5.5 canonical data schema is invalid");
  }
  const ids = new Set();
  for (const event of value.events) {
    if (!isRecord(event) || !text(event.eventId) || ids.has(event.eventId) || !text(event.eventType) || !EVENT_STATUSES.has(event.status) || !isOfficialSourceUrl(event.sourceUrl)) {
      throw new TypeError("V5.5 canonical event is invalid");
    }
    if (!isIsoDate(firstIso(event.effectiveDate, event.announcementDate, event.startDate, event.endDate, event.deadlineDate))) {
      throw new TypeError("V5.5 canonical event date is invalid");
    }
    if (event.marketScope === "cb" && (!bondCode(event.cbCode) || !text(event.companyName) || !text(event.cbName))) {
      throw new TypeError("V5.5 CB event identity is invalid");
    }
    if (event.price !== null && decimalOrNull(event.price) === null) throw new TypeError("V5.5 event price is invalid");
    ids.add(event.eventId);
  }
  return true;
}

function projectBaseEvent(event, dataDate) {
  if (!isOfficialSourceUrl(event?.sourceUrl) || !text(event?.eventId)) return null;
  const cbType = event?.marketScope === "cb" ? CB_TYPE_MAP[event.eventType] : null;
  const eventType = cbType ?? text(event?.eventType);
  const effectiveDate = firstIso(event?.effectiveDate, event?.startDate, event?.endDate, event?.deadlineDate);
  const announcementDate = isoOrNull(event?.announcementDate);
  const primaryDate = effectiveDate ?? announcementDate;
  if (!eventType || !primaryDate) return null;
  const base = {
    eventId: event.eventId,
    eventType,
    marketScope: text(event.marketScope),
    stockCode: textOrNull(event.stockCode),
    cbCode: textOrNull(event.cbCode),
    companyName: textOrNull(event.companyName),
    cbName: event.marketScope === "cb" ? textOrNull(event.instrumentName) : null,
    instrumentName: textOrNull(event.instrumentName),
    announcementDate,
    startDate: isoOrNull(event.startDate),
    endDate: isoOrNull(event.endDate),
    effectiveDate,
    deadlineDate: firstIso(event.deadlineDate, effectiveDate),
    lastConversionDate: isoOrNull(event.extra?.lastConversionDate),
    lastTradingDate: isoOrNull(event.extra?.lastTradingDate),
    recordDate: isoOrNull(event.extra?.recordDate),
    price: decimalOrNull(event.extra?.redemptionPrice),
    reason: textOrNull(event.summary),
    status: genericEventStatus(primaryDate, dataDate),
    title: text(event.title) || "公開事件",
    summary: textOrNull(event.summary),
    source: "官方公開資料",
    sourceUrl: event.sourceUrl,
    publishedAt: textOrNull(event.publishedAt),
    fetchedAt: textOrNull(event.fetchedAt),
    dataDate: isIsoDate(event.dataDate) ? event.dataDate : dataDate,
    eventDetails: {},
  };
  return base;
}

function genericEventStatus(date, asOfDate) {
  if (!isIsoDate(date) || !isIsoDate(asOfDate)) return "upcoming";
  if (date < asOfDate) return "completed";
  return daysBetween(date, asOfDate) <= 3 ? "deadline_soon" : "upcoming";
}

function dedupeEvents(events) {
  const unique = new Map();
  for (const event of events) {
    if (text(event?.eventId) && !unique.has(event.eventId)) unique.set(event.eventId, event);
  }
  return [...unique.values()].sort((left, right) => eventDate(left).localeCompare(eventDate(right)) || left.eventId.localeCompare(right.eventId));
}

function eventDate(event) {
  return firstIso(event?.deadlineDate, event?.effectiveDate, event?.startDate, event?.announcementDate) ?? "9999-12-31";
}

function firstIso(...values) {
  return values.map(isoOrNull).find(Boolean) ?? null;
}

function isoOrNull(value) {
  return isIsoDate(value) ? value : null;
}

function decimalOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim();
  return /^\d+(?:\.\d+)?$/u.test(normalized) ? normalized : null;
}

function daysBetween(left, right) {
  return Math.round((Date.parse(`${left}T00:00:00.000Z`) - Date.parse(`${right}T00:00:00.000Z`)) / 86_400_000);
}

function recordsOf(value) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function textOrNull(value) {
  const normalized = text(value);
  return normalized || null;
}

function bondCode(value) {
  const code = text(value);
  return /^\d{5,6}$/u.test(code) ? code : null;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value ?? ""))) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
