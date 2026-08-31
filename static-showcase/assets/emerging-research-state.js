const VIEWS = new Set(["summary", "price", "volume", "revenue", "all"]);
const SORT_KEYS = new Set([
  "companyCode", "industryName", "todayPrice", "period1W", "period1M", "period3M", "period6M", "periodYTD", "transactionAmount",
  "average5Volume", "average20Volume", "volumeRatio", "average20Amount", "amountChange", "transactionVolume",
  "dailyAveragePrice", "previousAveragePrice", "averageChangePercent", "dailyHighPrice", "dailyLowPrice", "estimatedTransactionAmount", "applyingStatus", "tradingDate",
]);

const PRESET_SORTS = Object.freeze({
  price: { sortKey: "todayPrice", sortDirection: "desc" },
  volume: { sortKey: "volumeRatio", sortDirection: "desc" },
  summary: { sortKey: "companyCode", sortDirection: "asc" },
  revenue: { sortKey: "companyCode", sortDirection: "asc" },
  all: { sortKey: "companyCode", sortDirection: "asc" },
});

export function parseV57EmergingState(search) {
  const params = new URLSearchParams(search);
  const view = VIEWS.has(params.get("view")) ? params.get("view") : "summary";
  const fallback = PRESET_SORTS[view];
  const sort = params.get("sort");
  return {
    view,
    sortKey: SORT_KEYS.has(sort) ? sort : fallback.sortKey,
    sortDirection: params.get("directionSort") === "asc" || params.get("directionSort") === "desc"
      ? params.get("directionSort")
      : fallback.sortDirection,
  };
}

export const V57_EMERGING_SORT_KEYS = SORT_KEYS;
