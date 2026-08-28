const DAY_MS = 24 * 60 * 60 * 1000;

function recordsOf(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.records) ? value.records : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function buildSearchIndex({ emerging, ipo, workbench, stockCloses }, dataDate) {
  const companies = new Map();
  const registerCompany = ({ stockCode, companyName, market = "公司" }) => {
    const code = text(stockCode);
    const name = text(companyName);
    if (!/^\d{4}$/.test(code) || !name) return;
    const current = companies.get(code);
    if (current === undefined || current.companyName.length < name.length) {
      companies.set(code, { stockCode: code, companyName: name, market });
    }
  };
  for (const record of recordsOf(emerging)) {
    registerCompany({ stockCode: record?.companyCode, companyName: record?.companyName, market: "興櫃" });
  }
  for (const record of recordsOf(ipo)) {
    registerCompany({ stockCode: record?.companyCode, companyName: record?.companyName, market: "IPO" });
  }
  const closeMarkets = new Map(recordsOf(stockCloses).map((record) => [
    text(record?.companyCode), text(record?.market) === "listed" ? "TWSE" : "TPEx",
  ]));
  const activeBonds = recordsOf(workbench).filter(activeBond);
  for (const record of activeBonds) {
    registerCompany({
      stockCode: record?.term?.issuerCode,
      companyName: record?.term?.issuerName,
      market: closeMarkets.get(text(record?.term?.issuerCode)) ?? "CB",
    });
  }
  const companyEntries = [...companies.values()].map((company) => ({
    id: `company:${company.stockCode}`,
    type: "company",
    stockCode: company.stockCode,
    companyName: company.companyName,
    cbCode: null,
    cbName: null,
    market: company.market,
    aliases: [],
    url: canonicalCompanyRoute(company.stockCode),
    dataDate,
  }));
  const cbEntries = activeBonds.map((record) => ({
    id: `cb:${text(record?.bondCode)}`,
    type: "cb",
    stockCode: text(record?.term?.issuerCode),
    companyName: text(record?.term?.issuerName),
    cbCode: text(record?.bondCode),
    cbName: text(record?.term?.bondName),
    market: "CB",
    aliases: [],
    url: canonicalBondRoute(text(record?.bondCode)),
    dataDate,
  })).filter((entry) => /^\d{5,6}$/.test(entry.cbCode) && /^\d{4}$/.test(entry.stockCode) && entry.cbName && entry.companyName);
  const ipoEntries = recordsOf(ipo).filter((record) => {
    const stage = text(record?.stage).toLowerCase();
    return !["withdrawn", "listed", "cancelled"].includes(stage);
  }).map((record) => ({
    id: `ipo:${text(record?.companyCode)}`,
    type: "ipo",
    stockCode: text(record?.companyCode),
    companyName: text(record?.companyName),
    cbCode: null,
    cbName: null,
    market: "IPO",
    aliases: [],
    url: canonicalIpoRoute(text(record?.companyCode)),
    dataDate,
  })).filter((entry) => /^\d{4}$/.test(entry.stockCode) && entry.companyName);
  return [...companyEntries, ...ipoEntries, ...cbEntries]
    .sort((left, right) => left.id.localeCompare(right.id, "zh-Hant"));
}

function rankedEntries(records, { metric, label, descending = true, dataDate }) {
  return records.map((record) => ({
    code: text(record?.companyCode),
    name: text(record?.companyName),
    value: number(record?.[metric]),
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
  const traded = records.filter((record) => (number(record?.transactionVolume) ?? 0) > 0);
  return {
    state: "ready",
    dataDate,
    tabs: {
      gainers: { label: "漲幅", entries: rankedEntries(traded.filter((record) => (number(record?.averageChangePercent) ?? 0) > 0), { metric: "averageChangePercent", label: "漲跌幅", dataDate }) },
      losers: { label: "跌幅", entries: rankedEntries(traded.filter((record) => (number(record?.averageChangePercent) ?? 0) < 0), { metric: "averageChangePercent", label: "漲跌幅", descending: false, dataDate }) },
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
    const close = number(record?.close);
    const change = number(record?.change);
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
    const units = number(point?.cbTradingUnits);
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
      close: number(total.point?.cbClose),
      premiumRate: number(total.point?.premiumRate),
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
  const verified = recordsOf(history).filter((point) => metadata.has(text(point?.bondCode)) && isIsoDate(point?.date) && number(point?.cbTradingUnits) !== null && number(point?.cbTradingUnits) >= 0);
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
      issueAmount: number(term.issueAmount),
      conversionPrice: number(record?.view?.currentConversionPrice),
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

export function buildPublicMarketResearch({ manifest, emerging, ipo, workbench, stockCloses, history } = {}) {
  const dataDate = isIsoDate(manifest?.market?.dataDate) ? manifest.market.dataDate : null;
  const counts = [recordsOf(emerging).length, recordsOf(ipo).length, recordsOf(workbench).length, recordsOf(stockCloses).length, recordsOf(history).length];
  return {
    schemaVersion: 1,
    meta: publicMeta(manifest, dataDate, counts),
    searchIndex: buildSearchIndex({ emerging, ipo, workbench, stockCloses }, dataDate),
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
