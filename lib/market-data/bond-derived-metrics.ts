import { isIsoDate } from "../domain/dates.ts";
import { divideDecimal, multiplyDecimal } from "./decimal.ts";

export type BondRemainingMetricInput = {
  issueAmount: string | null;
  outstandingAmount: string | null;
  outstandingDataDate: string | null;
  faceValueTwd: string | null;
  cbTradeUnits: string;
  cbTradeDate: string | null;
};

type BondRemainingMissingReason =
  | "NO_VERIFIED_FACE_VALUE"
  | "OUTSTANDING_NOT_INTEGER"
  | "OUTSTANDING_NOT_DIVISIBLE"
  | "INVALID_ISSUE_AMOUNT"
  | "BALANCE_TRADE_DATE_MISMATCH"
  | "ZERO_REMAINING_UNITS";

export type BondRemainingMetrics = {
  remainingUnits: string | null;
  remainingRatio: string | null;
  dailyTurnoverRate: string | null;
  missingReasons: readonly BondRemainingMissingReason[];
};

const INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/;

export function deriveBondRemainingMetrics(
  input: BondRemainingMetricInput,
): BondRemainingMetrics {
  const cbTradeUnits = requiredInteger(input.cbTradeUnits, "cbTradeUnits");
  const outstandingDataDate = optionalDate(
    input.outstandingDataDate,
    "outstandingDataDate",
  );
  const cbTradeDate = optionalDate(input.cbTradeDate, "cbTradeDate");
  const missingReasons: BondRemainingMissingReason[] = [];

  let faceValue: bigint | null = null;
  if (input.faceValueTwd === null) {
    missingReasons.push("NO_VERIFIED_FACE_VALUE");
  } else {
    faceValue = requiredInteger(input.faceValueTwd, "faceValueTwd");
    if (faceValue <= BigInt(0)) {
      throw new TypeError("faceValueTwd must be a positive canonical integer");
    }
  }

  let outstandingAmount: bigint | null = null;
  if (input.outstandingAmount === null) {
    missingReasons.push("OUTSTANDING_NOT_INTEGER");
  } else if (typeof input.outstandingAmount !== "string") {
    throw new TypeError("outstandingAmount must be a string or null");
  } else if (!INTEGER_PATTERN.test(input.outstandingAmount)) {
    missingReasons.push("OUTSTANDING_NOT_INTEGER");
  } else {
    outstandingAmount = BigInt(input.outstandingAmount);
  }

  let remainingUnitsValue: bigint | null = null;
  if (faceValue !== null && outstandingAmount !== null) {
    if (outstandingAmount % faceValue !== BigInt(0)) {
      missingReasons.push("OUTSTANDING_NOT_DIVISIBLE");
    } else {
      remainingUnitsValue = outstandingAmount / faceValue;
    }
  }

  let issueAmount: bigint | null = null;
  if (input.issueAmount !== null && typeof input.issueAmount !== "string") {
    throw new TypeError("issueAmount must be a string or null");
  }
  if (
    input.issueAmount === null
    || !INTEGER_PATTERN.test(input.issueAmount)
    || input.issueAmount === "0"
  ) {
    missingReasons.push("INVALID_ISSUE_AMOUNT");
  } else {
    issueAmount = BigInt(input.issueAmount);
  }

  if (
    issueAmount !== null
    && outstandingAmount !== null
    && outstandingAmount > issueAmount
  ) {
    throw new TypeError("outstandingAmount must not exceed issueAmount");
  }

  const datesMatch = outstandingDataDate !== null
    && cbTradeDate !== null
    && outstandingDataDate === cbTradeDate;
  if (!datesMatch) {
    missingReasons.push("BALANCE_TRADE_DATE_MISMATCH");
  }

  if (remainingUnitsValue === BigInt(0)) {
    missingReasons.push("ZERO_REMAINING_UNITS");
  }

  const remainingRatio = issueAmount !== null && outstandingAmount !== null
    ? percentage(outstandingAmount, issueAmount)
    : null;
  const dailyTurnoverRate = datesMatch
    && remainingUnitsValue !== null
    && remainingUnitsValue > BigInt(0)
      ? percentage(cbTradeUnits, remainingUnitsValue)
      : null;

  return Object.freeze({
    remainingUnits: remainingUnitsValue?.toString() ?? null,
    remainingRatio,
    dailyTurnoverRate,
    missingReasons: Object.freeze(missingReasons),
  });
}

function requiredInteger(value: unknown, name: string): bigint {
  if (typeof value !== "string" || !INTEGER_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a canonical non-negative integer`);
  }
  return BigInt(value);
}

function optionalDate(value: unknown, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !isIsoDate(value)) {
    throw new TypeError(`${name} must be a valid ISO date or null`);
  }
  return value;
}

function percentage(numerator: bigint, denominator: bigint): string {
  return divideDecimal(
    multiplyDecimal(numerator.toString(), "100", 0),
    denominator.toString(),
    2,
  );
}
