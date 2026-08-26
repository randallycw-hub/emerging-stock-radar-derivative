import { divideDecimal, multiplyDecimal, subtractDecimal } from "./decimal.ts";
import { isIsoDate } from "../domain/dates.ts";
import { selectEffectiveConversionPrice } from "./conversion-price-history.ts";
import type {
  BondMarketHistoryPoint,
  CbQuote,
  ConversionPriceVersion,
  StockClose,
} from "./types.ts";

const HISTORY_POINT_KEYS = [
  "bondCode",
  "date",
  "cbOpen",
  "cbHigh",
  "cbLow",
  "cbClose",
  "cbAverage",
  "cbChange",
  "cbTradingUnits",
  "cbTurnover",
  "stockClose",
  "effectiveConversionPrice",
  "conversionValue",
  "premiumRate",
];

export function parseBondMarketHistory(value: unknown): readonly BondMarketHistoryPoint[] {
  requireDenseArray(value, "bond market history");
  const identities = new Set<string>();
  const points = value.map((candidate, index) => {
    const point = requireRecord(candidate, `bond market history point ${index}`);
    assertExactKeys(point, HISTORY_POINT_KEYS, `bond market history point ${index}`);
    if (typeof point.bondCode !== "string" || !/^\d{5,6}$/.test(point.bondCode)) {
      throw new TypeError(`bond market history point ${index} bondCode is invalid`);
    }
    if (!isIsoDate(point.date)) {
      throw new TypeError(`bond market history point ${index} date is invalid`);
    }
    const normalized: BondMarketHistoryPoint = {
      bondCode: point.bondCode,
      date: point.date,
      cbOpen: optionalUnsignedDecimal(point.cbOpen, `bond market history point ${index} cbOpen`),
      cbHigh: optionalUnsignedDecimal(point.cbHigh, `bond market history point ${index} cbHigh`),
      cbLow: optionalUnsignedDecimal(point.cbLow, `bond market history point ${index} cbLow`),
      cbClose: optionalUnsignedDecimal(point.cbClose, `bond market history point ${index} cbClose`),
      cbAverage: optionalUnsignedDecimal(point.cbAverage, `bond market history point ${index} cbAverage`),
      cbChange: optionalSignedDecimal(point.cbChange, `bond market history point ${index} cbChange`),
      cbTradingUnits: optionalUnsignedDecimal(point.cbTradingUnits, `bond market history point ${index} cbTradingUnits`),
      cbTurnover: optionalUnsignedDecimal(point.cbTurnover, `bond market history point ${index} cbTurnover`),
      stockClose: optionalUnsignedDecimal(point.stockClose, `bond market history point ${index} stockClose`),
      effectiveConversionPrice: optionalUnsignedDecimal(point.effectiveConversionPrice, `bond market history point ${index} effectiveConversionPrice`),
      conversionValue: optionalUnsignedDecimal(point.conversionValue, `bond market history point ${index} conversionValue`),
      premiumRate: optionalSignedDecimal(point.premiumRate, `bond market history point ${index} premiumRate`),
    };
    assertOhlc(normalized, `bond market history point ${index}`);
    const identity = `${normalized.bondCode}\u001f${normalized.date}`;
    if (identities.has(identity)) {
      throw new TypeError(`duplicate bond market history identity: ${identity}`);
    }
    identities.add(identity);
    return normalized;
  });
  return deepFreeze(points);
}

export function buildHistoryPoints(input: {
  cbQuotes: readonly CbQuote[];
  stockCloses: readonly StockClose[];
  conversionPrices: readonly ConversionPriceVersion[];
}): readonly BondMarketHistoryPoint[] {
  const equivalentQuotes = input.cbQuotes.filter(
    (quote) => quote.tradingMode === "equivalent",
  );
  assertUnique(
    equivalentQuotes.map((quote) => `${quote.bondCode}\u001f${quote.tradingDate}`),
    "duplicate CB history quote",
  );
  assertUnique(
    input.stockCloses.map((stock) =>
      `${stock.companyCode}\u001f${stock.market}\u001f${stock.tradingDate}`
    ),
    "duplicate stock history close",
  );
  assertUnique(
    input.conversionPrices.map((price) =>
      `${price.bondCode}\u001f${price.effectiveDate}`
    ),
    "duplicate conversion history version",
  );

  const bondCodes = new Set([
    ...equivalentQuotes.map((quote) => quote.bondCode),
    ...input.conversionPrices.map((price) => price.bondCode),
  ]);
  const points: BondMarketHistoryPoint[] = [];

  for (const bondCode of [...bondCodes].sort()) {
    const versions = input.conversionPrices
      .filter((price) => price.bondCode === bondCode)
      .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate));
    const issuerCode = versions[0]?.issuerCode;
    const quoteByDate = new Map(
      equivalentQuotes
        .filter((quote) => quote.bondCode === bondCode)
        .map((quote) => [quote.tradingDate, quote] as const),
    );
    const stockByDate = new Map(
      issuerCode === undefined
        ? []
        : input.stockCloses
          .filter((stock) => stock.companyCode === issuerCode)
          .map((stock) => [stock.tradingDate, stock] as const),
    );
    const dates = new Set([...quoteByDate.keys(), ...stockByDate.keys()]);

    for (const date of [...dates].sort()) {
      const quote = quoteByDate.get(date);
      const stock = stockByDate.get(date);
      const effectiveVersion = selectEffectiveConversionPrice(versions, date);
      const conversionValue =
        stock !== undefined && effectiveVersion !== null
          ? multiplyDecimal(
            divideDecimal(
              stock.close,
              effectiveVersion.currentConversionPrice,
              8,
            ),
            "100",
            2,
          )
          : null;
      const candle = quote === undefined ? nullCandle() : normalizeCandle(quote);
      const premiumRate =
        candle.cbClose !== null
        && conversionValue !== null
          ? multiplyDecimal(
            subtractDecimal(
              divideDecimal(candle.cbClose, conversionValue, 8),
              "1",
              8,
            ),
            "100",
            2,
          )
          : null;

      points.push({
        bondCode,
        date,
        ...candle,
        cbAverage: quote?.average ?? null,
        cbChange: quote?.change ?? null,
        cbTradingUnits: quote?.tradingUnits ?? null,
        cbTurnover: quote?.turnover ?? null,
        stockClose: stock?.close ?? null,
        effectiveConversionPrice:
          effectiveVersion?.currentConversionPrice ?? null,
        conversionValue,
        premiumRate,
      });
    }
  }

  return parseBondMarketHistory(points);
}

export function mergeBondMarketHistory(
  previous: unknown,
  current: unknown,
): readonly BondMarketHistoryPoint[] {
  const points = new Map<string, BondMarketHistoryPoint>();
  for (const point of [...parseBondMarketHistory(previous), ...parseBondMarketHistory(current)]) {
    const identity = `${point.bondCode}\u001f${point.date}`;
    const existing = points.get(identity);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(point)) {
      throw new TypeError(`bond market history conflict requires correction evidence: ${identity}`);
    }
    points.set(identity, point);
  }
  return parseBondMarketHistory([...points.values()].sort(
    (left, right) => left.date.localeCompare(right.date) || left.bondCode.localeCompare(right.bondCode),
  ));
}

/**
 * A TPEx monthly CB response includes earlier CB dates, while the scheduled
 * refresh only fetches the current stock close.  Those earlier candidates lack
 * their same-day stock context and must not erase verified historical valuation
 * facts.  Keep the strict merge for every actual source difference.
 */
export function mergeBondMarketHistoryConservatively(
  previous: unknown,
  current: unknown,
): readonly BondMarketHistoryPoint[] {
  const prior = parseBondMarketHistory(previous);
  const priorByIdentity = new Map(prior.map((point) => [historyIdentity(point), point]));
  const appendable = parseBondMarketHistory(current).filter((candidate) => {
    const existing = priorByIdentity.get(historyIdentity(candidate));
    return existing === undefined || !isMissingOnlyHistoricalStockContext(existing, candidate);
  });
  return mergeBondMarketHistory(prior, appendable);
}

function isMissingOnlyHistoricalStockContext(
  existing: BondMarketHistoryPoint,
  candidate: BondMarketHistoryPoint,
): boolean {
  if (
    existing.stockClose === null
    || candidate.stockClose !== null
    || candidate.conversionValue !== null
    || candidate.premiumRate !== null
  ) return false;
  for (const key of [
    "bondCode",
    "date",
    "cbOpen",
    "cbHigh",
    "cbLow",
    "cbClose",
    "cbAverage",
    "cbChange",
    "cbTradingUnits",
    "cbTurnover",
    "effectiveConversionPrice",
  ] as const) {
    if (existing[key] !== candidate[key]) return false;
  }
  return true;
}

function historyIdentity(point: Pick<BondMarketHistoryPoint, "bondCode" | "date">): string {
  return `${point.bondCode}\u001f${point.date}`;
}

function nullCandle(): Pick<BondMarketHistoryPoint, "cbOpen" | "cbHigh" | "cbLow" | "cbClose"> {
  return { cbOpen: null, cbHigh: null, cbLow: null, cbClose: null };
}

function normalizeCandle(quote: CbQuote): Pick<BondMarketHistoryPoint, "cbOpen" | "cbHigh" | "cbLow" | "cbClose"> {
  if (isZeroDecimal(quote.tradingUnits)) return nullCandle();
  const values = [quote.open, quote.high, quote.low, quote.close];
  if (values.some((value) => value === null)) return nullCandle();
  return {
    cbOpen: quote.open,
    cbHigh: quote.high,
    cbLow: quote.low,
    cbClose: quote.close,
  };
}

function assertOhlc(point: BondMarketHistoryPoint, name: string): void {
  const values = [point.cbOpen, point.cbHigh, point.cbLow, point.cbClose];
  if (values.every((value) => value === null)) return;
  if (values.some((value) => value === null)) return;
  const [open, high, low, close] = values as [string, string, string, string];
  if (compareUnsignedDecimal(low, high) > 0
    || compareUnsignedDecimal(open, low) < 0
    || compareUnsignedDecimal(open, high) > 0
    || compareUnsignedDecimal(close, low) < 0
    || compareUnsignedDecimal(close, high) > 0) {
    throw new TypeError(`${name} OHLC relationship is invalid`);
  }
}

function compareUnsignedDecimal(left: string, right: string): number {
  const [leftInteger, leftFraction = ""] = left.split(".");
  const [rightInteger, rightFraction = ""] = right.split(".");
  if (leftInteger.length !== rightInteger.length) {
    return leftInteger.length < rightInteger.length ? -1 : 1;
  }
  if (leftInteger !== rightInteger) return leftInteger < rightInteger ? -1 : 1;
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const scaledLeft = leftFraction.padEnd(scale, "0");
  const scaledRight = rightFraction.padEnd(scale, "0");
  if (scaledLeft === scaledRight) return 0;
  return scaledLeft < scaledRight ? -1 : 1;
}

function optionalUnsignedDecimal(value: unknown, name: string): string | null {
  return value === null ? null : requiredUnsignedDecimal(value, name);
}

function optionalSignedDecimal(value: unknown, name: string): string | null {
  return value === null ? null : requiredSignedDecimal(value, name);
}

function requiredUnsignedDecimal(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new TypeError(`${name} must be a canonical decimal`);
  }
  return value;
}

function requiredSignedDecimal(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^(?!-0(?:\.0+)?$)-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new TypeError(`${name} must be a canonical signed decimal`);
  }
  return value;
}

function isZeroDecimal(value: string): boolean {
  return /^0(?:\.0+)?$/.test(value);
}

function requireDenseArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an exact dense array`);
  if (Reflect.ownKeys(value).length !== value.length + 1
    || value.some((_, index) => !Object.prototype.hasOwnProperty.call(value, index))) {
    throw new TypeError(`${name} must be an exact dense array`);
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], name: string): void {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some((key) => (
    typeof key !== "string"
    || !expected.includes(key)
    || !Object.prototype.propertyIsEnumerable.call(value, key)
  ))) {
    throw new TypeError(`${name} keys must match contract`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new TypeError(message);
}
