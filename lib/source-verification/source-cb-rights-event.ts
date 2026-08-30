import { createHash } from "node:crypto";

import type { CbRedemptionEvent } from "./source-cb-redemption.ts";

export type CbRightsEvent = Readonly<{
  eventId: string;
  eventType: "early_redemption";
  issuerCode: string;
  issuerName: string;
  bondCode: string;
  bondName: string;
  announcementDate: string;
  acceptStartDate: string | null;
  acceptEndDate: string | null;
  brokerAcceptStartDate: string | null;
  brokerAcceptEndDate: string | null;
  lastConversionDate: string | null;
  recordDate: string | null;
  lastTradingDate: string | null;
  redemptionPrice: string | null;
  redemptionPricePercent: string | null;
  reason: string | null;
  sourceUrl: string;
  rawSourceId: string;
  rawTextHash: string;
  fetchedAt: string;
}>;

type MopsRedemptionLocator = Readonly<{
  issuerCode: string;
  announcementDate: string;
  sequence: string;
  sourceUrl: string;
}>;

const REQUIRED_QUERY_KEYS = Object.freeze([
  "TYPEK",
  "co_id",
  "date1",
  "seq_no",
  "pub_class",
  "firstin",
]);

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseRocYear(rocYear: string, month: string, day: string): string | null {
  const year = Number(rocYear) + 1911;
  const parsedMonth = Number(month);
  const parsedDay = Number(day);
  if (!Number.isInteger(year) || parsedMonth < 1 || parsedMonth > 12 || parsedDay < 1 || parsedDay > 31) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(parsedMonth).padStart(2, "0")}-${String(parsedDay).padStart(2, "0")}`;
}

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function extractDates(value: string): string[] {
  const dates: string[] = [];
  const matcher = /(\d{2,3})\s*[年\/.]\s*(\d{1,2})\s*[月\/.]\s*(\d{1,2})\s*(?:日)?/gu;
  for (const match of value.matchAll(matcher)) {
    const date = parseRocYear(match[1], match[2], match[3]);
    if (date && !dates.includes(date)) dates.push(date);
  }
  return dates;
}

function textAfterLabel(text: string, label: RegExp, maxLength = 280): string | null {
  const match = label.exec(text);
  if (!match) return null;
  return text.slice(match.index + match[0].length, match.index + match[0].length + maxLength);
}

function datesAfterLabel(text: string, label: RegExp): string[] {
  const segment = textAfterLabel(text, label);
  return segment ? extractDates(segment) : [];
}

function findDateAfter(text: string, labels: readonly RegExp[]): string | null {
  for (const label of labels) {
    const dates = datesAfterLabel(text, label);
    if (dates.length > 0) return dates[0];
  }
  return null;
}

function findDateRangeAfter(text: string, labels: readonly RegExp[]): readonly [string | null, string | null] {
  for (const label of labels) {
    const dates = datesAfterLabel(text, label);
    if (dates.length > 0) return [dates[0], dates[1] ?? null];
  }
  return [null, null];
}

function findPrice(text: string): string | null {
  const segment = textAfterLabel(text, /(?:每張債券收回價格|收回價格|贖回價格)\s*[：:]/u, 160) ?? text;
  const match = segment.match(/(?:新[台臺]幣|NT\$)\s*([\d,]+(?:\.\d+)?)/iu);
  if (!match) return null;
  return match[1].replace(/,/gu, "");
}

function findPercent(text: string): string | null {
  const match = text.match(/(?:贖回權價格|收回價格)[^。；;]{0,90}?([\d,.]+)\s*%/u);
  if (!match) return null;
  const value = match[1].replace(/,/gu, "");
  return value.includes(".")
    ? value.replace(/0+$/u, "").replace(/\.$/u, "")
    : value;
}

function findReason(text: string): string | null {
  const match = text.match(/(?:依據|依[　 ]*據)\s*[：:]?\s*([^。；;]{8,240})/u);
  return match ? match[1].trim() : null;
}

function detailIdentityMatches(text: string, discovery: CbRedemptionEvent): boolean {
  return text.includes(discovery.issuerCode) && text.includes(discovery.bondCode);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

export function validateApprovedCbRedemptionDetailUrl(value: string): MopsRedemptionLocator {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Unapproved MOPS redemption detail URL.");
  }

  invariant(
    url.protocol === "https:" &&
      url.hostname === "mopsov.twse.com.tw" &&
      url.pathname === "/mops/web/ajax_t120sb23" &&
      !url.username &&
      !url.password &&
      !url.hash,
    "Unapproved MOPS redemption detail URL.",
  );
  const keys = [...url.searchParams.keys()].sort();
  invariant(
    keys.length === REQUIRED_QUERY_KEYS.length &&
      keys.every((key, index) => key === [...REQUIRED_QUERY_KEYS].sort()[index]),
    "MOPS redemption detail URL query parameters do not match the approved contract.",
  );
  invariant(
    url.searchParams.get("TYPEK") === "otc" &&
      /^\d{4}$/u.test(url.searchParams.get("co_id") ?? "") &&
      /^\d{8}$/u.test(url.searchParams.get("date1") ?? "") &&
      /^\d+$/u.test(url.searchParams.get("seq_no") ?? "") &&
      url.searchParams.get("pub_class") === "0" &&
      url.searchParams.get("firstin") === "1",
    "MOPS redemption detail URL query parameters do not match the approved contract.",
  );
  const date = url.searchParams.get("date1") ?? "";
  return Object.freeze({
    issuerCode: url.searchParams.get("co_id") ?? "",
    announcementDate: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
    sequence: url.searchParams.get("seq_no") ?? "",
    sourceUrl: url.toString(),
  });
}

export function parseCbRedemptionDetail(
  html: string,
  discovery: CbRedemptionEvent,
  fetchedAt: string,
): CbRightsEvent {
  invariant(typeof html === "string" && html.length > 0, "MOPS redemption detail is empty.");
  invariant(typeof fetchedAt === "string" && !Number.isNaN(Date.parse(fetchedAt)), "Fetched time is invalid.");
  const locator = validateApprovedCbRedemptionDetailUrl(discovery.detailUrl);
  invariant(locator.issuerCode === discovery.issuerCode, "MOPS redemption detail issuer does not match discovery.");
  invariant(locator.announcementDate === discovery.announcementDate, "MOPS redemption detail date does not match discovery.");
  const text = stripHtml(html);
  invariant(detailIdentityMatches(text, discovery), "MOPS redemption detail identity does not match discovery.");

  const [acceptStartDate, acceptEndDate] = findDateRangeAfter(text, [
    /發行公司於/u,
    /通知及受理轉換公司債(?:贖回|收回)期間\s*[：:]/u,
  ]);
  const [brokerAcceptStartDate, brokerAcceptEndDate] = findDateRangeAfter(text, [
    /證券商受理期間\s*[：:]/u,
  ]);
  const lastConversionDate = findDateAfter(text, [
    /請求轉換之最後期限/u,
  ]);
  const recordDate = findDateAfter(text, [
    /轉換公司債收回基準日\s*[：:]/u,
    /債券收回基準日\s*[：:]/u,
  ]);
  const lastTradingDate = findDateAfter(text, [
    /轉換公司債終止櫃檯買賣日期\s*[：:]/u,
    /終止櫃檯買賣日期\s*[：:]/u,
  ]) ?? discovery.delistingDate;
  const rawSourceId = `mops-redemption:${discovery.bondCode}:${discovery.announcementDate}:${locator.sequence}`;

  return Object.freeze({
    eventId: rawSourceId,
    eventType: "early_redemption",
    issuerCode: discovery.issuerCode,
    issuerName: discovery.issuerName,
    bondCode: discovery.bondCode,
    bondName: discovery.bondName,
    announcementDate: discovery.announcementDate,
    acceptStartDate,
    acceptEndDate,
    brokerAcceptStartDate,
    brokerAcceptEndDate,
    lastConversionDate,
    recordDate,
    lastTradingDate,
    redemptionPrice: findPrice(text),
    redemptionPricePercent: findPercent(text),
    reason: findReason(text),
    sourceUrl: locator.sourceUrl,
    rawSourceId,
    rawTextHash: `sha256:${createHash("sha256").update(html, "utf8").digest("hex")}`,
    fetchedAt,
  });
}
