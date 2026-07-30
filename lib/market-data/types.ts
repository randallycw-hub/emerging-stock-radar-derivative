export type CbTradingMode = "equivalent" | "negotiated";

export type CbQuote = {
  bondCode: string;
  tradingDate: string;
  tradingMode: CbTradingMode;
  close: string | null;
  change: string | null;
  open: string | null;
  high: string | null;
  low: string | null;
  tradeCount: string;
  tradingUnits: string;
  turnover: string;
  average: string | null;
};

export type StockClose = {
  companyCode: string;
  market: "listed" | "otc";
  tradingDate: string;
  close: string;
  change: string;
  volume: string;
  turnover: string;
};

export type ConversionPriceVersion = {
  bondCode: string;
  issuerCode: string;
  initialConversionPrice: string;
  currentConversionPrice: string;
  effectiveDate: string;
  officialDetailUrl: string;
};

export type BondMarketView = {
  bondCode: string;
  issuerCode: string;
  bondName: string;
  cbClose: string | null;
  cbPriceDate: string | null;
  cbTradeUnits: string;
  stockClose: string | null;
  stockPriceDate: string | null;
  currentConversionPrice: string | null;
  conversionPriceEffectiveDate: string | null;
  valuationDate: string | null;
  valuationCbClose: string | null;
  valuationStockClose: string | null;
  conversionValue: string | null;
  premiumRate: string | null;
  outstandingAmount: string | null;
  outstandingReductionRate: string | null;
  maturityDate: string;
  daysToMaturity: number;
  nextPutDate: string | null;
  daysToNextPut: number | null;
  staleCbPrice: boolean;
  missingReasons: readonly string[];
};
