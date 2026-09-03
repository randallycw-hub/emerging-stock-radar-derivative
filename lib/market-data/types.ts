import type { CbRedemptionEvent } from "../source-verification/source-cb-redemption.ts";

export type CbTradingMode = "equivalent" | "negotiated";

export type BondMarketStatus =
  | "ACTIVE"
  | "NO_TRADE"
  | "CONVERSION_SUSPENDED"
  | "TRADING_SUSPENDED"
  | "REDEMPTION_PROCESS"
  | "MATURED"
  | "DELISTED"
  | "DATA_CONFLICT"
  | "STALE";

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
  changeEvent?: "ex-dividend" | "ex-rights-and-dividend";
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
  marketStatus: BondMarketStatus;
  dataQuality: "complete" | "partial" | "date_mismatch";
  staleCbPrice: boolean;
  missingReasons: readonly string[];
};

export type BondMarketHistoryPoint = {
  bondCode: string;
  date: string;
  cbOpen: string | null;
  cbHigh: string | null;
  cbLow: string | null;
  cbClose: string | null;
  cbAverage: string | null;
  cbChange: string | null;
  cbTradingUnits: string | null;
  cbTurnover: string | null;
  stockClose: string | null;
  effectiveConversionPrice: string | null;
  conversionValue: string | null;
  premiumRate: string | null;
};

export type DimensionState = "favorable" | "watch" | "risk" | "pending";
export type ConditionState = "met" | "partial" | "pending" | "not_met";

export type AssessmentCheck = {
  code: string;
  label: string;
  state: ConditionState;
  actual: string | null;
  threshold: string;
  dataDate: string | null;
  sourceId: string | null;
  missingReason: string | null;
};

export type BondPublicFinancials = {
  ttmProfitState: "profitable" | "loss" | "unknown";
  revenueTrendState: "up" | "down" | "unknown";
  psPercentile: string | null;
  dataDate: string | null;
  sourceId: string | null;
};

export type BondAssessment = {
  dimensions: readonly {
    code: "price" | "days" | "premium" | "remaining" | "spread" | "liquidity";
    state: DimensionState;
    checks: readonly AssessmentCheck[];
  }[];
  strategies: readonly {
    code:
      | "stock_bond_relative"
      | "maturity_put"
      | "equity_relative"
      | "stock_equivalent"
      | "arbitrage"
      | "dynamic_hedge";
    state: ConditionState;
    checks: readonly AssessmentCheck[];
  }[];
};

export type BondLifecycleStatus = "active" | "archived";
export type BondArchiveReason =
  | "matured"
  | "redeemed"
  | "balance_exhausted"
  | "removed_from_official_roster";
export type BondFieldState =
  | "complete"
  | "stale"
  | "date_mismatch"
  | "missing"
  | "accumulating";

export type BondTermSummary = {
  bondCode: string;
  issuerCode: string;
  bondName: string;
  issuerName: string;
  issueDate: string | null;
  listingDate: string | null;
  maturityDate: string;
  issueAmount: string | null;
  outstandingAmount: string | null;
  outstandingDataDate: string | null;
  initialConversionPrice: string | null;
  conversionStartDate: string | null;
  conversionEndDate: string | null;
  putDates: readonly string[];
  putPrice: string | null;
  securedStatus: string | null;
  underwriter: string | null;
  trustee: string | null;
  outstandingChangeDate: string | null;
  outstandingChangeReason: string | null;
  unitFaceValueTwd: string | null;
};

export type BondWorkbenchEvent = {
  bondCode: string;
  eventId: string;
  type:
    | "conversion_adjustment"
    | "conversion_suspension"
    | "ex_dividend"
    | "put"
    | "redemption"
    | "maturity"
    | "listing"
    | "delisting";
  date: string;
  title: string;
  sourceId: string;
  sourceUrl: string | null;
};

export type BondWorkbenchFieldStates = {
  price: BondFieldState;
  valuation: BondFieldState;
  outstanding: BondFieldState;
  institutions: BondFieldState;
  company: BondFieldState;
  events: BondFieldState;
  history: BondFieldState;
};

export type BondWorkbenchRecord = {
  bondCode: string;
  status: BondLifecycleStatus;
  archiveReason: BondArchiveReason | null;
  archivedAt: string | null;
  term: BondTermSummary;
  view: BondMarketView;
  events: readonly BondWorkbenchEvent[];
  fieldStates: BondWorkbenchFieldStates;
  assessment: BondAssessment;
};

export type BondWorkbenchSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  dataDate: string;
  records: readonly BondWorkbenchRecord[];
};
