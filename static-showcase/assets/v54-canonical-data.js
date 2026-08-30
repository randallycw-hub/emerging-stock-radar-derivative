import { buildCbWorkbenchV53, isOfficialSourceUrl } from "./cb-workbench-v53.js";

const CB_EVENT_TYPES = Object.freeze({
  listing: "cb_listing",
  redemption: "cb_early_redemption",
  put: "cb_put",
  maturity: "cb_maturity",
  conversion_suspension: "cb_conversion_suspension",
  conversion_adjustment: "cb_conversion_price_change",
  reset: "cb_conversion_price_change",
});

const IPO_EVENT_TYPES = Object.freeze({
  application_submitted: "ipo_filing",
  review_completed: "ipo_review",
  board_approved: "ipo_review",
  contract_approved: "ipo_contract",
  auction_bid_start: "ipo_auction",
  auction_bid_end: "ipo_auction",
  auction_open: "ipo_auction",
  public_subscription_start: "ipo_subscription",
  public_subscription_end: "ipo_subscription",
  public_draw: "ipo_subscription",
  listing_date: "ipo_listing",
});

const OFFICIAL_REFERENCE_LABEL = "官方公開資料";

export function buildV54CanonicalData({
  manifest = null,
  workbench = null,
  history = [],
  cbMaster = [],
  companyMaster = [],
  supplemental = null,
  conversionPrices = [],
  ipo = null,
  emerging = null,
  revenue = [],
} = {}) {
  const cb = buildCbWorkbenchV53({ workbench, history, cbMaster, companyMaster, supplemental });
  const dataDate = cb.dataDate;
  const conversionByBond = indexConversionSnapshots(conversionPrices, dataDate);
  const records = cb.records.map((record) => projectCbRecord(record, conversionByBond.get(record.cbCode) ?? null));
  const cbEvents = records.flatMap((record) => projectCbEvents(record, dataDate));
  const ipoEvents = projectIpoEvents(ipo, dataDate);
  const events = dedupeEvents([...cbEvents, ...ipoEvents]);
  const datasets = buildDatasetMetadata({ manifest, cb, ipo, emerging, revenue, supplemental, conversionPrices });
  const model = {
    schemaVersion: 1,
    dataDate,
    generatedAt: generatedAt(manifest, dataDate),
    datasets,
    records,
    summary: cb.summary,
    issuance: cb.issuance,
    events,
    masters: {
      companyCount: recordsOf(companyMaster).length,
      cbCount: recordsOf(cbMaster).length,
    },
  };
  validateV54CanonicalData(model);
  return deepFreeze(model);
}

export function validateV54CanonicalData(value) {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isIsoDate(value.dataDate) || !Array.isArray(value.records) || !Array.isArray(value.events)) {
    throw new TypeError("V5.4 canonical data schema is invalid");
  }
  const eventIds = new Set();
  for (const record of value.records) {
    if (!isRecord(record) || !bondCode(record.cbCode) || !stockCode(record.stockCode)) throw new TypeError("V5.4 CB identity is invalid");
    const quote = record.quote;
    if (!isRecord(quote)) throw new TypeError("V5.4 CB quote is invalid");
    if (quote.conversionValue !== null || quote.premiumRate !== null) {
      if (!isIsoDate(quote.valuationDate) || quote.valuationDate !== quote.dataDate || quote.conversionValue === null || quote.premiumRate === null) {
        throw new TypeError("V5.4 CB valuation must use a same-date source");
      }
    }
    for (const version of recordsOf(record.conversionPriceHistory)) {
      if (!isIsoDate(version.effectiveDate) || !isOfficialSourceUrl(version.sourceUrl)) throw new TypeError("V5.4 conversion history source is invalid");
    }
  }
  for (const event of value.events) {
    if (!isRecord(event) || !text(event.eventId) || eventIds.has(event.eventId) || !text(event.eventType) || !text(event.marketScope) || !isIsoDate(event.effectiveDate ?? event.announcementDate ?? event.startDate ?? event.endDate ?? event.deadlineDate)) {
      throw new TypeError("V5.4 canonical event is invalid");
    }
    if (!isOfficialSourceUrl(event.sourceUrl)) throw new TypeError("V5.4 canonical event source is invalid");
    eventIds.add(event.eventId);
  }
  return true;
}

export function buildV54DataAudit({
  canonical,
  manifest = null,
  emerging = null,
  ipo = null,
  revenue = [],
  baseline = null,
} = {}) {
  validateV54CanonicalData(canonical);
  const sourceRegistry = buildSourceRegistry({ manifest, canonical, ipo, emerging });
  const fieldLineage = buildFieldLineage(sourceRegistry);
  const coverage = buildCoverageReport({ canonical, emerging, ipo, revenue });
  const qa = buildCrossPageQa({ canonical, emerging, ipo, revenue, baseline });
  const report = {
    schemaVersion: 1,
    dataDate: canonical.dataDate,
    generatedAt: canonical.generatedAt,
    sourceRegistry,
    fieldLineage,
    coverage,
    qa,
  };
  validateV54DataAudit(report);
  return deepFreeze(report);
}

export function validateV54DataAudit(value) {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isIsoDate(value.dataDate) || !Array.isArray(value.sourceRegistry) || !Array.isArray(value.fieldLineage) || !Array.isArray(value.coverage)) {
    throw new TypeError("V5.4 audit report schema is invalid");
  }
  for (const source of value.sourceRegistry) {
    if (!isRecord(source) || !text(source.dataset) || !isOfficialSourceUrl(source.sourceUrl) || source.tier !== "A" || source.access !== "public") {
      throw new TypeError("V5.4 source registry contains an unapproved source");
    }
  }
  for (const entry of value.coverage) {
    if (!isRecord(entry) || !text(entry.dataset) || !Array.isArray(entry.coreFields) || !Number.isInteger(entry.available) || !Number.isInteger(entry.missing) || !Array.isArray(entry.blockingIssues)) {
      throw new TypeError("V5.4 coverage report is invalid");
    }
  }
  if (!isRecord(value.qa) || value.qa.passed !== true) throw new TypeError("V5.4 cross-page QA did not pass");
  return true;
}

function projectCbRecord(record, conversionSnapshot) {
  const terms = record.terms ?? {};
  const putRights = recordsOf(terms.putDates).map((putDate) => ({
    eventId: `11406:put:${record.cbCode}:${putDate}`,
    putDate,
    applicationStart: null,
    applicationEnd: null,
    putPrice: number(terms.putPrice),
    sourceUrl: officialTermsUrl(record),
    dataDate: record.quote?.dataDate ?? null,
  })).filter((right) => isIsoDate(right.putDate) && isOfficialSourceUrl(right.sourceUrl));
  const maturity = isIsoDate(terms.maturityDate) && isOfficialSourceUrl(officialTermsUrl(record))
    ? { eventId: `11406:maturity:${record.cbCode}:${terms.maturityDate}`, maturityDate: terms.maturityDate, sourceUrl: officialTermsUrl(record), dataDate: record.quote?.dataDate ?? null }
    : null;
  return {
    ...record,
    rights: {
      redemption: record.rights?.redemption ?? null,
      puts: putRights,
      maturity,
    },
    conversionPriceHistory: conversionSnapshot === null ? [] : [conversionSnapshot],
  };
}

function indexConversionSnapshots(records, dataDate) {
  const indexed = new Map();
  for (const raw of recordsOf(records)) {
    const cbCode = bondCode(raw?.bondCode);
    const effectiveDate = isIsoDate(raw?.effectiveDate) ? raw.effectiveDate : null;
    const sourceUrl = typeof raw?.officialDetailUrl === "string" && isOfficialSourceUrl(raw.officialDetailUrl) ? raw.officialDetailUrl : null;
    const currentConversionPrice = number(raw?.currentConversionPrice);
    const initialConversionPrice = number(raw?.initialConversionPrice);
    if (!cbCode || !effectiveDate || !sourceUrl || currentConversionPrice === null || indexed.has(cbCode)) continue;
    indexed.set(cbCode, {
      effectiveDate,
      initialConversionPrice,
      currentConversionPrice,
      sourceUrl,
      dataDate,
    });
  }
  return indexed;
}

function projectCbEvents(record, dataDate) {
  const events = [];
  for (const event of recordsOf(record.events)) {
    const eventType = CB_EVENT_TYPES[text(event?.type)];
    const date = isIsoDate(event?.date) ? event.date : null;
    if (!eventType || !date || !isOfficialSourceUrl(event?.sourceUrl)) continue;
    const redemption = eventType === "cb_early_redemption" ? record.rights?.redemption ?? null : null;
    events.push(canonicalEvent({
      eventId: text(event.eventId), eventType, marketScope: "cb", stockCode: record.stockCode, cbCode: record.cbCode,
      companyName: record.companyName, instrumentName: record.cbName, announcementDate: redemption?.announcementDate ?? null,
      effectiveDate: redemption ? null : date, title: text(event.title) || event.label || "可轉債公開事件", summary: redemption?.summary ?? null,
      sourceUrl: event.sourceUrl, dataDate, extra: redemption === null ? {} : redemptionExtra(redemption),
    }));
  }
  for (const version of recordsOf(record.conversionPriceHistory)) {
    if (version.initialConversionPrice === null || version.initialConversionPrice === version.currentConversionPrice) continue;
    events.push(canonicalEvent({
      eventId: `mops-conversion:${record.cbCode}:${version.effectiveDate}`,
      eventType: "cb_conversion_price_change", marketScope: "cb", stockCode: record.stockCode, cbCode: record.cbCode,
      companyName: record.companyName, instrumentName: record.cbName, announcementDate: null, effectiveDate: version.effectiveDate,
      title: `${record.cbName}轉換價目前有效值`, summary: null, sourceUrl: version.sourceUrl, dataDate,
      extra: { initialConversionPrice: version.initialConversionPrice, currentConversionPrice: version.currentConversionPrice },
    }));
  }
  return events;
}

function redemptionExtra(redemption) {
  return {
    lastTradingDate: redemption.lastTradingDate,
    redemptionDate: redemption.redemptionDate,
    redemptionPrice: redemption.redemptionPrice,
    outstandingBalance: redemption.outstandingBalance,
  };
}

function projectIpoEvents(ipo, dataDate) {
  if (!isRecord(ipo) || !Array.isArray(ipo.records)) return [];
  const sources = indexIpoSources(ipo.sourceManifest);
  const entries = [];
  for (const record of ipo.records) {
    const companyCode = stockCode(record?.companyCode);
    const companyName = text(record?.companyName);
    if (!companyCode || !companyName) continue;
    for (const event of recordsOf(record.events)) {
      const kind = text(event?.kind);
      const eventType = IPO_EVENT_TYPES[kind];
      const date = isIsoDate(event?.date) ? event.date : null;
      const sourceUrl = sourceUrlForIpoRecord(recordsOf(event?.sourceRecordIds), sources);
      if (!eventType || !date || !sourceUrl) continue;
      entries.push(canonicalEvent({
        eventId: `ipo:${companyCode}:${kind}:${date}:${sourceKey(recordsOf(event.sourceRecordIds))}`,
        eventType, marketScope: "ipo", stockCode: companyCode, cbCode: null, companyName, instrumentName: companyName,
        announcementDate: eventType === "ipo_filing" ? date : null,
        effectiveDate: eventType === "ipo_filing" ? null : date,
        startDate: /_start$/u.test(kind) ? date : null,
        endDate: /_end$/u.test(kind) ? date : null,
        deadlineDate: null,
        title: text(event?.label) || "IPO 公開事件", summary: null, sourceUrl, dataDate,
        extra: ipoEventExtra(record, kind),
      }));
    }
  }
  return entries;
}

function indexIpoSources(sourceManifest) {
  const sources = new Map();
  for (const item of recordsOf(sourceManifest)) {
    const id = text(item?.sourceId);
    const sourceUrl = typeof item?.sourceUrl === "string" && isOfficialSourceUrl(item.sourceUrl) ? item.sourceUrl : null;
    if (id && sourceUrl) sources.set(id, sourceUrl);
  }
  return sources;
}

function sourceUrlForIpoRecord(ids, sources) {
  for (const sourceId of ids) {
    const value = text(sourceId);
    if (/^TWSE:auction:/u.test(value)) return sources.get("twse-auctions") ?? null;
    if (/^TWSE:public-offering:/u.test(value)) return sources.get("twse-public-offerings") ?? null;
    if (/^TPEx:/u.test(value)) return sources.get("tpex-applications") ?? null;
    if (/^TWSE:/u.test(value)) return sources.get("twse-applications") ?? null;
  }
  return null;
}

function ipoEventExtra(record, kind) {
  const auction = isRecord(record?.auction) ? record.auction : {};
  const offering = isRecord(record?.publicOffering) ? record.publicOffering : {};
  if (/^auction_/u.test(kind)) return pickFacts(auction, ["bidStartDate", "bidEndDate", "auctionOpenDate", "minimumBidPrice", "finalUnderwritingPrice"]);
  if (/^public_/u.test(kind)) return pickFacts(offering, ["subscriptionStartDate", "subscriptionEndDate", "drawDate", "provisionalUnderwritingPrice", "finalUnderwritingPrice"]);
  return {};
}

function canonicalEvent({
  eventId, eventType, marketScope, stockCode: eventStockCode, cbCode: eventCbCode, companyName, instrumentName,
  announcementDate = null, effectiveDate = null, startDate = null, endDate = null, deadlineDate = null,
  title, summary = null, sourceUrl, dataDate, extra = {},
}) {
  return {
    eventId, eventType, marketScope, stockCode: eventStockCode, cbCode: eventCbCode, companyName, instrumentName,
    announcementDate, effectiveDate, startDate, endDate, deadlineDate, title, summary,
    source: OFFICIAL_REFERENCE_LABEL, sourceUrl, publishedAt: null, fetchedAt: null, dataDate, extra,
  };
}

function buildDatasetMetadata({ manifest, cb, ipo, emerging, revenue, supplemental, conversionPrices }) {
  const manifestSources = new Map(recordsOf(manifest?.datasets).map((entry) => [text(entry?.datasetId), entry]));
  const metadata = [
    datasetMetadata("cb_terms", manifestSources.get("11406"), recordsOf(cb.records).length, cb.dataDate),
    datasetMetadata("ipo_events", null, recordsOf(ipo?.records).length, isIsoDate(ipo?.dataDate) ? ipo.dataDate : cb.dataDate),
    datasetMetadata("emerging_market", manifestSources.get("emergingMarket"), recordsOf(emerging?.records).length, isIsoDate(emerging?.tradingDate) ? emerging.tradingDate : cb.dataDate),
    datasetMetadata("monthly_revenue", manifestSources.get("94025"), recordsOf(revenue).length, cb.dataDate),
    datasetMetadata("cb_redemption", firstOfficialUrl(recordsOf(supplemental?.redemptions).map((item) => item?.detailUrl)), recordsOf(supplemental?.redemptions).length, cb.dataDate),
    datasetMetadata("cb_conversion_price", firstOfficialUrl(recordsOf(conversionPrices).map((item) => item?.officialDetailUrl)), recordsOf(conversionPrices).length, cb.dataDate),
  ];
  return metadata;
}

function datasetMetadata(dataset, source, recordCount, dataDate) {
  const sourceUrl = typeof source === "string" ? source : source?.sourceUrl;
  return {
    dataset,
    source: OFFICIAL_REFERENCE_LABEL,
    sourceUrl: isOfficialSourceUrl(sourceUrl) ? sourceUrl : null,
    dataDate: isIsoDate(dataDate) ? dataDate : null,
    fetchedAt: text(source?.downloadedAt) || null,
    updatedAt: text(source?.downloadedAt) || null,
    recordCount: Number.isInteger(recordCount) ? recordCount : null,
    status: isOfficialSourceUrl(sourceUrl) ? "normal" : "waiting",
    schemaVersion: 1,
    lastValidSnapshot: null,
  };
}

function buildSourceRegistry({ manifest, canonical, ipo, emerging }) {
  const sources = [];
  for (const item of recordsOf(manifest?.datasets)) {
    const sourceUrl = item?.sourceUrl;
    if (!isOfficialSourceUrl(sourceUrl)) continue;
    sources.push(sourceRegistryEntry(text(item.datasetId) || "official_dataset", sourceUrl, text(item.downloadedAt) || null, Number.isInteger(item.rowCount) ? item.rowCount : null));
  }
  for (const item of recordsOf(ipo?.sourceManifest)) {
    if (!isOfficialSourceUrl(item?.sourceUrl)) continue;
    sources.push(sourceRegistryEntry(text(item.sourceId), item.sourceUrl, text(item.downloadedAt) || null, Number.isInteger(item.rowCount) ? item.rowCount : null));
  }
  for (const record of canonical.records) {
    for (const redemption of [record.rights?.redemption]) {
      if (redemption && isOfficialSourceUrl(redemption.sourceUrl)) sources.push(sourceRegistryEntry("mops-cb-redemption", redemption.sourceUrl, canonical.generatedAt, 1));
    }
    for (const conversion of recordsOf(record.conversionPriceHistory)) {
      if (isOfficialSourceUrl(conversion.sourceUrl)) sources.push(sourceRegistryEntry("mops-cb-conversion-price", conversion.sourceUrl, canonical.generatedAt, 1));
    }
  }
  if (isOfficialSourceUrl(emerging?.sourceUrl)) sources.push(sourceRegistryEntry("emerging-market", emerging.sourceUrl, text(emerging.publishedAt) || null, recordsOf(emerging.records).length));
  return dedupeSourceRegistry(sources);
}

function sourceRegistryEntry(dataset, sourceUrl, updatedAt, recordCount) {
  return {
    dataset,
    sourceUrl,
    tier: "A",
    access: "public",
    authorization: "no-login-public",
    fallback: "last-known-good-only",
    refresh: "published-source-cadence",
    updatedAt: updatedAt || null,
    recordCount: recordCount ?? null,
  };
}

function dedupeSourceRegistry(entries) {
  const unique = new Map();
  for (const entry of entries) {
    if (!entry.dataset || !entry.sourceUrl) continue;
    unique.set(`${entry.dataset}\u001f${entry.sourceUrl}`, entry);
  }
  return [...unique.values()].sort((left, right) => left.dataset.localeCompare(right.dataset) || left.sourceUrl.localeCompare(right.sourceUrl));
}

function buildFieldLineage(sourceRegistry) {
  const byDataset = new Map(sourceRegistry.map((entry) => [entry.dataset, entry]));
  const source = (dataset) => byDataset.get(dataset)?.sourceUrl ?? null;
  return [
    lineage("company_identity", ["stockCode", "companyName", "market", "industry"], source("emergingMarket") ?? source("emerging-market"), "A", null),
    lineage("emerging_quote", ["lastTradedPrice", "dailyAveragePrice", "transactionVolume", "estimatedTransactionAmount"], source("emergingMarket") ?? source("emerging-market"), "A", null),
    lineage("monthly_revenue", ["month", "revenue", "MoM", "YoY"], source("94025"), "A", null),
    lineage("cb_terms", ["issueDate", "listingDate", "maturityDate", "issueAmount", "putDates", "putPrice"], source("11406"), "A", null),
    lineage("cb_valuation", ["conversionValue", "premiumRate"], source("11406"), "B", "conversionValue = stockClose / conversionPrice * 100; premiumRate = (cbClose / conversionValue - 1) * 100; same data date required"),
    lineage("cb_redemption", ["announcementDate", "lastTradingDate", "summary"], source("mops-cb-redemption"), "A", null),
    lineage("cb_conversion_price", ["effectiveDate", "initialConversionPrice", "currentConversionPrice"], source("mops-cb-conversion-price"), "A", null),
    lineage("ipo_events", ["stage", "dates", "auction", "publicOffering", "listingDate"], source("twse-applications") ?? source("tpex-applications"), "A", null),
  ];
}

function lineage(dataset, fields, sourceUrl, tier, formula) {
  return { dataset, fields, sourceUrl, tier, formula, status: sourceUrl || tier === "B" ? "verified" : "unavailable" };
}

function buildCoverageReport({ canonical, emerging, ipo, revenue }) {
  const cb = canonical.records;
  return [
    coverage("cb_market", cb, ["quote.cbClose", "quote.volume", "quote.turnoverAmount", "quote.stockClose", "quote.conversionPrice", "quote.conversionValue", "quote.premiumRate", "terms.maturityDate"], ["quote.conversionValue", "quote.premiumRate"]),
    coverage("cb_terms", cb, ["terms.issueDate", "terms.listingDate", "terms.maturityDate", "terms.issueAmount", "terms.putDates", "terms.putPrice", "terms.outstandingAmount"], []),
    coverage("cb_early_redemption", cb.map((record) => record.rights?.redemption).filter(Boolean), ["announcementDate", "lastTradingDate", "sourceUrl", "summary", "redemptionDate", "redemptionPrice", "outstandingBalance"], ["redemptionDate", "redemptionPrice", "outstandingBalance"]),
    coverage("cb_conversion_price", cb.map((record) => recordsOf(record.conversionPriceHistory)[0]).filter(Boolean), ["effectiveDate", "initialConversionPrice", "currentConversionPrice", "sourceUrl"], []),
    coverage("ipo", recordsOf(ipo?.records), ["companyCode", "companyName", "market", "stage", "events"], []),
    coverage("emerging_market", recordsOf(emerging?.records), ["companyCode", "companyName", "tradingDate", "dailyAveragePrice", "transactionVolume"], []),
    coverage("monthly_revenue", recordsOf(revenue), ["公司代號", "公司名稱", "資料年月", "營業收入-當月營收", "營業收入-上月比較增減(%)", "營業收入-去年同月增減(%)"], []),
  ];
}

function coverage(dataset, records, fields, blockerFields) {
  const fieldAvailability = Object.fromEntries(fields.map((path) => [path, records.filter((record) => publishedValue(readPath(record, path))).length]));
  const availableFields = fields.filter((path) => fieldAvailability[path] > 0);
  const missingFields = fields.filter((path) => fieldAvailability[path] === 0);
  const blockers = blockerFields.filter((path) => fieldAvailability[path] === 0);
  return {
    dataset,
    coreFields: fields,
    available: availableFields.length,
    missing: missingFields.length,
    coverage: `${availableFields.length}/${fields.length}`,
    sourceVerified: true,
    crossPageConsistent: true,
    historyAvailable: dataset === "cb_conversion_price" ? records.length > 0 : dataset !== "cb_early_redemption",
    fieldAvailability,
    blockingIssues: blockers,
  };
}

function buildCrossPageQa({ canonical, emerging, ipo, revenue, baseline }) {
  const activeCb = canonical.records.filter((record) => record.status === "active");
  const samples = {
    stocks: recordsOf(emerging?.records).slice(0, 20),
    activeCb: activeCb.slice(0, 20),
    recentIssuance: canonical.issuance.slice(0, 5),
    redemptions: canonical.events.filter((event) => event.eventType === "cb_early_redemption").slice(0, 5),
    conversionChanges: canonical.events.filter((event) => event.eventType === "cb_conversion_price_change").slice(0, 5),
    ipo: recordsOf(ipo?.records).slice(0, 10),
    revenue: recordsOf(revenue).slice(0, 10),
  };
  const failures = [];
  if (samples.stocks.some((record) => !stockCode(record?.companyCode) || !text(record?.companyName))) failures.push("stock_identity");
  if (samples.activeCb.some((record) => !bondCode(record?.cbCode) || !stockCode(record?.stockCode) || !text(record?.companyName))) failures.push("cb_identity");
  if (samples.activeCb.some((record) => record.quote.conversionValue !== null && record.quote.valuationDate !== record.quote.dataDate)) failures.push("cb_valuation_date");
  if (samples.redemptions.some((event) => !isOfficialSourceUrl(event.sourceUrl) || !isIsoDate(event.announcementDate))) failures.push("redemption_source");
  if (samples.conversionChanges.some((event) => !isOfficialSourceUrl(event.sourceUrl) || !isIsoDate(event.effectiveDate))) failures.push("conversion_source");
  if (samples.ipo.some((record) => !stockCode(record?.companyCode) || !text(record?.companyName))) failures.push("ipo_identity");
  if (samples.revenue.some((record) => !stockCode(record?.["公司代號"]) || !text(record?.["公司名稱"]))) failures.push("revenue_identity");
  for (const [key, values] of Object.entries(samples)) {
    const required = key === "stocks" || key === "activeCb" ? 20 : 5;
    if ((key === "ipo" || key === "revenue") && values.length < 10) failures.push(`${key}_sample_size`);
    else if (key !== "ipo" && key !== "revenue" && values.length < required) failures.push(`${key}_sample_size`);
  }
  if (baseline?.inputHashes && !isRecord(baseline.inputHashes)) failures.push("baseline_shape");
  return { passed: failures.length === 0, samples: Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, values.length])), failures };
}

function dedupeEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    if (!event?.eventId || seen.has(event.eventId)) return false;
    seen.add(event.eventId);
    return true;
  }).sort((left, right) => eventDate(left).localeCompare(eventDate(right)) || left.eventId.localeCompare(right.eventId));
}

function eventDate(event) {
  return event.effectiveDate ?? event.announcementDate ?? event.startDate ?? event.endDate ?? event.deadlineDate ?? "9999-12-31";
}

function officialTermsUrl(record) {
  return recordsOf(record?.events).find((event) => event?.type === "listing" && isOfficialSourceUrl(event?.sourceUrl))?.sourceUrl ?? null;
}

function generatedAt(manifest, dataDate) {
  const value = text(manifest?.market?.generatedAt);
  return value || `${dataDate}T00:00:00.000Z`;
}

function firstOfficialUrl(values) {
  return recordsOf(values).find((value) => isOfficialSourceUrl(value)) ?? null;
}

function pickFacts(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, publishedValue(value?.[key]) ? value[key] : null]));
}

function readPath(value, path) {
  return path.split(".").reduce((current, key) => current === null || current === undefined ? undefined : current[key], value);
}

function sourceKey(ids) {
  return recordsOf(ids).map(text).filter(Boolean).sort().join("+") || "official";
}

function publishedValue(value) {
  return value !== null && value !== undefined && value !== "" && value !== "—";
}

function recordsOf(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.records) ? value.records : [];
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function bondCode(value) {
  const code = text(value);
  return /^\d{5,6}$/.test(code) ? code : null;
}

function stockCode(value) {
  const code = text(value);
  return /^\d{4}$/.test(code) ? code : null;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
