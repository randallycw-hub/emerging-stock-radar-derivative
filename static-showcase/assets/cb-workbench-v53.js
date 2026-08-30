const OFFICIAL_SOURCE_HOSTS = new Set([
  "www.tpex.org.tw",
  "www.twse.com.tw",
  "openapi.twse.com.tw",
  "mops.twse.com.tw",
  "mopsov.twse.com.tw",
  "www.tdcc.com.tw",
]);

const EVENT_TYPE_LABELS = Object.freeze({
  conversion_adjustment: "轉換價調整",
  conversion_suspension: "停止轉換",
  redemption: "提前贖回",
  put: "賣回",
  maturity: "到期",
  reset: "Reset",
  listing: "新掛牌",
  delisting: "終止交易",
});

const PIPELINE_STAGE_KEYS = Object.freeze([
  "announcementDate",
  "filingDate",
  "effectiveDate",
  "auctionOrBookbuildingDate",
  "pricingDate",
  "listingDate",
  "asoDate",
]);

export { EVENT_TYPE_LABELS, OFFICIAL_SOURCE_HOSTS, PIPELINE_STAGE_KEYS };

export function buildCbWorkbenchV53({ workbench, history = [], cbMaster = [], companyMaster = [], supplemental = null } = {}) {
  const snapshot = requiredRecord(workbench, "workbench");
  const dataDate = isoDate(snapshot.dataDate);
  if (!dataDate || !Array.isArray(snapshot.records)) throw new TypeError("workbench must contain dataDate and records");
  const masters = indexMasters(cbMaster, companyMaster);
  const historyByBond = indexHistory(history);
  const redemptionsByBond = indexRedemptions(supplemental, dataDate);
  const records = snapshot.records.map((input) => projectRecord(input, dataDate, masters, historyByBond, redemptionsByBond));
  assertUniqueActiveCodes(records);
  const events = records.flatMap((record) => record.events)
    .sort((left, right) => left.date.localeCompare(right.date) || left.cbCode.localeCompare(right.cbCode));
  const issuance = records.map((record) => record.issuance)
    .sort((left, right) => (right.stages.listingDate ?? "").localeCompare(left.stages.listingDate ?? "") || left.cbCode.localeCompare(right.cbCode));
  return deepFreeze({
    schemaVersion: 1,
    dataDate,
    sourceRegistry: buildSourceRegistry(records, events),
    records,
    events,
    issuance,
    summary: buildSummary(records, dataDate),
  });
}

export function selectV53QaSamples(model) {
  const snapshot = requiredRecord(model, "V5.3 model");
  const active = arrayValue(snapshot.records).filter((record) => record?.status === "active").slice(0, 20);
  const issuance = arrayValue(snapshot.issuance).slice(0, 5);
  const events = arrayValue(snapshot.events).filter((event) => isOfficialSourceUrl(event?.sourceUrl)).slice(0, 5);
  return deepFreeze({ active, issuance, events });
}

export function validateCbWorkbenchV53(value) {
  const model = requiredRecord(value, "V5.3 model");
  if (model.schemaVersion !== 1 || !isoDate(model.dataDate) || !Array.isArray(model.records)) {
    throw new TypeError("V5.3 model schema is invalid");
  }
  assertUniqueActiveCodes(model.records);
  for (const record of model.records) {
    const item = requiredRecord(record, "V5.3 CB record");
    const issueDate = isoDate(item.terms?.issueDate);
    const maturityDate = isoDate(item.terms?.maturityDate);
    if (issueDate && maturityDate && maturityDate < issueDate) throw new TypeError("CB maturity date precedes issue date");
    const quote = requiredRecord(item.quote, "V5.3 CB quote");
    if (quote.conversionValue !== null || quote.premiumRate !== null) {
      if (!quote.valuationDate || quote.valuationDate !== quote.dataDate || quote.conversionValue === null || quote.premiumRate === null) {
        throw new TypeError("CB valuation requires one same-date public quote");
      }
    }
    for (const event of arrayValue(item.events)) {
      if (!isoDate(event?.date) || !isOfficialSourceUrl(event?.sourceUrl)) {
        throw new TypeError("CB event must retain a verified official source URL");
      }
    }
  }
  return true;
}

export function isOfficialSourceUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.hash === "" && OFFICIAL_SOURCE_HOSTS.has(url.host);
  } catch {
    return false;
  }
}

function projectRecord(input, dataDate, masters, historyByBond, redemptionsByBond) {
  const raw = requiredRecord(input, "workbench record");
  const term = requiredRecord(raw.term, "workbench term");
  const view = requiredRecord(raw.view, "workbench view");
  const cbCode = text(raw.bondCode ?? term.bondCode ?? view.bondCode);
  const master = masters.cbByCode.get(cbCode);
  if (!cbCode || !master) throw new TypeError(`CB ${cbCode || "record"} is absent from canonical master`);
  const stockCode = master.stockCode;
  const company = masters.companyByCode.get(stockCode);
  const history = historyByBond.get(cbCode) ?? [];
  const quote = projectQuote(view, history, dataDate);
  const redemption = redemptionsByBond.get(cbCode) ?? null;
  const events = projectEvents([
    ...arrayValue(raw.events),
    ...(redemption === null ? [] : [redemptionEvent(redemption)]),
  ], { cbCode, bondName: master.bondName, stockCode, companyName: master.companyName });
  const terms = projectTerms(term, view);
  const issuance = projectIssuance({ cbCode, bondName: master.bondName, stockCode, companyName: master.companyName, terms, events, sourceDataDate: dataDate });
  return {
    cbCode,
    cbName: master.bondName,
    stockCode,
    companyName: master.companyName,
    market: master.market,
    industry: company?.industry ?? null,
    status: raw.status === "archived" ? "archived" : "active",
    terms,
    quote,
    liquidity: projectLiquidity(history, dataDate),
    rights: { redemption },
    events,
    issuance,
  };
}

function indexRedemptions(supplemental, dataDate) {
  const indexed = new Map();
  for (const entry of arrayValue(supplemental?.redemptions)) {
    const cbCode = text(entry?.bondCode);
    const announcementDate = isoDate(entry?.announcementDate);
    const lastTradingDate = isoDate(entry?.delistingDate);
    const sourceUrl = typeof entry?.detailUrl === "string" && isOfficialSourceUrl(entry.detailUrl)
      ? entry.detailUrl
      : null;
    const summary = optionalText(entry?.subject);
    if (!cbCode || !announcementDate || !lastTradingDate || !sourceUrl || !summary || indexed.has(cbCode)) continue;
    indexed.set(cbCode, {
      eventId: `mops-redemption:${cbCode}:${announcementDate}`,
      state: announcementDate <= dataDate && dataDate <= lastTradingDate
        ? "active"
        : dataDate < announcementDate ? "upcoming" : "completed",
      announcementDate,
      lastTradingDate,
      redemptionDate: null,
      redemptionPrice: null,
      outstandingBalance: null,
      sourceUrl,
      dataDate,
      summary,
    });
  }
  return indexed;
}

function redemptionEvent(redemption) {
  return {
    eventId: redemption.eventId,
    type: "redemption",
    date: redemption.announcementDate,
    title: redemption.summary,
    sourceUrl: redemption.sourceUrl,
  };
}

function indexMasters(cbMaster, companyMaster) {
  const cbByCode = new Map();
  for (const entry of arrayValue(cbMaster)) {
    const cbCode = text(entry?.bondCode);
    const stockCode = text(entry?.stockCode);
    const bondName = text(entry?.bondName);
    const companyName = text(entry?.companyName);
    const market = text(entry?.market);
    if (!cbCode || !stockCode || !bondName || !companyName || !market || cbByCode.has(cbCode)) {
      throw new TypeError("canonical CB master is invalid");
    }
    cbByCode.set(cbCode, { cbCode, stockCode, bondName, companyName, market });
  }
  const companyByCode = new Map();
  for (const entry of arrayValue(companyMaster)) {
    const stockCode = text(entry?.stockCode);
    if (!stockCode || companyByCode.has(stockCode)) throw new TypeError("canonical company master is invalid");
    companyByCode.set(stockCode, { stockCode, industry: optionalText(entry?.industry) });
  }
  return { cbByCode, companyByCode };
}

function indexHistory(history) {
  const result = new Map();
  for (const point of arrayValue(history)) {
    const cbCode = text(point?.bondCode);
    const date = isoDate(point?.date);
    if (!cbCode || !date) continue;
    const values = result.get(cbCode) ?? [];
    values.push({
      date,
      tradingUnits: finiteNumber(point?.cbTradingUnits),
      turnover: finiteNumber(point?.cbTurnover),
    });
    result.set(cbCode, values);
  }
  for (const values of result.values()) values.sort((left, right) => left.date.localeCompare(right.date));
  return result;
}

function projectQuote(view, history, dataDate) {
  const cbPriceDate = isoDate(view.cbPriceDate);
  const stockPriceDate = isoDate(view.stockPriceDate);
  const conversionPriceEffectiveDate = isoDate(view.conversionPriceEffectiveDate);
  const cbClose = finiteNumber(view.cbClose);
  const stockClose = finiteNumber(view.stockClose);
  const conversionPrice = finiteNumber(view.currentConversionPrice);
  const valuationDate = cbPriceDate && cbPriceDate === stockPriceDate && conversionPriceEffectiveDate && conversionPriceEffectiveDate <= cbPriceDate
    ? cbPriceDate
    : null;
  const conversionValue = valuationDate && stockClose !== null && conversionPrice !== null && conversionPrice > 0
    ? round(stockClose / conversionPrice * 100)
    : null;
  const premiumRate = conversionValue !== null && conversionValue > 0 && cbClose !== null
    ? round((cbClose / conversionValue - 1) * 100)
    : null;
  const volume = finiteNumber(view.cbTradeUnits);
  const turnoverAmount = cbPriceDate
    ? history.find((point) => point.date === cbPriceDate)?.turnover ?? null
    : null;
  const tradeState = volume === null ? "unavailable" : volume === 0 ? "no_trade" : "traded";
  return {
    dataDate: cbPriceDate,
    cbClose,
    stockClose,
    conversionPrice,
    conversionPriceEffectiveDate,
    valuationDate,
    conversionValue,
    premiumRate,
    volume,
    turnoverAmount,
    tradeState,
    isLatestSnapshot: cbPriceDate === dataDate,
  };
}

function projectTerms(term, view) {
  return {
    issueDate: isoDate(term.issueDate),
    listingDate: isoDate(term.listingDate),
    maturityDate: isoDate(term.maturityDate ?? view.maturityDate),
    issueAmount: finiteNumber(term.issueAmount),
    outstandingAmount: finiteNumber(term.outstandingAmount ?? view.outstandingAmount),
    outstandingDataDate: isoDate(term.outstandingDataDate ?? view.outstandingDataDate),
    remainingRatio: finiteNumber(view.remainingRatio),
    securedStatus: securedStatus(term.securedStatus),
    underwriter: optionalText(term.underwriter),
    trustee: optionalText(term.trustee),
    tenorYears: tenureYears(term.issueDate, term.maturityDate),
    putDates: arrayValue(term.putDates).map(isoDate).filter(Boolean),
    putPrice: finiteNumber(term.putPrice),
    conversionStartDate: isoDate(term.conversionStartDate),
    conversionEndDate: isoDate(term.conversionEndDate),
  };
}

function projectEvents(events, identity) {
  return arrayValue(events).map((event) => {
    const date = isoDate(event?.date);
    const type = text(event?.type);
    const sourceUrl = typeof event?.sourceUrl === "string" && isOfficialSourceUrl(event.sourceUrl) ? event.sourceUrl : null;
    if (!date || !type || !sourceUrl) return null;
    return {
      eventId: text(event?.eventId) || `${identity.cbCode}:${type}:${date}`,
      cbCode: identity.cbCode,
      cbName: identity.bondName,
      stockCode: identity.stockCode,
      companyName: identity.companyName,
      type,
      label: EVENT_TYPE_LABELS[type] ?? "公開事件",
      date,
      title: optionalText(event?.title),
      sourceUrl,
    };
  }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date) || left.type.localeCompare(right.type));
}

function projectIssuance({ cbCode, bondName, stockCode, companyName, terms, events, sourceDataDate }) {
  const listing = events.find((event) => event.type === "listing" && event.date === terms.listingDate) ?? null;
  const stages = {
    announcementDate: null,
    filingDate: null,
    effectiveDate: null,
    auctionOrBookbuildingDate: null,
    pricingDate: null,
    listingDate: listing?.date ?? null,
    asoDate: null,
  };
  return {
    cbCode,
    cbName: bondName,
    stockCode,
    companyName,
    stages,
    terms: {
      issueDate: terms.issueDate,
      maturityDate: terms.maturityDate,
      issueAmount: terms.issueAmount,
      securedStatus: terms.securedStatus,
      underwriter: terms.underwriter,
    },
    currentStage: [...PIPELINE_STAGE_KEYS].reverse().find((stage) => stages[stage]) ?? "unannounced",
    sourceUrl: listing?.sourceUrl ?? null,
    dataDate: sourceDataDate,
  };
}

function projectLiquidity(history, dataDate) {
  const valid = history.filter((point) => point.date <= dataDate && point.tradingUnits !== null);
  const average = (size) => {
    const slice = valid.slice(-size);
    return slice.length === size ? round(slice.reduce((sum, point) => sum + point.tradingUnits, 0) / size) : null;
  };
  const monday = isoWeekMonday(dataDate);
  const weekly = history.filter((point) => point.date >= monday && point.date <= dataDate);
  const hasWeeklyVolume = weekly.length > 0 && weekly.every((point) => point.tradingUnits !== null);
  const hasWeeklyTurnover = weekly.length > 0 && weekly.every((point) => point.turnover !== null);
  return {
    average5: average(5),
    average20: average(20),
    sample5: Math.min(valid.length, 5),
    sample20: Math.min(valid.length, 20),
    weekVolume: hasWeeklyVolume ? round(weekly.reduce((sum, point) => sum + point.tradingUnits, 0)) : null,
    weekTurnover: hasWeeklyTurnover ? round(weekly.reduce((sum, point) => sum + point.turnover, 0)) : null,
    tradedDays20: valid.slice(-20).filter((point) => point.tradingUnits > 0).length,
  };
}

function buildSummary(records, dataDate) {
  const active = records.filter((record) => record.status === "active");
  const hasCompleteTradeCoverage = active.every((record) => record.quote.volume !== null && record.quote.isLatestSnapshot);
  const hasCompleteTurnoverCoverage = active.every((record) => record.quote.turnoverAmount !== null && record.quote.isLatestSnapshot);
  const hasCompleteWeeklyCoverage = active.every((record) => record.liquidity.weekTurnover !== null);
  return {
    activeCount: active.length,
    tradedCount: hasCompleteTradeCoverage ? active.filter((record) => record.quote.volume > 0).length : null,
    turnoverAmount: hasCompleteTurnoverCoverage ? round(active.reduce((sum, record) => sum + record.quote.turnoverAmount, 0)) : null,
    weekTurnoverAmount: hasCompleteWeeklyCoverage ? round(active.reduce((sum, record) => sum + record.liquidity.weekTurnover, 0)) : null,
    weekPeriod: `${isoWeekMonday(dataDate)} 至 ${dataDate}`,
  };
}

function buildSourceRegistry(records, events) {
  const byUrl = new Map();
  for (const event of events) {
    const prior = byUrl.get(event.sourceUrl) ?? { sourceName: "官方公開公告", sourceUrl: event.sourceUrl, dataDate: event.date, recordCount: 0, status: "available" };
    prior.recordCount += 1;
    if (event.date > prior.dataDate) prior.dataDate = event.date;
    byUrl.set(event.sourceUrl, prior);
  }
  if (byUrl.size === 0 && records.length) {
    byUrl.set("https://www.tpex.org.tw/", { sourceName: "TPEx 可轉債公開資料", sourceUrl: "https://www.tpex.org.tw/", dataDate: null, recordCount: 0, status: "unavailable" });
  }
  return [...byUrl.values()].sort((left, right) => left.sourceUrl.localeCompare(right.sourceUrl));
}

function assertUniqueActiveCodes(records) {
  const activeCodes = records.filter((record) => record.status === "active").map((record) => record.cbCode);
  if (new Set(activeCodes).size !== activeCodes.length) throw new TypeError("active CB codes must be unique");
}

function securedStatus(value) {
  return String(value ?? "").trim() === "1" ? "有擔保" : String(value ?? "").trim() === "2" ? "無擔保" : null;
}

function tenureYears(issueDate, maturityDate) {
  const start = isoDate(issueDate);
  const end = isoDate(maturityDate);
  if (!start || !end || end < start) return null;
  return round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / (365.25 * 24 * 60 * 60 * 1000));
}

function isoWeekMonday(value) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function isoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function finiteNumber(value) {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function text(value) {
  return optionalText(value) ?? "";
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function requiredRecord(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  return value;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
