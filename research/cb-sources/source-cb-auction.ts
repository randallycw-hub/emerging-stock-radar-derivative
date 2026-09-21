import { isIsoDate } from "../../lib/domain/dates.ts";

// Independent of the IPO parser: the existing IPO source approval is not CB approval.
const FIELDS = ["序號", "開標日期", "證券名稱", "證券代號", "發行市場", "發行性質", "競拍方式", "投標開始日", "投標結束日", "競拍數量(張)", "最低投標價格(元)", "最低每標單投標數量(張)", "最高投(得)標數量(張)", "保證金成數(%)", "每一投標單投標處理費(元)", "撥券日期(上市、上櫃日期)", "主辦券商", "得標總金額(元)", "得標手續費率(%)", "總合格件", "合格投標數量(張)", "最低得標價格(元)", "最高得標價格(元)", "得標加權平均價格(元)", "實際承銷價格(元)", "取消競價拍賣(流標或取消)"];

export function parseCbAuctionReviewSource(payload: unknown, { sourceDate }: { sourceDate: string }) {
  if (!isIsoDate(sourceDate)) throw new TypeError("invalid CB auction source date");
  if (!payload || typeof payload !== "object") throw new TypeError("invalid CB auction payload");
  const table = payload as { stat?: unknown; fields?: unknown; data?: unknown };
  const fields = table.fields;
  if (table.stat !== "OK" || !Array.isArray(fields) || fields.length !== FIELDS.length || !FIELDS.every((field, i) => fields[i] === field)) throw new TypeError("invalid CB auction fields/status");
  if (!Array.isArray(table.data) || table.data.length > 10_000) throw new TypeError("invalid CB auction data");
  const seen = new Set<string>();
  const records = table.data.flatMap((row: unknown) => {
    if (!Array.isArray(row) || row.length !== FIELDS.length) throw new TypeError("invalid CB auction row width");
    const kind = text(row[5]);
    if (!["有擔保轉換公司債", "無擔保轉換公司債"].includes(kind)) return [];
    if (text(row[4]) !== "櫃檯買賣") throw new TypeError("invalid CB auction market");
    const bondCode = text(row[3]);
    if (!/^\d{5,6}$/.test(bondCode)) throw new TypeError("invalid CB auction bond code");
    const bondName = text(row[2]);
    if (!bondName || !text(row[16])) throw new TypeError("missing CB auction name/underwriter");
    const bidStartDate = date(row[7]);
    const bidEndDate = date(row[8]);
    const auctionOpenDate = date(row[1]);
    const listingDate = text(row[15]) ? date(row[15]) : null;
    if (bidStartDate > bidEndDate || bidEndDate > auctionOpenDate || (listingDate && listingDate < auctionOpenDate)) throw new TypeError("invalid CB auction date order");
    const recordRef = `twse:cb-auction:${bondCode}:${auctionOpenDate}`;
    if (seen.has(recordRef)) throw new TypeError("duplicate CB auction event");
    seen.add(recordRef);
    const cancelled = text(row[25]) !== "";
    const minimumBidPrice = positivePrice(row[10]);
    if (minimumBidPrice === null) throw new TypeError("missing minimum CB auction bid price");
    const rawResults = [21, 22, 23, 24].map((index) => positivePrice(row[index]));
    if (!cancelled && auctionOpenDate > sourceDate && rawResults.some((value) => value !== null)) throw new TypeError("future CB auction has completed results");
    const [minimumWinningPrice, maximumWinningPrice, weightedWinningPrice, finalUnderwritingPrice] = cancelled ? [null, null, null, null] : rawResults;
    if (minimumWinningPrice !== null && maximumWinningPrice !== null && minimumWinningPrice > maximumWinningPrice) throw new TypeError("invalid CB auction winning price order");
    if (weightedWinningPrice !== null && ((minimumWinningPrice !== null && weightedWinningPrice < minimumWinningPrice) || (maximumWinningPrice !== null && weightedWinningPrice > maximumWinningPrice))) throw new TypeError("invalid CB auction weighted price range");
    const resultStatus = cancelled ? "cancelled" : auctionOpenDate > sourceDate ? "scheduled" : rawResults.every((value) => value !== null) ? "completed" : rawResults.some((value) => value !== null) ? "partial" : "awaiting_results";
    return [{ recordRef, sourceDate, bondCode, issuerCode: bondCode.slice(0, 4), bondName, securedStatus: kind === "有擔保轉換公司債" ? "有擔保" : "無擔保", underwriter: text(row[16]), bidStartDate, bidEndDate, auctionOpenDate, listingDate, minimumBidPrice, minimumWinningPrice, maximumWinningPrice, weightedWinningPrice, finalUnderwritingPrice, resultStatus, cancelled }];
  });
  return { sourceDate, purpose: "internal_candidate_review", publishable: false, records };
}

function text(value: unknown): string { return value === null || value === undefined ? "" : String(value).trim(); }
function date(value: unknown): string {
  const parsed = text(value).replaceAll("/", "-");
  if (!isIsoDate(parsed)) throw new TypeError("invalid CB auction date");
  return parsed;
}
function positivePrice(value: unknown): number | null {
  const raw = text(value);
  if (raw === "" || raw === "--" || raw === "—") return null;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw)) throw new TypeError("invalid CB auction numeric price");
  const number = Number(raw.replaceAll(",", ""));
  if (!Number.isFinite(number) || number > Number.MAX_SAFE_INTEGER) throw new TypeError("invalid CB auction numeric price");
  return number > 0 ? number : null;
}
