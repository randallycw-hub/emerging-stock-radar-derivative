import { normalize11586Application, parse11586Csv } from "../source-verification/source-11586.ts";
import {
  parseTpexApplicantSource,
  parseTpexIpoListingSource,
  parseTwseAuctionSource,
  parseTwsePublicOfferingSource,
} from "../source-verification/source-ipo-events.ts";
import type { IpoSnapshotRepository } from "./repository.ts";
import { buildIpoEventSnapshot, type IpoEventSnapshot, type IpoSourceManifestEntry } from "./snapshot.ts";

const MAX_SOURCE_BYTES = 8_000_000;
const SOURCE_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const FRESH_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600";
const STALE_CACHE_CONTROL = "public, max-age=60";

type FetchImplementation = (input: string, init?: RequestInit) => Promise<Response>;

interface RefreshOptions {
  fetchImpl: FetchImplementation;
  now: Date;
}

interface IpoEventsResponseOptions extends RefreshOptions {
  repository: IpoSnapshotRepository;
  headers?: HeadersInit;
}

type SourceId = IpoSourceManifestEntry["sourceId"];

const sourceUrls = (year: number) => ({
  twseApplications: "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
  tpexApplications: "https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies",
  tpexIpoListings: "https://www.tpex.org.tw/openapi/v1/tpex_ipo_no_limit",
  twseAuctions: `https://www.twse.com.tw/announcement/auction?response=json&yy=${year}`,
  twsePublicOfferings: `https://www.twse.com.tw/announcement/publicForm?response=json&yy=${year}`,
});

export function shouldRefreshIpoSnapshot({ now, current }: { now: Date; current: IpoEventSnapshot | null }): boolean {
  if (!current) return true;
  const taipei = taipeiDateTime(now);
  return taipei.date !== current.dataDate && taipei.hour >= 22 && (taipei.hour > 22 || taipei.minute >= 30);
}

export async function refreshOfficialIpoSnapshot({ fetchImpl, now }: RefreshOptions): Promise<IpoEventSnapshot> {
  const taipei = taipeiDateTime(now);
  const urls = sourceUrls(taipei.year);
  const downloadedAt = `${taipei.date}T${pad(taipei.hour)}:${pad(taipei.minute)}:${pad(taipei.second)}+08:00`;

  const twseApplications = await loadRequiredSource("twse-applications", urls.twseApplications, fetchImpl, downloadedAt, (bytes) => {
    const rows = parse11586Csv(decodeUtf8(bytes));
    return rows.map((row) => {
      const normalized = normalize11586Application(row);
      return {
        companyCode: normalized.companyCode,
        companyName: normalized.companyName,
        market: "上市" as const,
        applicationDate: normalized.applicationDate,
        reviewDate: normalized.listingReviewDate ?? null,
        boardDate: normalized.boardApprovalDate ?? null,
        contractDate: normalized.listingContractApprovalOrFilingDate ?? null,
        listingDate: normalized.listingDate ?? null,
        underwriter: normalized.underwriters.join("、"),
        note: normalized.note,
        sourceRecordId: normalized.sourceRecordId,
      };
    });
  });
  const tpexApplications = await loadRequiredSource("tpex-applications", urls.tpexApplications, fetchImpl, downloadedAt, (bytes) => parseTpexApplicantSource(parseJson(bytes)));
  const tpexListings = await loadRequiredSource("tpex-ipo-listings", urls.tpexIpoListings, fetchImpl, downloadedAt, (bytes) => parseTpexIpoListingSource(parseJson(bytes)));
  const auctions = await loadRequiredSource("twse-auctions", urls.twseAuctions, fetchImpl, downloadedAt, (bytes) => parseTwseAuctionSource(parseJson(bytes)));
  const publicOfferings = await loadRequiredSource("twse-public-offerings", urls.twsePublicOfferings, fetchImpl, downloadedAt, (bytes) => parseTwsePublicOfferingSource(parseJson(bytes)));

  return buildIpoEventSnapshot({
    twseApplications: twseApplications.rows,
    tpexApplications: tpexApplications.rows,
    tpexListings: tpexListings.rows,
    auctions: auctions.rows,
    publicOfferings: publicOfferings.rows,
    generatedAt: downloadedAt,
    dataDate: taipei.date,
    sourceManifest: [
      twseApplications.manifest,
      tpexApplications.manifest,
      tpexListings.manifest,
      auctions.manifest,
      publicOfferings.manifest,
    ],
  });
}

export async function getIpoEventsResponse({ repository, fetchImpl, now, headers }: IpoEventsResponseOptions): Promise<Response> {
  let current: IpoEventSnapshot | null;
  try {
    current = await repository.readCurrent();
  } catch {
    return jsonResponse({ status: "source_unavailable" }, 503, "no-store", headers);
  }

  if (!shouldRefreshIpoSnapshot({ now, current })) {
    return jsonResponse(current, 200, FRESH_CACHE_CONTROL, headers);
  }

  try {
    const next = await refreshOfficialIpoSnapshot({ fetchImpl, now });
    await repository.publish(next);
    return jsonResponse(next, 200, FRESH_CACHE_CONTROL, headers);
  } catch {
    if (current) return jsonResponse({ ...current, stale: true }, 200, STALE_CACHE_CONTROL, headers);
    return jsonResponse({ status: "source_unavailable" }, 503, "no-store", headers);
  }
}

async function loadRequiredSource<T>(
  sourceId: SourceId,
  sourceUrl: string,
  fetchImpl: FetchImplementation,
  downloadedAt: string,
  parse: (bytes: Uint8Array) => T[],
): Promise<{ rows: T[]; manifest: IpoSourceManifestEntry }> {
  try {
    const bytes = await fetchSourceBytes(sourceUrl, fetchImpl);
    const rows = parse(bytes);
    if (rows.length === 0) throw new TypeError("required source has no rows");
    return {
      rows,
      manifest: {
        sourceId,
        sourceUrl,
        downloadedAt,
        sha256: `sha256:${await sha256(bytes)}`,
        rawBytes: bytes.byteLength,
        rowCount: rows.length,
      },
    };
  } catch {
    throw new Error(`IPO_REQUIRED_SOURCE_FAILED:${sourceId}`);
  }
}

async function fetchSourceBytes(url: string, fetchImpl: FetchImplementation): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) throw new TypeError(`HTTP_${response.status}`);
      return await readResponseBytes(response);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await delay(100 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function readResponseBytes(response: Response): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_SOURCE_BYTES)) {
    throw new TypeError("source exceeds maximum size");
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_SOURCE_BYTES) throw new TypeError("invalid source size");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SOURCE_BYTES) throw new TypeError("source exceeds maximum size");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size === 0) throw new TypeError("source is empty");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(decodeUtf8(bytes));
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function taipeiDateTime(now: Date): { year: number; date: string; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  return { year, date: `${year}-${pad(month)}-${pad(day)}`, hour: value("hour"), minute: value("minute"), second: value("second") };
}

function jsonResponse(payload: unknown, status: number, cacheControl: string, headers?: HeadersInit): Response {
  const resultHeaders = new Headers(headers);
  resultHeaders.set("Cache-Control", cacheControl);
  return Response.json(payload, { status, headers: resultHeaders });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
