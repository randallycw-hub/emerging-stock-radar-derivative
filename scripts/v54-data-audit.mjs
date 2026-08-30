import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCanonicalPublicMasters,
} from "../static-showcase/assets/public-market-research.js";
import {
  buildV54CanonicalData,
  buildV54DataAudit,
} from "../static-showcase/assets/v54-canonical-data.js";

const DEFAULT_SOURCE = fileURLToPath(new URL("../static-showcase/", import.meta.url));
const DEFAULT_OUTPUT = fileURLToPath(new URL("../.cache/v54/", import.meta.url));
const BASELINE_FILES = Object.freeze([
  "emerging-market.json",
  "ipo-events.json",
  "bond-workbench.json",
  "bond-market-history.json",
  "bond-supplemental.json",
  "conversion-prices.json",
  "94025.json",
]);

export async function runV54DataAudit({ source = DEFAULT_SOURCE, output = DEFAULT_OUTPUT } = {}) {
  const pointer = await readJson(join(source, "data", "current.json"));
  const generation = String(pointer?.generation ?? "");
  if (!/^generations\/[a-f0-9]+$/i.test(generation)) {
    throw new Error("V5.4 audit requires an active generated snapshot");
  }
  const base = join(source, "data", ...generation.split("/"));
  const [manifest, emerging, ipo, workbench, stockCloses, history, revenue, supplemental, conversionPrices] = await Promise.all([
    readJson(join(base, "manifest.json")),
    readJson(join(base, "emerging-market.json")),
    readJson(join(base, "ipo-events.json")),
    readJson(join(base, "bond-workbench.json")),
    readOptionalJson(join(base, "stock-closes.json"), []),
    readOptionalJson(join(base, "bond-market-history.json"), []),
    readOptionalJson(join(base, "94025.json"), []),
    readOptionalJson(join(base, "bond-supplemental.json"), { redemptions: [] }),
    readOptionalJson(join(base, "conversion-prices.json"), []),
  ]);
  const masters = buildCanonicalPublicMasters({
    manifest,
    emerging,
    ipo,
    workbench,
    stockCloses,
    revenue,
  });
  const canonical = buildV54CanonicalData({
    manifest,
    workbench,
    history,
    cbMaster: masters.cbMaster,
    companyMaster: masters.companyMaster,
    supplemental,
    conversionPrices,
    ipo,
    emerging,
    revenue,
  });
  const baseline = { inputHashes: await hashInputs(base) };
  const report = buildV54DataAudit({
    canonical,
    manifest,
    emerging,
    ipo,
    revenue,
    baseline,
  });

  await mkdir(output, { recursive: true });
  await Promise.all([
    writeJson(join(output, "source-registry.v54.json"), report.sourceRegistry),
    writeJson(join(output, "field-lineage.v54.json"), report.fieldLineage),
    writeJson(join(output, "data-coverage-report.v54.json"), report.coverage),
    writeJson(join(output, "qa-report.v54.json"), report.qa),
    writeJson(join(output, "audit-report.v54.json"), {
      schemaVersion: report.schemaVersion,
      dataDate: report.dataDate,
      generatedAt: report.generatedAt,
      baseline,
      qa: report.qa,
    }),
  ]);
  return report;
}

async function hashInputs(base) {
  const entries = await Promise.all(BASELINE_FILES.map(async (file) => {
    const content = await readOptionalFile(join(base, file));
    return [file, content === null ? null : createHash("sha256").update(content).digest("hex")];
  }));
  return Object.fromEntries(entries);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readOptionalJson(path, fallback) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readOptionalFile(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--output" || !argv[index + 1]) continue;
    options.output = resolve(process.cwd(), argv[index + 1]);
    index += 1;
  }
  return options;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const report = await runV54DataAudit(parseCli(process.argv.slice(2)));
  process.stdout.write(`V5.4 internal audit passed for ${report.dataDate}.\n`);
}
