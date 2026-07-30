import { divideDecimal, multiplyDecimal, subtractDecimal } from "./decimal.ts";
import type {
  BondMarketHistoryPoint,
  CbQuote,
  ConversionPriceVersion,
  StockClose,
} from "./types.ts";

export function buildHistoryPoints(input: {
  cbQuotes: readonly CbQuote[];
  stockCloses: readonly StockClose[];
  conversionPrices: readonly ConversionPriceVersion[];
}): readonly BondMarketHistoryPoint[] {
  const equivalentQuotes = input.cbQuotes.filter(
    (quote) => quote.tradingMode === "equivalent" && quote.close !== null,
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
      const effectiveVersion = versions.find(
        (version) => version.effectiveDate <= date,
      );
      const conversionValue =
        stock !== undefined && effectiveVersion !== undefined
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
      const premiumRate =
        quote?.close !== null
        && quote?.close !== undefined
        && conversionValue !== null
          ? multiplyDecimal(
            subtractDecimal(
              divideDecimal(quote.close, conversionValue, 8),
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
        cbClose: quote?.close ?? null,
        stockClose: stock?.close ?? null,
        effectiveConversionPrice:
          effectiveVersion?.currentConversionPrice ?? null,
        conversionValue,
        premiumRate,
      });
    }
  }

  return points;
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new TypeError(message);
}
