const INTERNAL_SCALE = 24;
const OUTPUT_SCALE = 6;
const SCALE_FACTOR = 10n ** BigInt(INTERNAL_SCALE);
const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function verifiedDailyCandles(points) {
  if (!Array.isArray(points)) throw new TypeError("points must be an array");

  return points
    .filter((point) => [point.cbOpen, point.cbHigh, point.cbLow, point.cbClose, point.cbTradingUnits, point.cbTurnover]
      .every((value) => typeof value === "string"))
    .map((point) => ({
      periodStart: point.date,
      periodEnd: point.date,
      open: canonicalDecimal(point.cbOpen),
      high: canonicalDecimal(point.cbHigh),
      low: canonicalDecimal(point.cbLow),
      close: canonicalDecimal(point.cbClose),
      tradingUnits: canonicalDecimal(point.cbTradingUnits),
      turnover: canonicalDecimal(point.cbTurnover),
    }))
    .sort((left, right) => left.periodStart.localeCompare(right.periodStart));
}

export function summarizeVerifiedOhlcv(points) {
  const candles = verifiedDailyCandles(points);
  return Object.freeze({
    completePoints: candles.length,
    dateRange: candles.length === 0
      ? null
      : Object.freeze([candles[0].periodStart, candles.at(-1).periodEnd]),
  });
}

export function aggregateCandles(candles, period) {
  if (!Array.isArray(candles)) throw new TypeError("candles must be an array");
  if (period !== "week" && period !== "month") {
    throw new TypeError("period must be week or month");
  }

  const groups = new Map();
  const ordered = [...candles].sort((left, right) =>
    left.periodStart.localeCompare(right.periodStart));

  for (const candle of ordered) {
    const bounds = periodBounds(candle.periodStart, period);
    const existing = groups.get(bounds.periodStart);
    if (existing === undefined) {
      groups.set(bounds.periodStart, {
        ...bounds,
        open: canonicalDecimal(candle.open),
        high: canonicalDecimal(candle.high),
        low: canonicalDecimal(candle.low),
        close: canonicalDecimal(candle.close),
        tradingUnits: canonicalDecimal(candle.tradingUnits),
        turnover: canonicalDecimal(candle.turnover),
      });
      continue;
    }

    if (compareDecimals(candle.high, existing.high) > 0) {
      existing.high = canonicalDecimal(candle.high);
    }
    if (compareDecimals(candle.low, existing.low) < 0) {
      existing.low = canonicalDecimal(candle.low);
    }
    existing.close = canonicalDecimal(candle.close);
    existing.tradingUnits = addDecimals(existing.tradingUnits, candle.tradingUnits);
    existing.turnover = addDecimals(existing.turnover, candle.turnover);
  }

  return [...groups.values()];
}

export function simpleMovingAverage(candles, period) {
  assertPositiveInteger(period, "period");
  const closes = closeValues(candles);
  const output = Array(candles.length).fill(null);
  let sum = 0n;

  for (let index = 0; index < closes.length; index += 1) {
    sum += closes[index];
    if (index >= period) sum -= closes[index - period];
    if (index >= period - 1) {
      output[index] = formatOutput(roundFraction(sum, BigInt(period)));
    }
  }

  return output;
}

export function bollingerBands(candles, period = 20, multiplier = 2) {
  assertPositiveInteger(period, "period");
  const multiplierValue = toScaled(String(multiplier));
  const closes = closeValues(candles);
  const output = Array.from({ length: candles.length }, () => nullBollinger());
  let sum = 0n;
  let sumSquares = 0n;

  for (let index = 0; index < closes.length; index += 1) {
    const close = closes[index];
    sum += close;
    sumSquares += close * close;
    if (index >= period) {
      const expired = closes[index - period];
      sum -= expired;
      sumSquares -= expired * expired;
    }
    if (index < period - 1) continue;

    const count = BigInt(period);
    const varianceNumerator = sumSquares * count - sum * sum;
    const standardDeviation = roundedSquareRootFraction(
      varianceNumerator < 0n ? 0n : varianceNumerator,
      count,
    );
    const middle = roundFraction(sum, count);
    const distance = roundFraction(
      standardDeviation * multiplierValue,
      SCALE_FACTOR,
    );
    output[index] = {
      middle: formatOutput(middle),
      upper: formatOutput(middle + distance),
      lower: formatOutput(middle - distance),
    };
  }

  return output;
}

export function relativeStrengthIndex(candles, period = 14) {
  assertPositiveInteger(period, "period");
  const closes = closeValues(candles);
  const output = Array(candles.length).fill(null);
  if (closes.length <= period) return output;

  let gainSum = 0n;
  let lossSum = 0n;
  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    if (change > 0n) gainSum += change;
    if (change < 0n) lossSum -= change;
  }

  const count = BigInt(period);
  let averageGain = roundFraction(gainSum, count);
  let averageLoss = roundFraction(lossSum, count);
  output[period] = formatOutput(rsiValue(averageGain, averageLoss));

  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    const gain = change > 0n ? change : 0n;
    const loss = change < 0n ? -change : 0n;
    averageGain = roundFraction(averageGain * (count - 1n) + gain, count);
    averageLoss = roundFraction(averageLoss * (count - 1n) + loss, count);
    output[index] = formatOutput(rsiValue(averageGain, averageLoss));
  }

  return output;
}

export function stochasticKd(candles, lookback = 9, kPeriod = 3, dPeriod = 3) {
  assertPositiveInteger(lookback, "lookback");
  assertPositiveInteger(kPeriod, "kPeriod");
  assertPositiveInteger(dPeriod, "dPeriod");
  const highs = candles.map((candle) => toScaled(candle.high));
  const lows = candles.map((candle) => toScaled(candle.low));
  const closes = closeValues(candles);
  const output = Array.from({ length: candles.length }, () => ({ k: null, d: null }));
  let previousK = 50n * SCALE_FACTOR;
  let previousD = 50n * SCALE_FACTOR;

  for (let index = lookback - 1; index < candles.length; index += 1) {
    let highest = highs[index - lookback + 1];
    let lowest = lows[index - lookback + 1];
    for (let cursor = index - lookback + 2; cursor <= index; cursor += 1) {
      if (highs[cursor] > highest) highest = highs[cursor];
      if (lows[cursor] < lowest) lowest = lows[cursor];
    }
    const range = highest - lowest;
    const raw = range === 0n
      ? 50n * SCALE_FACTOR
      : roundFraction((closes[index] - lowest) * 100n * SCALE_FACTOR, range);
    previousK = smooth(previousK, raw, kPeriod);
    previousD = smooth(previousD, previousK, dPeriod);
    output[index] = {
      k: formatOutput(previousK),
      d: formatOutput(previousD),
    };
  }

  return output;
}

export function macd(candles, fast = 12, slow = 26, signal = 9) {
  assertPositiveInteger(fast, "fast");
  assertPositiveInteger(slow, "slow");
  assertPositiveInteger(signal, "signal");
  const closes = closeValues(candles);
  const fastEma = exponentialMovingAverage(closes, fast);
  const slowEma = exponentialMovingAverage(closes, slow);
  const macdValues = closes.map((_, index) =>
    fastEma[index] === null || slowEma[index] === null
      ? null
      : fastEma[index] - slowEma[index]);
  const signalValues = sparseExponentialMovingAverage(macdValues, signal);

  return macdValues.map((value, index) => {
    const signalValue = signalValues[index];
    return {
      macd: value === null ? null : formatOutput(value),
      signal: signalValue === null ? null : formatOutput(signalValue),
      histogram: value === null || signalValue === null
        ? null
        : formatOutput(value - signalValue),
    };
  });
}

function periodBounds(date, period) {
  const { year, month, day } = parseIsoDate(date);
  if (period === "month") {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      periodStart: formatIsoDate(year, month, 1),
      periodEnd: formatIsoDate(year, month, lastDay),
    };
  }

  const value = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - daysSinceMonday);
  const periodStart = value.toISOString().slice(0, 10);
  value.setUTCDate(value.getUTCDate() + 6);
  return { periodStart, periodEnd: value.toISOString().slice(0, 10) };
}

function parseIsoDate(value) {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) throw new TypeError(`invalid ISO date: ${String(value)}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day) {
    throw new TypeError(`invalid ISO date: ${value}`);
  }
  return { year, month, day };
}

function formatIsoDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function closeValues(candles) {
  if (!Array.isArray(candles)) throw new TypeError("candles must be an array");
  return candles.map((candle) => toScaled(candle.close));
}

function exponentialMovingAverage(values, period) {
  const output = Array(values.length).fill(null);
  if (values.length < period) return output;
  let sum = 0n;
  for (let index = 0; index < period; index += 1) sum += values[index];
  let previous = roundFraction(sum, BigInt(period));
  output[period - 1] = previous;
  const denominator = BigInt(period + 1);
  const previousWeight = BigInt(period - 1);
  for (let index = period; index < values.length; index += 1) {
    previous = roundFraction(values[index] * 2n + previous * previousWeight, denominator);
    output[index] = previous;
  }
  return output;
}

function sparseExponentialMovingAverage(values, period) {
  const output = Array(values.length).fill(null);
  let seen = 0;
  let seedSum = 0n;
  let previous = null;
  const denominator = BigInt(period + 1);
  const previousWeight = BigInt(period - 1);

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === null) continue;
    if (previous === null) {
      seen += 1;
      seedSum += value;
      if (seen === period) {
        previous = roundFraction(seedSum, BigInt(period));
        output[index] = previous;
      }
      continue;
    }
    previous = roundFraction(value * 2n + previous * previousWeight, denominator);
    output[index] = previous;
  }
  return output;
}

function rsiValue(averageGain, averageLoss) {
  if (averageGain === 0n && averageLoss === 0n) return 50n * SCALE_FACTOR;
  if (averageLoss === 0n) return 100n * SCALE_FACTOR;
  return roundFraction(
    averageGain * 100n * SCALE_FACTOR,
    averageGain + averageLoss,
  );
}

function smooth(previous, current, period) {
  const count = BigInt(period);
  return roundFraction(previous * (count - 1n) + current, count);
}

function nullBollinger() {
  return { middle: null, upper: null, lower: null };
}

function addDecimals(left, right) {
  const leftValue = parseDecimal(left);
  const rightValue = parseDecimal(right);
  const scale = Math.max(leftValue.scale, rightValue.scale);
  const coefficient = leftValue.coefficient * powerOfTen(scale - leftValue.scale)
    + rightValue.coefficient * powerOfTen(scale - rightValue.scale);
  return formatScaled(coefficient, scale);
}

function compareDecimals(left, right) {
  const leftValue = parseDecimal(left);
  const rightValue = parseDecimal(right);
  const scale = Math.max(leftValue.scale, rightValue.scale);
  const leftCoefficient = leftValue.coefficient * powerOfTen(scale - leftValue.scale);
  const rightCoefficient = rightValue.coefficient * powerOfTen(scale - rightValue.scale);
  return leftCoefficient < rightCoefficient ? -1 : leftCoefficient > rightCoefficient ? 1 : 0;
}

function canonicalDecimal(value) {
  const parsed = parseDecimal(value);
  return formatScaled(parsed.coefficient, parsed.scale);
}

function toScaled(value) {
  const parsed = parseDecimal(value);
  if (parsed.scale <= INTERNAL_SCALE) {
    return parsed.coefficient * powerOfTen(INTERNAL_SCALE - parsed.scale);
  }
  return roundFraction(
    parsed.coefficient,
    powerOfTen(parsed.scale - INTERNAL_SCALE),
  );
}

function parseDecimal(value) {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    throw new TypeError(`invalid canonical decimal: ${String(value)}`);
  }
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [integerPart, fractionPart = ""] = unsigned.split(".");
  const digits = `${integerPart}${fractionPart}`.replace(/^0+(?=\d)/, "");
  return {
    coefficient: BigInt(digits || "0") * (negative ? -1n : 1n),
    scale: fractionPart.length,
  };
}

function formatOutput(coefficient) {
  return formatScaled(
    rescale(coefficient, INTERNAL_SCALE, OUTPUT_SCALE),
    OUTPUT_SCALE,
  );
}

function rescale(coefficient, sourceScale, targetScale) {
  if (targetScale >= sourceScale) {
    return coefficient * powerOfTen(targetScale - sourceScale);
  }
  return roundFraction(coefficient, powerOfTen(sourceScale - targetScale));
}

function roundFraction(numerator, denominator) {
  if (denominator === 0n) throw new RangeError("division by zero");
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  let quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;
  if (remainder * 2n >= absoluteDenominator) quotient += 1n;
  return negative ? -quotient : quotient;
}

function roundedSquareRootFraction(numerator, denominatorRoot) {
  if (numerator === 0n) return 0n;
  const floor = integerSquareRoot(numerator) / denominatorRoot;
  const doubledCandidate = floor * 2n + 1n;
  return numerator * 4n >= denominatorRoot * denominatorRoot
      * doubledCandidate * doubledCandidate
    ? floor + 1n
    : floor;
}

function integerSquareRoot(value) {
  if (value < 0n) throw new RangeError("square root of a negative value");
  if (value < 2n) return value;
  let current = 1n << BigInt((value.toString(2).length + 1) >> 1);
  let next = (current + value / current) >> 1n;
  while (next < current) {
    current = next;
    next = (current + value / current) >> 1n;
  }
  return current;
}

function formatScaled(coefficient, scale) {
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient)
    .toString()
    .padStart(scale + 1, "0");
  if (scale === 0) return `${negative ? "-" : ""}${digits}`;
  const integerPart = digits.slice(0, -scale);
  const fractionPart = digits.slice(-scale).replace(/0+$/, "");
  const magnitude = fractionPart === "" ? integerPart : `${integerPart}.${fractionPart}`;
  return negative && magnitude !== "0" ? `-${magnitude}` : magnitude;
}

function powerOfTen(exponent) {
  return 10n ** BigInt(exponent);
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}
