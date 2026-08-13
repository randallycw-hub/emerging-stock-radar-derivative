import { createHash } from "node:crypto";
import {
  appendFile,
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
import { parseBondMarketHistory } from "../lib/market-data/bond-market-history.ts";
import {
  buildBondWorkbenchSnapshot,
  parseBondWorkbenchSnapshot,
} from "../lib/market-data/bond-workbench.ts";
import { parseCbIssuerResearchSnapshot } from "../lib/market-data/cb-issuer-research.ts";
import { parseCsv } from "../lib/source-verification/csv.ts";
import { parseEmergingMarketSource } from "../lib/source-verification/source-emerging-market.ts";
import { normalize94025Row, parse94025Csv } from "../lib/source-verification/source-94025.ts";
import {
  bondInputsFrom11406Rows,
  buildBondMarketSnapshot,
  summarizeWorkbenchSourceStates,
  verifyIssuerResearchViewConsistency,
  verifySupplementalViewConsistency,
  verifyWorkbenchConsistency,
} from "./build-bond-market-snapshot.mjs";
import { bondTermSummariesFrom11406Rows } from "./lib/bond-inputs-from-11406.mjs";
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
  const declaresBondWorkbench = manifest?.market?.files?.some(
    (file) => file?.name === "bond-workbench.json",
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
      ...(declaresBondWorkbench
        ? { bondWorkbench: `${base}/bond-workbench.json` }
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
  const activeGeneration = await readActiveGeneration(paths.dataDirectory);
  const previousWorkbench = await readPublishedBondWorkbenchFromActive(
    activeGeneration,
  );
  const previousHistory = await readPublishedBondHistoryFromActive(
    activeGeneration,
    paths.publishedHistoryCachePath,
  );
  const previousSupplemental = await readPublishedCbSupplementalFromActive(
    activeGeneration,
  );
  const previousIssuerResearch = await readPublishedCbIssuerResearchFromActive(
    activeGeneration,
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
    if (previousWorkbench !== undefined) {
      await writeFile(
        join(stagingDataDirectory, "bond-workbench.json"),
        `${JSON.stringify(previousWorkbench, null, 2)}\n`,
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
    const runtime = buildGenerationRuntime(generation, manifest);
    if (marketResult.runtimeScenario === "workbench-path") {
      runtime.datasets.bondWorkbench = "./data/generations/deadbeef/bond-workbench.json";
    }
    await writeFile(
      join(stagingDataDirectory, "runtime.json"),
      `${JSON.stringify(runtime, null, 2)}\n`,
      "utf8",
    );
    await verifyStagedGeneration(stagingDataDirectory, previousWorkbench);
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
    "workbench",
    "runtime",
    "cache",
  ]).has(scenario)) {
    throw new TypeError(
      "isolated refresh scenario must be one of success, hash, manifest, cross-file, supplemental, supplemental-view, workbench, runtime, cache",
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
  const view = isolatedWorkbenchView(compact, scenario);
  const viewsText = `${JSON.stringify([view], null, 2)}\n`;
  const [term] = bondTermSummariesFrom11406Rows(JSON.parse(await readFile(
    join(outputDir, "11406.json"),
    "utf8",
  )));
  const workbench = buildBondWorkbenchSnapshot({
    generatedAt,
    dataDate: "2026-07-30",
    asOfDate: "2026-07-30",
    currentTerms: [{ ...term, unitFaceValueTwd: supplemental.unitFaceValueTwd }],
    currentViews: [view],
    currentEvents: [],
  });
  const workbenchText = `${JSON.stringify(workbench, null, 2)}\n`;
  const workbenchSourceStateSummary = summarizeWorkbenchSourceStates(workbench);
  await writeFile(join(outputDir, "cb-issuer-research.json"), researchText, "utf8");
  await writeFile(join(outputDir, "bond-supplemental.json"), supplementalText, "utf8");
  await writeFile(join(outputDir, "bond-market-view.json"), viewsText, "utf8");
  await writeFile(join(outputDir, "bond-workbench.json"), workbenchText, "utf8");
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
    {
      name: "bond-workbench.json",
      sha256: sha256Text(workbenchText),
      rawBytes: Buffer.byteLength(workbenchText),
      recordCount: 1,
      schemaVersion: 1,
      sourceStateSummary: workbenchSourceStateSummary,
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
  if (scenario === "workbench") {
    await writeFile(
      join(outputDir, "bond-workbench.json"),
      `${JSON.stringify({ ...workbench, schemaVersion: 2 }, null, 2)}\n`,
      "utf8",
    );
  }
  if (scenario === "manifest") files.pop();
  if (scenario === "cache") {
    const generation = /^\.\/data\/(generations\/[a-f0-9]+)\/emerging-market\.json$/
      .exec(manifestBase.emergingMarketUrl)?.[1];
    if (generation === undefined) {
      throw new TypeError("isolated cache scenario requires a canonical generation");
    }
    const occupiedGeneration = join(
      dirname(dirname(outputDir)),
      "data",
      ...generation.split("/"),
    );
    await mkdir(occupiedGeneration, { recursive: true });
    await writeFile(join(occupiedGeneration, "sentinel.txt"), "occupied", "utf8");
  }
  return {
    manifest: {
      ...manifestBase,
      market: {
        status: "verified",
        dataDate: "2026-07-30",
        requestedDate: "2026-07-30",
        supplementalSources: supplemental.sources,
        workbenchSourceStateSummary,
        files,
      },
    },
    report: { validation: "passed" },
    ...(scenario === "runtime" ? { runtimeScenario: "workbench-path" } : {}),
  };
}

function isolatedWorkbenchView(compact, scenario = "success") {
  return {
    bondCode: "35221",
    issuerCode: "3522",
    bondName: "御嵿一",
    issuerResearch: scenario === "cross-file" ? null : compact,
    cbClose: null,
    cbPriceDate: null,
    cbTradeUnits: "0",
    stockClose: null,
    stockPriceDate: null,
    currentConversionPrice: null,
    conversionPriceEffectiveDate: null,
    valuationDate: null,
    valuationCbClose: null,
    valuationStockClose: null,
    conversionValue: null,
    premiumRate: null,
    outstandingAmount: "123100000",
    outstandingDataDate: "2026-07-23",
    outstandingReductionRate: "17.93",
    remainingUnits: null,
    remainingRatio: scenario === "supplemental-view" ? "82.08" : "82.07",
    dailyTurnoverRate: null,
    institutionDataDate: null,
    institutionNetUnits: null,
    institutionNet5dUnits: null,
    institutionNet20dUnits: null,
    redemptionEvent: null,
    maturityDate: "2026-12-18",
    daysToMaturity: 141,
    nextPutDate: null,
    daysToNextPut: null,
    nextEventType: "maturity",
    nextEventDate: "2026-12-18",
    daysToNextEvent: 141,
    missingReasons: [
      "NO_VERIFIED_FACE_VALUE",
      "BALANCE_TRADE_DATE_MISMATCH",
    ],
    dataQuality: "date_mismatch",
    staleCbPrice: false,
  };
}

function isolatedWorkbenchTerm() {
  return {
    bondCode: "35221",
    issuerCode: "3522",
    issuerName: "御頂",
    bondName: "御嵿一",
    issueDate: "2023-12-18",
    listingDate: "2023-12-18",
    maturityDate: "2026-12-18",
    issueAmount: "150000000",
    outstandingAmount: "123100000",
    outstandingDataDate: "2026-07-23",
    initialConversionPrice: "19.5000",
    conversionStartDate: "2024-03-19",
    conversionEndDate: "2026-12-18",
    putDates: ["2025-12-18"],
    putPrice: "101.0025",
    securedStatus: "1",
    underwriter: "700T兆豐證券",
    trustee: "彰化商業銀行股份有限公司信託部",
    unitFaceValueTwd: null,
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
      issuerCode: "3522",
      issuerName: "御頂",
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
  const priorWorkbench = buildBondWorkbenchSnapshot({
    generatedAt: "2026-07-29T06:00:06.000Z",
    dataDate: "2026-07-29",
    asOfDate: "2026-07-29",
    currentTerms: [isolatedWorkbenchTerm()],
    currentViews: [isolatedWorkbenchView(null)],
    currentEvents: [],
  });
  const priorWorkbenchText = `${JSON.stringify(priorWorkbench, null, 2)}\n`;
  const priorWorkbenchSourceStateSummary = summarizeWorkbenchSourceStates(
    priorWorkbench,
  );
  await writeFile(join(priorGeneration, "bond-workbench.json"), priorWorkbenchText, "utf8");
  await writeFile(
    join(priorGeneration, "manifest.json"),
    JSON.stringify({
      market: {
        status: "verified",
        workbenchSourceStateSummary: priorWorkbenchSourceStateSummary,
        files: [{
          name: "bond-workbench.json",
          sha256: sha256Text(priorWorkbenchText),
          rawBytes: Buffer.byteLength(priorWorkbenchText),
          recordCount: priorWorkbench.records.length,
          schemaVersion: priorWorkbench.schemaVersion,
          sourceStateSummary: priorWorkbenchSourceStateSummary,
        }],
      },
    }),
    "utf8",
  );
  await writeFile(
    join(priorGeneration, "bond-supplemental.json"),
    `${JSON.stringify(isolatedSupplementalSnapshot("2026-07-29T06:00:06.000Z"))}\n`,
    "utf8",
  );
  await mkdir(dirname(paths.publishedHistoryCachePath), { recursive: true });
  await writeFile(paths.publishedHistoryCachePath, "[]\n", "utf8");
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
    priorWorkbenchText: await readOptionalText(join(
      paths.dataDirectory,
      "generations",
      "abcdef",
      "bond-workbench.json",
    )),
    cacheText: await readOptionalText(paths.publishedHistoryCachePath),
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
    "bond-workbench.json",
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
  return readPublishedBondHistoryFromActive(
    await readActiveGeneration(dataDirectory),
    cachePath,
  );
}

async function readPublishedBondHistoryFromActive(active, cachePath) {
  const histories = [];
  if (active !== undefined) {
    try {
      const { text, value } = await readHistoryFile(
        join(active.root, "bond-market-history.json"),
      );
      validatePriorManifestFile(
        active.manifest,
        "bond-market-history.json",
        text,
        value.length,
      );
      histories.push(value);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      if (declaresFile(active.manifest, "bond-market-history.json")) {
        throw new Error("missing prior bond market history snapshot");
      }
    }
  }
  if (cachePath) {
    try {
      histories.unshift((await readHistoryFile(cachePath)).value);
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
  return readPublishedCbIssuerResearchFromActive(
    await readActiveGeneration(dataDirectory),
  );
}

async function readPublishedCbIssuerResearchFromActive(active) {
  if (active === undefined) return undefined;
  try {
    const text = await readFile(join(active.root, "cb-issuer-research.json"), "utf8");
    const snapshot = parseCbIssuerResearchSnapshot(JSON.parse(text));
    validatePriorManifestFile(
      active.manifest,
      "cb-issuer-research.json",
      text,
      snapshot.records.length,
    );
    return snapshot;
  } catch (error) {
    if (error?.code === "ENOENT") {
      if (declaresFile(active.manifest, "cb-issuer-research.json")) {
        throw new Error("missing prior CB issuer research snapshot");
      }
      return undefined;
    }
    throw error;
  }
}

export async function readPublishedBondWorkbench(
  dataDirectory = DATA_DIRECTORY,
) {
  return readPublishedBondWorkbenchFromActive(
    await readActiveGeneration(dataDirectory),
  );
}

async function readPublishedBondWorkbenchFromActive(active) {
  if (active === undefined) return undefined;
  try {
    const text = await readFile(join(active.root, "bond-workbench.json"), "utf8");
    const snapshot = parseBondWorkbenchSnapshot(JSON.parse(text));
    const entry = validatePriorManifestFile(
      active.manifest,
      "bond-workbench.json",
      text,
      snapshot.records.length,
    );
    if (entry !== undefined && (
      entry.rawBytes !== Buffer.byteLength(text, "utf8")
      || entry.schemaVersion !== snapshot.schemaVersion
      || !equalJson(entry.sourceStateSummary, summarizeWorkbenchSourceStates(snapshot))
      || !equalJson(
        active.manifest.market.workbenchSourceStateSummary,
        entry.sourceStateSummary,
      )
    )) {
      throw new Error("prior bond workbench manifest integrity is invalid");
    }
    return snapshot;
  } catch (error) {
    if (error?.code === "ENOENT") {
      if (declaresFile(active.manifest, "bond-workbench.json")) {
        throw new Error("missing prior bond workbench snapshot");
      }
      return undefined;
    }
    throw new TypeError(`prior bond workbench snapshot is invalid: ${error.message}`);
  }
}

export async function readPublishedCbSupplemental(
  dataDirectory = DATA_DIRECTORY,
) {
  return readPublishedCbSupplementalFromActive(
    await readActiveGeneration(dataDirectory),
  );
}

async function readPublishedCbSupplementalFromActive(active) {
  if (active === undefined) return undefined;
  try {
    const text = await readFile(join(active.root, "bond-supplemental.json"), "utf8");
    const snapshot = parseCbSupplementalSnapshot(JSON.parse(text));
    validatePriorManifestFile(
      active.manifest,
      "bond-supplemental.json",
      text,
      countSupplementalRecords(snapshot),
    );
    if (
      declaresFile(active.manifest, "bond-supplemental.json")
      && !equalJson(active.manifest.market.supplementalSources, snapshot.sources)
    ) {
      throw new Error("prior CB supplemental manifest integrity is invalid");
    }
    return snapshot;
  } catch (error) {
    if (error?.code === "ENOENT") {
      if (declaresFile(active.manifest, "bond-supplemental.json")) {
        throw new Error("missing prior CB supplemental snapshot");
      }
      return undefined;
    }
    throw new TypeError(`prior CB supplemental snapshot is invalid: ${error.message}`);
  }
}

async function readHistoryFile(path) {
  const text = await readFile(path, "utf8");
  const history = JSON.parse(text);
  try {
    return { text, value: parseBondMarketHistory(history) };
  } catch (error) {
    throw new Error(`INVALID_PUBLISHED_BOND_HISTORY:${error.message}`);
  }
}

async function readActiveGeneration(dataDirectory) {
  let pointer;
  try {
    pointer = JSON.parse(await readFile(join(dataDirectory, "current.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
  const expectedRuntimeUrl = `./data/${pointer?.generation}/runtime.json`;
  if (
    pointer === null
    || typeof pointer !== "object"
    || Array.isArray(pointer)
    || !equalJson(Object.keys(pointer).sort(), [
      "generation",
      "runtimeUrl",
      "schemaVersion",
    ].sort())
    || pointer.schemaVersion !== 1
    || !/^generations\/[a-f0-9-]+$/i.test(pointer.generation ?? "")
    || pointer.runtimeUrl !== expectedRuntimeUrl
  ) {
    throw new Error("INVALID_CURRENT_GENERATION_POINTER");
  }
  const root = join(dataDirectory, pointer.generation);
  let manifestText;
  try {
    manifestText = await readFile(join(root, "manifest.json"), "utf8");
  } catch (error) {
    throw new Error(`INVALID_ACTIVE_GENERATION_MANIFEST:${error.message}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    throw new Error(`INVALID_ACTIVE_GENERATION_MANIFEST:${error.message}`);
  }
  if (
    manifest === null
    || typeof manifest !== "object"
    || Array.isArray(manifest)
    || manifest.market === null
    || typeof manifest.market !== "object"
    || Array.isArray(manifest.market)
    || !Array.isArray(manifest.market.files)
  ) {
    throw new Error("INVALID_ACTIVE_GENERATION_MANIFEST:ENVELOPE");
  }
  return Object.freeze({ root, manifest });
}

function declaresFile(manifest, name) {
  return manifest?.market?.files?.some((file) => file?.name === name) === true;
}

function validatePriorManifestFile(manifest, name, text, recordCount) {
  if (!declaresFile(manifest, name)) return undefined;
  const entries = manifest.market.files.filter((file) => file?.name === name);
  const entry = entries[0];
  if (
    entries.length !== 1
    || entry?.sha256 !== sha256Text(text)
    || entry?.recordCount !== recordCount
    || (Object.hasOwn(entry, "rawBytes")
      && entry.rawBytes !== Buffer.byteLength(text, "utf8"))
  ) {
    throw new Error(`prior ${name} manifest integrity is invalid`);
  }
  return entry;
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

async function verifyStagedGeneration(stagingDataDirectory, previousWorkbench) {
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
  const generationMatch = /^\.\/data\/(generations\/[a-f0-9]+)\/emerging-market\.json$/.exec(
    manifest.emergingMarketUrl ?? "",
  );
  if (generationMatch === null) {
    throw new Error("VALIDATION_FAILED:EMERGING_MARKET_MANIFEST");
  }
  const runtime = JSON.parse(await readFile(join(stagingDataDirectory, "runtime.json"), "utf8"));
  const expectedRuntime = buildGenerationRuntime(generationMatch[1], manifest);
  if (!equalJson(runtime, expectedRuntime)) {
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
  const workbenchEntries = Array.isArray(marketFiles) ? marketFiles.filter(
    (file) => file?.name === "bond-workbench.json",
  ) : [];
  if (workbenchEntries.length !== 1) {
    throw new Error("VALIDATION_FAILED:WORKBENCH_MANIFEST");
  }
  if (
    issuerResearchEntries.length === 0
    && supplementalEntries.length === 0
    && workbenchEntries.length === 0
  ) return;
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

  if (workbenchEntries.length > 0) {
    if (
      workbenchEntries.length !== 1
      || issuerResearchEntries.length !== 1
      || supplementalEntries.length !== 1
    ) {
      throw new Error("VALIDATION_FAILED:WORKBENCH_MANIFEST");
    }
    const workbenchEntry = validateWorkbenchGenerationFileEntry(
      workbenchEntries[0],
    );
    const workbenchText = await readFile(
      join(stagingDataDirectory, "bond-workbench.json"),
      "utf8",
    );
    if (
      sha256Text(workbenchText) !== workbenchEntry.sha256
      || Buffer.byteLength(workbenchText, "utf8") !== workbenchEntry.rawBytes
    ) {
      throw new Error("VALIDATION_FAILED:WORKBENCH_HASH");
    }
    const workbench = parseBondWorkbenchSnapshot(JSON.parse(workbenchText));
    if (
      workbench.records.length !== workbenchEntry.recordCount
      || workbench.schemaVersion !== workbenchEntry.schemaVersion
      || runtime.datasets?.bondWorkbench
        !== `./data/${runtime.generation}/bond-workbench.json`
    ) {
      throw new Error("VALIDATION_FAILED:WORKBENCH_RUNTIME");
    }
    const supplemental = parseCbSupplementalSnapshot(JSON.parse(await readFile(
      join(stagingDataDirectory, "bond-supplemental.json"),
      "utf8",
    )));
    const issuerResearch = parseCbIssuerResearchSnapshot(JSON.parse(await readFile(
      join(stagingDataDirectory, "cb-issuer-research.json"),
      "utf8",
    )));
    const terms = bondTermSummariesFrom11406Rows(JSON.parse(await readFile(
      join(stagingDataDirectory, "11406.json"),
      "utf8",
    ))).map((term) => ({
      ...term,
      unitFaceValueTwd: supplemental.unitFaceValueTwd,
    }));
    const history = parseBondMarketHistory(JSON.parse(await readFile(
      join(stagingDataDirectory, "bond-market-history.json"),
      "utf8",
    )));
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
      previous: previousWorkbench,
      events: [],
    });
    if (JSON.stringify(workbenchEntry.sourceStateSummary)
      !== JSON.stringify(manifest.market.workbenchSourceStateSummary)) {
      throw new Error("VALIDATION_FAILED:WORKBENCH_SOURCE_STATE");
    }
  }
}

function validateWorkbenchGenerationFileEntry(entry) {
  if (
    entry === null
    || typeof entry !== "object"
    || Array.isArray(entry)
    || JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify([
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
    throw new Error("VALIDATION_FAILED:WORKBENCH_MANIFEST");
  }
  return entry;
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
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => (
      key === rightKeys[index]
      && equalJson(left[key], right[key])
    ));
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
