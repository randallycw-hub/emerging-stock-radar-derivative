import { pathToFileURL } from "node:url";

import { isIsoDate } from "../lib/domain/dates.ts";
import {
  refreshStaticShowcase,
  runIsolatedRefreshStaticShowcaseTestHarness,
} from "./refresh-static-showcase-data.mjs";

const USAGE = "Usage: node scripts/run-nightly-market-refresh.mjs --date YYYY-MM-DD";

export function parseNightlyMarketRefreshArgs(args) {
  if (
    !Array.isArray(args)
    || args.length !== 2
    || args[0] !== "--date"
    || !isIsoDate(args[1])
  ) {
    throw new TypeError(USAGE);
  }
  return { date: args[1] };
}

export function nightlyRefreshTimestamp(date) {
  if (!isIsoDate(date)) throw new TypeError("date must be an ISO date");
  return new Date(`${date}T14:30:00.000Z`);
}

export async function runNightlyMarketRefresh(options = {}) {
  assertExactOptions(options, ["date", "fetchImpl"]);
  const { date, fetchImpl = fetch } = options;
  if (!isIsoDate(date)) throw new TypeError("date must be an ISO date");
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }
  const scheduledAt = nightlyRefreshTimestamp(date);
  const result = await refreshStaticShowcase({
    dataDate: date,
    fetchImpl,
    now: scheduledAt,
  });
  return {
    status: "validated-static-input",
    dataDate: date,
    scheduledAt: scheduledAt.toISOString(),
    result,
  };
}

export async function runIsolatedNightlyMarketRefreshTestHarness(options = {}) {
  assertExactOptions(options, ["date", "scenario"]);
  const { date, scenario } = options;
  if (!isIsoDate(date)) throw new TypeError("date must be an ISO date");
  if (!new Set(["success", "required-failure", "optional-stale"]).has(scenario)) {
    throw new TypeError("scenario must be success, required-failure, or optional-stale");
  }
  const scheduledAt = nightlyRefreshTimestamp(date);
  const outcome = await runIsolatedRefreshStaticShowcaseTestHarness({
    dataDate: date,
    now: scheduledAt.toISOString(),
    scenario: `nightly-${scenario}`,
  });
  return {
    ...outcome,
    scheduledAt: scheduledAt.toISOString(),
    deploymentEffects: [],
    decisions: lifecycleDecisions(outcome.artifacts),
  };
}

function lifecycleDecisions(artifacts) {
  const before = parseWorkbench(artifacts.before.priorWorkbenchText);
  const after = parseWorkbench(artifacts.active["bond-workbench.json"]);
  const beforeByCode = new Map(before.records.map((record) => [record.bondCode, record]));
  const added = [];
  const updated = [];
  const archived = [];
  for (const record of after.records) {
    const prior = beforeByCode.get(record.bondCode);
    if (record.status === "active") {
      (prior === undefined ? added : updated).push(record.bondCode);
    } else if (prior?.status === "active") {
      archived.push(record.bondCode);
    }
  }
  return { added, updated, archived };
}

function parseWorkbench(text) {
  if (typeof text !== "string") return { records: [] };
  const value = JSON.parse(text);
  return Array.isArray(value?.records) ? value : { records: [] };
}

function assertExactOptions(value, allowed) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("options must be an object");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (
      typeof key !== "string"
      || !allowed.includes(key)
      || !Object.prototype.propertyIsEnumerable.call(value, key)
    ) {
      throw new TypeError(`${String(key)} is not supported by nightly refresh`);
    }
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entryUrl === import.meta.url) {
  const options = parseNightlyMarketRefreshArgs(process.argv.slice(2));
  console.log(JSON.stringify(await runNightlyMarketRefresh(options), null, 2));
}
