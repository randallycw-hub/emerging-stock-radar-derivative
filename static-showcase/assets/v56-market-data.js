const INTERNAL_FIELDS = new Set([
  "rawSourceId",
  "rawTextHash",
  "sourceId",
  "sourceRecordId",
  "missingReason",
  "missingReasons",
  "diagnostics",
]);

export function buildV56MarketData({
  manifest = null,
  masters = null,
  history = [],
  workbench = null,
  emerging = null,
  ipo = null,
  rightsEvents = null,
  previous = null,
} = {}) {
  const dataDate = isoDate(manifest?.market?.dataDate);
  if (!dataDate) throw new TypeError("V5.6 data date is invalid");
  const companyMaster = recordsOf(masters?.companyMaster);
  const cbMaster = recordsOf(masters?.cbMaster);
  const workbenchRecords = recordsOf(workbench);
  const securityRecords = projectSecurityMaster(companyMaster, dataDate);
  const cbRecords = projectCbMaster(cbMaster, workbenchRecords, securityRecords, dataDate);
  const model = {
    schemaVersion: 3,
    dataDate,
    generatedAt: textOrNull(manifest?.market?.generatedAt),
    securityMaster: dataset("security_master", securityRecords, dataDate),
    priceHistory: dataset("price_history", projectPriceHistory(history, dataDate), dataDate),
    cbMaster: dataset("cb_master", cbRecords, dataDate),
    cbEvents: dataset("cb_events", projectCbEvents(rightsEvents, dataDate), dataDate),
    ipoPipeline: dataset("ipo_pipeline", projectIpoPipeline(ipo, dataDate), dataDate),
    emerging: dataset("emerging_market", projectEmerging(emerging, dataDate), dataDate),
    dailyChanges: dataset("daily_changes", [], dataDate),
    performance: dataset("performance", [], dataDate),
    searchIndex: dataset("search_index", projectSearchIndex(masters?.searchIndex, dataDate), dataDate),
    previousDataDate: isoDate(previous?.dataDate),
  };
  validateV56MarketData(model);
  return deepFreeze(model);
}

export function displayFinancialValue(value, context = "numeric") {
  if (value === null || value === undefined || value === "") {
    if (context === "undetermined") return "待定";
    if (context === "not_published") return "待公布";
    if (context === "no_trade") return "今日無成交";
    if (context === "unavailable") return "資料暫時無法取得";
    return "—";
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return "—";
}

export function validateV56MarketData(value) {
  if (!isRecord(value) || value.schemaVersion !== 3 || !isoDate(value.dataDate)) {
    throw new TypeError("V5.6 market model is invalid");
  }
  for (const key of ["securityMaster", "priceHistory", "cbMaster", "cbEvents", "ipoPipeline", "emerging", "dailyChanges", "performance", "searchIndex"]) {
    const section = value[key];
    if (!isRecord(section) || !Array.isArray(section.records) || section.dataDate !== value.dataDate) {
      throw new TypeError(`V5.6 dataset is invalid: ${key}`);
    }
    if (findInternalField(section.records)) throw new TypeError(`V5.6 public dataset contains internal field: ${key}`);
  }
  const securities = new Map(value.securityMaster.records.map((record) => [record.stockCode, record]));
  for (const cb of value.cbMaster.records) {
    const issuer = securities.get(cb.stockCode);
    if (!issuer || !issuer.relatedCbCodes.includes(cb.cbCode)) {
      throw new TypeError("V5.6 CB identity is invalid");
    }
    if (cb.currentConversionPrice !== null && !isFiniteNumber(cb.currentConversionPrice)) {
      throw new TypeError("V5.6 conversion price is invalid");
    }
  }
  return true;
}

function projectSecurityMaster(records, dataDate) {
  const seen = new Set();
  return records.map((source) => {
    const stockCode = stockCodeOf(source?.stockCode);
    const name = text(source?.companyName);
    const relatedCbCodes = [...new Set(recordsOf(source?.cbCodes).map(bondCodeOf).filter(Boolean))].sort();
    if (!stockCode || !name || seen.has(stockCode)) throw new TypeError("V5.6 security identity is invalid");
    seen.add(stockCode);
    return {
      securityId: `stock:${stockCode}`,
      stockCode,
      name,
      market: textOrNull(source?.market),
      industry: textOrNull(source?.industry),
      status: "active",
      relatedCbCodes,
      dataDate,
    };
  }).sort((left, right) => left.stockCode.localeCompare(right.stockCode));
}

function projectCbMaster(records, workbenchRecords, securities, dataDate) {
  const byBond = new Map(workbenchRecords.map((record) => [bondCodeOf(record?.bondCode ?? record?.term?.bondCode), record]));
  const byStock = new Map(securities.map((record) => [record.stockCode, record]));
  const seen = new Set();
  return records.map((source) => {
    const cbCode = bondCodeOf(source?.bondCode);
    const stockCode = stockCodeOf(source?.stockCode);
    const security = byStock.get(stockCode);
    if (!cbCode || !stockCode || !security || !security.relatedCbCodes.includes(cbCode) || seen.has(cbCode)) {
      throw new TypeError("V5.6 CB identity is invalid");
    }
    seen.add(cbCode);
    const sourceRecord = byBond.get(cbCode);
    const term = sourceRecord?.term ?? {};
    const view = sourceRecord?.view ?? {};
    return {
      cbCode,
      cbName: text(source?.bondName) || text(term?.bondName),
      stockCode,
      companyName: text(source?.companyName) || security.name,
      market: textOrNull(source?.market) ?? security.market,
      issueDate: isoDate(term?.issueDate),
      listingDate: isoDate(term?.listingDate),
      maturityDate: isoDate(term?.maturityDate),
      issueAmount: finiteNumber(term?.issueAmount),
      outstandingAmount: finiteNumber(view?.outstandingAmount ?? term?.outstandingAmount),
      currentConversionPrice: finiteNumber(view?.currentConversionPrice ?? term?.currentConversionPrice),
      cbClose: finiteNumber(view?.cbClose),
      status: textOrNull(sourceRecord?.status) ?? "active",
      dataDate,
    };
  }).sort((left, right) => left.cbCode.localeCompare(right.cbCode));
}

function projectPriceHistory(history, dataDate) {
  return recordsOf(history).flatMap((record) => {
    const cbCode = bondCodeOf(record?.bondCode);
    const tradeDate = isoDate(record?.date ?? record?.tradingDate);
    if (!cbCode || !tradeDate) return [];
    const close = finiteNumber(record?.cbClose);
    const volume = finiteNumber(record?.cbTradingUnits);
    return [{ securityId: `cb:${cbCode}`, cbCode, tradeDate, open: finiteNumber(record?.cbOpen), high: finiteNumber(record?.cbHigh), low: finiteNumber(record?.cbLow), close, volume, value: finiteNumber(record?.cbTurnoverAmount), source: "official", dataDate }];
  });
}

function projectCbEvents(rightsEvents, dataDate) {
  return recordsOf(rightsEvents?.events).flatMap((event) => {
    const eventId = text(event?.eventId);
    const cbCode = bondCodeOf(event?.bondCode);
    const announcementDate = isoDate(event?.announcementDate);
    if (!eventId || !cbCode || !announcementDate) return [];
    return [{
      eventId,
      eventType: text(event?.eventType) || "early_redemption",
      cbCode,
      stockCode: stockCodeOf(event?.issuerCode),
      announcementDate,
      startDate: isoDate(event?.acceptStartDate),
      endDate: isoDate(event?.acceptEndDate),
      deadlineDate: isoDate(event?.lastConversionDate ?? event?.acceptEndDate),
      effectiveDate: isoDate(event?.recordDate),
      title: textOrNull(event?.reason),
      sourceUrl: safeOfficialUrl(event?.sourceUrl),
      status: text(event?.status) || "upcoming",
      dataDate,
    }];
  });
}

function projectIpoPipeline(ipo, dataDate) {
  return recordsOf(ipo?.records ?? ipo).flatMap((record) => {
    const stockCode = stockCodeOf(record?.companyCode);
    const companyName = text(record?.companyName);
    if (!stockCode || !companyName) return [];
    return [{ stockCode, companyName, market: textOrNull(record?.market), applicationDate: isoDate(record?.applicationDate), reviewDate: isoDate(record?.reviewDate), boardDate: isoDate(record?.boardDate), contractDate: isoDate(record?.contractDate), listingDate: isoDate(record?.listingDate), offerPrice: finiteNumber(record?.finalUnderwritingPrice), stage: textOrNull(record?.stage), dataDate }];
  });
}

function projectEmerging(emerging, dataDate) {
  return recordsOf(emerging?.records ?? emerging).flatMap((record) => {
    const stockCode = stockCodeOf(record?.companyCode);
    if (!stockCode) return [];
    return [{ stockCode, companyName: textOrNull(record?.companyName), tradingDate: isoDate(record?.tradingDate), dailyAveragePrice: finiteNumber(record?.dailyAveragePrice), dailyVolume: finiteNumber(record?.transactionVolume), transactionAmount: finiteNumber(record?.estimatedTransactionAmount), dataDate }];
  });
}

function projectSearchIndex(records, dataDate) {
  return recordsOf(records).flatMap((record) => {
    const type = text(record?.type);
    if (!type || findInternalField(record)) return [];
    return [{ id: text(record?.id), type, stockCode: stockCodeOf(record?.stockCode), companyName: textOrNull(record?.companyName), cbCode: bondCodeOf(record?.cbCode), cbName: textOrNull(record?.cbName), market: textOrNull(record?.market), aliases: recordsOf(record?.aliases).map(text).filter(Boolean), dataDate }];
  });
}

function dataset(name, records, dataDate) {
  return { dataset: name, dataDate, recordCount: records.length, status: "verified", records };
}

function findInternalField(value) {
  if (Array.isArray(value)) return value.find(findInternalField) ?? null;
  if (!isRecord(value)) return null;
  for (const [key, nested] of Object.entries(value)) {
    if (INTERNAL_FIELDS.has(key)) return key;
    const child = findInternalField(nested);
    if (child) return child;
  }
  return null;
}

function safeOfficialUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["www.tpex.org.tw", "mopsov.twse.com.tw", "mops.twse.com.tw", "www.twse.com.tw"].includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function recordsOf(value) { return Array.isArray(value) ? value : []; }
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function textOrNull(value) { const result = text(value); return result || null; }
function stockCodeOf(value) { const code = text(value); return /^\d{4}$/.test(code) ? code : null; }
function bondCodeOf(value) { const code = text(value); return /^\d{5,6}$/.test(code) ? code : null; }
function isFiniteNumber(value) { return typeof value === "number" && Number.isFinite(value); }
function finiteNumber(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function isoDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return null; const date = new Date(`${value}T00:00:00.000Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null; }
function deepFreeze(value) { if (value !== null && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }
