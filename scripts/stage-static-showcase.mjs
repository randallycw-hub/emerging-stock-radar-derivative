import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { parseCbIssuerResearchSnapshot } from "../lib/market-data/cb-issuer-research.ts";
import { parseCbSupplementalSnapshot } from "../lib/market-data/bond-supplemental.ts";
import { parseBondMarketHistory } from "../lib/market-data/bond-market-history.ts";
import { parseBondWorkbenchSnapshot } from "../lib/market-data/bond-workbench.ts";
import { getApprovedResource } from "../lib/pipeline/source-registry.ts";
import {
  bondInputsFrom11406Rows,
  summarizeWorkbenchSourceStates,
  verifyIssuerResearchViewConsistency,
  verifySupplementalViewConsistency,
  verifyWorkbenchConsistency,
} from "./build-bond-market-snapshot.mjs";
import { bondTermSummariesFrom11406Rows } from "./lib/bond-inputs-from-11406.mjs";

const ROOT_FILES = new Set([
  ".nojekyll",
  "bonds.html",
  "emerging.html",
  "index.html",
  "ipo-radar.html",
  "ipo.html",
  "methodology.html",
]);
const ASSET_FILES = new Set([
  "app.css",
  "bond-candlestick-chart.js",
  "bond-detail-page.js",
  "bond-list-page.js",
  "bond-technical-analysis.js",
  "bonds-page.js",
  "emerging-page.js",
  "home-page.js",
  "ipo-data.js",
  "ipo-page.js",
  "ipo-radar-page.js",
  "ipo-stage-filter.js",
  "site-shell.js",
  "table-sort.js",
]);
const DATA_ROOT_FILES = new Set([
  "11406.json",
  "11586.json",
  "94025.json",
  "bond-market-history.json",
  "bond-market-view.json",
  "cb-quotes.json",
  "conversion-prices.json",
  "current.json",
  "manifest.json",
  "runtime.js",
  "stock-closes.json",
]);
const GENERATION_FILES = new Set([
  "11406.json",
  "11586.json",
  "94025.json",
  "bond-market-history.json",
  "bond-market-view.json",
  "bond-workbench.json",
  "bond-supplemental.json",
  "cb-issuer-research.json",
  "cb-quotes.json",
  "conversion-prices.json",
  "emerging-market.json",
  "ipo-events.json",
  "manifest.json",
  "runtime.json",
  "stock-closes.json",
]);
const BASE_DATASET_FILES = {
  "94025": "94025.json",
  "11406": "11406.json",
  "11586": "11586.json",
  bondMarket: "bond-market-view.json",
  conversionPrices: "conversion-prices.json",
  bondHistory: "bond-market-history.json",
};
const APPROVED_WORKBENCH_EVENT_SOURCE_URLS = new Map([
  ["11406", getApprovedResource("11406", "11406-csv").exactUrl],
  ["tpex-cb-institution-daily", getApprovedResource(
    "tpex-cb-institution-daily",
    "tpex-cb-institution-daily-json",
  ).exactUrl],
  ["tpex-cb-redemption-announcements", getApprovedResource(
    "tpex-cb-redemption-announcements",
    "tpex-cb-redemption-announcements-json",
  ).exactUrl],
  ["twsa-cb-underwriting-announcements", getApprovedResource(
    "twsa-cb-underwriting-announcements",
    "twsa-cb-underwriting-announcements-html",
  ).exactUrl],
]);

export async function stageStaticShowcase({
  source = "static-showcase",
  destination = "dist/client/market-site",
} = {}) {
  const pointer = await readJson(
    join(source, "data", "current.json"),
    "active generation pointer is missing or invalid",
  );
  if (!/^generations\/[a-f0-9]+$/i.test(pointer?.generation ?? "")) {
    throw new Error("active generation pointer is missing or invalid");
  }
  const expectedRuntimeUrl = `./data/${pointer.generation}/runtime.json`;
  if (pointer.runtimeUrl !== expectedRuntimeUrl) {
    throw new Error("active generation pointer is missing or invalid");
  }
  const runtime = await readJson(
    join(source, pointer.runtimeUrl.replace(/^\.\//, "")),
    "active generation runtime is missing or invalid",
  );
  if (
    runtime?.generation !== pointer.generation
    || runtime?.manifestUrl !== `./data/${pointer.generation}/manifest.json`
  ) {
    throw new Error(
      "active generation required dataset artifacts or runtime datasets are missing or invalid",
    );
  }
  const manifest = await readJson(
    join(source, runtime.manifestUrl.replace(/^\.\//, "")),
    "active generation manifest is missing or invalid",
  );
  if (manifest?.market?.status !== "verified" || !manifest?.market?.dataDate) {
    throw new Error("active generation manifest is missing or invalid");
  }
  const base = `./data/${pointer.generation}`;
  const declaresIssuerResearch = manifest.market.files?.some(
    (file) => file?.name === "cb-issuer-research.json",
  ) === true;
  const declaresSupplemental = manifest.market.files?.some(
    (file) => file?.name === "bond-supplemental.json",
  ) === true;
  const declaresWorkbench = manifest.market.files?.some(
    (file) => file?.name === "bond-workbench.json",
  ) === true;
  const expectedDatasets = expectedRuntimeDatasets(
    base,
    declaresIssuerResearch,
    declaresSupplemental,
    declaresWorkbench,
  );
  validateRuntime(runtime, pointer.generation, expectedDatasets);
  if (manifest.emergingMarketUrl !== `${base}/emerging-market.json`) {
    throw new Error("active generation required dataset artifacts are missing or invalid");
  }
  const requiredUrls = [runtime.emergingMarketUrl, ...Object.values(expectedDatasets)];
  if (runtime.ipoEventsUrl !== undefined) requiredUrls.push(runtime.ipoEventsUrl);
  for (const expectedUrl of requiredUrls) {
    await readJson(
      join(source, expectedUrl.replace(/^\.\//, "")),
      "active generation required dataset artifacts are missing or invalid",
    );
  }
  if (declaresIssuerResearch) {
    await verifyDeclaredIssuerResearch({ source, manifest, runtime, base });
  }
  if (declaresSupplemental) {
    await verifyDeclaredSupplemental({ source, manifest, runtime, base });
  }
  if (declaresWorkbench) {
    await verifyDeclaredWorkbench({ source, manifest, runtime, base });
  }
  const approvedFiles = await collectApprovedSourceFiles(source, pointer.generation);
  await rm(destination, { recursive: true, force: true });
  for (const relativePath of approvedFiles) {
    const target = join(destination, ...relativePath.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(source, ...relativePath.split("/")), target);
  }
}

function expectedRuntimeDatasets(
  base,
  declaresIssuerResearch,
  declaresSupplemental,
  declaresWorkbench,
) {
  return Object.fromEntries([
    ...Object.entries(BASE_DATASET_FILES).map(([key, name]) => [key, `${base}/${name}`]),
    ...(declaresIssuerResearch
      ? [["cbIssuerResearch", `${base}/cb-issuer-research.json`]]
      : []),
    ...(declaresSupplemental
      ? [["bondSupplemental", `${base}/bond-supplemental.json`]]
      : []),
    ...(declaresWorkbench
      ? [["bondWorkbench", `${base}/bond-workbench.json`]]
      : []),
  ]);
}

function validateRuntime(runtime, generation, expectedDatasets) {
  if (
    runtime === null
    || typeof runtime !== "object"
    || Array.isArray(runtime)
    || runtime.generation !== generation
    || runtime.manifestUrl !== `./data/${generation}/manifest.json`
    || runtime.emergingMarketUrl !== `./data/${generation}/emerging-market.json`
    || (
      runtime.ipoEventsUrl !== undefined
      && runtime.ipoEventsUrl !== `./data/${generation}/ipo-events.json`
    )
  ) {
    throw new Error(
      "active generation required dataset artifacts or runtime datasets are missing or invalid",
    );
  }
  const runtimeKeys = Object.keys(runtime).sort();
  const expectedRuntimeKeys = [
    "datasets",
    "emergingMarketUrl",
    "generation",
    "manifestUrl",
    ...(runtime.ipoEventsUrl === undefined ? [] : ["ipoEventsUrl"]),
  ].sort();
  if (!equalStringArrays(runtimeKeys, expectedRuntimeKeys)) {
    throw new Error("active generation runtime is missing or invalid");
  }
  if (
    runtime.datasets === null
    || typeof runtime.datasets !== "object"
    || Array.isArray(runtime.datasets)
    || !equalStringArrays(
      Object.keys(runtime.datasets).sort(),
      Object.keys(expectedDatasets).sort(),
    )
    || Object.entries(expectedDatasets).some(
      ([key, path]) => runtime.datasets[key] !== path,
    )
  ) {
    throw new Error(
      "active generation required dataset artifacts or runtime datasets are missing or invalid",
    );
  }
}

function equalStringArrays(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

async function collectApprovedSourceFiles(source, activeGeneration) {
  const files = [];
  await collectExactDirectory({
    absolutePath: source,
    relativePath: "",
    allowedFiles: ROOT_FILES,
    allowedDirectories: new Set(["assets", "data"]),
    files,
  });

  if (await directoryExists(join(source, "assets"))) {
    await collectExactDirectory({
      absolutePath: join(source, "assets"),
      relativePath: "assets",
      allowedFiles: ASSET_FILES,
      allowedDirectories: new Set(),
      files,
    });
  }
  await collectExactDirectory({
    absolutePath: join(source, "data"),
    relativePath: "data",
    allowedFiles: DATA_ROOT_FILES,
    allowedDirectories: new Set(["generations"]),
    files,
  });
  const generationsPath = join(source, "data", "generations");
  const generations = await readdir(generationsPath, { withFileTypes: true });
  for (const entry of generations) {
    if (!entry.isDirectory() || !/^[a-f0-9]+$/i.test(entry.name)) {
      throw new Error(`static showcase source path is not approved: data/generations/${entry.name}`);
    }
    const relativeGeneration = `data/generations/${entry.name}`;
    const generationFiles = await collectExactDirectory({
      absolutePath: join(generationsPath, entry.name),
      relativePath: relativeGeneration,
      allowedFiles: GENERATION_FILES,
      allowedDirectories: new Set(),
      files,
    });
    const hasResearch = generationFiles.has("cb-issuer-research.json");
    const hasSupplemental = generationFiles.has("bond-supplemental.json");
    const hasWorkbench = generationFiles.has("bond-workbench.json");
    const manifestPath = join(generationsPath, entry.name, "manifest.json");
    const manifest = await readOptionalJson(manifestPath);
    const declaresResearch = manifest?.market?.files?.some(
      (file) => file?.name === "cb-issuer-research.json",
    ) === true;
    const declaresSupplemental = manifest?.market?.files?.some(
      (file) => file?.name === "bond-supplemental.json",
    ) === true;
    const declaresWorkbench = manifest?.market?.files?.some(
      (file) => file?.name === "bond-workbench.json",
    ) === true;
    if (hasResearch !== declaresResearch) {
      throw new Error(`static showcase source path is not approved: ${relativeGeneration}/cb-issuer-research.json`);
    }
    if (hasSupplemental !== declaresSupplemental) {
      throw new Error(`static showcase source path is not approved: ${relativeGeneration}/bond-supplemental.json`);
    }
    if (hasWorkbench !== declaresWorkbench) {
      throw new Error(`static showcase source path is not approved: ${relativeGeneration}/bond-workbench.json`);
    }
    const runtimePath = join(generationsPath, entry.name, "runtime.json");
    const runtime = await readOptionalJson(runtimePath);
    if (runtime !== undefined) {
      const generation = `generations/${entry.name}`;
      validateRuntime(
        runtime,
        generation,
        expectedRuntimeDatasets(
          `./data/${generation}`,
          declaresResearch,
          declaresSupplemental,
          declaresWorkbench,
        ),
      );
      if (declaresResearch && generation !== activeGeneration) {
        await verifyDeclaredIssuerResearch({
          source,
          manifest,
          runtime,
          base: `./data/${generation}`,
        });
      }
      if (declaresSupplemental && generation !== activeGeneration) {
        await verifyDeclaredSupplemental({
          source,
          manifest,
          runtime,
          base: `./data/${generation}`,
        });
      }
      if (declaresWorkbench && generation !== activeGeneration) {
        await verifyDeclaredWorkbench({
          source,
          manifest,
          runtime,
          base: `./data/${generation}`,
        });
      }
    } else if (declaresResearch || declaresSupplemental || declaresWorkbench) {
      throw new Error(`static showcase source path is not approved: ${relativeGeneration}/runtime.json`);
    }
  }
  return files.sort();
}

async function collectExactDirectory({
  absolutePath,
  relativePath,
  allowedFiles,
  allowedDirectories,
  files,
}) {
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const localFiles = new Set();
  for (const entry of entries) {
    const path = relativePath === "" ? entry.name : `${relativePath}/${entry.name}`;
    if (entry.isFile() && allowedFiles.has(entry.name)) {
      files.push(path);
      localFiles.add(entry.name);
      continue;
    }
    if (entry.isDirectory() && allowedDirectories.has(entry.name)) continue;
    throw new Error(`static showcase source path is not approved: ${path}`);
  }
  return localFiles;
}

async function directoryExists(path) {
  try {
    return (await readdir(path)).length >= 0;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw new Error(`static showcase source path is not approved: ${path}`);
  }
}

async function verifyDeclaredIssuerResearch({ source, manifest, runtime, base }) {
  const issuerEntries = manifest.market.files.filter(
    (file) => file?.name === "cb-issuer-research.json",
  );
  const viewEntries = manifest.market.files.filter(
    (file) => file?.name === "bond-market-view.json",
  );
  if (issuerEntries.length !== 1 || viewEntries.length !== 1) {
    throw new Error("active generation issuer research manifest is invalid");
  }
  const issuerEntry = validateFileEntry(issuerEntries[0], "cb-issuer-research.json");
  const viewEntry = validateFileEntry(viewEntries[0], "bond-market-view.json");
  const researchText = await readFile(
    join(source, `${base}/cb-issuer-research.json`.replace(/^\.\//, "")),
    "utf8",
  );
  const viewsText = await readFile(
    join(source, `${base}/bond-market-view.json`.replace(/^\.\//, "")),
    "utf8",
  );
  if (
    sha256Text(researchText) !== issuerEntry.sha256
    || sha256Text(viewsText) !== viewEntry.sha256
  ) {
    throw new Error("active generation issuer research hash is invalid");
  }
  const snapshot = parseCbIssuerResearchSnapshot(JSON.parse(researchText));
  const views = JSON.parse(viewsText);
  if (
    snapshot.records.length !== issuerEntry.recordCount
    || !Array.isArray(views)
    || views.length !== viewEntry.recordCount
    || runtime.datasets?.cbIssuerResearch !== `${base}/cb-issuer-research.json`
  ) {
    throw new Error("active generation issuer research artifact is invalid");
  }
  verifyIssuerResearchViewConsistency(snapshot, views);
}

async function verifyDeclaredSupplemental({ source, manifest, runtime, base }) {
  const supplementalEntries = manifest.market.files.filter(
    (file) => file?.name === "bond-supplemental.json",
  );
  const viewEntries = manifest.market.files.filter(
    (file) => file?.name === "bond-market-view.json",
  );
  if (supplementalEntries.length !== 1 || viewEntries.length !== 1) {
    throw new Error("active generation CB supplemental manifest is invalid");
  }
  const supplementalEntry = validateFileEntry(
    supplementalEntries[0],
    "bond-supplemental.json",
    "CB supplemental",
  );
  const viewEntry = validateFileEntry(
    viewEntries[0],
    "bond-market-view.json",
    "CB supplemental",
  );
  const supplementalText = await readFile(
    join(source, `${base}/bond-supplemental.json`.replace(/^\.\//, "")),
    "utf8",
  );
  const viewsText = await readFile(
    join(source, `${base}/bond-market-view.json`.replace(/^\.\//, "")),
    "utf8",
  );
  if (
    sha256Text(supplementalText) !== supplementalEntry.sha256
    || sha256Text(viewsText) !== viewEntry.sha256
  ) {
    throw new Error("active generation CB supplemental hash is invalid");
  }
  const snapshot = parseCbSupplementalSnapshot(JSON.parse(supplementalText));
  const views = JSON.parse(viewsText);
  if (
    countSupplementalRecords(snapshot) !== supplementalEntry.recordCount
    || !Array.isArray(views)
    || views.length !== viewEntry.recordCount
    || runtime.datasets?.bondSupplemental !== `${base}/bond-supplemental.json`
    || !equalJson(manifest.market.supplementalSources, snapshot.sources)
  ) {
    throw new Error("active generation CB supplemental artifact is invalid");
  }
  const bondInputs = bondInputsFrom11406Rows(await readJson(
    join(source, `${base}/11406.json`.replace(/^\.\//, "")),
    "active generation CB supplemental issuance evidence is invalid",
  ));
  verifySupplementalViewConsistency(
    snapshot,
    views,
    manifest.market.requestedDate,
    bondInputs,
  );
}

async function verifyDeclaredWorkbench({ source, manifest, runtime, base }) {
  const workbenchEntries = manifest.market.files.filter(
    (file) => file?.name === "bond-workbench.json",
  );
  const viewEntries = manifest.market.files.filter(
    (file) => file?.name === "bond-market-view.json",
  );
  const issuerEntries = manifest.market.files.filter(
    (file) => file?.name === "cb-issuer-research.json",
  );
  const supplementalEntries = manifest.market.files.filter(
    (file) => file?.name === "bond-supplemental.json",
  );
  const historyEntries = manifest.market.files.filter(
    (file) => file?.name === "bond-market-history.json",
  );
  const issuanceEntries = manifest.market.files.filter(
    (file) => file?.name === "11406.json",
  );
  if (
    workbenchEntries.length !== 1
    || viewEntries.length !== 1
    || issuerEntries.length !== 1
    || supplementalEntries.length !== 1
    || historyEntries.length !== 1
    || issuanceEntries.length > 1
  ) {
    throw new Error("active generation bond workbench manifest is invalid");
  }
  const entry = validateWorkbenchFileEntry(workbenchEntries[0]);
  const workbenchText = await readFile(
    join(source, `${base}/bond-workbench.json`.replace(/^\.\//, "")),
    "utf8",
  );
  if (
    sha256Text(workbenchText) !== entry.sha256
    || Buffer.byteLength(workbenchText, "utf8") !== entry.rawBytes
  ) {
    throw new Error("active generation bond workbench hash is invalid");
  }
  const workbench = parseBondWorkbenchSnapshot(JSON.parse(workbenchText));
  assertApprovedWorkbenchEventSources(workbench);
  if (
    workbench.records.length !== entry.recordCount
    || workbench.schemaVersion !== entry.schemaVersion
    || runtime.datasets?.bondWorkbench !== `${base}/bond-workbench.json`
    || !equalJson(entry.sourceStateSummary, manifest.market.workbenchSourceStateSummary)
    || !equalJson(
      entry.sourceStateSummary,
      summarizeWorkbenchSourceStates(workbench),
    )
  ) {
    throw new Error("active generation bond workbench artifact is invalid");
  }
  const historyText = await readFile(
    join(source, `${base}/bond-market-history.json`.replace(/^\.\//, "")),
    "utf8",
  );
  const history = parseBondMarketHistory(JSON.parse(historyText));
  verifyMarketEvidenceEntry(
    historyEntries[0],
    "bond-market-history.json",
    historyText,
    history.length,
  );
  const issuanceText = await readFile(
    join(source, `${base}/11406.json`.replace(/^\.\//, "")),
    "utf8",
  );
  const issuanceRows = JSON.parse(issuanceText);
  if (!Array.isArray(issuanceRows)) {
    throw new Error("active generation 11406 artifact is invalid");
  }
  if (issuanceEntries.length === 1) {
    verifyMarketEvidenceEntry(
      issuanceEntries[0],
      "11406.json",
      issuanceText,
      issuanceRows.length,
    );
  } else {
    const normalizedIssuanceEntries = Array.isArray(manifest.market.normalizedInputs)
      ? manifest.market.normalizedInputs.filter((entry) => entry?.name === "11406.json")
      : [];
    if (normalizedIssuanceEntries.length !== 1) {
      throw new Error("active generation normalized 11406 integrity record is invalid");
    }
    verifyMarketEvidenceEntry(
      normalizedIssuanceEntries[0],
      "11406.json",
      issuanceText,
      issuanceRows.length,
    );
    verifyOfficialDatasetEvidence(
      manifest.datasets,
      "11406",
      APPROVED_WORKBENCH_EVENT_SOURCE_URLS.get("11406"),
      issuanceRows.length,
    );
  }
  const views = await readJson(
    join(source, `${base}/bond-market-view.json`.replace(/^\.\//, "")),
    "active generation bond workbench views are invalid",
  );
  const supplemental = parseCbSupplementalSnapshot(await readJson(
    join(source, `${base}/bond-supplemental.json`.replace(/^\.\//, "")),
    "active generation bond workbench supplemental is invalid",
  ));
  const issuerResearch = parseCbIssuerResearchSnapshot(await readJson(
    join(source, `${base}/cb-issuer-research.json`.replace(/^\.\//, "")),
    "active generation bond workbench issuer research is invalid",
  ));
  const terms = bondTermSummariesFrom11406Rows(issuanceRows).map((term) => ({
    ...term,
    unitFaceValueTwd: supplemental.unitFaceValueTwd,
  }));
  verifyWorkbenchConsistency({
    workbench,
    terms,
    views,
    history,
    supplemental,
    issuerResearch,
    requestedDate: manifest.market.requestedDate,
    dataDate: manifest.market.dataDate,
    sourceStateSummary: manifest.market.workbenchSourceStateSummary,
  });
}

export function assertApprovedWorkbenchEventSources(workbench) {
  for (const record of workbench.records) {
    for (const event of record.events) {
      const approvedUrl = APPROVED_WORKBENCH_EVENT_SOURCE_URLS.get(event.sourceId);
      if (
        approvedUrl === undefined
        || (event.sourceUrl !== null && event.sourceUrl !== approvedUrl)
      ) {
        throw new Error("active generation workbench event approved source URL is invalid");
      }
    }
  }
}

function verifyMarketEvidenceEntry(entry, name, text, recordCount) {
  if (
    entry === null
    || typeof entry !== "object"
    || Array.isArray(entry)
    || !equalStringArrays(Object.keys(entry).sort(), [
      "name",
      "rawBytes",
      "recordCount",
      "sha256",
    ].sort())
    || entry.name !== name
    || !/^sha256:[0-9a-f]{64}$/.test(entry.sha256 ?? "")
    || !Number.isInteger(entry.rawBytes)
    || entry.rawBytes <= 0
    || !Number.isInteger(entry.recordCount)
    || entry.recordCount < 0
    || entry.sha256 !== sha256Text(text)
    || entry.rawBytes !== Buffer.byteLength(text, "utf8")
    || entry.recordCount !== recordCount
  ) {
    throw new Error(`active generation ${name} manifest integrity is invalid`);
  }
}

function verifyOfficialDatasetEvidence(
  datasets,
  datasetId,
  sourceUrl,
  recordCount,
) {
  const entries = Array.isArray(datasets)
    ? datasets.filter((entry) => entry?.datasetId === datasetId)
    : [];
  const entry = entries[0];
  if (
    entries.length !== 1
    || entry === null
    || typeof entry !== "object"
    || Array.isArray(entry)
    || !equalStringArrays(Object.keys(entry).sort(), [
      "datasetId",
      "downloadedAt",
      "rawBytes",
      "rowCount",
      "sha256",
      "sourceUrl",
    ].sort())
    || entry.sourceUrl !== sourceUrl
    || typeof entry.downloadedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(entry.downloadedAt)
    || !/^sha256:[0-9a-f]{64}$/.test(entry.sha256 ?? "")
    || !Number.isInteger(entry.rawBytes)
    || entry.rawBytes <= 0
    || !Number.isInteger(entry.rowCount)
    || entry.rowCount !== recordCount
  ) {
    throw new Error(`active generation ${datasetId} official dataset evidence is invalid`);
  }
}

function validateWorkbenchFileEntry(entry) {
  if (
    entry === null
    || typeof entry !== "object"
    || Array.isArray(entry)
    || !equalStringArrays(Object.keys(entry).sort(), [
      "name",
      "rawBytes",
      "recordCount",
      "schemaVersion",
      "sha256",
      "sourceStateSummary",
    ].sort())
    || entry.name !== "bond-workbench.json"
    || !/^sha256:[0-9a-f]{64}$/.test(entry.sha256 ?? "")
    || !Number.isInteger(entry.rawBytes)
    || entry.rawBytes <= 0
    || !Number.isInteger(entry.recordCount)
    || entry.recordCount < 0
    || entry.schemaVersion !== 1
    || entry.sourceStateSummary === null
    || typeof entry.sourceStateSummary !== "object"
    || Array.isArray(entry.sourceStateSummary)
  ) {
    throw new Error("active generation bond workbench manifest is invalid");
  }
  return entry;
}

function validateFileEntry(entry, expectedName, label = "issuer research") {
  if (
    entry?.name !== expectedName
    || !/^sha256:[0-9a-f]{64}$/.test(entry.sha256 ?? "")
    || !Number.isInteger(entry.recordCount)
    || entry.recordCount < 0
  ) {
    throw new Error(`active generation ${label} manifest is invalid`);
  }
  return entry;
}

function countSupplementalRecords(snapshot) {
  return Object.values(snapshot.institutionHistory)
    .reduce((count, records) => count + records.length, 0)
    + snapshot.redemptions.length
    + snapshot.underwritingCases.length;
}

function equalJson(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => equalJson(value, right[index]));
  }
  if (
    left === null
    || right === null
    || typeof left !== "object"
    || typeof right !== "object"
  ) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return equalStringArrays(leftKeys, rightKeys)
    && leftKeys.every((key) => equalJson(left[key], right[key]));
}

function sha256Text(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

async function readJson(path, message) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(message);
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entryUrl === import.meta.url) {
  await stageStaticShowcase({
    source: process.argv[2],
    destination: process.argv[3],
  });
}
