import type { CbRedemptionEvent } from "../source-verification/source-cb-redemption.ts";

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
  change: string | null;
  changeEvent?: "ex-dividend";
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

export type BondIssuerResearchView = {
  market: "listed" | "otc";
  industryName: string;
  revenueMonth: string;
  sourcePublishedOn: string;
  revenueUnit: "仟元";
  currentMonthRevenue: string;
  monthOverMonthPercent: string | null;
  yearOverYearPercent: string | null;
  cumulativeRevenue: string | null;
  cumulativeYearOverYearPercent: string | null;
};

export type BondMarketView = {
  bondCode: string;
  issuerCode: string;
  bondName: string;
  issuerResearch: BondIssuerResearchView | null;
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
  outstandingDataDate: string | null;
  outstandingReductionRate: string | null;
  remainingUnits: string | null;
  remainingRatio: string | null;
  dailyTurnoverRate: string | null;
  institutionDataDate: string | null;
  institutionNetUnits: string | null;
  institutionNet5dUnits: string | null;
  institutionNet20dUnits: string | null;
  redemptionEvent: CbRedemptionEvent | null;
  maturityDate: string;
  daysToMaturity: number;
  nextPutDate: string | null;
  daysToNextPut: number | null;
  nextEventType: "redemption" | "put" | "maturity";
  nextEventDate: string;
  daysToNextEvent: number;
  dataQuality: "complete" | "partial" | "date_mismatch";
  staleCbPrice: boolean;
  missingReasons: readonly string[];
};

export type BondMarketHistoryPoint = {
  bondCode: string;
  date: string;
  cbClose: string | null;
  stockClose: string | null;
  effectiveConversionPrice: string | null;
  conversionValue: string | null;
  premiumRate: string | null;
};
