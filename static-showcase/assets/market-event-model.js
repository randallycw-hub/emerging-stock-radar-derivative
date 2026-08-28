import { normalizeApprovedIpoEvents, projectActiveIpoEventEntries } from "./ipo-stage-filter.js";
import { projectPublicBondEvents } from "./public-event-digest.js";

const DAY_MS = 86_400_000;
const MARKET_VALUES = new Set(["all", "ipo", "bonds"]);
const PERIOD_VALUES = new Set(["all", "today", "tomorrow", "7", "30", "custom"]);
const STATUS_VALUES = new Set(["all", "ongoing", "upcoming", "completed"]);

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

export function projectMarketEvents({ asOfDate, ipoSnapshot, bonds } = {}) {
  if (!isIsoDate(asOfDate)) return [];
  return [
    ...projectIpoEvents(ipoSnapshot, asOfDate),
    ...projectBondEvents(bonds, asOfDate),
  ].sort(compareEvents);
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

function publicEvent({ market, date, code, companyName, entityKey, entityName, subtitle, title, eventType, href, detailHref, asOfDate }) {
  return {
    id: [market, entityKey, date, eventType, title].join(":"),
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
    updatedAt: asOfDate,
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
    if (!matchesStatus(distance, selectedStatus)) return false;
    return !queryText || [event.code, event.companyName, event.entityName, event.title, event.eventTypeLabel]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("zh-Hant")
      .includes(queryText);
  }).sort(compareEvents);
}

function matchesPeriod(date, distance, period, customStart, customEnd) {
  if (period === "all") return true;
  if (period === "today") return distance === 0;
  if (period === "tomorrow") return distance === 1;
  if (period === "7") return distance >= 0 && distance <= 7;
  if (period === "30") return distance >= 0 && distance <= 30;
  if (period !== "custom") return true;
  return (!isIsoDate(customStart) || date >= customStart)
    && (!isIsoDate(customEnd) || date <= customEnd);
}

function matchesStatus(distance, status) {
  if (status === "all") return true;
  if (status === "ongoing") return distance === 0;
  if (status === "upcoming") return distance > 0;
  return distance < 0;
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
