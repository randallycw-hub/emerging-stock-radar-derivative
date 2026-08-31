import { normalizeApprovedIpoEvents, projectActiveIpoEventEntries } from "./ipo-stage-filter.js";
import { projectPublicBondEvents } from "./public-event-digest.js";

const DAY_MS = 86_400_000;
const MARKET_VALUES = new Set(["all", "ipo", "bonds"]);
const PERIOD_VALUES = new Set(["all", "history", "today", "tomorrow", "7", "30", "custom"]);
const STATUS_VALUES = new Set(["all", "ongoing", "active", "deadline_soon", "upcoming", "completed"]);

export const EVENT_TYPE_LABELS = Object.freeze({
  application_submitted: "送件",
  review: "審議",
  board: "董事會",
  contract: "契約",
  auction: "競拍",
  subscription: "申購",
  listing: "掛牌",
  conversion_price_adjustment: "轉換價調整",
  conversion_suspended: "停止轉換",
  conversion_resumed: "恢復轉換",
  put: "賣回",
  redemption: "提前贖回",
  maturity: "到期",
});

export function projectMarketEvents({ asOfDate, ipoSnapshot, bonds, canonicalEvents = null } = {}) {
  if (!isIsoDate(asOfDate)) return [];
  const canonical = projectCanonicalEvents(canonicalEvents, asOfDate);
  if (canonical.length) return dedupePublicEvents(canonical).sort(compareEvents);
  return dedupePublicEvents([
    ...projectIpoEvents(ipoSnapshot, asOfDate),
    ...projectBondEvents(bonds, asOfDate),
  ]).sort(compareEvents);
}

function dedupePublicEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const identity = text(event?.id) || `${event?.market}:${event?.entityKey}:${event?.date}:${event?.eventType}`;
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function projectCanonicalEvents(snapshot, asOfDate) {
  const records = Array.isArray(snapshot?.records) ? snapshot.records : [];
  return records.map((event) => {
    const market = event?.marketScope === "ipo" ? "ipo" : event?.marketScope === "cb" ? "bonds" : null;
    const date = canonicalEventDate(event);
    const code = text(market === "bonds" ? event?.cbCode : event?.stockCode);
    const companyName = text(event?.companyName);
    const entityName = text(market === "bonds" ? event?.instrumentName : event?.companyName) || code;
    if (!market || !isIsoDate(date) || !code || !companyName || !entityName) return null;
    const eventType = canonicalEventType(event?.eventType);
    const href = market === "ipo"
      ? `./ipo.html?q=${encodeURIComponent(code)}`
      : `./bonds.html?bond=${encodeURIComponent(code)}`;
    return publicEvent({
      market,
      date,
      code,
      companyName,
      entityKey: `${market === "ipo" ? "ipo" : "bond"}:${code}`,
      entityName,
      subtitle: market === "bonds" ? [text(event?.stockCode), companyName].filter(Boolean).join(" ") : null,
      title: text(event?.title) || "公開事件",
      eventType,
      href,
      detailHref: market === "ipo"
        ? `./company.html?code=${encodeURIComponent(code)}`
        : href,
      officialUrl: isOfficialUrl(event?.sourceUrl) ? event.sourceUrl : null,
      asOfDate,
      id: text(event?.eventId) || null,
      status: canonicalStatus(event?.status, date, asOfDate),
      dateLabel: canonicalDateLabel(event),
      details: publicCanonicalDetails(event),
    });
  }).filter(Boolean);
}

function canonicalEventDate(event) {
  const values = [event?.deadlineDate, event?.effectiveDate, event?.startDate, event?.endDate, event?.announcementDate];
  return values.find(isIsoDate) ?? null;
}

function canonicalEventType(value) {
  const type = text(value);
  const mapping = {
    cb_listing: "listing",
    cb_early_redemption: "redemption",
    cb_put: "put",
    cb_maturity: "maturity",
    cb_conversion_suspension: "conversion_suspended",
    cb_conversion_price_change: "conversion_price_adjustment",
    early_redemption: "redemption",
    suspension: "conversion_suspended",
    conversion_price_adjustment: "conversion_price_adjustment",
    ipo_filing: "application_submitted",
    ipo_review: "review",
    ipo_contract: "contract",
    ipo_auction: "auction",
    ipo_subscription: "subscription",
    ipo_listing: "listing",
  };
  return mapping[type] ?? "public_event";
}

function canonicalStatus(value, date, asOfDate) {
  const status = text(value);
  if (["active", "deadline_soon", "upcoming", "completed"].includes(status)) return status;
  const distance = calendarDistance(asOfDate, date);
  if (distance === null) return "upcoming";
  if (distance < 0) return "completed";
  if (distance === 0) return "active";
  return "upcoming";
}

function canonicalDateLabel(event) {
  if (event?.eventType === "early_redemption") return "受理截止";
  if (event?.eventType === "put") return "賣回日";
  if (event?.eventType === "maturity") return "到期日";
  if (event?.eventType === "listing") return "掛牌日";
  return "事件日期";
}

function publicCanonicalDetails(event) {
  const details = event?.eventDetails && typeof event.eventDetails === "object" ? event.eventDetails : {};
  return {
    acceptanceStartDate: isIsoDate(event?.startDate) ? event.startDate : null,
    acceptanceEndDate: isIsoDate(event?.endDate) ? event.endDate : null,
    lastConversionDate: isIsoDate(event?.lastConversionDate) ? event.lastConversionDate : null,
    lastTradingDate: isIsoDate(event?.lastTradingDate) ? event.lastTradingDate : null,
    recordDate: isIsoDate(event?.recordDate) ? event.recordDate : null,
    price: typeof event?.price === "string" && /^\d+(?:\.\d+)?$/u.test(event.price) ? event.price : null,
    reason: text(event?.reason) || null,
    redemptionPricePercent: typeof details.redemptionPricePercent === "string" && /^\d+(?:\.\d+)?$/u.test(details.redemptionPricePercent)
      ? details.redemptionPricePercent
      : null,
  };
}

function projectIpoEvents(snapshot, asOfDate) {
  if (!isIsoDate(snapshot?.dataDate) || !Array.isArray(snapshot?.records)) return [];
  const rows = snapshot.records.map((record) => ({
    ...record,
    events: normalizeApprovedIpoEvents(record, snapshot.sourceManifest),
  }));
  return projectActiveIpoEventEntries(rows, snapshot.dataDate)
    .filter(({ event }) => isIsoDate(event?.date))
    .map(({ row, event }) => {
      const code = text(row?.companyCode);
      const companyName = text(row?.companyName) || code;
      if (!code || !companyName) return null;
      const eventType = eventTypeOf(event?.kind, event?.label);
      return publicEvent({
        market: "ipo",
        date: event.date,
        code,
        companyName,
        entityKey: `ipo:${code}`,
        entityName: companyName,
        subtitle: text(row?.market),
        title: text(event?.label) || "IPO 公開事件",
        eventType,
        href: `./ipo.html?q=${encodeURIComponent(code)}`,
        detailHref: `./company.html?code=${encodeURIComponent(code)}`,
        asOfDate,
      });
    })
    .filter(Boolean);
}

function projectBondEvents(records, asOfDate) {
  if (!Array.isArray(records)) return [];
  const entries = [];
  for (const record of records) {
    if (record?.status !== "active") continue;
    const code = text(record?.bondCode ?? record?.term?.bondCode);
    const bondName = text(record?.term?.bondName) || code;
    if (!code || !bondName) continue;
    const issuerName = text(record?.term?.issuerName);
    const issuerCode = text(record?.term?.issuerCode);
    const published = projectPublicBondEvents(
      (Array.isArray(record?.events) ? record.events : []).map((event) => ({ ...event, bondCode: code })),
      asOfDate,
    );
    for (const event of published) {
      entries.push(publicEvent({
        market: "bonds",
        date: event.date,
        code,
        companyName: issuerName || bondName,
        entityKey: `bond:${code}`,
        entityName: bondName,
        subtitle: [issuerCode, issuerName].filter(Boolean).join(" "),
        title: text(event.title) || "可轉債公開事件",
        eventType: eventTypeOf(event.type, event.title),
        href: `./bonds.html?bond=${encodeURIComponent(code)}`,
        detailHref: `./bonds.html?bond=${encodeURIComponent(code)}`,
        asOfDate,
      }));
    }
  }
  return entries;
}

function publicEvent({ market, date, code, companyName, entityKey, entityName, subtitle, title, eventType, href, detailHref, officialUrl = null, asOfDate, id = null, status = null, dateLabel = null, details = null }) {
  return {
    id: id || [market, entityKey, date, eventType, title].join(":"),
    market,
    date,
    code,
    companyName,
    entityKey,
    entityName,
    subtitle: subtitle || null,
    title,
    eventType,
    eventTypeLabel: EVENT_TYPE_LABELS[eventType] ?? "公開事件",
    href,
    detailHref,
    officialUrl,
    updatedAt: asOfDate,
    status: canonicalStatus(status, date, asOfDate),
    dateLabel: dateLabel || "事件日期",
    details: details && typeof details === "object" ? details : {},
  };
}

export function buildEventMetrics(events, asOfDate) {
  const valid = normalizedEvents(events);
  const isFuture30 = (event) => {
    const distance = calendarDistance(asOfDate, event.date);
    return distance !== null && distance >= 0 && distance <= 30;
  };
  return {
    today: valid.filter((event) => calendarDistance(asOfDate, event.date) === 0).length,
    tomorrow: valid.filter((event) => calendarDistance(asOfDate, event.date) === 1).length,
    next7: valid.filter((event) => {
      const distance = calendarDistance(asOfDate, event.date);
      return distance !== null && distance >= 0 && distance <= 7;
    }).length,
    ipo: valid.filter((event) => event.market === "ipo" && isFuture30(event)).length,
    bonds: valid.filter((event) => event.market === "bonds" && isFuture30(event)).length,
  };
}

export function filterMarketEvents(events, {
  asOfDate,
  market = "all",
  period = "all",
  eventType = "all",
  status = "all",
  query = "",
  customStart = null,
  customEnd = null,
} = {}) {
  const selectedMarket = MARKET_VALUES.has(market) ? market : "all";
  const selectedPeriod = PERIOD_VALUES.has(period) ? period : "all";
  const selectedStatus = STATUS_VALUES.has(status) ? status : "all";
  const queryText = text(query).toLocaleLowerCase("zh-Hant");
  return normalizedEvents(events).filter((event) => {
    const distance = calendarDistance(asOfDate, event.date);
    if (distance === null) return false;
    if (selectedMarket !== "all" && event.market !== selectedMarket) return false;
    if (eventType !== "all" && event.eventType !== eventType) return false;
    if (!matchesPeriod(event.date, distance, selectedPeriod, customStart, customEnd)) return false;
    if (!matchesStatus(event, selectedStatus)) return false;
    return !queryText || [event.code, event.companyName, event.entityName, event.title, event.eventTypeLabel]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("zh-Hant")
      .includes(queryText);
  }).sort(compareEvents);
}

function matchesPeriod(date, distance, period, customStart, customEnd) {
  if (period === "all") return true;
  if (period === "history") return distance < 0;
  if (period === "today") return distance === 0;
  if (period === "tomorrow") return distance === 1;
  if (period === "7") return distance >= 0 && distance <= 7;
  if (period === "30") return distance >= 0 && distance <= 30;
  if (period !== "custom") return true;
  return (!isIsoDate(customStart) || date >= customStart)
    && (!isIsoDate(customEnd) || date <= customEnd);
}

function matchesStatus(event, status) {
  if (status === "all") return true;
  if (status === "ongoing") return event.status === "active";
  return event.status === status;
}

export function groupMarketEventsByDate(events) {
  const groups = new Map();
  for (const event of normalizedEvents(events).sort(compareEvents)) {
    const current = groups.get(event.date) ?? [];
    current.push(event);
    groups.set(event.date, current);
  }
  return [...groups.entries()].map(([date, groupedEvents]) => ({ date, events: groupedEvents }));
}

export function groupMarketEventsByEntity(events) {
  const groups = new Map();
  for (const event of normalizedEvents(events).sort(compareEvents)) {
    const current = groups.get(event.entityKey) ?? [];
    current.push(event);
    groups.set(event.entityKey, current);
  }
  return [...groups.entries()]
    .map(([entityKey, groupedEvents]) => ({
      entityKey,
      market: groupedEvents[0].market,
      entityName: groupedEvents[0].entityName,
      code: groupedEvents[0].code,
      companyName: groupedEvents[0].companyName,
      href: groupedEvents[0].href,
      detailHref: groupedEvents[0].detailHref,
      events: groupedEvents,
    }))
    .sort((left, right) => compareEvents(left.events[0], right.events[0]));
}

export function calendarDistance(asOfDate, eventDate) {
  if (!isIsoDate(asOfDate) || !isIsoDate(eventDate)) return null;
  return (Date.parse(`${eventDate}T00:00:00Z`) - Date.parse(`${asOfDate}T00:00:00Z`)) / DAY_MS;
}

export function eventTimeLabel(eventDate, asOfDate) {
  const distance = calendarDistance(asOfDate, eventDate);
  if (distance === null) return "—";
  if (distance === 0) return "今天";
  if (distance === 1) return "明天";
  if (distance > 1 && distance <= 3) return `${distance} 日內`;
  if (distance > 3 && distance <= 7) return `${distance} 日內`;
  if (distance > 7) return `${distance} 日後`;
  return "已完成";
}

function eventTypeOf(kind, label) {
  const value = text(kind).toLocaleLowerCase("en-US");
  if (EVENT_TYPE_LABELS[value]) return value;
  const source = `${value} ${text(label)}`;
  if (/競拍/u.test(source)) return "auction";
  if (/申購|抽籤/u.test(source)) return "subscription";
  if (/掛牌|上市|上櫃買賣/u.test(source)) return "listing";
  if (/董事會/u.test(source)) return "board";
  if (/契約/u.test(source)) return "contract";
  if (/審議/u.test(source)) return "review";
  if (/送件|申請/u.test(source)) return "application_submitted";
  if (/提前贖回/u.test(source)) return "redemption";
  if (/賣回/u.test(source)) return "put";
  if (/到期/u.test(source)) return "maturity";
  return "public_event";
}

function normalizedEvents(events) {
  return Array.isArray(events) ? events.filter((event) => (
    event
    && isIsoDate(event.date)
    && MARKET_VALUES.has(event.market)
    && event.market !== "all"
    && text(event.id)
    && text(event.entityKey)
  )) : [];
}

function compareEvents(left, right) {
  return left.date.localeCompare(right.date)
    || left.market.localeCompare(right.market)
    || left.entityKey.localeCompare(right.entityKey)
    || left.eventType.localeCompare(right.eventType)
    || left.title.localeCompare(right.title, "zh-Hant");
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function isOfficialUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && new Set([
      "www.tpex.org.tw",
      "www.twse.com.tw",
      "openapi.twse.com.tw",
      "mops.twse.com.tw",
      "mopsov.twse.com.tw",
      "www.tdcc.com.tw",
    ]).has(url.hostname);
  } catch {
    return false;
  }
}
