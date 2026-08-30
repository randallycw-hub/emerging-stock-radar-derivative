import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PUBLIC_INTERNAL_FIELDS = new Set([
  "rawSourceId",
  "rawTextHash",
  "sourceId",
  "sourceRecordId",
  "missingReason",
  "missingReasons",
  "diagnostics",
]);

export function auditV55RightsEvents({ canonical, rightsSnapshot, minimumSampleSize = 20 } = {}) {
  const events = recordsOf(canonical?.records);
  const sourceEvents = recordsOf(rightsSnapshot?.events);
  const richEvents = events.filter((event) => event?.eventType === "early_redemption");
  const canonicalIds = new Set();
  const failures = [];

  for (const event of events) {
    if (!text(event?.eventId)) failures.push("canonical event id is missing");
    if (canonicalIds.has(event?.eventId)) failures.push(`duplicate canonical event id: ${event.eventId}`);
    canonicalIds.add(event?.eventId);
    const internal = findPublicInternalField(event);
    if (internal !== null) failures.push(`public internal field found: ${internal}`);
  }

  for (const source of sourceEvents) {
    if (!text(source?.eventId) || !canonicalIds.has(source.eventId)) {
      failures.push(`source rights event is absent from canonical events: ${text(source?.eventId) || "unknown"}`);
    }
  }

  for (const event of richEvents) {
    if (!cbCode(event?.cbCode) || !text(event?.companyName) || !text(event?.cbName)) {
      failures.push(`CB redemption identity is incomplete: ${text(event?.eventId) || "unknown"}`);
    }
    if (!isOfficialSourceUrl(event?.sourceUrl)) {
      failures.push(`CB redemption official source is invalid: ${text(event?.eventId) || "unknown"}`);
    }
    if (!isIsoDate(event?.announcementDate) || !isIsoDate(event?.deadlineDate)) {
      failures.push(`CB redemption dates are incomplete: ${text(event?.eventId) || "unknown"}`);
    }
  }

  const sampledCbCodes = [...new Set(richEvents.map((event) => cbCode(event?.cbCode)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, Math.max(0, Number(minimumSampleSize) || 0));
  if (sourceEvents.length > 0 && sampledCbCodes.length < Math.min(minimumSampleSize, sourceEvents.length)) {
    failures.push("insufficient distinct CB samples for rights-event QA");
  }
  if (failures.length > 0) throw new Error(`V5.5 rights-event QA failed: ${failures.join("; ")}`);

  return Object.freeze({
    passed: true,
    dataDate: isIsoDate(canonical?.dataDate) ? canonical.dataDate : null,
    canonicalEventCount: events.length,
    richEventCount: richEvents.length,
    sourceEventCount: sourceEvents.length,
    sampledCbCodes,
  });
}

async function main() {
  const root = process.argv[2] ?? "dist/client/market-site";
  const current = await readJson(join(root, "data", "current.json"));
  const runtime = await readJson(join(root, trimPublicPath(current.runtimeUrl)));
  const generation = text(current.generation);
  const canonical = await readJson(join(root, trimPublicPath(runtime.canonicalEventsV55Url)));
  const rightsSnapshot = await readJson(join(root, "data", generation, "cb-rights-events.json"));
  const result = auditV55RightsEvents({ canonical, rightsSnapshot });
  const reportPath = join(".cache", "v55-rights-event-qa.json");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({ ...result, checkedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function findPublicInternalField(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findPublicInternalField(entry);
      if (found !== null) return found;
    }
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(value)) {
    if (PUBLIC_INTERNAL_FIELDS.has(key)) return key;
    const found = findPublicInternalField(nested);
    if (found !== null) return found;
  }
  return null;
}

function trimPublicPath(value) {
  const path = text(value).replace(/^\.\//u, "");
  if (!path || path.includes("..") || path.startsWith("/")) throw new TypeError("public artifact path is invalid");
  return path;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function recordsOf(value) {
  return Array.isArray(value) ? value : [];
}

function cbCode(value) {
  const code = text(value);
  return /^\d{5,6}$/u.test(code) ? code : null;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value ?? ""))) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function isOfficialSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["mopsov.twse.com.tw", "www.tpex.org.tw", "www.twse.com.tw"].includes(url.hostname);
  } catch {
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
