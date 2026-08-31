import { isIsoDate } from "../domain/dates.ts";

export type IpoPriceStage = "final" | "provisional" | "minimum_bid" | "unpublished" | "verified_zero";

export type TradeState = "TRADED_TODAY" | "NO_TRADE_TODAY" | "DATA_ERROR";

export type TradeStateInput = Readonly<{
  latestTradeDate: string | null | undefined;
  dataDate: string | null | undefined;
  lastPrice: number | null | undefined;
  lastVolume: number | null | undefined;
}>;

export type TradeStateResult = Readonly<{
  state: TradeState;
  lastTradeDate: string | null;
  lastPrice: number | null;
  lastVolume: number | null;
}>;

export type RollingPoint = Readonly<{
  date: string;
  volume: number | null;
  amount: number | null;
}>;

export type RollingMetrics = Readonly<{
  average5: number | null;
  average20: number | null;
  volumeRatio: number | null;
  averageAmount20: number | null;
  amountChange: number | null;
  volumeRatioNumerator: number | null;
  volumeRatioDenominator: number | null;
  amountChangeNumerator: number | null;
  amountChangeDenominator: number | null;
}>;

export function normalizeIpoPublicPrice(value: unknown, stage: IpoPriceStage): number | null {
  const number = finiteNumber(value);
  if (number === null || number < 0) return null;
  if (number === 0 && stage !== "verified_zero") return null;
  return number;
}

export function resolveTradeState(input: TradeStateInput): TradeStateResult {
  const dataDate = validDate(input.dataDate);
  const latestTradeDate = validDate(input.latestTradeDate);
  const lastPrice = finiteNumber(input.lastPrice);
  const lastVolume = finiteNumber(input.lastVolume);
  if (!dataDate || !latestTradeDate || latestTradeDate > dataDate || (lastVolume !== null && lastVolume < 0)) {
    return freeze({ state: "DATA_ERROR", lastTradeDate: null, lastPrice: null, lastVolume: null });
  }
  return freeze({
    state: latestTradeDate === dataDate && lastVolume !== null && lastVolume > 0 ? "TRADED_TODAY" : "NO_TRADE_TODAY",
    lastTradeDate: latestTradeDate,
    lastPrice,
    lastVolume,
  });
}

export function calculateRollingMetrics(points: readonly RollingPoint[]): RollingMetrics {
  const sessions = validSessions(points);
  const current = sessions.at(-1) ?? null;
  const average5 = average(sessions.slice(-5).map((point) => point.volume), 5);
  const average20 = average(sessions.slice(-20).map((point) => point.volume), 20);
  const averageAmount20 = average(sessions.slice(-20).map((point) => point.amount), 20);
  const volumeRatio = current !== null && current.volume !== null && average5 !== null && average5 > 0
    ? round(current.volume / average5)
    : null;
  const amountChange = current !== null && current.amount !== null && averageAmount20 !== null && averageAmount20 > 0
    ? round(current.amount / averageAmount20 - 1)
    : null;
  return freeze({
    average5,
    average20,
    volumeRatio,
    averageAmount20,
    amountChange,
    volumeRatioNumerator: current?.volume ?? null,
    volumeRatioDenominator: average5,
    amountChangeNumerator: current?.amount ?? null,
    amountChangeDenominator: averageAmount20,
  });
}

function validSessions(points: readonly RollingPoint[]): readonly RollingPoint[] {
  const dates = new Set<string>();
  const valid: RollingPoint[] = [];
  for (const point of points) {
    if (!isIsoDate(point?.date) || dates.has(point.date)) continue;
    const volume = finiteNumber(point.volume);
    const amount = finiteNumber(point.amount);
    if (volume === null || volume < 0 || amount === null || amount < 0) continue;
    dates.add(point.date);
    valid.push(freeze({ date: point.date, volume, amount }));
  }
  return freeze(valid.sort((left, right) => left.date.localeCompare(right.date)));
}

function average(values: readonly (number | null)[], requiredSize: number): number | null {
  if (values.length !== requiredSize || values.some((value) => value === null)) return null;
  return round(values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / requiredSize);
}

function validDate(value: unknown): string | null {
  return typeof value === "string" && isIsoDate(value) ? value : null;
}

function finiteNumber(value: unknown): number | null {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value: number): number {
  return Number(value.toFixed(8));
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}
