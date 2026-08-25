import { isIsoDate } from "../domain/dates.ts";
import type { BondMarketStatus } from "./types.ts";

export type { BondMarketStatus } from "./types.ts";

type BondStatusInput = Readonly<{
  maturityDate: string;
  delistingDate: string | null;
  redemptionDate: string | null;
  conversionSuspended: boolean | null;
  tradingSuspended: boolean | null;
  tradingUnits: string | null;
  quoteDate: string | null;
  dataConflict: boolean;
}>;

const labels: Readonly<Record<BondMarketStatus, string>> = Object.freeze({
  ACTIVE: "交易中",
  NO_TRADE: "今日無成交",
  CONVERSION_SUSPENDED: "停止轉換",
  TRADING_SUSPENDED: "暫停交易",
  REDEMPTION_PROCESS: "贖回程序中",
  MATURED: "已到期",
  DELISTED: "已下櫃",
  DATA_CONFLICT: "資料待核",
  STALE: "盤後資料未更新",
});

export function resolveBondStatus(input: BondStatusInput, evaluationDate: string): BondMarketStatus {
  if (!isIsoDate(evaluationDate) || !isIsoDate(input.maturityDate)) {
    throw new TypeError("evaluationDate and maturityDate must be ISO dates");
  }
  if (dateReached(input.delistingDate, evaluationDate)) return "DELISTED";
  if (input.maturityDate <= evaluationDate) return "MATURED";
  if (dateReached(input.redemptionDate, evaluationDate)) return "REDEMPTION_PROCESS";
  if (input.conversionSuspended === true) return "CONVERSION_SUSPENDED";
  if (input.tradingSuspended === true) return "TRADING_SUSPENDED";
  if (input.dataConflict) return "DATA_CONFLICT";
  if (input.quoteDate !== evaluationDate) return "STALE";
  if (isZeroDecimal(input.tradingUnits)) return "NO_TRADE";
  return "ACTIVE";
}

export function publicBondStatusLabel(status: BondMarketStatus): string {
  return labels[status];
}

function dateReached(value: string | null, evaluationDate: string): boolean {
  return value !== null && isIsoDate(value) && value <= evaluationDate;
}

function isZeroDecimal(value: string | null): boolean {
  return value !== null && /^(?:0|0\.0+)$/.test(value.replaceAll(",", "").trim());
}
