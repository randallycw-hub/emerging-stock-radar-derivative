export function emergingDailyAverageLabel({ dailyAveragePrice, transactionVolume }) {
  if (dailyAveragePrice !== null && dailyAveragePrice !== undefined && dailyAveragePrice !== "") {
    return null;
  }
  return String(transactionVolume ?? "").replaceAll(",", "") === "0"
    ? "今日無成交"
    : "—";
}
