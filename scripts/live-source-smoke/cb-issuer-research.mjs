import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildCbIssuerAliasIndex } from "../../lib/market-data/cb-issuer-research.ts";
import {
  assertExactResourceUrl,
  getApprovedResource,
} from "../../lib/pipeline/source-registry.ts";
import {
  normalize94025Row,
  parseMonthlyRevenueCsv,
} from "../../lib/source-verification/source-94025.ts";
import {
  assertCbIssuerResearchSourceRequest,
  CB_ISSUER_RESEARCH_SOURCE_POLICIES,
} from "../../lib/source-verification/source-cb-issuer-research.ts";
import { bondInputsFrom11406Rows } from "../build-bond-market-snapshot.mjs";

const ACTIVE_GENERATION = "generations/d9560508d9dceb87";
const ACTIVE_JSON_BYTES = 435_121;
const ACTIVE_JSON_SHA256 = "f0e75150f0acaff4ee4d57949ba69a14cea1176701191b8faa06072f2ab501fd";
const ACTIVE_RAW_SHA256 = "sha256:557ca7f01ff3ab9dec003c3d4e6be81b2df3e0e253b97b27c19ddd8bd1d95feb";
const ACTIVE_SOURCE_URL = "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv";
const ACTIVE_DATA_ROOT = new URL("../../static-showcase/data/", import.meta.url);
const SOURCE_ORDER = Object.freeze(["listed", "otc"]);
const RESOURCE_IDS = Object.freeze({
  listed: "data-gov-18420-listed-monthly-revenue-csv",
  otc: "data-gov-56510-otc-monthly-revenue-csv",
});

export function deriveActiveCbIssuerIdentities(rows) {
  const bonds = bondInputsFrom11406Rows(rows);
  const aliasIndex = buildCbIssuerAliasIndex(bonds.map(({ issuerCode, issuerName }) => ({
    issuerCode,
    issuerName,
  })));
  if (aliasIndex.entries.length === 0) {
    throw new TypeError("active 11406 context must contain at least one issuer");
  }
  return aliasIndex.entries.map(({ issuerCode, aliases }) => ({
      issuerCode,
      issuerNames: [...aliases],
    }));
}

export async function loadActiveCbIssuerContext() {
  const pointer = parsePlainJson(
    await readFile(new URL("current.json", ACTIVE_DATA_ROOT), "utf8"),
    "active generation pointer",
  );
  assertExactKeys(pointer, ["schemaVersion", "generation", "runtimeUrl"], "active generation pointer");
  if (pointer.schemaVersion !== 1 || pointer.generation !== ACTIVE_GENERATION) {
    throw new TypeError("active generation pointer is not the reviewed 11406 context");
  }
  const expectedRuntimeUrl = `./data/${ACTIVE_GENERATION}/runtime.json`;
  if (pointer.runtimeUrl !== expectedRuntimeUrl) {
    throw new TypeError("active generation pointer runtime URL is invalid");
  }

  const generationRoot = new URL(`${ACTIVE_GENERATION.slice("generations/".length)}/`, new URL("generations/", ACTIVE_DATA_ROOT));
  const manifest = parsePlainJson(
    await readFile(new URL("manifest.json", generationRoot), "utf8"),
    "active generation manifest",
  );
  if (!Array.isArray(manifest.datasets)) {
    throw new TypeError("active generation manifest datasets must be an array");
  }
  const sourceEntries = manifest.datasets.filter((entry) => (
    entry !== null && typeof entry === "object" && entry.datasetId === "11406"
  ));
  if (sourceEntries.length !== 1) {
    throw new TypeError("active generation manifest must declare exactly one 11406 dataset");
  }
  const sourceEntry = sourceEntries[0];
  assertExactKeys(
    sourceEntry,
    ["datasetId", "sourceUrl", "downloadedAt", "sha256", "rawBytes", "rowCount"],
    "active generation 11406 manifest entry",
  );
  if (
    sourceEntry.sourceUrl !== ACTIVE_SOURCE_URL
    || sourceEntry.downloadedAt !== "2026-08-01"
    || sourceEntry.sha256 !== ACTIVE_RAW_SHA256
    || sourceEntry.rawBytes !== 137_370
    || sourceEntry.rowCount !== 415
  ) {
    throw new TypeError("active generation 11406 manifest entry is not the reviewed snapshot");
  }

  const runtime = parsePlainJson(
    await readFile(new URL("runtime.json", generationRoot), "utf8"),
    "active generation runtime",
  );
  if (
    runtime.generation !== ACTIVE_GENERATION
    || runtime.manifestUrl !== `./data/${ACTIVE_GENERATION}/manifest.json`
    || runtime.datasets?.["11406"] !== `./data/${ACTIVE_GENERATION}/11406.json`
  ) {
    throw new TypeError("active generation runtime does not bind the reviewed 11406 artifact");
  }

  const jsonBytes = new Uint8Array(await readFile(new URL("11406.json", generationRoot)));
  if (jsonBytes.byteLength !== ACTIVE_JSON_BYTES) {
    throw new TypeError("active generation 11406 JSON byte count changed");
  }
  if (sha256(jsonBytes) !== ACTIVE_JSON_SHA256) {
    throw new TypeError("active generation 11406 JSON hash changed");
  }
  const rows = parsePlainJson(new TextDecoder("utf-8", { fatal: true }).decode(jsonBytes), "active generation 11406 JSON");
  if (!Array.isArray(rows) || rows.length !== sourceEntry.rowCount) {
    throw new TypeError("active generation 11406 JSON row count changed");
  }
  const activeIssuers = deriveActiveCbIssuerIdentities(rows);
  const activeBondCount = bondInputsFrom11406Rows(rows).length;
  if (activeBondCount !== 385 || activeIssuers.length !== 310) {
    throw new TypeError("active generation 11406 denominator changed");
  }
  return Object.freeze({
    generation: ACTIVE_GENERATION,
    activeBondCount,
    activeIssuers: Object.freeze(activeIssuers.map((issuer) => Object.freeze({
      issuerCode: issuer.issuerCode,
      issuerNames: Object.freeze([...issuer.issuerNames]),
    }))),
  });
}

export function assessCbIssuerResearchSource(input) {
  const config = sourceConfiguration(input.market);
  assertIsoTimestamp(input.retrievedAt, "retrievedAt");
  const aliases = activeIssuerAliasIndex(input.activeIssuers);
  const response = requirePlainRecord(input.response, "source response");
  const requestedUrl = response.requestedUrl;
  const finalUrl = response.finalUrl;
  const status = response.status;
  const contentType = response.contentType;
  const body = response.body;
  const base = {
    sourceId: config.policy.sourceId,
    resourceId: config.resource.resourceId,
    market: config.policy.market,
    requestedUrl,
    finalUrl,
    status,
    contentType,
    bytes: body instanceof Uint8Array ? body.byteLength : null,
    sha256: body instanceof Uint8Array ? sha256(body) : null,
    rowCount: null,
    newestRevenueMonth: null,
    newestSourcePublishedOn: null,
    activeCbIssuerCount: aliases.entries.length,
    matchedIssuerCount: 0,
    missingIssuerCount: aliases.entries.length,
    nameConflictCount: 0,
    duplicateIdentityCount: 0,
  };

  try {
    assertCbIssuerResearchSourceRequest({ method: "GET", url: requestedUrl });
    assertExactResourceUrl(config.resource, requestedUrl);
  } catch {
    return failedSummary(base, "REQUEST_URL_NOT_APPROVED");
  }
  if (status !== 200) return failedSummary(base, "HTTP_STATUS_NOT_200");
  if (response.redirected === true) return failedSummary(base, "REDIRECT_NOT_ALLOWED");
  if (finalUrl !== requestedUrl) return failedSummary(base, "FINAL_URL_MISMATCH");
  if (typeof contentType !== "string") {
    return failedSummary(base, "CONTENT_TYPE_NOT_ALLOWED");
  }
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (!config.resource.allowedContentTypes.includes(mediaType)) {
    return failedSummary(base, "CONTENT_TYPE_NOT_ALLOWED");
  }
  if (!(body instanceof Uint8Array)) {
    return failedSummary(base, "RESPONSE_BODY_REQUIRED");
  }
  if (body.byteLength > config.resource.maxResponseBytes) {
    return failedSummary(base, "RESPONSE_TOO_LARGE");
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body).replace(/^\uFEFF/, "");
  } catch {
    return failedSummary(base, "INVALID_UTF8");
  }

  let rows;
  try {
    rows = parseMonthlyRevenueCsv(text, `${config.policy.market} monthly revenue CSV`)
      .map(normalize94025Row);
  } catch {
    return failedSummary(base, "SOURCE_CONTRACT_REJECTED");
  }

  const identities = new Set();
  let duplicateIdentityCount = 0;
  for (const row of rows) {
    const identity = `${row.sourcePublishedOn}\u001f${row.yearMonth}\u001f${row.companyCode}`;
    if (identities.has(identity)) duplicateIdentityCount += 1;
    identities.add(identity);
  }
  const newestRevenueMonth = rows.map(({ yearMonth }) => yearMonth).sort().at(-1) ?? null;
  const newestSourcePublishedOn = rows
    .map(({ sourcePublishedOn }) => sourcePublishedOn)
    .sort()
    .at(-1) ?? null;
  const latestRows = selectLatestRows(rows);
  let matchedIssuerCount = 0;
  let missingIssuerCount = 0;
  let nameConflictCount = 0;
  for (const issuer of aliases.entries) {
    const row = latestRows.get(issuer.issuerCode);
    if (row === undefined) {
      missingIssuerCount += 1;
    } else if (aliases.matches(issuer.issuerCode, row.companyName)) {
      matchedIssuerCount += 1;
    } else {
      nameConflictCount += 1;
    }
  }
  const assessed = {
    ...base,
    rowCount: rows.length,
    newestRevenueMonth,
    newestSourcePublishedOn,
    matchedIssuerCount,
    missingIssuerCount,
    nameConflictCount,
    duplicateIdentityCount,
  };
  if (duplicateIdentityCount !== 0) {
    return failedSummary(assessed, "DUPLICATE_SOURCE_IDENTITY");
  }
  if (
    newestRevenueMonth > input.retrievedAt.slice(0, 7)
    || newestSourcePublishedOn > input.retrievedAt.slice(0, 10)
  ) {
    return failedSummary(assessed, "SOURCE_PERIOD_AFTER_RETRIEVAL");
  }
  return {
    ...assessed,
    warnings: [],
    outcome: "PASS",
    failure: null,
  };
}

export async function runCbIssuerResearchSmoke(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const loadContext = options.loadContext ?? loadActiveCbIssuerContext;
  const retrievedAt = now();
  assertIsoTimestamp(retrievedAt, "retrievedAt");
  const context = await loadContext();
  const aliases = activeIssuerAliasIndex(context.activeIssuers);
  const configs = SOURCE_ORDER.map(sourceConfiguration);
  const sources = await Promise.all(configs.map((config) => fetchAndAssessSource({
    config,
    fetchImpl,
    retrievedAt,
    activeIssuers: context.activeIssuers,
    activeCbIssuerCount: aliases.entries.length,
  })));
  return {
    retrievedAt,
    generation: context.generation,
    activeBondCount: context.activeBondCount,
    activeCbIssuerCount: aliases.entries.length,
    sources,
    ok: sources.every(({ outcome }) => outcome === "PASS"),
  };
}

async function fetchAndAssessSource(input) {
  const { config, fetchImpl, retrievedAt, activeIssuers, activeCbIssuerCount } = input;
  let response;
  try {
    response = await fetchImpl(config.policy.url, { method: "GET", redirect: "manual" });
  } catch {
    return emptyFailure(config, activeCbIssuerCount, "NETWORK_REQUEST_FAILED");
  }
  if (
    response === null
    || typeof response !== "object"
    || !Number.isInteger(response.status)
    || typeof response.url !== "string"
    || typeof response.headers?.get !== "function"
  ) {
    return emptyFailure(config, activeCbIssuerCount, "INVALID_RESPONSE");
  }
  const contentType = response.headers.get("content-type");
  const responseMetadata = {
    requestedUrl: config.policy.url,
    finalUrl: response.url,
    status: response.status,
    contentType,
    redirected: response.redirected === true,
  };
  if (response.status !== 200 || response.redirected === true || response.url !== config.policy.url) {
    return assessCbIssuerResearchSource({
      market: config.policy.market,
      retrievedAt,
      activeIssuers,
      response: { ...responseMetadata, body: new Uint8Array() },
    });
  }

  let body;
  try {
    body = await readBoundedBody(response, config.resource.maxResponseBytes);
  } catch (error) {
    const failure = error instanceof TypeError && error.message === "RESPONSE_TOO_LARGE"
      ? "RESPONSE_TOO_LARGE"
      : "RESPONSE_BODY_FAILED";
    return {
      ...emptyFailure(config, activeCbIssuerCount, failure),
      finalUrl: response.url,
      status: response.status,
      contentType,
    };
  }
  return assessCbIssuerResearchSource({
    market: config.policy.market,
    retrievedAt,
    activeIssuers,
    response: { ...responseMetadata, body },
  });
}

function sourceConfiguration(market) {
  if (!SOURCE_ORDER.includes(market)) throw new TypeError("market is invalid");
  const policy = CB_ISSUER_RESEARCH_SOURCE_POLICIES[market];
  const resource = getApprovedResource(policy.sourceId, RESOURCE_IDS[market]);
  if (resource.sourceId !== policy.sourceId || resource.resourceId !== RESOURCE_IDS[market]) {
    throw new TypeError("central source registry identity changed");
  }
  assertExactResourceUrl(resource, policy.url);
  assertCbIssuerResearchSourceRequest({ method: "GET", url: policy.url });
  return { policy, resource };
}

function activeIssuerAliasIndex(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("activeIssuers must be a nonempty array");
  }
  const pairs = value.flatMap((candidate, index) => {
    const issuer = requirePlainRecord(candidate, `active issuer ${index}`);
    assertExactKeys(issuer, ["issuerCode", "issuerNames"], `active issuer ${index}`);
    if (!Array.isArray(issuer.issuerNames) || issuer.issuerNames.length === 0) {
      throw new TypeError(`active issuer ${index} issuerNames must be nonempty`);
    }
    return issuer.issuerNames.map((issuerName) => ({
      issuerCode: issuer.issuerCode,
      issuerName,
    }));
  });
  return buildCbIssuerAliasIndex(pairs);
}

function selectLatestRows(rows) {
  const latest = new Map();
  for (const row of rows) {
    const previous = latest.get(row.companyCode);
    if (
      previous === undefined
      || row.sourcePublishedOn > previous.sourcePublishedOn
      || (
        row.sourcePublishedOn === previous.sourcePublishedOn
        && row.yearMonth > previous.yearMonth
      )
    ) {
      latest.set(row.companyCode, row);
    }
  }
  return latest;
}

async function readBoundedBody(response, maximumBytes) {
  if (response.body === null || typeof response.body?.getReader !== "function") {
    throw new TypeError("RESPONSE_BODY_REQUIRED");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new TypeError("RESPONSE_BODY_INVALID");
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new TypeError("RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function emptyFailure(config, activeCbIssuerCount, failure) {
  return {
    sourceId: config.policy.sourceId,
    resourceId: config.resource.resourceId,
    market: config.policy.market,
    requestedUrl: config.policy.url,
    finalUrl: null,
    status: null,
    contentType: null,
    bytes: null,
    sha256: null,
    rowCount: null,
    newestRevenueMonth: null,
    newestSourcePublishedOn: null,
    activeCbIssuerCount,
    matchedIssuerCount: 0,
    missingIssuerCount: activeCbIssuerCount,
    nameConflictCount: 0,
    duplicateIdentityCount: 0,
    warnings: [failure],
    outcome: "FAIL",
    failure,
  };
}

function failedSummary(summary, failure) {
  return {
    ...summary,
    warnings: [failure],
    outcome: "FAIL",
    failure,
  };
}

function assertIsoTimestamp(value, name) {
  if (
    typeof value !== "string"
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw new TypeError(`${name} must be an ISO timestamp`);
  }
}

function parsePlainJson(text, name) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new TypeError(`${name} must be valid JSON`);
  }
  return value;
}

function requirePlainRecord(value, name) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${name} must be a plain object`);
  }
  return value;
}

function assertExactKeys(value, expected, name) {
  const record = requirePlainRecord(value, name);
  const actual = Reflect.ownKeys(record);
  if (
    actual.some((key) => typeof key !== "string")
    || actual.length !== expected.length
    || expected.some((key) => !Object.hasOwn(record, key))
  ) {
    throw new TypeError(`${name} keys are invalid`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  try {
    const result = await runCbIssuerResearchSmoke();
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({
      retrievedAt: new Date().toISOString(),
      ok: false,
      failure: "SMOKE_SETUP_FAILED",
      warnings: ["SMOKE_SETUP_FAILED"],
    }));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
