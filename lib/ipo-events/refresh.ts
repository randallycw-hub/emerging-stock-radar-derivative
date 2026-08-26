import { normalize11586Application, parse11586Csv } from "../source-verification/source-11586.ts";
import {
  assertExactResourceUrl,
  getApprovedIpoResource,
  type ApprovedIpoResource,
} from "../pipeline/source-registry.ts";
import {
  parseTpexApplicantSource,
  parseTpexIpoListingSource,
  parseTwseAuctionSource,
  parseTwsePublicOfferingSource,
} from "../source-verification/source-ipo-events.ts";
import type { IpoSnapshotRepository } from "./repository.ts";
import { buildIpoEventSnapshot, type IpoEventSnapshot, type IpoSourceManifestEntry } from "./snapshot.ts";
import { evaluateIpoStageProgress } from "../pipeline/quality-gates.ts";

const MAX_ATTEMPTS = 3;
const FRESH_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600";
const STALE_CACHE_CONTROL = "public, max-age=60";

type FetchImplementation = (input: string, init?: RequestInit) => Promise<Response>;

interface RefreshOptions {
  fetchImpl: FetchImplementation;
  now: Date;
  excludeCompleted?: boolean;
}

interface IpoEventsResponseOptions extends RefreshOptions {
  repository: IpoSnapshotRepository;
  headers?: HeadersInit;
  refreshRequested?: boolean;
}

type SourceId = IpoSourceManifestEntry["sourceId"];
let inFlightRefresh: Promise<IpoEventSnapshot> | null = null;

class IpoRefreshLeaseUnavailableError extends Error {}

export function shouldRefreshIpoSnapshot({ now, current }: { now: Date; current: IpoEventSnapshot | null }): boolean {
  if (!current) return true;
  const taipei = taipeiDateTime(now);
  return current.dataDate < taipei.date && taipei.hour >= 22 && (taipei.hour > 22 || taipei.minute >= 30);
}

export async function refreshOfficialIpoSnapshot({ fetchImpl, now, excludeCompleted = false }: RefreshOptions): Promise<IpoEventSnapshot> {
  const taipei = taipeiDateTime(now);
  const resources = {
    twseApplications: getApprovedIpoResource("twse-applications", taipei.year),
    tpexApplications: getApprovedIpoResource("tpex-applications", taipei.year),
    tpexIpoListings: getApprovedIpoResource("tpex-ipo-listings", taipei.year),
    twseAuctions: getApprovedIpoResource("twse-auctions", taipei.year),
    twsePublicOfferings: getApprovedIpoResource("twse-public-offerings", taipei.year),
  };
  const downloadedAt = `${taipei.date}T${pad(taipei.hour)}:${pad(taipei.minute)}:${pad(taipei.second)}+08:00`;

  const twseApplications = await loadRequiredSource("twse-applications", resources.twseApplications, fetchImpl, downloadedAt, (bytes) => {
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
        sourceRecordId: `TWSE:${normalized.companyCode}:${normalized.applicationDate}`,
      };
    });
  });
  const tpexApplications = await loadRequiredSource("tpex-applications", resources.tpexApplications, fetchImpl, downloadedAt, (bytes) => parseTpexApplicantSource(parseJson(bytes)));
  const tpexListings = await loadRequiredSource("tpex-ipo-listings", resources.tpexIpoListings, fetchImpl, downloadedAt, (bytes) => parseTpexIpoListingSource(parseJson(bytes)));
  const auctions = await loadRequiredSource("twse-auctions", resources.twseAuctions, fetchImpl, downloadedAt, (bytes) => parseTwseAuctionSource(parseJson(bytes)));
  const publicOfferings = await loadRequiredSource("twse-public-offerings", resources.twsePublicOfferings, fetchImpl, downloadedAt, (bytes) => parseTwsePublicOfferingSource(parseJson(bytes)));
  return buildIpoEventSnapshot({
    twseApplications: filterCompletedRows(twseApplications.rows, taipei.date, excludeCompleted),
    tpexApplications: filterCompletedRows(tpexApplications.rows, taipei.date, excludeCompleted),
    tpexListings: filterCompletedRows(tpexListings.rows, taipei.date, excludeCompleted),
    auctions: filterCompletedRows(auctions.rows, taipei.date, excludeCompleted),
    publicOfferings: filterCompletedRows(publicOfferings.rows, taipei.date, excludeCompleted),
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

function filterCompletedRows<T extends { listingDate: string | null }>(
  rows: T[],
  dataDate: string,
  excludeCompleted: boolean,
): T[] {
  return excludeCompleted
    ? rows.filter((row) => row.listingDate === null || row.listingDate > dataDate)
    : rows;
}

export async function getIpoEventsResponse({
  repository,
  fetchImpl,
  now,
  headers,
  refreshRequested = false,
}: IpoEventsResponseOptions): Promise<Response> {
  let current: IpoEventSnapshot | null;
  try {
    current = await repository.readCurrent();
  } catch {
    if (!refreshRequested) return retryableUnavailableResponse(headers);
    current = null;
  }

  if (!refreshRequested) return current
    ? jsonResponse(current, 200, FRESH_CACHE_CONTROL, headers)
    : retryableUnavailableResponse(headers);

  if (!shouldRefreshIpoSnapshot({ now, current })) return jsonResponse(current, 200, FRESH_CACHE_CONTROL, headers);

  try {
    const next = await refreshWithSingleFlight({ repository, fetchImpl, now }, current);
    return jsonResponse(next, 200, FRESH_CACHE_CONTROL, headers);
  } catch {
    if (current) return jsonResponse({ ...current, stale: true }, 200, STALE_CACHE_CONTROL, headers);
    return retryableUnavailableResponse(headers);
  }
}

async function refreshWithSingleFlight(
  options: IpoEventsResponseOptions,
  previous: IpoEventSnapshot | null,
): Promise<IpoEventSnapshot> {
  const pending = inFlightRefresh ?? (inFlightRefresh = refreshWithLease(options, previous));
  try {
    return await pending;
  } finally {
    if (inFlightRefresh === pending) inFlightRefresh = null;
  }
}

async function refreshWithLease(
  { repository, fetchImpl, now }: IpoEventsResponseOptions,
  previous: IpoEventSnapshot | null,
): Promise<IpoEventSnapshot> {
  const ownerToken = crypto.randomUUID();
  const acquired = await repository.tryAcquireRefreshLease({ ownerToken, now });
  if (!acquired) throw new IpoRefreshLeaseUnavailableError();
  let succeeded = false;
  try {
    const next = await refreshOfficialIpoSnapshot({ fetchImpl, now });
    const stageQuality = evaluateIpoStageProgress(previous?.records ?? [], next.records);
    if (!stageQuality.eligible) throw new Error(stageQuality.reasons.join("|"));
    await repository.publish(next);
    succeeded = true;
    return next;
  } finally {
    await repository.completeRefreshAttempt({ ownerToken, completedAt: new Date(), succeeded });
  }
}

async function loadRequiredSource<T>(
  sourceId: SourceId,
  resource: ApprovedIpoResource,
  fetchImpl: FetchImplementation,
  downloadedAt: string,
  parse: (bytes: Uint8Array) => T[],
): Promise<{ rows: T[]; manifest: IpoSourceManifestEntry }> {
  try {
    if (resource.ipoEventPolicy.manifestSourceId !== sourceId) throw new TypeError("IPO source registry identity mismatch");
    const bytes = await fetchSourceBytes(resource, fetchImpl);
    const rows = parse(bytes);
    if (rows.length === 0) throw new TypeError("required source has no rows");
    return {
      rows,
      manifest: {
        sourceId,
        sourceUrl: resource.exactUrl,
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

async function fetchSourceBytes(resource: ApprovedIpoResource, fetchImpl: FetchImplementation): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), resource.timeoutMs);
    try {
      const response = await fetchImpl(resource.exactUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: { accept: resource.allowedContentTypes.join(",") },
      });
      if (response.status >= 300 && response.status < 400) throw new TypeError("source redirect is not allowed");
      if (!response.ok) throw new TypeError(`HTTP_${response.status}`);
      if (response.redirected) throw new TypeError("source redirect is not allowed");
      assertExactResourceUrl(resource, response.url || resource.exactUrl);
      const contentType = canonicalContentType(response.headers.get("content-type"));
      if (!resource.allowedContentTypes.includes(contentType)) throw new TypeError("source Content-Type is not approved");
      return await readResponseBytes(response, resource.maxResponseBytes);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await delay(100 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function readResponseBytes(response: Response, maxResponseBytes: number): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxResponseBytes)) {
    throw new TypeError("source exceeds maximum size");
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > maxResponseBytes) throw new TypeError("invalid source size");
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
      if (size > maxResponseBytes) throw new TypeError("source exceeds maximum size");
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

function canonicalContentType(value: string | null): string {
  return (value ?? "").split(";", 1)[0].trim().toLowerCase();
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

function retryableUnavailableResponse(headers?: HeadersInit): Response {
  return jsonResponse({ status: "refresh_retryable", retryable: true }, 503, "no-store", headers);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
