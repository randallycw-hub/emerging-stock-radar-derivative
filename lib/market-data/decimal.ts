type ParsedDecimal = {
  coefficient: bigint;
  scale: number;
};

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function divideDecimal(
  left: string,
  right: string,
  scale: number,
): string {
  assertScale(scale);
  const dividend = parseDecimal(left);
  const divisor = parseDecimal(right);
  if (divisor.coefficient === BigInt(0)) throw new RangeError("division by zero");

  let numerator = dividend.coefficient;
  let denominator = divisor.coefficient;
  const exponent = divisor.scale + scale - dividend.scale;
  if (exponent >= 0) {
    numerator *= powerOfTen(exponent);
  } else {
    denominator *= powerOfTen(-exponent);
  }
  return formatScaled(roundFraction(numerator, denominator), scale);
}

export function multiplyDecimal(
  left: string,
  right: string,
  scale: number,
): string {
  assertScale(scale);
  const leftValue = parseDecimal(left);
  const rightValue = parseDecimal(right);
  const coefficient = leftValue.coefficient * rightValue.coefficient;
  const sourceScale = leftValue.scale + rightValue.scale;
  return formatScaled(rescale(coefficient, sourceScale, scale), scale);
}

export function subtractDecimal(
  left: string,
  right: string,
  scale: number,
): string {
  assertScale(scale);
  const leftValue = parseDecimal(left);
  const rightValue = parseDecimal(right);
  const commonScale = Math.max(leftValue.scale, rightValue.scale);
  const coefficient =
    leftValue.coefficient * powerOfTen(commonScale - leftValue.scale)
    - rightValue.coefficient * powerOfTen(commonScale - rightValue.scale);
  return formatScaled(rescale(coefficient, commonScale, scale), scale);
}

function parseDecimal(value: string): ParsedDecimal {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    throw new TypeError(`invalid decimal: ${String(value)}`);
  }
  const negative = value.startsWith("-");
  const unsigned = value.replace(/^[+-]/, "");
  const [integerPart = "0", fractionPart = ""] = unsigned.split(".");
  const digits = `${integerPart || "0"}${fractionPart}`.replace(/^0+(?=\d)/, "");
  const coefficient = BigInt(digits || "0") * (
    negative ? BigInt(-1) : BigInt(1)
  );
  return { coefficient, scale: fractionPart.length };
}

function rescale(
  coefficient: bigint,
  sourceScale: number,
  targetScale: number,
): bigint {
  if (targetScale >= sourceScale) {
    return coefficient * powerOfTen(targetScale - sourceScale);
  }
  return roundFraction(coefficient, powerOfTen(sourceScale - targetScale));
}

function roundFraction(numerator: bigint, denominator: bigint): bigint {
  if (denominator === BigInt(0)) throw new RangeError("division by zero");
  const negative =
    (numerator < BigInt(0)) !== (denominator < BigInt(0));
  const absoluteNumerator =
    numerator < BigInt(0) ? -numerator : numerator;
  const absoluteDenominator =
    denominator < BigInt(0) ? -denominator : denominator;
  let quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;
  if (remainder * BigInt(2) >= absoluteDenominator) quotient += BigInt(1);
  return negative ? -quotient : quotient;
}

function formatScaled(coefficient: bigint, scale: number): string {
  const negative = coefficient < BigInt(0);
  const digits = (negative ? -coefficient : coefficient)
    .toString()
    .padStart(scale + 1, "0");
  if (scale === 0) return `${negative ? "-" : ""}${digits}`;
  const integerPart = digits.slice(0, -scale);
  const fractionPart = digits.slice(-scale).replace(/0+$/, "");
  const magnitude = fractionPart === ""
    ? integerPart
    : `${integerPart}.${fractionPart}`;
  if (/^0(?:\.0*)?$/.test(magnitude)) return "0";
  return negative ? `-${magnitude}` : magnitude;
}

function powerOfTen(exponent: number): bigint {
  return BigInt(10) ** BigInt(exponent);
}

function assertScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
    throw new TypeError("scale must be an integer from 0 to 18");
  }
}
