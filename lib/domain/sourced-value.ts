import {
  compareIsoDates,
  isIsoDate,
  isIsoDateTime,
  toTaipeiDate,
} from "./dates.ts";
import type {
  PublicSourceReference,
  SourcedValue,
  SourcedValueStatus,
} from "./types.ts";

export type { PublicSourceReference, SourcedValue, SourcedValueStatus } from "./types.ts";

type SourcedValueInput<T> = Readonly<{
  value: T | null;
  asOfDate: string | null;
  source: PublicSourceReference | null;
  fetchedAt: string | null;
  status: SourcedValueStatus;
}>;

const statuses = new Set<SourcedValueStatus>(["ok", "stale", "conflict", "missing"]);

export function createSourcedValue<T>(input: SourcedValueInput<T>): Readonly<SourcedValue<T>> {
  if (!statuses.has(input.status)) throw new TypeError("SourcedValue status is invalid");
  const source = input.source === null ? null : normalizeSource(input.source);
  const asOfDate = normalizeOptionalDate(input.asOfDate, "asOfDate");
  const fetchedAt = normalizeOptionalDateTime(input.fetchedAt, "fetchedAt");

  if (source === null && (asOfDate !== null || fetchedAt !== null)) {
    throw new TypeError("SourcedValue dates require a source");
  }
  if (source !== null && (asOfDate === null || fetchedAt === null)) {
    throw new TypeError("SourcedValue source requires asOfDate and fetchedAt");
  }
  if (asOfDate !== null && fetchedAt !== null && compareIsoDates(asOfDate, toTaipeiDate(fetchedAt)) > 0) {
    throw new TypeError("SourcedValue asOfDate cannot be later than fetchedAt");
  }
  if ((input.status === "missing" || input.status === "conflict") && input.value !== null) {
    throw new TypeError(`SourcedValue ${input.status} cannot contain a value`);
  }
  if ((input.status === "ok" || input.status === "stale") && input.value === null) {
    throw new TypeError(`SourcedValue ${input.status} requires a value`);
  }
  if (input.status === "missing" && (source !== null || asOfDate !== null || fetchedAt !== null)) {
    throw new TypeError("SourcedValue missing cannot contain source details");
  }

  return Object.freeze({
    value: input.value,
    asOfDate,
    source,
    fetchedAt,
    status: input.status,
  });
}

export function toPublicProvenance<T>(value: Pick<SourcedValue<T>, "source" | "asOfDate" | "fetchedAt">): Readonly<{
  label: string;
  asOfDate: string;
  fetchedAt: string;
  sourceUrl: string;
}> | null {
  if (value.source === null || value.asOfDate === null || value.fetchedAt === null) return null;
  return Object.freeze({
    label: `${value.source.providerName}｜${value.source.datasetName}`,
    asOfDate: value.asOfDate,
    fetchedAt: value.fetchedAt,
    sourceUrl: value.source.officialUrl,
  });
}

function normalizeSource(value: PublicSourceReference): Readonly<PublicSourceReference> {
  const providerName = requiredText(value.providerName, "source.providerName");
  const datasetName = requiredText(value.datasetName, "source.datasetName");
  const officialUrl = requiredOfficialUrl(value.officialUrl);
  return Object.freeze({ providerName, datasetName, officialUrl });
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${field} is required`);
  return value.trim();
}

function requiredOfficialUrl(value: unknown): string {
  const text = requiredText(value, "source.officialUrl");
  let url: URL;
  try { url = new URL(text); } catch { throw new TypeError("source.officialUrl must be HTTPS"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new TypeError("source.officialUrl must be HTTPS");
  }
  return url.href;
}

function normalizeOptionalDate(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (!isIsoDate(value)) throw new TypeError(`SourcedValue ${field} must be an ISO date or null`);
  return value;
}

function normalizeOptionalDateTime(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (!isIsoDateTime(value)) throw new TypeError(`SourcedValue ${field} must be an ISO datetime or null`);
  return value;
}
