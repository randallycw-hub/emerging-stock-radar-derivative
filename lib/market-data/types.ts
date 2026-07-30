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

