import { isIsoDate } from "../domain/dates.ts";
import {
  parseCbIssuerResearchRecords,
  type CbIssuerResearchRecord,
} from "./cb-issuer-research.ts";
import { deriveBondRemainingMetrics } from "./bond-derived-metrics.ts";
import {
  currentCbRedemption,
  summarizeCbInstitution,
  type CbSupplementalSnapshot,
} from "./bond-supplemental.ts";
import { divideDecimal, multiplyDecimal, subtractDecimal } from "./decimal.ts";
import type {
  BondIssuerResearchView,
  BondMarketView,
  CbQuote,
  ConversionPriceVersion,
  StockClose,
} from "./types.ts";

type BondInput = {
  bondCode: string;
  issuerCode: string;
  bondName: string;
  maturityDate: string;
  issueAmount: string | null;
  outstandingAmount: string | null;
  outstandingDataDate: string | null;
  putDates: readonly string[];
};

export function buildBondMarketViews(input: {
  asOfDate: string;
  bonds: readonly Record<string, unknown>[];
  cbQuotes: readonly CbQuote[];
  stockCloses: readonly StockClose[];
  conversionPrices: readonly ConversionPriceVersion[];
  issuerResearch?: readonly CbIssuerResearchRecord[];
  supplemental?: CbSupplementalSnapshot;
}): readonly BondMarketView[] {
  if (!isIsoDate(input.asOfDate)) {
    throw new TypeError("asOfDate must be a valid ISO date");
  }

  const bonds = input.bonds
    .filter((bond) => typeof bond.bondCode === "string" && bond.bondCode !== "")
    .map(parseBondInput);
  assertUnique(bonds.map((bond) => bond.bondCode), "duplicate bond code");
  assertUnique(
    input.cbQuotes.map((quote) =>
      `${quote.bondCode}\u001f${quote.tradingDate}\u001f${quote.tradingMode}`
    ),
    "duplicate CB quote",
  );
  assertUnique(
    input.stockCloses.map((stock) =>
      `${stock.companyCode}\u001f${stock.market}\u001f${stock.tradingDate}`
    ),
    "duplicate stock close",
  );
  assertUnique(
    input.conversionPrices.map((price) =>
      `${price.bondCode}\u001f${price.effectiveDate}`
    ),
    "duplicate conversion price version",
  );
  const issuerResearchByCode = buildIssuerResearchMap(
    parseCbIssuerResearchRecords(input.issuerResearch ?? []),
  );

  return bonds.map((bond) => buildView(bond, input, issuerResearchByCode));
}

function buildView(
  bond: BondInput,
  input: {
    asOfDate: string;
    cbQuotes: readonly CbQuote[];
    stockCloses: readonly StockClose[];
    conversionPrices: readonly ConversionPriceVersion[];
    supplemental?: CbSupplementalSnapshot;
  },
  issuerResearchByCode: ReadonlyMap<string, CbIssuerResearchRecord>,
): BondMarketView {
  const cbQuotes = input.cbQuotes
    .filter((quote) =>
      quote.bondCode === bond.bondCode
      && quote.tradingMode === "equivalent"
      && quote.close !== null
      && quote.tradingDate <= input.asOfDate
    )
    .sort(descendingDate);
  const stockCloses = input.stockCloses
    .filter((stock) =>
      stock.companyCode === bond.issuerCode
      && stock.tradingDate <= input.asOfDate
    )
    .sort(descendingDate);
  const conversionPrices = input.conversionPrices
    .filter((price) =>
      price.bondCode === bond.bondCode
      && price.issuerCode === bond.issuerCode
    )
    .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate));

  const latestCb = cbQuotes[0];
  const latestStock = stockCloses[0];
  const latestConversion = conversionPrices[0];
  const stockByDate = new Map(
    stockCloses.map((stock) => [stock.tradingDate, stock] as const),
  );
  const valuationCb = cbQuotes.find((quote) => stockByDate.has(quote.tradingDate));
  const valuationStock = valuationCb
    ? stockByDate.get(valuationCb.tradingDate)
    : undefined;
  const valuationDate = valuationCb?.tradingDate ?? null;
  const effectiveConversion = valuationDate === null
    ? undefined
    : conversionPrices.find((price) => price.effectiveDate <= valuationDate);

  let conversionValue: string | null = null;
  let premiumRate: string | null = null;
  if (
    valuationCb?.close
    && valuationStock
    && effectiveConversion
  ) {
    conversionValue = multiplyDecimal(
      divideDecimal(
        valuationStock.close,
        effectiveConversion.currentConversionPrice,
        8,
      ),
      "100",
      2,
    );
    premiumRate = multiplyDecimal(
      subtractDecimal(
        divideDecimal(valuationCb.close, conversionValue, 8),
        "1",
        8,
      ),
      "100",
      2,
    );
  }

  const missingReasons: string[] = [];
  if (!latestCb) missingReasons.push("NO_CB_CLOSE");
  if (!latestStock) missingReasons.push("NO_STOCK_CLOSE");
  if (!latestConversion) missingReasons.push("NO_CONVERSION_PRICE");
  if (!valuationCb || !valuationStock) {
    missingReasons.push("NO_COMMON_VALUATION_DATE");
  } else if (!effectiveConversion) {
    missingReasons.push("NO_EFFECTIVE_CONVERSION_PRICE");
  }

  const nextPutDate =
    bond.putDates.filter((date) => date >= input.asOfDate).sort()[0] ?? null;
  const remainingMetrics = deriveBondRemainingMetrics({
    issueAmount: bond.issueAmount,
    outstandingAmount: bond.outstandingAmount,
    outstandingDataDate: bond.outstandingDataDate,
    faceValueTwd: input.supplemental?.unitFaceValueTwd ?? null,
    cbTradeUnits: latestCb?.tradingUnits ?? "0",
    cbTradeDate: latestCb?.tradingDate ?? null,
  });
  const institution = summarizeCbInstitution(
    input.supplemental,
    bond.bondCode,
    input.asOfDate,
  );
  const redemptionEvent = currentCbRedemption(
    input.supplemental,
    bond.bondCode,
    input.asOfDate,
  );
  missingReasons.push(...remainingMetrics.missingReasons);
  const nextEvent = redemptionEvent !== null
    ? { type: "redemption" as const, date: redemptionEvent.delistingDate }
    : nextPutDate !== null
      ? { type: "put" as const, date: nextPutDate }
      : { type: "maturity" as const, date: bond.maturityDate };
  const dataQuality = missingReasons.includes("BALANCE_TRADE_DATE_MISMATCH")
    ? "date_mismatch"
    : missingReasons.length > 0
      ? "partial"
      : "complete";
  const outstandingReductionRate =
    bond.issueAmount !== null
    && bond.outstandingAmount !== null
    && bond.issueAmount !== "0"
      ? multiplyDecimal(
        subtractDecimal(
          "1",
          divideDecimal(bond.outstandingAmount, bond.issueAmount, 8),
          8,
        ),
        "100",
        2,
      )
      : null;

  return {
    bondCode: bond.bondCode,
    issuerCode: bond.issuerCode,
    bondName: bond.bondName,
    issuerResearch: clonePublicIssuerResearch(
      issuerResearchByCode.get(bond.issuerCode),
    ),
    cbClose: latestCb?.close ?? null,
    cbPriceDate: latestCb?.tradingDate ?? null,
    cbTradeUnits: latestCb?.tradingUnits ?? "0",
    stockClose: latestStock?.close ?? null,
    stockPriceDate: latestStock?.tradingDate ?? null,
    currentConversionPrice: latestConversion?.currentConversionPrice ?? null,
    conversionPriceEffectiveDate: latestConversion?.effectiveDate ?? null,
    valuationDate,
    valuationCbClose: valuationCb?.close ?? null,
    valuationStockClose: valuationStock?.close ?? null,
    conversionValue,
    premiumRate,
    outstandingAmount: bond.outstandingAmount,
    outstandingDataDate: bond.outstandingDataDate,
    outstandingReductionRate,
    remainingUnits: remainingMetrics.remainingUnits,
    remainingRatio: remainingMetrics.remainingRatio,
    dailyTurnoverRate: remainingMetrics.dailyTurnoverRate,
    institutionDataDate: institution.dataDate,
    institutionNetUnits: institution.dailyNetUnits,
    institutionNet5dUnits: institution.net5dUnits,
    institutionNet20dUnits: institution.net20dUnits,
    redemptionEvent,
    maturityDate: bond.maturityDate,
    daysToMaturity: differenceCalendarDays(input.asOfDate, bond.maturityDate),
    nextPutDate,
    daysToNextPut: nextPutDate === null
      ? null
      : differenceCalendarDays(input.asOfDate, nextPutDate),
    nextEventType: nextEvent.type,
    nextEventDate: nextEvent.date,
    daysToNextEvent: differenceCalendarDays(input.asOfDate, nextEvent.date),
    dataQuality,
    staleCbPrice: latestCb !== undefined && latestCb.tradingDate !== input.asOfDate,
    missingReasons,
  };
}

function buildIssuerResearchMap(
  records: readonly CbIssuerResearchRecord[],
): ReadonlyMap<string, CbIssuerResearchRecord> {
  return new Map(records.map((record) => [record.issuerCode, record]));
}

function clonePublicIssuerResearch(
  record: CbIssuerResearchRecord | undefined,
): BondIssuerResearchView | null {
  if (record === undefined) return null;
  return {
    market: record.market,
    industryName: record.industryName,
    revenueMonth: record.revenueMonth,
    sourcePublishedOn: record.sourcePublishedOn,
    revenueUnit: record.revenueUnit,
    currentMonthRevenue: record.currentMonthRevenue,
    monthOverMonthPercent: record.monthOverMonthPercent,
    yearOverYearPercent: record.yearOverYearPercent,
    cumulativeRevenue: record.cumulativeRevenue,
    cumulativeYearOverYearPercent: record.cumulativeYearOverYearPercent,
  };
}

function parseBondInput(value: Record<string, unknown>): BondInput {
  const bondCode = requiredString(value.bondCode, "bondCode");
  if (!/^\d{5,6}$/.test(bondCode)) {
    throw new TypeError(`invalid bond code: ${bondCode}`);
  }
  const issuerCode = requiredString(value.issuerCode, "issuerCode");
  const bondName = typeof value.shortName === "string" && value.shortName.trim() !== ""
    ? value.shortName.trim()
    : requiredString(value.bondName, "bondName");
  const maturityDate = requiredDate(value.maturityDate, "maturityDate");
  const putDates = Array.isArray(value.putDates)
    ? value.putDates.map((date, index) => requiredDate(date, `putDates[${index}]`))
    : [];
  const outstandingAmount = optionalDecimalString(
    value.outstandingAmount,
    "outstandingAmount",
  );
  const outstandingDataDate = optionalDate(
    value.outstandingDataDate,
    "outstandingDataDate",
  );
  if (outstandingAmount !== null && outstandingDataDate === null) {
    throw new TypeError(
      "outstandingDataDate must be a valid ISO date when outstandingAmount is present",
    );
  }
  return {
    bondCode,
    issuerCode,
    bondName,
    maturityDate,
    issueAmount: optionalDecimalString(value.issueAmount, "issueAmount"),
    outstandingAmount,
    outstandingDataDate,
    putDates,
  };
}

function optionalDate(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requiredDate(value, name);
}

function optionalDecimalString(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const text = requiredString(value, name);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
    throw new TypeError(`${name} must be a non-negative decimal string`);
  }
  return text;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function requiredDate(value: unknown, name: string): string {
  const text = requiredString(value, name);
  if (!isIsoDate(text)) throw new TypeError(`${name} must be a valid ISO date`);
  return text;
}

function differenceCalendarDays(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round(
    (
      Date.UTC(toYear, toMonth - 1, toDay)
      - Date.UTC(fromYear, fromMonth - 1, fromDay)
    ) / 86_400_000,
  );
}

function descendingDate<T extends { tradingDate: string }>(
  left: T,
  right: T,
): number {
  return right.tradingDate.localeCompare(left.tradingDate);
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) {
    throw new TypeError(message);
  }
}
