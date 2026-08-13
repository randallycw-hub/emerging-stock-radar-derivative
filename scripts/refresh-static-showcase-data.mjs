import { createHash } from "node:crypto";
import {
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { types } from "node:util";

import { isIsoDate } from "../lib/domain/dates.ts";
import { EmergingMarketViewSchema } from "../lib/domain/schema.ts";
import { buildEmergingMarketViews } from "../lib/market-data/emerging-market-view.ts";
import { parseCbSupplementalSnapshot } from "../lib/market-data/bond-supplemental.ts";
import { parseCbIssuerResearchSnapshot } from "../lib/market-data/cb-issuer-research.ts";
import { parseCsv } from "../lib/source-verification/csv.ts";
import { parseEmergingMarketSource } from "../lib/source-verification/source-emerging-market.ts";
import { normalize94025Row, parse94025Csv } from "../lib/source-verification/source-94025.ts";
import {
  bondInputsFrom11406Rows,
  buildBondMarketSnapshot,
  verifyIssuerResearchViewConsistency,
  verifySupplementalViewConsistency,
} from "./build-bond-market-snapshot.mjs";
import { fetchCurrentOfficialMarketData } from "./lib/official-market-fetch.mjs";
import { buildStaticIpoSnapshot } from "./static-ipo-fallback.mjs";

export const OFFICIAL_SHOWCASE_SOURCES = {
  "94025": "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv",
  "11406": "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
  "11586":
    "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
  emergingMarket:
    "https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics",
};

const DATA_DIRECTORY = "static-showcase/data";

export function buildRuntimeBootstrap() {
  return [
    "window.__OFFICIAL_SHOWCASE__ = ",
    JSON.stringify({
      generationPointerUrl: "./data/current.json",
    }),
    ";\n",
  ].join("");
}

export function buildGenerationRuntime(generation, manifest) {
  const base = `./data/${generation}`;
  const declaresIssuerResearch = manifest?.market?.files?.some(
    (file) => file?.name === "cb-issuer-research.json",
  ) === true;
  const declaresBondSupplemental = manifest?.market?.files?.some(
    (file) => file?.name === "bond-supplemental.json",
  ) === true;
  return {
    generation,
    manifestUrl: `${base}/manifest.json`,
    emergingMarketUrl: `${base}/emerging-market.json`,
    ipoEventsUrl: `${base}/ipo-events.json`,
    datasets: {
      "94025": `${base}/94025.json`, "11406": `${base}/11406.json`, "11586": `${base}/11586.json`,
      bondMarket: `${base}/bond-market-view.json`, conversionPrices: `${base}/conversion-prices.json`, bondHistory: `${base}/bond-market-history.json`,
      ...(declaresIssuerResearch
        ? { cbIssuerResearch: `${base}/cb-issuer-research.json` }
        : {}),
      ...(declaresBondSupplemental
        ? { bondSupplemental: `${base}/bond-supplemental.json` }
        : {}),
    },
  };
}

export function updateRuntimeCacheKey(html, cacheKey) {
  const marker = /runtime\.js\?v=[^"]+/;
  if (!marker.test(html)) {
    throw new Error("runtime cache key marker not found");
  }
  return html.replace(marker, `runtime.js?v=${cacheKey}`);
}

export async function fetchOfficialCsvWithRetry(
  url,
  fetchImpl = fetch,
  {
    maxAttempts = 5,
    sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let retryDelayMs = 250;
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "text/csv, application/json, application/octet-stream" },
        redirect: "error",
      });
      if (!response.ok) {
        const retryable = [408, 425, 429].includes(response.status)
          || response.status >= 500 && response.status <= 599;
        if (!retryable || attempt === maxAttempts) {
          return {
            ok: false,
            status: response.status,
            bytes: new Uint8Array(),
          };
        }
        lastError = new Error(`HTTP_${response.status}`);
      } else {
        return {
          ok: true,
          status: response.status,
          bytes: new Uint8Array(await response.arrayBuffer()),
        };
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) throw error;
      retryDelayMs = 2_000;
    }
    await sleep(retryDelayMs * 2 ** (attempt - 1));
  }
  throw lastError ?? new Error("official CSV request failed");
}

export async function openMarketCheckpoint({
  date,
  directory = ".cache/official-market",
} = {}) {
  if (!isIsoDate(date)) throw new TypeError("checkpoint date must be ISO");
  await mkdir(directory, { recursive: true });
  const path = `${directory}/${date}.jsonl`;
  const checkpoint = {
    schemaVersion: 1,
    date,
    cbQuotesByBondCode: {},
    conversionPricesByBondCode: {},
  };
  const lines = await readFile(path, "utf8")
    .then((text) => text.split("\n").filter(Boolean))
    .catch(() => []);
  const records = lines.flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  const validHeader = (
    records[0]?.schemaVersion === 1
    && records[0]?.date === date
  );
  if (!validHeader) {
    await writeFile(
      path,
      `${JSON.stringify({ schemaVersion: 1, date })}\n`,
      "utf8",
    );
  } else {
    for (const record of records.slice(1)) {
      if (
        ["cbQuotesByBondCode", "conversionPricesByBondCode"]
          .includes(record?.kind)
        && /^\d{5,6}$/.test(record?.key)
      ) {
        checkpoint[record.kind][record.key] = record.value;
      }
    }
  }

  return {
    path,
    checkpoint,
    onCheckpoint: async ({ kind, key, value }) => {
      if (
        !["cbQuotesByBondCode", "conversionPricesByBondCode"].includes(kind)
        || !/^\d{5,6}$/.test(key)
      ) {
        throw new TypeError("invalid market checkpoint entry");
      }
      checkpoint[kind][key] = value;
      await appendFile(
        path,
        `${JSON.stringify({ kind, key, value })}\n`,
        "utf8",
      );
    },
  };
}

export async function refreshStaticShowcase(options = {}) {
  assertPublicOptions(options, ["fetchImpl", "now"], "refreshStaticShowcase");
  const {
    fetchImpl = fetch,
    now = new Date(),
  } = options;
  const paths = createRefreshPathBundle(process.cwd());
  return refreshStaticShowcaseCandidate({
    fetchImpl,
    now,
    marketBuilder: buildBondMarketSnapshot,
    paths,
  });
}

async function refreshStaticShowcaseCandidate({ fetchImpl, now, marketBuilder, paths }) {
  const previousSupplemental = await readPublishedCbSupplemental(
    paths.dataDirectory,
  );
  const previousIssuerResearch = await readPublishedCbIssuerResearch(
    paths.dataDirectory,
  );
  const datasets = {};
  const datasetTexts = {};
  const manifestDatasets = [];
  const tpexIpoApplicationSnapshot = await readFile(
    paths.tpexIpoApplicationSnapshotPath,
    "utf8",
  )
    .then((text) => JSON.parse(text))
    .catch(() => []);

  for (const [datasetId, sourceUrl] of Object.entries(OFFICIAL_SHOWCASE_SOURCES)) {
    if (datasetId === "emergingMarket") continue;
    const response = await fetchOfficialCsvWithRetry(sourceUrl, fetchImpl);
    if (!response.ok) {
      throw new Error(`${datasetId}: HTTP_${response.status}`);
    }

    const bytes = response.bytes;
    if (bytes.byteLength === 0 || bytes.byteLength > 8_000_000) {
      throw new Error(`${datasetId}: invalid response size`);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const rows = parseCsv(text);
    datasets[datasetId] = rows;
    datasetTexts[datasetId] = text;

    manifestDatasets.push({
      datasetId,
      sourceUrl,
      downloadedAt: taipeiDate(now),
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      rawBytes: bytes.byteLength,
      rowCount: rows.length,
    });
  }

  const emergingResponse = await fetchOfficialCsvWithRetry(
    OFFICIAL_SHOWCASE_SOURCES.emergingMarket,
    fetchImpl,
  );
  if (!emergingResponse.ok) {
    throw new Error(`emergingMarket: HTTP_${emergingResponse.status}`);
  }
  if (
    emergingResponse.bytes.byteLength === 0
    || emergingResponse.bytes.byteLength > 8_000_000
  ) {
    throw new Error("emergingMarket: invalid response size");
  }
  const emergingText = new TextDecoder("utf-8", { fatal: true }).decode(
    emergingResponse.bytes,
  );
  const marketRows = parseEmergingMarketSource(JSON.parse(emergingText));
  const companyRows = newest94025CompanyRows(datasetTexts["94025"]);
  const emergingSnapshot = buildEmergingMarketSnapshot({ marketRows, companyRows });
  manifestDatasets.push({
    datasetId: "emergingMarket",
    sourceUrl: OFFICIAL_SHOWCASE_SOURCES.emergingMarket,
    downloadedAt: taipeiDate(now),
    sha256: `sha256:${createHash("sha256").update(emergingResponse.bytes).digest("hex")}`,
    rawBytes: emergingResponse.bytes.byteLength,
    rowCount: marketRows.length,
  });

  const generation = `generations/${createHash("sha256").update(JSON.stringify(manifestDatasets)).update(now.toISOString()).digest("hex").slice(0, 16)}`;
  const baseManifest = {
    kind: "official-source-snapshot",
    status: "official-static-snapshot",
    generatedAt: taipeiDate(now),
    datasets: manifestDatasets,
    emergingMarketUrl: `./data/${generation}/emerging-market.json`,
  };

  const stagingRoot = await mkdtemp(join(dirname(paths.dataDirectory), ".showcase-"));
  const stagingDataDirectory = join(stagingRoot, "data");
  try {
    await mkdir(stagingDataDirectory, { recursive: true });
    const previousHistory = await readPublishedBondHistory(
      paths.dataDirectory,
      paths.publishedHistoryCachePath,
    );
    await writeFile(
      join(stagingDataDirectory, "bond-market-history.json"),
      `${JSON.stringify(previousHistory, null, 2)}\n`,
      "utf8",
    );
    if (previousSupplemental !== undefined) {
      await writeFile(
        join(stagingDataDirectory, "bond-supplemental.json"),
        `${JSON.stringify(previousSupplemental, null, 2)}\n`,
        "utf8",
      );
    }

    for (const [datasetId, rows] of Object.entries(datasets)) {
      await writeFile(
        join(stagingDataDirectory, `${datasetId}.json`),
        `${JSON.stringify(rows)}\n`,
        "utf8",
      );
    }
    await writeFile(
      join(stagingDataDirectory, "emerging-market.json"),
      `${JSON.stringify(emergingSnapshot, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(stagingDataDirectory, "ipo-events.json"),
      `${JSON.stringify(buildStaticIpoSnapshot({
        twseRows: datasets["11586"],
        tpexRows: tpexIpoApplicationSnapshot,
        dataDate: emergingSnapshot.tradingDate,
        generatedAt: now.toISOString(),
      }), null, 2)}\n`,
      "utf8",
    );

    const marketResult = await marketBuilder({
      outputDir: stagingDataDirectory,
      bonds: bondInputsFrom11406Rows(datasets["11406"]),
      asOfDate: emergingSnapshot.tradingDate,
      collectImpl: async (options) => {
        const store = await openMarketCheckpoint({
          date: options.date,
          directory: paths.marketCheckpointDirectory,
        });
        return fetchCurrentOfficialMarketData({
          ...options,
          fetchImpl,
          checkpoint: store.checkpoint,
          onCheckpoint: store.onCheckpoint,
        });
      },
      now: () => now,
      manifestBase: baseManifest,
      previousIssuerResearch,
    });
    const manifest = marketResult.manifest;
    await writeFile(
      join(stagingDataDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(stagingDataDirectory, "runtime.json"),
      `${JSON.stringify(buildGenerationRuntime(generation, manifest), null, 2)}\n`,
      "utf8",
    );
    await verifyStagedGeneration(stagingDataDirectory);
    await mkdir(dirname(paths.publishedHistoryCachePath), { recursive: true });
    await copyFile(
      join(stagingDataDirectory, "bond-market-history.json"),
      paths.publishedHistoryCachePath,
    );

    await mkdir(join(paths.dataDirectory, "generations"), { recursive: true });
    await rename(stagingDataDirectory, join(paths.dataDirectory, generation));
    const pointerStage = join(stagingRoot, "current.json");
    await writeFile(pointerStage, `${JSON.stringify({ schemaVersion: 1, generation, runtimeUrl: `./data/${generation}/runtime.json` })}\n`, "utf8");
    await rename(pointerStage, join(paths.dataDirectory, "current.json"));

    return {
      manifest,
      rowCounts: {
        ...Object.fromEntries(
          Object.entries(datasets).map(([datasetId, rows]) => [datasetId, rows.length]),
        ),
        emergingMarket: emergingSnapshot.records.length,
      },
      market: marketResult.report,
    };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

export async function runIsolatedRefreshStaticShowcaseTestHarness(options = {}) {
  const {
    scenario,
    now: nowText = "2026-07-30T06:00:06.000Z",
  } = parseIsolatedHarnessOptions(options);
  if (!new Set([
    "success",
    "hash",
    "manifest",
    "cross-file",
    "supplemental",
    "supplemental-view",
  ]).has(scenario)) {
    throw new TypeError(
      "isolated refresh scenario must be one of success, hash, manifest, cross-file, supplemental, supplemental-view",
    );
  }
  if (
    typeof nowText !== "string"
    || !Number.isFinite(Date.parse(nowText))
    || new Date(nowText).toISOString() !== nowText
  ) {
    throw new TypeError("isolated refresh now must be a canonical ISO timestamp string");
  }

  const fixtureTexts = await loadIsolatedHarnessFixtures();
  const now = new Date(nowText);
  const root = await mkdtemp(join(tmpdir(), "isolated-showcase-refresh-"));
  const paths = createRefreshPathBundle(root);
  const observations = {
    requestedUrls: [],
    activeRequests: 0,
    maximumConcurrency: 0,
    marketAsOfDate: null,
  };
  try {
    await seedIsolatedHarnessRoot(paths);
    const before = await captureIsolatedArtifacts(paths);
    let status = "fulfilled";
    let value;
    let error;
    try {
      value = await refreshStaticShowcaseCandidate({
        fetchImpl: async (url) => {
          observations.requestedUrls.push(String(url));
          observations.activeRequests += 1;
          observations.maximumConcurrency = Math.max(
            observations.maximumConcurrency,
            observations.activeRequests,
          );
          try {
            const datasetId = Object.entries(OFFICIAL_SHOWCASE_SOURCES)
              .find(([, sourceUrl]) => sourceUrl === String(url))?.[0];
            if (datasetId === undefined) {
              throw new TypeError("isolated harness received an unknown source URL");
            }
            return new Response(fixtureTexts[datasetId], { status: 200 });
          } finally {
            observations.activeRequests -= 1;
          }
        },
        now,
        paths,
        marketBuilder: async ({ outputDir, manifestBase, asOfDate }) => {
          observations.marketAsOfDate = asOfDate;
          return buildIsolatedMarketCandidate({
            outputDir,
            manifestBase,
            generatedAt: nowText,
            scenario,
          });
        },
      });
    } catch (caught) {
      status = "rejected";
      error = caught;
    }
    const after = await captureIsolatedArtifacts(paths);
    return {
      status,
      ...(status === "fulfilled" ? { value } : { error }),
      observations: {
        requestedUrls: [...observations.requestedUrls],
        maximumConcurrency: observations.maximumConcurrency,
        marketAsOfDate: observations.marketAsOfDate,
      },
      artifacts: {
        before,
        after,
        active: await captureActiveGeneration(paths, after.pointerText),
      },
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function createRefreshPathBundle(workspaceRoot) {
  const absoluteRoot = resolve(workspaceRoot);
  return Object.freeze({
    dataDirectory: join(absoluteRoot, "static-showcase", "data"),
    staticIndexPath: join(absoluteRoot, "static-showcase", "index.html"),
    tpexIpoApplicationSnapshotPath: join(
      absoluteRoot,
      "lib",
      "tpex-applicant-snapshot.json",
    ),
    publishedHistoryCachePath: join(
      absoluteRoot,
      ".cache",
      "published-history",
      "bond-market-history.json",
    ),
    marketCheckpointDirectory: join(absoluteRoot, ".cache", "official-market"),
  });
}

function parseIsolatedHarnessOptions(value) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || types.isProxy(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) {
    throw new TypeError("isolated refresh options must be a plain data object");
  }
  const output = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !["scenario", "now"].includes(key)) {
      throw new TypeError(
        `${String(key)} is not supported by runIsolatedRefreshStaticShowcaseTestHarness`,
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new TypeError("isolated refresh options must use plain data properties");
    }
    output[key] = descriptor.value;
  }
  return output;
}

async function loadIsolatedHarnessFixtures() {
  const bondRows = await readFile(new URL(
    "../tests/fixtures/source-verification/11406/csv-minimal.csv",
    import.meta.url,
  ), "utf8");
  return {
    "94025": await readFile(new URL(
      "../tests/fixtures/source-verification/94025/csv-minimal.csv",
      import.meta.url,
    ), "utf8"),
    "11406": bondRows
      .split(/\r?\n/)
      .filter((line, index) => index === 0 || line.includes('"35221"'))
      .join("\n"),
    "11586": "companyCode\n1260\n",
    emergingMarket: await readFile(new URL(
      "../tests/fixtures/source-verification/emerging-market/tpex-esb-latest-statistics.json",
      import.meta.url,
    ), "utf8"),
  };
}

async function buildIsolatedMarketCandidate({
  outputDir,
  manifestBase,
  generatedAt,
  scenario,
}) {
  const snapshot = isolatedIssuerResearchSnapshot(generatedAt);
  const compact = {
    market: "listed",
    industryName: "食品工業",
    revenueMonth: "2026-06",
    sourcePublishedOn: "2026-07-17",
    revenueUnit: "仟元",
    currentMonthRevenue: "100",
    monthOverMonthPercent: "1",
    yearOverYearPercent: "2",
    cumulativeRevenue: "600",
    cumulativeYearOverYearPercent: "3",
  };
  const researchText = `${JSON.stringify(snapshot, null, 2)}\n`;
  const supplemental = isolatedSupplementalSnapshot(generatedAt);
  const supplementalText = `${JSON.stringify(supplemental, null, 2)}\n`;
  const viewsText = `${JSON.stringify([{
    bondCode: "35221",
    issuerCode: "1260",
    issuerResearch: scenario === "cross-file" ? null : compact,
    cbTradeUnits: "0",
    cbPriceDate: null,
    outstandingAmount: "123100000",
    outstandingDataDate: "2026-07-23",
    remainingUnits: null,
    remainingRatio: scenario === "supplemental-view" ? "82.08" : "82.07",
    dailyTurnoverRate: null,
    institutionDataDate: null,
    institutionNetUnits: null,
    institutionNet5dUnits: null,
    institutionNet20dUnits: null,
    redemptionEvent: null,
    missingReasons: [
      "NO_VERIFIED_FACE_VALUE",
      "BALANCE_TRADE_DATE_MISMATCH",
    ],
    dataQuality: "date_mismatch",
  }], null, 2)}\n`;
  await writeFile(join(outputDir, "cb-issuer-research.json"), researchText, "utf8");
  await writeFile(join(outputDir, "bond-supplemental.json"), supplementalText, "utf8");
  await writeFile(join(outputDir, "bond-market-view.json"), viewsText, "utf8");
  const files = [
    {
      name: "cb-issuer-research.json",
      sha256: sha256Text(researchText),
      recordCount: 1,
    },
    {
      name: "bond-supplemental.json",
      sha256: sha256Text(supplementalText),
      recordCount: 0,
    },
    {
      name: "bond-market-view.json",
      sha256: sha256Text(viewsText),
      recordCount: 1,
    },
  ];
  if (scenario === "hash") {
    await writeFile(
      join(outputDir, "cb-issuer-research.json"),
      `${researchText.trimEnd()} \n`,
      "utf8",
    );
  }
  if (scenario === "supplemental") {
    await writeFile(
      join(outputDir, "bond-supplemental.json"),
      `${JSON.stringify({ ...supplemental, schemaVersion: 2 }, null, 2)}\n`,
      "utf8",
    );
  }
  if (scenario === "manifest") files.pop();
  return {
    manifest: {
      ...manifestBase,
      market: {
        status: "verified",
        dataDate: "2026-07-30",
        requestedDate: "2026-07-30",
        supplementalSources: supplemental.sources,
        files,
      },
    },
    report: { validation: "passed" },
  };
}

function isolatedSupplementalSnapshot(generatedAt) {
  return {
    schemaVersion: 1,
    generatedAt,
    unitFaceValueTwd: null,
    institutionHistory: {},
    redemptions: [],
    underwritingCases: [],
    sources: {
      institution: { state: "unavailable", dataDate: null, periodYear: null },
      redemption: { state: "unavailable", dataDate: null, periodYear: null },
      underwriting: { state: "unavailable", dataDate: null, periodYear: null },
    },
  };
}

function isolatedIssuerResearchSnapshot(generatedAt) {
  return {
    schemaVersion: 1,
    generatedAt,
    records: [{
      issuerCode: "1260",
      issuerName: "富味鄉",
      market: "listed",
      industryName: "食品工業",
      revenueMonth: "2026-06",
      sourcePublishedOn: "2026-07-17",
      revenueUnit: "仟元",
      currentMonthRevenue: "100",
      monthOverMonthPercent: "1",
      yearOverYearPercent: "2",
      cumulativeRevenue: "600",
      cumulativeYearOverYearPercent: "3",
    }],
    sources: {
      listed: {
        status: "current",
        dataDate: "2026-07-17",
        fetchedAt: generatedAt,
      },
      otc: { status: "unavailable", dataDate: null, fetchedAt: null },
    },
    diagnostics: [],
  };
}

async function seedIsolatedHarnessRoot(paths) {
  const priorGeneration = join(paths.dataDirectory, "generations", "abcdef");
  await mkdir(priorGeneration, { recursive: true });
  await writeFile(
    paths.staticIndexPath,
    '<script src="./data/runtime.js?v=prior"></script>',
    "utf8",
  );
  await writeFile(
    join(paths.dataDirectory, "current.json"),
    JSON.stringify({
      schemaVersion: 1,
      generation: "generations/abcdef",
      runtimeUrl: "./data/generations/abcdef/runtime.json",
    }),
    "utf8",
  );
  await writeFile(
    join(priorGeneration, "manifest.json"),
    JSON.stringify({ market: { status: "verified", files: [] } }),
    "utf8",
  );
  await writeFile(join(priorGeneration, "runtime.json"), "prior runtime", "utf8");
  await writeFile(
    join(priorGeneration, "cb-issuer-research.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      generatedAt: "2026-07-29T06:00:06.000Z",
      records: [],
      sources: {
        listed: { status: "unavailable", dataDate: null, fetchedAt: null },
        otc: { status: "unavailable", dataDate: null, fetchedAt: null },
      },
      diagnostics: [],
    })}\n`,
    "utf8",
  );
  await writeFile(
    join(priorGeneration, "bond-supplemental.json"),
    `${JSON.stringify(isolatedSupplementalSnapshot("2026-07-29T06:00:06.000Z"))}\n`,
    "utf8",
  );
}

async function captureIsolatedArtifacts(paths) {
  return {
    pointerText: await readOptionalText(
      join(paths.dataDirectory, "current.json"),
    ),
    priorResearchText: await readOptionalText(join(
      paths.dataDirectory,
      "generations",
      "abcdef",
      "cb-issuer-research.json",
    )),
    priorSupplementalText: await readOptionalText(join(
      paths.dataDirectory,
      "generations",
      "abcdef",
      "bond-supplemental.json",
    )),
  };
}

async function captureActiveGeneration(paths, pointerText) {
  if (pointerText === undefined) return {};
  let pointer;
  try {
    pointer = JSON.parse(pointerText);
  } catch {
    return {};
  }
  if (!/^generations\/[a-f0-9]+$/i.test(pointer?.generation ?? "")) return {};
  const generationRoot = join(
    paths.dataDirectory,
    ...pointer.generation.split("/"),
  );
  return Object.fromEntries(await Promise.all([
    "cb-issuer-research.json",
    "bond-supplemental.json",
    "bond-market-view.json",
    "emerging-market.json",
    "manifest.json",
    "runtime.json",
  ].map(async (name) => [name, await readOptionalText(join(generationRoot, name))])));
}

async function readOptionalText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function assertPublicOptions(value, allowed, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} options must be an object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) {
      throw new TypeError(`${String(key)} is not supported by ${name}`);
    }
  }
}

export async function readPublishedBondHistory(
  dataDirectory = DATA_DIRECTORY,
  cachePath,
) {
  const histories = [];
  try {
    const pointerText = await readFile(join(dataDirectory, "current.json"), "utf8");
    const pointer = JSON.parse(pointerText);
    if (!/^generations\/[a-f0-9-]+$/i.test(pointer?.generation ?? "")) {
      throw new Error("INVALID_CURRENT_GENERATION_POINTER");
    }
    histories.push(await readHistoryFile(
      join(dataDirectory, pointer.generation, "bond-market-history.json"),
    ));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (cachePath) {
    try {
      histories.push(await readHistoryFile(cachePath));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const merged = new Map();
  for (const history of histories) {
    for (const row of history) {
      if (
        row === null
        || typeof row !== "object"
        || typeof row.bondCode !== "string"
        || !isIsoDate(row.date)
      ) {
        throw new Error("INVALID_PUBLISHED_BOND_HISTORY");
      }
      merged.set(`${row.bondCode}\u0000${row.date}`, row);
    }
  }
  return [...merged.values()].sort((left, right) =>
    left.bondCode.localeCompare(right.bondCode)
    || left.date.localeCompare(right.date));
}

export async function readPublishedCbIssuerResearch(
  dataDirectory = DATA_DIRECTORY,
) {
  let pointer;
  try {
    pointer = JSON.parse(await readFile(join(dataDirectory, "current.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
  if (!/^generations\/[a-f0-9-]+$/i.test(pointer?.generation ?? "")) {
    throw new Error("INVALID_CURRENT_GENERATION_POINTER");
  }
  try {
    const value = JSON.parse(await readFile(
      join(dataDirectory, pointer.generation, "cb-issuer-research.json"),
      "utf8",
    ));
    return parseCbIssuerResearchSnapshot(value);
  } catch (error) {
    if (error?.code === "ENOENT") {
      let manifest;
      try {
        manifest = JSON.parse(await readFile(
          join(dataDirectory, pointer.generation, "manifest.json"),
          "utf8",
        ));
      } catch (manifestError) {
        if (manifestError?.code === "ENOENT") return undefined;
        throw manifestError;
      }
      if (manifest?.market?.files?.some(
        (file) => file?.name === "cb-issuer-research.json",
      )) {
        throw new Error("missing prior CB issuer research snapshot");
      }
      return undefined;
    }
    throw error;
  }
}

export async function readPublishedCbSupplemental(
  dataDirectory = DATA_DIRECTORY,
) {
  let pointer;
  try {
    pointer = JSON.parse(await readFile(join(dataDirectory, "current.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
  if (!/^generations\/[a-f0-9-]+$/i.test(pointer?.generation ?? "")) {
    throw new Error("INVALID_CURRENT_GENERATION_POINTER");
  }
  try {
    const value = JSON.parse(await readFile(
      join(dataDirectory, pointer.generation, "bond-supplemental.json"),
      "utf8",
    ));
    return parseCbSupplementalSnapshot(value);
  } catch (error) {
    if (error?.code === "ENOENT") {
      let manifest;
      try {
        manifest = JSON.parse(await readFile(
          join(dataDirectory, pointer.generation, "manifest.json"),
          "utf8",
        ));
      } catch (manifestError) {
        if (manifestError?.code === "ENOENT") return undefined;
        throw manifestError;
      }
      if (manifest?.market?.files?.some(
        (file) => file?.name === "bond-supplemental.json",
      )) {
        throw new Error("missing prior CB supplemental snapshot");
      }
      return undefined;
    }
    throw new TypeError(`prior CB supplemental snapshot is invalid: ${error.message}`);
  }
}

async function readHistoryFile(path) {
  const history = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(history)) throw new Error("INVALID_PUBLISHED_BOND_HISTORY");
  return history;
}

function newest94025CompanyRows(text) {
  const latestByCompanyCode = new Map();
  for (const sourceRow of parse94025Csv(text)) {
    const row = normalize94025Row(sourceRow);
    const current = latestByCompanyCode.get(row.companyCode);
    if (
      current === undefined
      || `${row.sourcePublishedOn}\u001f${row.yearMonth}`
        > `${current.sourcePublishedOn}\u001f${current.yearMonth}`
    ) {
      latestByCompanyCode.set(row.companyCode, row);
    }
  }
  return [...latestByCompanyCode.values()];
}

function buildEmergingMarketSnapshot({ marketRows, companyRows }) {
  if (!Array.isArray(marketRows) || marketRows.length === 0) {
    throw new TypeError("emerging market payload must contain at least one row");
  }
  const records = buildEmergingMarketViews({ marketRows, companyRows })
    .map((record) => EmergingMarketViewSchema.parse(record));
  const tradingDate = marketRows[0].tradingDate;
  if (!records.every((record) => record.tradingDate === tradingDate)) {
    throw new TypeError("emerging market records must use one trading date");
  }
  if (new Set(records.map((record) => record.companyCode)).size !== records.length) {
    throw new TypeError("emerging market records must have unique company codes");
  }
  const publishedTime = marketRows.map((row) => row.publishedTime).sort().at(-1);
  return {
    schemaVersion: 1,
    tradingDate,
    publishedAt: `${tradingDate}T${publishedTime}+08:00`,
    sourceId: "tpex_esb_latest_statistics",
    records,
  };
}

async function verifyStagedGeneration(stagingDataDirectory) {
  const snapshot = JSON.parse(await readFile(
    join(stagingDataDirectory, "emerging-market.json"),
    "utf8",
  ));
  if (
    snapshot?.schemaVersion !== 1
    || snapshot?.sourceId !== "tpex_esb_latest_statistics"
    || !isIsoDate(snapshot?.tradingDate)
    || !Array.isArray(snapshot?.records)
    || snapshot.records.length === 0
  ) {
    throw new Error("VALIDATION_FAILED:EMERGING_MARKET_SNAPSHOT");
  }
  const records = snapshot.records.map((record) => EmergingMarketViewSchema.parse(record));
  if (
    records.some((record) => record.tradingDate !== snapshot.tradingDate)
    || new Set(records.map((record) => record.companyCode)).size !== records.length
  ) {
    throw new Error("VALIDATION_FAILED:EMERGING_MARKET_INTEGRITY");
  }
  const manifest = JSON.parse(await readFile(join(stagingDataDirectory, "manifest.json"), "utf8"));
  if (!/^\.\/data\/generations\/[a-f0-9]+\/emerging-market\.json$/.test(manifest.emergingMarketUrl)) {
    throw new Error("VALIDATION_FAILED:EMERGING_MARKET_MANIFEST");
  }
  const runtime = JSON.parse(await readFile(join(stagingDataDirectory, "runtime.json"), "utf8"));
  if (runtime.generation === undefined || runtime.emergingMarketUrl !== manifest.emergingMarketUrl) {
    throw new Error("VALIDATION_FAILED:EMERGING_MARKET_RUNTIME");
  }
  const marketFiles = manifest?.market?.files;
  const issuerResearchEntries = Array.isArray(marketFiles)
    ? marketFiles.filter((file) => file?.name === "cb-issuer-research.json")
    : [];
  const supplementalEntries = Array.isArray(marketFiles)
    ? marketFiles.filter((file) => file?.name === "bond-supplemental.json")
    : [];
  const viewEntries = Array.isArray(marketFiles) ? marketFiles.filter(
    (file) => file?.name === "bond-market-view.json",
  ) : [];
  if (issuerResearchEntries.length === 0 && supplementalEntries.length === 0) return;
  if (viewEntries.length !== 1) {
    throw new Error("VALIDATION_FAILED:MARKET_VIEW_MANIFEST");
  }
  const viewEntry = validateGenerationFileEntry(
    viewEntries[0],
    "bond-market-view.json",
    "MARKET_VIEW",
  );
  const viewsText = await readFile(
    join(stagingDataDirectory, "bond-market-view.json"),
    "utf8",
  );
  const views = JSON.parse(viewsText);
  if (
    sha256Text(viewsText) !== viewEntry.sha256
    || !Array.isArray(views)
    || views.length !== viewEntry.recordCount
  ) {
    throw new Error("VALIDATION_FAILED:MARKET_VIEW_ARTIFACT");
  }

  if (issuerResearchEntries.length > 0) {
    if (issuerResearchEntries.length !== 1) {
      throw new Error("VALIDATION_FAILED:ISSUER_RESEARCH_MANIFEST");
    }
    const issuerEntry = validateGenerationFileEntry(
      issuerResearchEntries[0],
      "cb-issuer-research.json",
      "ISSUER_RESEARCH",
    );
    const researchText = await readFile(
      join(stagingDataDirectory, "cb-issuer-research.json"),
      "utf8",
    );
    if (sha256Text(researchText) !== issuerEntry.sha256) {
      throw new Error("VALIDATION_FAILED:ISSUER_RESEARCH_HASH");
    }
    const issuerResearch = parseCbIssuerResearchSnapshot(JSON.parse(researchText));
    if (issuerResearch.records.length !== issuerEntry.recordCount) {
      throw new Error("VALIDATION_FAILED:ISSUER_RESEARCH_COUNT");
    }
    const expectedResearchUrl = `./data/${runtime.generation}/cb-issuer-research.json`;
    if (runtime.datasets?.cbIssuerResearch !== expectedResearchUrl) {
      throw new Error("VALIDATION_FAILED:ISSUER_RESEARCH_RUNTIME");
    }
    verifyIssuerResearchViewConsistency(issuerResearch, views);
  }

  if (supplementalEntries.length > 0) {
    if (supplementalEntries.length !== 1) {
      throw new Error("VALIDATION_FAILED:SUPPLEMENTAL_MANIFEST");
    }
    const supplementalEntry = validateGenerationFileEntry(
      supplementalEntries[0],
      "bond-supplemental.json",
      "SUPPLEMENTAL",
    );
    const supplementalText = await readFile(
      join(stagingDataDirectory, "bond-supplemental.json"),
      "utf8",
    );
    if (sha256Text(supplementalText) !== supplementalEntry.sha256) {
      throw new Error("VALIDATION_FAILED:SUPPLEMENTAL_HASH");
    }
    const supplemental = parseCbSupplementalSnapshot(JSON.parse(supplementalText));
    if (countSupplementalRecords(supplemental) !== supplementalEntry.recordCount) {
      throw new Error("VALIDATION_FAILED:SUPPLEMENTAL_COUNT");
    }
    if (
      runtime.datasets?.bondSupplemental
        !== `./data/${runtime.generation}/bond-supplemental.json`
      || JSON.stringify(manifest.market.supplementalSources)
        !== JSON.stringify(supplemental.sources)
    ) {
      throw new Error("VALIDATION_FAILED:SUPPLEMENTAL_RUNTIME");
    }
    verifySupplementalViewConsistency(
      supplemental,
      views,
      manifest.market.requestedDate,
      bondInputsFrom11406Rows(JSON.parse(await readFile(
        join(stagingDataDirectory, "11406.json"),
        "utf8",
      ))),
    );
  }
}

function validateGenerationFileEntry(entry, expectedName, code) {
  if (
    entry?.name !== expectedName
    || !/^sha256:[0-9a-f]{64}$/.test(entry.sha256 ?? "")
    || !Number.isInteger(entry.recordCount)
    || entry.recordCount < 0
  ) {
    throw new Error(`VALIDATION_FAILED:${code}_MANIFEST`);
  }
  return entry;
}

function countSupplementalRecords(snapshot) {
  return Object.values(snapshot.institutionHistory)
    .reduce((count, records) => count + records.length, 0)
    + snapshot.redemptions.length
    + snapshot.underwritingCases.length;
}

function sha256Text(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function taipeiDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entryUrl === import.meta.url) {
  const result = await refreshStaticShowcase();
  console.log(JSON.stringify(result, null, 2));
}
