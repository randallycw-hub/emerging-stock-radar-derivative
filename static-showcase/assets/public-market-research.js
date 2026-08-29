import { publicNumber } from "./public-data-state.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function recordsOf(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.records) ? value.records : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isPositiveNumber(value) {
  const parsed = publicNumber(value);
  return parsed !== null && parsed > 0;
}

function isNegativeNumber(value) {
  const parsed = publicNumber(value);
  return parsed !== null && parsed < 0;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  return Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function dateDistance(from, to) {
  if (!isIsoDate(from) || !isIsoDate(to)) return null;
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
}

function round(value, digits = 2) {
  return Math.round(value * 10 ** digits) / 10 ** digits;
}

function canonicalCompanyRoute(stockCode) {
  return `./company.html?code=${encodeURIComponent(stockCode)}`;
}

function canonicalBondRoute(bondCode) {
  return `./bonds.html?bond=${encodeURIComponent(bondCode)}`;
}

function canonicalIpoRoute(stockCode) {
  return `./company.html?code=${encodeURIComponent(stockCode)}&tab=ipo-cb`;
}

function activeBond(record) {
  return text(record?.status).toLowerCase() === "active";
}

function marketLabel(value) {
  const market = text(value).toLowerCase();
  if (market === "listed" || market === "twse" || value === "上市") return "上市";
  if (market === "otc" || market === "tpex" || value === "上櫃") return "上櫃";
  if (market === "emerging" || value === "興櫃") return "興櫃";
  return null;
}

function validStockCode(value) {
  return /^\d{4}$/.test(text(value));
}

function validBondCode(value) {
  return /^\d{5,6}$/.test(text(value));
}

function preferredValue(current, next, rank) {
  const value = text(next);
  if (!value) return current;
  if (!current || rank < current.rank) return { value, rank };
  return current;
}

function preferredMarket(current, next, rank) {
  const value = marketLabel(next);
  if (!value) return current;
  if (!current || rank < current.rank) return { value, rank };
  return current;
}

function preferredIpoStage(current, next) {
  const value = text(next);
  if (!value) return current;
  const rank = /^[ABCD]$/.test(value) ? 0 : 1;
  if (!current || rank < current.rank) return { value, rank };
  return current;
}

function companyCandidate(map, stockCode) {
  const code = text(stockCode);
  if (!validStockCode(code)) return null;
  if (!map.has(code)) {
    map.set(code, {
      stockCode: code,
      companyName: null,
      market: null,
      industry: null,
      ipoStage: null,
      bonds: [],
    });
  }
  return map.get(code);
}

/**
 * Produces the three public identity datasets from the validated generation.
 * Company identity is always keyed by the formal four-digit code; CB links are
 * accepted only when the term's issuerCode is a matching four-digit code.
 */
export function buildCanonicalPublicMasters({
  manifest = null,
  emerging = [],
  ipo = [],
  workbench = [],
  stockCloses = [],
  revenue = [],
} = {}) {
  const dataDate = isIsoDate(manifest?.market?.dataDate) ? manifest.market.dataDate : null;
  const companies = new Map();
  const register = ({ stockCode, companyName, market, industry, ipoStage, rank }) => {
    const candidate = companyCandidate(companies, stockCode);
    if (!candidate) return null;
    candidate.companyName = preferredValue(candidate.companyName, companyName, rank);
    candidate.market = preferredMarket(candidate.market, market, rank);
    candidate.industry = preferredValue(candidate.industry, industry, rank);
    candidate.ipoStage = preferredIpoStage(candidate.ipoStage, ipoStage);
    return candidate;
  };

  for (const record of recordsOf(stockCloses)) {
    register({ stockCode: record?.companyCode, market: record?.market, rank: 0 });
  }
  for (const record of recordsOf(emerging)) {
    register({
      stockCode: record?.companyCode,
      companyName: record?.companyName,
      market: "興櫃",
      industry: record?.industryName,
      rank: 0,
    });
  }
  // Archive records remain in the canonical CB master so an explicitly opened
  // historical bond can be resolved by its exact code; active-only views still
  // apply their own status filter before rendering.
  for (const record of recordsOf(workbench)) {
    const issuer = record?.term?.issuerCode;
    const issuerResearch = record?.view?.issuerResearch;
    const company = register({
      stockCode: issuer,
      companyName: record?.term?.issuerName,
      market: issuerResearch?.market,
      industry: issuerResearch?.industryName,
      rank: 1,
    });
    const bondCode = text(record?.bondCode ?? record?.term?.bondCode);
    const bondName = text(record?.term?.bondName ?? record?.view?.bondName);
    if (!company || !validBondCode(bondCode) || !bondName) continue;
    if (!company.bonds.some((bond) => bond.bondCode === bondCode)) {
      company.bonds.push({ bondCode, bondName });
    }
  }
  for (const record of recordsOf(revenue)) {
    register({
      stockCode: record?.["公司代號"],
      companyName: record?.["公司名稱"],
      industry: record?.["產業別"],
      rank: 2,
    });
  }
  for (const record of recordsOf(ipo)) {
    register({
      stockCode: record?.companyCode,
      companyName: record?.companyName,
      market: record?.market,
      ipoStage: record?.stage,
      rank: 3,
    });
  }

  const companyMaster = [...companies.values()]
    .filter((company) => company.companyName?.value)
    .map((company) => {
      const bonds = [...company.bonds].sort((left, right) => left.bondCode.localeCompare(right.bondCode));
      return {
        stockCode: company.stockCode,
        companyName: company.companyName.value,
        market: company.market?.value ?? "—",
        industry: company.industry?.value ?? "—",
        cbCodes: bonds.map((bond) => bond.bondCode),
        cbNames: bonds.map((bond) => bond.bondName),
        aliases: [],
        ipoStage: company.ipoStage?.value ?? null,
        dataDate,
      };
    })
    .sort((left, right) => left.stockCode.localeCompare(right.stockCode));
  const companyByCode = new Map(companyMaster.map((company) => [company.stockCode, company]));
  const cbMaster = companyMaster.flatMap((company) => company.cbCodes.map((bondCode, index) => ({
    bondCode,
    bondName: company.cbNames[index],
    stockCode: company.stockCode,
    companyName: company.companyName,
    market: company.market,
    dataDate,
  }))).sort((left, right) => left.bondCode.localeCompare(right.bondCode));
  const searchIndex = [
    ...companyMaster.map((company) => ({
      id: `company:${company.stockCode}`,
      type: "company",
      stockCode: company.stockCode,
      companyName: company.companyName,
      cbCode: null,
      cbName: null,
      market: company.market,
      industry: company.industry,
      cbCodes: company.cbCodes,
      cbNames: company.cbNames,
      aliases: company.aliases,
      ipoStage: company.ipoStage,
      url: canonicalCompanyRoute(company.stockCode),
      dataDate,
    })),
    ...cbMaster.map((bond) => ({
      id: `cb:${bond.bondCode}`,
      type: "cb",
      stockCode: bond.stockCode,
      companyName: bond.companyName,
      cbCode: bond.bondCode,
      cbName: bond.bondName,
      market: bond.market,
      industry: companyByCode.get(bond.stockCode)?.industry ?? "—",
      cbCodes: [bond.bondCode],
      cbNames: [bond.bondName],
      aliases: [],
      ipoStage: companyByCode.get(bond.stockCode)?.ipoStage ?? null,
      url: canonicalBondRoute(bond.bondCode),
      dataDate,
    })),
  ].sort((left, right) => left.id.localeCompare(right.id, "zh-Hant"));

  return {
    meta: {
      dataDate,
      recordCount: companyMaster.length + cbMaster.length,
      status: dataDate ? "ok" : "unavailable",
    },
    companyMaster,
    cbMaster,
    searchIndex,
  };
}

function publicMeta(manifest, dataDate, counts) {
  const sourceUrls = [...new Set((Array.isArray(manifest?.datasets) ? manifest.datasets : [])
    .map((dataset) => text(dataset?.sourceUrl))
    .filter((url) => /^https:\/\//.test(url)))];
  return {
    source: "official-public-snapshots",
    sourceUrls,
    dataDate,
    fetchedAt: text(manifest?.market?.generatedAt) || null,
    updatedAt: text(manifest?.market?.generatedAt) || null,
    recordCount: counts.reduce((total, count) => total + count, 0),
    status: dataDate ? "ok" : "unavailable",
  };
}

function rankedEntries(records, { metric, label, descending = true, dataDate }) {
  return records.map((record) => ({
    code: text(record?.companyCode),
    name: text(record?.companyName),
    value: publicNumber(record?.[metric]),
  })).filter((entry) => /^\d{4}$/.test(entry.code) && entry.name && entry.value !== null)
    .sort((left, right) => descending ? right.value - left.value : left.value - right.value)
    .slice(0, 5)
    .map((entry, index) => ({
      rank: index + 1,
      code: entry.code,
      name: entry.name,
      primaryLabel: label,
      primaryValue: entry.value,
      secondaryValue: null,
      route: canonicalCompanyRoute(entry.code),
      dataDate,
    }));
}

function buildEmergingRankings(emerging, dataDate) {
  const records = recordsOf(emerging).filter((record) => record?.tradingDate === dataDate);
  if (!dataDate || records.length === 0) {
    return { state: "data_unavailable", dataDate: dataDate ?? null, tabs: {} };
  }
  const traded = records.filter((record) => isPositiveNumber(record?.transactionVolume));
  return {
    state: "ready",
    dataDate,
    tabs: {
      gainers: { label: "漲幅", entries: rankedEntries(traded.filter((record) => isPositiveNumber(record?.averageChangePercent)), { metric: "averageChangePercent", label: "漲跌幅", dataDate }) },
      losers: { label: "跌幅", entries: rankedEntries(traded.filter((record) => isNegativeNumber(record?.averageChangePercent)), { metric: "averageChangePercent", label: "漲跌幅", descending: false, dataDate }) },
      turnover: { label: "成交額", entries: rankedEntries(traded, { metric: "estimatedTransactionAmount", label: "成交額", dataDate }) },
      volume: { label: "成交量", entries: rankedEntries(traded, { metric: "transactionVolume", label: "成交量", dataDate }) },
      revenueYoY: { label: "營收 YoY", entries: [], state: "not_available" },
    },
  };
}

function buildCbStockLeaders(workbench, stockCloses, dataDate) {
  if (!dataDate) return { state: "data_unavailable", dataDate: null, entries: [] };
  const bondsByIssuer = new Map();
  for (const record of recordsOf(workbench).filter(activeBond)) {
    const issuerCode = text(record?.term?.issuerCode);
    const issuerName = text(record?.term?.issuerName);
    if (!/^\d{4}$/.test(issuerCode) || !issuerName) continue;
    const bonds = bondsByIssuer.get(issuerCode) ?? { companyName: issuerName, bonds: [] };
    bonds.bonds.push({ code: text(record?.bondCode), name: text(record?.term?.bondName), route: canonicalBondRoute(text(record?.bondCode)) });
    bondsByIssuer.set(issuerCode, bonds);
  }
  const rows = recordsOf(stockCloses).filter((record) => record?.tradingDate === dataDate);
  const entries = rows.map((record) => {
    const code = text(record?.companyCode);
    const related = bondsByIssuer.get(code);
    const close = publicNumber(record?.close);
    const change = publicNumber(record?.change);
    if (!related || close === null || change === null || close - change === 0) return null;
    return {
      code,
      name: related.companyName,
      changePercent: round(change / (close - change) * 100),
      close,
      dataDate,
      route: canonicalCompanyRoute(code),
      relatedBonds: related.bonds.filter((bond) => bond.code && bond.name),
    };
  }).filter(Boolean).sort((left, right) => right.changePercent - left.changePercent).slice(0, 5);
  return entries.length ? { state: "ready", dataDate, entries } : { state: "data_unavailable", dataDate, entries: [] };
}

function bondMetadata(workbench) {
  return new Map(recordsOf(workbench).filter(activeBond).map((record) => [
    text(record?.bondCode),
    {
      bondName: text(record?.term?.bondName),
      issuerCode: text(record?.term?.issuerCode),
      issuerName: text(record?.term?.issuerName),
    },
  ]));
}

function turnoverEntries(points, metadata, dataDate) {
  const totals = new Map();
  for (const point of points) {
    const units = publicNumber(point?.cbTradingUnits);
    const bondCode = text(point?.bondCode);
    if (units === null || units <= 0 || !metadata.has(bondCode)) continue;
    const current = totals.get(bondCode) ?? { tradingUnits: 0, point };
    current.tradingUnits += units;
    if (point.date > current.point.date) current.point = point;
    totals.set(bondCode, current);
  }
  return [...totals.entries()].map(([bondCode, total]) => {
    const meta = metadata.get(bondCode);
    return {
      code: bondCode,
      name: meta.bondName,
      issuerCode: meta.issuerCode,
      issuerName: meta.issuerName,
      tradingUnits: total.tradingUnits,
      close: publicNumber(total.point?.cbClose),
      premiumRate: publicNumber(total.point?.premiumRate),
      route: canonicalBondRoute(bondCode),
      companyRoute: canonicalCompanyRoute(meta.issuerCode),
      dataDate,
    };
  }).sort((left, right) => right.tradingUnits - left.tradingUnits).slice(0, 5);
}

function buildCbTurnover(workbench, history, dataDate) {
  const metadata = bondMetadata(workbench);
  if (!dataDate || metadata.size === 0) {
    return {
      daily: { state: "no_verified_data", dataDate: dataDate ?? null, entries: [] },
      weekly: { state: "no_verified_data", dataDate: dataDate ?? null, periodStart: null, periodEnd: null, entries: [] },
    };
  }
  const verified = recordsOf(history).filter((point) => metadata.has(text(point?.bondCode)) && isIsoDate(point?.date) && publicNumber(point?.cbTradingUnits) !== null && publicNumber(point?.cbTradingUnits) >= 0);
  const dailyPoints = verified.filter((point) => point.date === dataDate);
  const dailyEntries = turnoverEntries(dailyPoints, metadata, dataDate);
  const daily = dailyPoints.length === 0
    ? { state: "no_verified_data", dataDate, entries: [] }
    : dailyEntries.length === 0
      ? { state: "no_trades", dataDate, entries: [] }
      : { state: "ready", dataDate, entries: dailyEntries };
  if (dailyPoints.length === 0) {
    return { daily, weekly: { state: "no_verified_data", dataDate, periodStart: null, periodEnd: null, entries: [] } };
  }
  const dates = [...new Set(verified.filter((point) => point.date <= dataDate).map((point) => point.date))].sort().slice(-5);
  const periodPoints = verified.filter((point) => dates.includes(point.date));
  const weeklyEntries = turnoverEntries(periodPoints, metadata, dataDate);
  const weekly = weeklyEntries.length
    ? { state: "ready", dataDate, periodStart: dates[0] ?? null, periodEnd: dates.at(-1) ?? null, entries: weeklyEntries }
    : { state: "no_trades", dataDate, periodStart: dates[0] ?? null, periodEnd: dates.at(-1) ?? null, entries: [] };
  return { daily, weekly };
}

function buildCbIssuance(workbench, dataDate) {
  const entries = recordsOf(workbench).filter(activeBond).map((record) => {
    const term = record?.term ?? {};
    const listingDate = isIsoDate(term.listingDate) && term.listingDate <= dataDate ? term.listingDate : null;
    const issueDate = isIsoDate(term.issueDate) && term.issueDate <= dataDate ? term.issueDate : null;
    if (!listingDate && !issueDate) return null;
    const code = text(record?.bondCode);
    const issuerCode = text(term.issuerCode);
    return {
      stockCode: issuerCode,
      companyName: text(term.issuerName),
      cbCode: code,
      cbName: text(term.bondName),
      issueAmount: publicNumber(term.issueAmount),
      conversionPrice: publicNumber(record?.view?.currentConversionPrice),
      stage: listingDate ? "已公告掛牌" : "已公告發行",
      nextDate: listingDate ?? issueDate,
      route: canonicalBondRoute(code),
      companyRoute: canonicalCompanyRoute(issuerCode),
      dataDate,
    };
  }).filter(Boolean).sort((left, right) => right.nextDate.localeCompare(left.nextDate)).slice(0, 5);
  return entries.length ? { state: "ready", dataDate, entries } : { state: "not_published", dataDate, entries: [] };
}

function isCbOfficialEvent(event, dataDate) {
  const type = text(event?.type).toLowerCase();
  const distance = dateDistance(dataDate, event?.date);
  return ["listing", "redemption", "delisting"].includes(type)
    && distance !== null
    && distance <= 0;
}

function buildCbOfficialEvents(workbench, dataDate) {
  const entries = recordsOf(workbench).flatMap((record) => (record?.events ?? []).map((event) => ({ record, event })))
    .filter(({ event }) => isCbOfficialEvent(event, dataDate) && typeof event?.sourceUrl === "string" && /^https:\/\//.test(event.sourceUrl))
    .map(({ record, event }) => ({
      date: event.date,
      code: text(record?.bondCode),
      name: text(record?.term?.bondName),
      title: text(event.title) || "可轉債官方公告",
      eventType: text(event.type),
      sourceName: "官方事件",
      sourceUrl: event.sourceUrl,
      route: canonicalBondRoute(text(record?.bondCode)),
      dataDate,
    })).sort((left, right) => right.date.localeCompare(left.date)).slice(0, 8);
  return entries.length ? { state: "ready", dataDate, entries } : { state: "not_published", dataDate, entries: [] };
}

function isIpoMarketEvent(event) {
  return /auction|subscription|draw|listing|underwriting|payment/u.test(text(event?.kind));
}

function calendarEntries(ipo, dataDate, days) {
  return recordsOf(ipo).flatMap((record) => (record?.events ?? []).map((event) => ({ record, event })))
    .filter(({ event }) => isIpoMarketEvent(event) && (dateDistance(dataDate, event?.date) ?? -1) >= 0 && (dateDistance(dataDate, event?.date) ?? Infinity) <= days)
    .map(({ record, event }) => ({
      date: event.date,
      code: text(record?.companyCode),
      name: text(record?.companyName),
      label: text(event.label) || "已公告時程",
      route: canonicalIpoRoute(text(record?.companyCode)),
      dataDate,
    })).sort((left, right) => left.date.localeCompare(right.date) || left.code.localeCompare(right.code));
}

function buildIpoCalendar(ipo, dataDate) {
  if (!dataDate) return { state: "not_published", dataDate: null, days7: { entries: [] }, days30: { entries: [] } };
  const days30 = calendarEntries(ipo, dataDate, 30);
  const days7 = days30.filter((entry) => (dateDistance(dataDate, entry.date) ?? Infinity) <= 7);
  return { state: days30.length ? "ready" : "not_published", dataDate, days7: { entries: days7 }, days30: { entries: days30 } };
}

function buildLatestEvents({ emerging, ipo, workbench }, dataDate) {
  const cb = recordsOf(workbench).flatMap((record) => (record?.events ?? []).filter((event) => isCbOfficialEvent(event, dataDate)).map((event) => ({
    date: event?.date,
    category: "cb",
    code: text(record?.bondCode),
    title: text(event?.title),
    route: canonicalBondRoute(text(record?.bondCode)),
  })));
  const ipoEvents = recordsOf(ipo).flatMap((record) => (record?.events ?? []).filter(isIpoMarketEvent).map((event) => ({
    date: event?.date,
    category: "ipo",
    code: text(record?.companyCode),
    title: text(event?.label),
    route: canonicalIpoRoute(text(record?.companyCode)),
  })));
  const emergingEvents = recordsOf(emerging?.events).map((event) => ({
    date: event?.date,
    category: "emerging",
    code: text(event?.companyCode),
    title: text(event?.title ?? event?.label),
    route: canonicalCompanyRoute(text(event?.companyCode)),
  }));
  const seen = new Set();
  const entries = [...cb, ...ipoEvents, ...emergingEvents]
    .filter((entry) => isIsoDate(entry.date) && entry.code && entry.title)
    .sort((left, right) => right.date.localeCompare(left.date))
    .filter((entry) => {
      const key = `${entry.category}:${entry.code}:${entry.date}:${entry.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8).map((entry) => ({ ...entry, dataDate }));
  return { state: entries.length ? "ready" : "not_published", dataDate: dataDate ?? null, entries };
}

export function buildPublicMarketResearch({ manifest, emerging, ipo, workbench, stockCloses, history, revenue } = {}) {
  const dataDate = isIsoDate(manifest?.market?.dataDate) ? manifest.market.dataDate : null;
  const counts = [recordsOf(emerging).length, recordsOf(ipo).length, recordsOf(workbench).length, recordsOf(stockCloses).length, recordsOf(history).length];
  const masters = buildCanonicalPublicMasters({
    manifest,
    emerging,
    ipo,
    workbench,
    stockCloses,
    revenue,
  });
  return {
    schemaVersion: 1,
    meta: publicMeta(manifest, dataDate, counts),
    searchIndex: masters.searchIndex,
    home: {
      cbStockLeaders: buildCbStockLeaders(workbench, stockCloses, dataDate),
      emergingRankings: buildEmergingRankings(emerging, dataDate),
      cbTurnover: buildCbTurnover(workbench, history, dataDate),
      cbIssuance: buildCbIssuance(workbench, dataDate),
      cbOfficialEvents: buildCbOfficialEvents(workbench, dataDate),
      marketNews: { state: "not_available", dataDate, entries: [] },
      ipoCalendar: buildIpoCalendar(ipo, dataDate),
      latestEvents: buildLatestEvents({ emerging, ipo, workbench }, dataDate),
    },
  };
}
