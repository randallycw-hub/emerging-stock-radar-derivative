import { createHash } from "node:crypto";

import { isIsoDateTime } from "../domain/dates.ts";
import { getParsedCsvHeaders } from "./csv.ts";
import type { FixtureMetadata, FixturePrivacyReview } from "./types.ts";

const DATASET_IDS = new Set(["11406", "94025", "11586", "28567"]);
const METADATA_KEYS = new Set([
  "sourceId",
  "schemaVersion",
  "fixtureVersion",
  "datasetId",
  "datasetName",
  "resourceRole",
  "resourceUrl",
  "fetchedAt",
  "httpContentType",
  "httpStatus",
  "sourceResponseSha256",
  "fixtureSha256",
  "sourceRowCount",
  "fixtureRowCount",
  "licenseName",
  "providerName",
  "manuallyReviewed",
  "reviewedAt",
  "privacyReview",
  "samplingMethod",
]);
const PRIVACY_REVIEW_KEYS = new Set([
  "containsPersonalData",
  "excludedFields",
  "minimized",
  "deidentified",
  "rationale",
]);
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const LICENSE_NAME = "政府資料開放授權條款－第1版";

export class FixtureIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureIntegrityError";
  }
}

export function sha256Hex(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function parseFixtureMetadata(value: unknown): FixtureMetadata {
  assertFixtureRuntimeAllowed();
  const record = requireRecord(value, "metadata");
  assertOnlyKeys(record, METADATA_KEYS, "metadata");
  for (const key of METADATA_KEYS) assertPresent(record, key);

  const datasetId = requireDatasetId(record.datasetId);
  const sourceId = requireNonEmptyString(record.sourceId, "sourceId");
  if (sourceId !== `data-gov-${datasetId}`) {
    throw new TypeError("sourceId must match data-gov-{datasetId}");
  }
  const schemaVersion = requireVersion(record.schemaVersion, "schemaVersion");
  const fixtureVersion = requireVersion(record.fixtureVersion, "fixtureVersion");

  const resourceUrl = requireNonEmptyString(record.resourceUrl, "resourceUrl");
  assertHttpsUrl(resourceUrl, "resourceUrl");
  const fetchedAt = requireNonEmptyString(record.fetchedAt, "fetchedAt");
  if (!isIsoDateTime(fetchedAt) || !fetchedAt.endsWith("Z")) {
    throw new TypeError("fetchedAt must be a UTC ISO datetime");
  }
  const httpStatus = requireHttpStatus(record.httpStatus);

  const sourceRowCount = requireNonNegativeInteger(record.sourceRowCount, "sourceRowCount");
  const fixtureRowCount = requireNonNegativeInteger(record.fixtureRowCount, "fixtureRowCount");
  if (fixtureRowCount > sourceRowCount) {
    throw new TypeError("fixtureRowCount must not exceed sourceRowCount");
  }

  if (record.manuallyReviewed !== true) {
    throw new TypeError("manuallyReviewed must be true");
  }
  const reviewedAt = requireNonEmptyString(record.reviewedAt, "reviewedAt");
  if (!isIsoDateTime(reviewedAt) || !reviewedAt.endsWith("Z")) {
    throw new TypeError("reviewedAt must be a UTC ISO datetime");
  }

  return {
    sourceId,
    schemaVersion,
    fixtureVersion,
    datasetId,
    datasetName: requireNonEmptyString(record.datasetName, "datasetName"),
    resourceRole: requireResourceRole(record.resourceRole),
    resourceUrl,
    fetchedAt,
    httpContentType: requireNonEmptyString(record.httpContentType, "httpContentType"),
    httpStatus,
    sourceResponseSha256: requireSha256(record.sourceResponseSha256, "sourceResponseSha256"),
    fixtureSha256: requireSha256(record.fixtureSha256, "fixtureSha256"),
    sourceRowCount,
    fixtureRowCount,
    licenseName: requireLicenseName(record.licenseName),
    providerName: requireNonEmptyString(record.providerName, "providerName"),
    manuallyReviewed: true,
    reviewedAt,
    privacyReview: parsePrivacyReview(record.privacyReview),
    samplingMethod: requireNonEmptyString(record.samplingMethod, "samplingMethod"),
  };
}

export function verifyFixtureIntegrity(
  metadata: FixtureMetadata,
  bytes: Uint8Array,
  parsedRowCount: number,
): void {
  assertFixtureRuntimeAllowed();
  if (sha256Hex(bytes) !== metadata.fixtureSha256) {
    throw new FixtureIntegrityError("fixtureSha256 mismatch");
  }
  if (parsedRowCount !== metadata.fixtureRowCount) {
    throw new FixtureIntegrityError("fixtureRowCount mismatch");
  }
  if (!metadata.manuallyReviewed) {
    throw new FixtureIntegrityError("manuallyReviewed must be true");
  }
  if (!metadata.privacyReview.minimized) {
    throw new FixtureIntegrityError("privacyReview.minimized must be true");
  }
}

export function verifyFixtureContent(
  metadata: FixtureMetadata,
  rows: readonly Readonly<Record<string, string>>[],
  approvedFields: readonly string[],
): void {
  assertFixtureRuntimeAllowed();
  const approvedHeaders = new Set(approvedFields);
  if (approvedHeaders.size === 0 || approvedFields.some((field) => field.trim() === "")) {
    throw new TypeError("approvedFields must contain non-empty headers");
  }

  const trustedHeaders = getParsedCsvHeaders(rows);
  const headers = new Set<string>(trustedHeaders);
  for (const row of rows) {
    for (const header of Object.keys(row)) headers.add(header);
  }
  if (!trustedHeaders && headers.size === 0) {
    throw new FixtureIntegrityError("trusted CSV headers are required for header-only rows");
  }
  for (const header of headers) {
    if (!approvedHeaders.has(header)) {
      throw new FixtureIntegrityError(`unapproved header: ${header}`);
    }
  }
  for (const excludedField of metadata.privacyReview.excludedFields) {
    if (headers.has(excludedField)) {
      throw new FixtureIntegrityError(`excluded field: ${excludedField}`);
    }
  }
}

function parsePrivacyReview(value: unknown): FixturePrivacyReview {
  const record = requireRecord(value, "privacyReview");
  assertOnlyKeys(record, PRIVACY_REVIEW_KEYS, "privacyReview");
  for (const key of PRIVACY_REVIEW_KEYS) assertPresent(record, `privacyReview.${key}`);

  if (typeof record.containsPersonalData !== "boolean") {
    throw new TypeError("privacyReview.containsPersonalData must be boolean");
  }
  if (typeof record.minimized !== "boolean" || !record.minimized) {
    throw new TypeError("privacyReview.minimized must be true");
  }
  if (typeof record.deidentified !== "boolean") {
    throw new TypeError("privacyReview.deidentified must be boolean");
  }
  if (record.containsPersonalData !== record.deidentified) {
    throw new TypeError("privacyReview.deidentified must match privacyReview.containsPersonalData");
  }
  if (!Array.isArray(record.excludedFields) || record.excludedFields.length === 0) {
    throw new TypeError("privacyReview.excludedFields must list excluded sensitive fields");
  }

  const excludedFields = record.excludedFields.map((field, index) =>
    requireNonEmptyString(field, `privacyReview.excludedFields[${index}]`),
  );
  if (new Set(excludedFields).size !== excludedFields.length) {
    throw new TypeError("privacyReview.excludedFields must not contain duplicates");
  }

  return {
    containsPersonalData: record.containsPersonalData,
    excludedFields,
    minimized: true,
    deidentified: record.deidentified,
    rationale: requireNonEmptyString(record.rationale, "privacyReview.rationale"),
  };
}

function assertFixtureRuntimeAllowed(): void {
  if (process.env.NODE_ENV === "production") {
    throw new FixtureIntegrityError("Fixture parsing and verification are forbidden in production runtime");
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(record: Record<string, unknown>, allowed: Set<string>, name: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new TypeError(`${name} has unknown key: ${key}`);
  }
}

function assertPresent(record: Record<string, unknown>, key: string): void {
  const leafKey = key.includes(".") ? key.split(".").at(-1)! : key;
  if (!(leafKey in record) || record[leafKey] === undefined) {
    throw new TypeError(`missing required field: ${key}`);
  }
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function requireVersion(value: unknown, name: string): string {
  if (
    typeof value !== "string"
    || !VERSION_PATTERN.test(value)
    || /[\r\n\u2028\u2029]/.test(value)
  ) {
    throw new TypeError(`${name} must be a valid version string`);
  }
  return value;
}

function requireDatasetId(value: unknown): FixtureMetadata["datasetId"] {
  if (typeof value !== "string" || !DATASET_IDS.has(value)) {
    throw new TypeError("datasetId is not an approved V1 dataset");
  }
  return value as FixtureMetadata["datasetId"];
}

function requireResourceRole(value: unknown): FixtureMetadata["resourceRole"] {
  if (value !== "csv" && value !== "openapi_json") {
    throw new TypeError("resourceRole must be csv or openapi_json");
  }
  return value;
}

function assertHttpsUrl(value: string, name: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname === "" || url.username || url.password) {
      throw new TypeError();
    }
  } catch {
    throw new TypeError(`${name} must be an HTTPS URL`);
  }
}

function requireSha256(value: unknown, name: string): `sha256:${string}` {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${name} must be sha256:<64 lowercase hex characters>`);
  }
  return value as `sha256:${string}`;
}

function requireNonNegativeInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return value;
}

function requireHttpStatus(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 100 || value > 599) {
    throw new TypeError("httpStatus must be an integer from 100 to 599");
  }
  return value;
}

function requireLicenseName(value: unknown): FixtureMetadata["licenseName"] {
  if (value !== LICENSE_NAME) throw new TypeError("licenseName must be 政府資料開放授權條款－第1版");
  return LICENSE_NAME;
}
