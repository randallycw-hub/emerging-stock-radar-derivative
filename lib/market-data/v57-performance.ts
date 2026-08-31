import {
  selectValidPeriodBaseline,
  type V56PerformancePeriod,
} from "./v56-performance.ts";

export type V57DerivedMetric = Readonly<{
  value: number;
  numerator: number;
  denominator: number;
  sourceDates: readonly [string, string];
}>;

type Dataset = Readonly<{ records?: readonly Record<string, unknown>[] }>;

export type V57PerformanceSnapshot = Readonly<{
  dataDate: string;
  cbMaster?: Dataset;
  priceHistory?: Dataset;
  emerging?: Dataset;
  stockPriceHistory?: Dataset;
  ipoPipeline?: Dataset;
}>;

type Session = Readonly<{
  tradeDate: string;
  close: number;
  volume: number | null;
  value: number | null;
}>;

const PERIODS = Object.freeze(["1D", "1W", "1M", "3M", "6M", "YTD"] as const satisfies readonly V56PerformancePeriod[]);

export function calculateV57PeriodMetric(
  sessions: readonly Session[],
  period: V56PerformancePeriod,
): V57DerivedMetric | null {
  const valid = validSessions(sessions);
  const latest = valid.at(-1);
  const baseline = selectValidPeriodBaseline(valid, period);
  if (!latest || !baseline || baseline.close <= 0) return null;
  return Object.freeze({
    value: Number((latest.close / baseline.close - 1).toFixed(8)),
    numerator: latest.close,
    denominator: baseline.close,
    sourceDates: Object.freeze([baseline.tradeDate, latest.tradeDate]),
  });
}

export function buildV57Performance(snapshots: readonly V57PerformanceSnapshot[]): readonly Record<string, unknown>[] {
  const ordered = [...snapshots].filter((snapshot) => isIsoDate(snapshot.dataDate)).sort((left, right) => left.dataDate.localeCompare(right.dataDate));
  const current = ordered.at(-1);
  if (!current) return Object.freeze([]);
  const cbSessions = sessionsByCode(ordered, "priceHistory", "cbCode", { requireTrade: false });
  const emergingSessions = sessionsByCode(ordered, "emerging", "stockCode", { requireTrade: true });
  const stockSessions = sessionsByCode(ordered, "stockPriceHistory", "stockCode", { requireTrade: true });
  const records = [
    ...recordsOf(current.cbMaster).flatMap((record) => buildCbRecord(record, cbSessions, current.dataDate)),
    ...recordsOf(current.emerging).flatMap((record) => buildEmergingRecord(record, emergingSessions, current.dataDate)),
    ...recordsOf(current.ipoPipeline).flatMap((record) => buildIpoRecord(record, stockSessions, current.dataDate)),
  ];
  return Object.freeze(records.sort((left, right) => (
    text(left.entityType).localeCompare(text(right.entityType))
    || text(left.entityId).localeCompare(text(right.entityId))
  )));
}

function buildCbRecord(record: Record<string, unknown>, byCode: ReadonlyMap<string, readonly Session[]>, dataDate: string): readonly Record<string, unknown>[] {
  const cbCode = code(record.cbCode);
  if (!cbCode) return [];
  const sessions = byCode.get(cbCode) ?? [];
  return [Object.freeze({
    entityType: "cb",
    entityId: cbCode,
    cbCode,
    dataDate,
    periods: periodValues(sessions),
    metrics: periodMetrics(sessions),
  })];
}

function buildEmergingRecord(record: Record<string, unknown>, byCode: ReadonlyMap<string, readonly Session[]>, dataDate: string): readonly Record<string, unknown>[] {
  const stockCode = code(record.stockCode);
  if (!stockCode) return [];
  const sessions = byCode.get(stockCode) ?? [];
  const latest = sessions.at(-1) ?? null;
  return [Object.freeze({
    entityType: "emerging",
    entityId: stockCode,
    stockCode,
    companyName: textOrNull(record.companyName),
    dataDate,
    tradeState: latest === null ? "DATA_ERROR" : latest.tradeDate === dataDate ? "TRADED_TODAY" : "NO_TRADE_TODAY",
    latestTradeDate: latest?.tradeDate ?? null,
    latestPrice: latest?.close ?? null,
    latestVolume: latest?.volume ?? null,
    periods: periodValues(sessions),
    metrics: periodMetrics(sessions),
    liquidity: calculateLiquidity(sessions),
  })];
}

function buildIpoRecord(record: Record<string, unknown>, byCode: ReadonlyMap<string, readonly Session[]>, dataDate: string): readonly Record<string, unknown>[] {
  const stockCode = code(record.stockCode);
  const listingDate = isoDate(record.listingDate);
  if (!stockCode || !listingDate || listingDate > dataDate) return [];
  const offerPrice = positiveNumber(record.offerPrice);
  const sessions = (byCode.get(stockCode) ?? []).filter((session) => session.tradeDate >= listingDate);
  const latest = sessions.at(-1) ?? null;
  const sinceListing = offerPrice === null || latest === null
    ? null
    : metricFromBaseline(latest, { tradeDate: listingDate, close: offerPrice });
  const periodMetrics = {
    "5D": calculateV57PeriodMetric(sessions, "1W"),
    "20D": calculateV57PeriodMetric(sessions, "1M"),
    "1M": calculateV57PeriodMetric(sessions, "1M"),
    sinceListing,
  };
  return [Object.freeze({
    entityType: "ipo",
    entityId: stockCode,
    stockCode,
    companyName: textOrNull(record.companyName),
    listingDate,
    offerPrice,
    dataDate,
    latestTradeDate: latest?.tradeDate ?? null,
    latestPrice: latest?.close ?? null,
    periods: Object.freeze(Object.fromEntries(Object.entries(periodMetrics).map(([period, metric]) => [period, metric?.value ?? null]))),
    metrics: Object.freeze(periodMetrics),
  })];
}

function sessionsByCode(
  snapshots: readonly V57PerformanceSnapshot[],
  datasetName: "priceHistory" | "emerging" | "stockPriceHistory",
  codeField: "cbCode" | "stockCode",
  { requireTrade }: Readonly<{ requireTrade: boolean }>,
): ReadonlyMap<string, readonly Session[]> {
  const byCode = new Map<string, Session[]>();
  for (const snapshot of snapshots) {
    for (const record of recordsOf(snapshot[datasetName])) {
      const id = code(record[codeField]);
      const session = sessionFromRecord(record, snapshot.dataDate, requireTrade);
      if (!id || !session) continue;
      const values = byCode.get(id) ?? [];
      values.push(session);
      byCode.set(id, values);
    }
  }
  return new Map([...byCode.entries()].map(([id, sessions]) => [id, validSessions(sessions)]));
}

function sessionFromRecord(record: Record<string, unknown>, snapshotDate: string, requireTrade: boolean): Session | null {
  const tradeDate = isoDate(record.tradeDate) ?? isoDate(record.tradingDate) ?? isoDate(snapshotDate);
  const close = positiveNumber(record.close ?? record.dailyAveragePrice);
  const volume = nonNegativeNumber(record.volume ?? record.dailyVolume);
  const value = nonNegativeNumber(record.value ?? record.transactionAmount);
  if (!tradeDate || close === null || (requireTrade && (volume === null || volume <= 0))) return null;
  return Object.freeze({ tradeDate, close, volume, value });
}

function validSessions(sessions: readonly Session[]): readonly Session[] {
  const byDate = new Map<string, Session>();
  for (const session of sessions) {
    if (isIsoDate(session.tradeDate) && Number.isFinite(session.close) && session.close > 0) byDate.set(session.tradeDate, session);
  }
  return Object.freeze([...byDate.values()].sort((left, right) => left.tradeDate.localeCompare(right.tradeDate)));
}

function periodMetrics(sessions: readonly Session[]): Readonly<Record<V56PerformancePeriod, V57DerivedMetric | null>> {
  return Object.freeze(Object.fromEntries(PERIODS.map((period) => [period, calculateV57PeriodMetric(sessions, period)])) as Record<V56PerformancePeriod, V57DerivedMetric | null>);
}

function periodValues(sessions: readonly Session[]): Readonly<Record<V56PerformancePeriod, number | null>> {
  return Object.freeze(Object.fromEntries(Object.entries(periodMetrics(sessions)).map(([period, metric]) => [period, metric?.value ?? null])) as Record<V56PerformancePeriod, number | null>);
}

function calculateLiquidity(sessions: readonly Session[]) {
  const valid = validSessions(sessions).filter((session) => session.volume !== null);
  const latest = valid.at(-1) ?? null;
  const average = (field: "volume" | "value", size: number): number | null => {
    const points = valid.slice(-size);
    if (points.length !== size || points.some((point) => point[field] === null)) return null;
    return Number((points.reduce((sum, point) => sum + Number(point[field]), 0) / size).toFixed(4));
  };
  const average20Volume = average("volume", 20);
  const average20Amount = average("value", 20);
  return Object.freeze({
    average5Volume: average("volume", 5),
    average20Volume,
    volumeRatio: latest?.volume === null || average20Volume === null || average20Volume <= 0 ? null : Number((latest.volume / average20Volume).toFixed(4)),
    average20Amount,
    amountChange: latest?.value === null || average20Amount === null || average20Amount <= 0 ? null : Number((latest.value / average20Amount - 1).toFixed(8)),
  });
}

function metricFromBaseline(latest: Session, baseline: Readonly<{ tradeDate: string; close: number }>): V57DerivedMetric | null {
  if (baseline.close <= 0) return null;
  return Object.freeze({
    value: Number((latest.close / baseline.close - 1).toFixed(8)),
    numerator: latest.close,
    denominator: baseline.close,
    sourceDates: Object.freeze([baseline.tradeDate, latest.tradeDate]),
  });
}

function recordsOf(dataset: Dataset | undefined): readonly Record<string, unknown>[] {
  return Array.isArray(dataset?.records) ? dataset.records : [];
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function textOrNull(value: unknown): string | null { const result = text(value); return result || null; }
function code(value: unknown): string | null { const result = text(value); return /^\d{4,6}$/.test(result) ? result : null; }
function positiveNumber(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function nonNegativeNumber(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function isoDate(value: unknown): string | null { const date = String(value ?? ""); return isIsoDate(date) ? date : null; }
function isIsoDate(value: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)); }
