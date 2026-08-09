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
import { verifyIssuerResearchViewConsistency } from "./build-bond-market-snapshot.mjs";

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
  "bonds-page.js",
  "emerging-page.js",
  "home-page.js",
  "ipo-data.js",
  "ipo-page.js",
  "ipo-radar-page.js",
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
  const expectedDatasets = expectedRuntimeDatasets(base, declaresIssuerResearch);
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
  const approvedFiles = await collectApprovedSourceFiles(source, pointer.generation);
  await rm(destination, { recursive: true, force: true });
  for (const relativePath of approvedFiles) {
    const target = join(destination, ...relativePath.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(source, ...relativePath.split("/")), target);
  }
}

function expectedRuntimeDatasets(base, declaresIssuerResearch) {
  return Object.fromEntries([
    ...Object.entries(BASE_DATASET_FILES).map(([key, name]) => [key, `${base}/${name}`]),
    ...(declaresIssuerResearch
      ? [["cbIssuerResearch", `${base}/cb-issuer-research.json`]]
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
    const manifestPath = join(generationsPath, entry.name, "manifest.json");
    const manifest = await readOptionalJson(manifestPath);
    const declaresResearch = manifest?.market?.files?.some(
      (file) => file?.name === "cb-issuer-research.json",
    ) === true;
    if (hasResearch !== declaresResearch) {
      throw new Error(`static showcase source path is not approved: ${relativeGeneration}/cb-issuer-research.json`);
    }
    const runtimePath = join(generationsPath, entry.name, "runtime.json");
    const runtime = await readOptionalJson(runtimePath);
    if (runtime !== undefined) {
      const generation = `generations/${entry.name}`;
      validateRuntime(
        runtime,
        generation,
        expectedRuntimeDatasets(`./data/${generation}`, declaresResearch),
      );
      if (declaresResearch && generation !== activeGeneration) {
        await verifyDeclaredIssuerResearch({
          source,
          manifest,
          runtime,
          base: `./data/${generation}`,
        });
      }
    } else if (declaresResearch) {
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

function validateFileEntry(entry, expectedName) {
  if (
    entry?.name !== expectedName
    || !/^sha256:[0-9a-f]{64}$/.test(entry.sha256 ?? "")
    || !Number.isInteger(entry.recordCount)
    || entry.recordCount < 0
  ) {
    throw new Error("active generation issuer research manifest is invalid");
  }
  return entry;
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
