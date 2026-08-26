import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  OFFICIAL_SHOWCASE_SOURCES,
  buildGenerationRuntime,
  buildRuntimeBootstrap,
  fetchOfficialCsvWithRetry,
  readPublishedBondHistory,
  readPublishedBondWorkbench,
  readPublishedConversionPrices,
  readPublishedCbIssuerResearch,
  readPublishedCbSupplemental,
  refreshStaticShowcase,
  updateRuntimeCacheKey,
} from "../scripts/refresh-static-showcase-data.mjs";

test("generation runtime requires the formal workbench and IPO artifacts", () => {
  const baseManifest = { market: { files: [] } };
  assert.throws(
    () => buildGenerationRuntime("generations/abc123", baseManifest),
    /workbench|IPO/i,
  );
});

async function withBlockedGlobalFetch(run) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    throw new Error(`unexpected global fetch: ${String(url)}`);
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    assert.deepEqual(calls, []);
  }
}

function historyPoint(patch = {}) {
  return {
    bondCode: "35221",
    date: "2026-06-30",
    cbOpen: null,
    cbHigh: null,
    cbLow: null,
    cbClose: null,
    cbAverage: null,
    cbChange: null,
    cbTradingUnits: null,
    cbTurnover: null,
    stockClose: null,
    effectiveConversionPrice: null,
    conversionValue: null,
    premiumRate: null,
    ...patch,
  };
}

function legacyHistoryPoint(patch = {}) {
  return {
    bondCode: "35221",
    date: "2026-06-30",
    cbClose: "101.5",
    stockClose: "52.3",
    effectiveConversionPrice: "44.2",
    conversionValue: "118.3258",
    premiumRate: "-14.2201",
    ...patch,
  };
}

test("refresh preserves prior files when the TPEx snapshot request fails", async () => {
  await withTemporaryShowcase(async (root) => {
    const dataDirectory = join(root, "static-showcase/data");
    const paths = ["94025.json", "11406.json", "11586.json", "emerging-market.json", "manifest.json", "runtime.js"];
    await Promise.all(paths.map((name) => writeFile(join(dataDirectory, name), `prior:${name}`, "utf8")));
    const before = await Promise.all(paths.map(async (name) => [name, await readFile(join(dataDirectory, name), "utf8")]));

    await assert.rejects(
      withBlockedGlobalFetch(() => refreshStaticShowcase({
        fetchImpl: async (url) => {
          if (String(url) === OFFICIAL_SHOWCASE_SOURCES.emergingMarket) return new Response("unavailable", { status: 503 });
          if (String(url) === OFFICIAL_SHOWCASE_SOURCES["94025"]) {
            return new Response(await fixtureText("source-verification/94025/csv-minimal.csv"), { status: 200 });
          }
          return new Response("header\n", { status: 200 });
        },
      })),
      /emergingMarket: HTTP_503/,
    );

    const after = await Promise.all(paths.map(async (name) => [name, await readFile(join(dataDirectory, name), "utf8")]));
    assert.deepEqual(after, before);
  });
});

test("refresh rejects the removed offline source option before fetch or pointer mutation", async () => {
  await withTemporaryShowcase(async (root) => {
    await seedPriorGeneration(root);
    const pointerPath = join(root, "static-showcase/data/current.json");
    const beforePointer = await readFile(pointerPath, "utf8");
    let fetchCalls = 0;

    await assert.rejects(
      withBlockedGlobalFetch(() => refreshStaticShowcase({
        offlineIssuerResearchSourceResults: {
          listed: { status: "fulfilled", value: "injected,current,csv" },
          otc: { status: "rejected", reason: new Error("offline") },
        },
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("must not fetch", { status: 500 });
        },
      })),
      /offlineIssuerResearchSourceResults.*not supported/i,
    );
    assert.equal(fetchCalls, 0);
    assert.equal(await readFile(pointerPath, "utf8"), beforePointer);
  });
});

test("production refresh rejects marketBuilder before fetch or pointer mutation", async () => {
  const workspacePointerPath = join(process.cwd(), "static-showcase/data/current.json");
  const workspacePointerBefore = await readFile(workspacePointerPath, "utf8");
  await withTemporaryShowcase(async (root) => {
    await seedPriorGeneration(root);
    const pointerPath = join(root, "static-showcase/data/current.json");
    const beforePointer = await readFile(pointerPath, "utf8");
    let fetchCalls = 0;

    await assert.rejects(
      withBlockedGlobalFetch(() => refreshStaticShowcase({
        marketBuilder: async () => assert.fail("injected builder must not run"),
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("must not fetch", { status: 500 });
        },
      })),
      /marketBuilder.*not supported/i,
    );
    assert.equal(fetchCalls, 0);
    assert.equal(await readFile(pointerPath, "utf8"), beforePointer);
  });
  assert.equal(await readFile(workspacePointerPath, "utf8"), workspacePointerBefore);
});

test("production refresh rejects history correction controls before fetch or pointer mutation", async () => {
  const workspacePointerPath = join(process.cwd(), "static-showcase/data/current.json");
  const workspacePointerBefore = await readFile(workspacePointerPath, "utf8");
  await withTemporaryShowcase(async (root) => {
    await seedPriorGeneration(root);
    const pointerPath = join(root, "static-showcase/data/current.json");
    const beforePointer = await readFile(pointerPath, "utf8");
    let fetchCalls = 0;

    await assert.rejects(
      withBlockedGlobalFetch(() => refreshStaticShowcase({
        correction: { path: "evidence.json" },
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("must not fetch", { status: 500 });
        },
      })),
      /correction.*not supported/i,
    );
    assert.equal(fetchCalls, 0);
    assert.equal(await readFile(pointerPath, "utf8"), beforePointer);
  });
  assert.equal(await readFile(workspacePointerPath, "utf8"), workspacePointerBefore);
});

test("isolated harness rejects executable callbacks without external writes", async (context) => {
  const { runIsolatedRefreshStaticShowcaseTestHarness } = await import(
    "../scripts/refresh-static-showcase-data.mjs"
  );
  const workspacePointerPath = join(process.cwd(), "static-showcase/data/current.json");
  const workspacePointerBefore = await readFile(workspacePointerPath, "utf8");
  const sourceTexts = {
    "94025": await fixtureText("source-verification/94025/csv-minimal.csv"),
    "11406": "bondCode\n",
    "11586": "companyCode\n1260\n",
    emergingMarket: await fixtureText(
      "source-verification/emerging-market/tpex-esb-latest-statistics.json",
    ),
  };
  const cases = [
    ["fetchImpl", (sentinelPath, execution) => ({
      fetchImpl: async () => {
        execution.count += 1;
        await writeFile(sentinelPath, "external fetch write", "utf8");
        return new Response("must not execute", { status: 500 });
      },
      marketBuilder: async () => assert.fail("market builder must not execute"),
    })],
    ["marketBuilder", (sentinelPath, execution) => ({
      marketBuilder: async () => {
        execution.count += 1;
        await writeFile(sentinelPath, "external builder write", "utf8");
        return { manifest: {}, report: {} };
      },
      fetchImpl: async (url) => {
        const datasetId = Object.entries(OFFICIAL_SHOWCASE_SOURCES)
          .find(([, sourceUrl]) => sourceUrl === String(url))?.[0];
        return new Response(sourceTexts[datasetId], { status: 200 });
      },
    })],
  ];

  for (const [key, options] of cases) {
    await context.test(key, async () => {
      const externalRoot = await mkdtemp(join(tmpdir(), "showcase-external-sentinel-"));
      const sentinelPath = join(externalRoot, "sentinel.txt");
      const execution = { count: 0 };
      await writeFile(sentinelPath, "formal pointer sentinel", "utf8");
      try {
        await assert.rejects(
          runIsolatedRefreshStaticShowcaseTestHarness({
            ...options(sentinelPath, execution),
            now: new Date("2026-07-30T06:00:06.000Z"),
          }),
          new RegExp(`${key}.*not supported`, "i"),
        );
        assert.equal(execution.count, 0);
        assert.equal(await readFile(sentinelPath, "utf8"), "formal pointer sentinel");
        assert.equal(await readFile(workspacePointerPath, "utf8"), workspacePointerBefore);
      } finally {
        await rm(externalRoot, { recursive: true, force: true });
      }
    });
  }
});

test("isolated harness rejects unknown inert options before creating temp roots", async () => {
  const { runIsolatedRefreshStaticShowcaseTestHarness } = await import(
    "../scripts/refresh-static-showcase-data.mjs"
  );
  const listHarnessRoots = async () => (await readdir(tmpdir()))
    .filter((name) => name.startsWith("isolated-showcase-refresh-"))
    .sort();
  const before = await listHarnessRoots();

  await assert.rejects(
    runIsolatedRefreshStaticShowcaseTestHarness({ scenario: "unknown" }),
    /scenario must be one of/i,
  );
  await assert.rejects(
    runIsolatedRefreshStaticShowcaseTestHarness({ scenario: "success", extra: true }),
    /extra.*not supported/i,
  );
  assert.deepEqual(await listHarnessRoots(), before);
});

test("isolated harness rejects accessor options without executing them", async () => {
  const { runIsolatedRefreshStaticShowcaseTestHarness } = await import(
    "../scripts/refresh-static-showcase-data.mjs"
  );
  let getterCalls = 0;
  const options = {};
  Object.defineProperty(options, "scenario", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "success";
    },
  });

  await assert.rejects(
    runIsolatedRefreshStaticShowcaseTestHarness(options),
    /plain data properties/i,
  );
  assert.equal(getterCalls, 0);
});

test("isolated harness keeps concurrent candidates inside their own roots during cwd flips", async () => {
  const { runIsolatedRefreshStaticShowcaseTestHarness } = await import(
    "../scripts/refresh-static-showcase-data.mjs"
  );
  const originalDirectory = process.cwd();
  const fakeWorkspace = await mkdtemp(join(tmpdir(), "showcase-cwd-flip-"));
  await seedPriorGeneration(fakeWorkspace);
  const fakePointerPath = join(fakeWorkspace, "static-showcase/data/current.json");
  const fakePointerBefore = await readFile(fakePointerPath, "utf8");
  const listHarnessRoots = async () => (await readdir(tmpdir()))
    .filter((name) => name.startsWith("isolated-showcase-refresh-"))
    .sort();
  const harnessRootsBefore = await listHarnessRoots();
  let keepFakeCwd = true;
  let results;
  let directoryAfterHarness;

  try {
    const runs = [
      runIsolatedRefreshStaticShowcaseTestHarness({
        scenario: "success",
        now: "2026-07-30T06:00:06.000Z",
      }),
      runIsolatedRefreshStaticShowcaseTestHarness({
        scenario: "hash",
        now: "2026-07-30T06:00:07.000Z",
      }),
    ];
    process.chdir(fakeWorkspace);
    const cwdEnforcer = (async () => {
      while (keepFakeCwd) {
        if (process.cwd() !== fakeWorkspace) process.chdir(fakeWorkspace);
        await new Promise((resolve) => setImmediate(resolve));
      }
    })();
    results = await Promise.allSettled(runs);
    keepFakeCwd = false;
    await cwdEnforcer;
    directoryAfterHarness = process.cwd();
  } finally {
    keepFakeCwd = false;
    process.chdir(originalDirectory);
  }

  try {
    assert.equal(directoryAfterHarness, fakeWorkspace);
    assert.equal(await readFile(fakePointerPath, "utf8"), fakePointerBefore);
    assert.deepEqual(await listHarnessRoots(), harnessRootsBefore);
    assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled"]);
    const [success, hash] = results.map((result) => result.value);
    assert.equal(success.status, "fulfilled");
    assert.notEqual(success.artifacts.after.pointerText, success.artifacts.before.pointerText);
    assert.equal(hash.status, "rejected");
    assert.equal(hash.artifacts.after.pointerText, hash.artifacts.before.pointerText);
  } finally {
    await rm(fakeWorkspace, { recursive: true, force: true });
  }
  assert.equal(process.cwd(), originalDirectory);
});

test("refresh publishes a schema-validated emerging-market snapshot from one TPEx response", async () => {
  const { runIsolatedRefreshStaticShowcaseTestHarness } = await import(
    "../scripts/refresh-static-showcase-data.mjs"
  );
  const workspacePointerPath = join(process.cwd(), "static-showcase/data/current.json");
  const workspacePointerBefore = await readFile(workspacePointerPath, "utf8");
  const sourceTexts = {
    "94025": await fixtureText("source-verification/94025/csv-minimal.csv"),
    "11406": "bondCode\n",
    "11586": "companyCode\n1260\n",
    emergingMarket: await fixtureText(
      "source-verification/emerging-market/tpex-esb-latest-statistics.json",
    ),
  };
  const outcome = await runIsolatedRefreshStaticShowcaseTestHarness({
    scenario: "success",
    now: "2026-07-30T06:00:06.000Z",
  });

  assert.equal(outcome.status, "fulfilled");
  assert.equal(
    outcome.observations.requestedUrls.filter(
      (url) => url === OFFICIAL_SHOWCASE_SOURCES.emergingMarket,
    ).length,
    1,
  );
  assert.ok(outcome.observations.maximumConcurrency <= 2);
  assert.equal(outcome.observations.marketAsOfDate, "2026-07-30");
  assert.equal(await readFile(workspacePointerPath, "utf8"), workspacePointerBefore);

  const pointer = JSON.parse(outcome.artifacts.after.pointerText);
  const snapshot = JSON.parse(outcome.artifacts.active["emerging-market.json"]);
  assert.deepEqual(Object.keys(snapshot).sort(), [
    "publishedAt", "records", "schemaVersion", "sourceId", "tradingDate",
  ]);
  assert.equal(snapshot.tradingDate, "2026-07-30");
  assert.equal(snapshot.publishedAt, "2026-07-30T14:00:06+08:00");
  assert.equal(snapshot.sourceId, "tpex_esb_latest_statistics");
  assert.equal(snapshot.records[0].companyCode, "1260");
  assert.equal(snapshot.records[0].industryName, "食品工業");
  assert.equal(snapshot.records[0].lastTradedPrice, "25.2");
  assert.ok(snapshot.records.every((record) => record.tradingDate === snapshot.tradingDate));
  assert.equal(new Set(snapshot.records.map((record) => record.companyCode)).size, snapshot.records.length);
  assert.equal("BuyingPrice" in snapshot.records[0], false);

  const manifest = JSON.parse(outcome.artifacts.active["manifest.json"]);
  assert.equal(manifest.emergingMarketUrl, `./data/${pointer.generation}/emerging-market.json`);
  const ipoEventsText = outcome.artifacts.active["ipo-events.json"];
  const ipoEvents = JSON.parse(ipoEventsText);
  assert.deepEqual(
    ipoEvents.sourceManifest.map((source) => source.sourceId),
    [
      "twse-applications",
      "tpex-applications",
      "tpex-ipo-listings",
      "twse-auctions",
      "twse-public-offerings",
    ],
  );
  assert.ok(
    ipoEvents.records.some((record) => (
      record.auction !== null || record.publicOffering !== null
    )),
    "static refresh must retain verified IPO auction or public-offering facts",
  );
  assert.deepEqual(
    manifest.market.files.filter((entry) => entry.name === "ipo-events.json"),
    [{
      name: "ipo-events.json",
      sha256: `sha256:${createHash("sha256").update(ipoEventsText, "utf8").digest("hex")}`,
      rawBytes: Buffer.byteLength(ipoEventsText, "utf8"),
      recordCount: ipoEvents.records.length,
    }],
  );
  assert.deepEqual(
    manifest.datasets.find((dataset) => dataset.datasetId === "emergingMarket"),
    {
      datasetId: "emergingMarket",
      sourceUrl: OFFICIAL_SHOWCASE_SOURCES.emergingMarket,
      downloadedAt: "2026-07-30",
      sha256: `sha256:${createHash("sha256").update(sourceTexts.emergingMarket).digest("hex")}`,
      rawBytes: Buffer.byteLength(sourceTexts.emergingMarket),
      rowCount: 1,
    },
  );
  const runtime = JSON.parse(outcome.artifacts.active["runtime.json"]);
  const stagedUrls = [
    runtime.manifestUrl,
    runtime.emergingMarketUrl,
    runtime.ipoEventsUrl,
    ...Object.values(runtime.datasets),
  ];
  assert.ok(stagedUrls.every((url) => {
    const fileName = new URL(url, "https://isolated.invalid/").pathname.split("/").at(-1);
    return Object.hasOwn(outcome.artifacts.active, fileName);
  }));
  assert.equal(runtime.generation, pointer.generation);
  assert.equal(runtime.manifestUrl, `./data/${pointer.generation}/manifest.json`);
  assert.equal(
    runtime.datasets.cbIssuerResearch,
    `./data/${pointer.generation}/cb-issuer-research.json`,
  );
  assert.equal(
    runtime.datasets.bondSupplemental,
    `./data/${pointer.generation}/bond-supplemental.json`,
  );
  assert.equal(
    runtime.datasets.bondWorkbench,
    `./data/${pointer.generation}/bond-workbench.json`,
  );
  const workbench = JSON.parse(outcome.artifacts.active["bond-workbench.json"]);
  assert.equal(workbench.schemaVersion, 1);
  assert.equal(workbench.records[0].bondCode, "35221");
  const issuerResearch = JSON.parse(
    outcome.artifacts.active["cb-issuer-research.json"],
  );
  assert.equal(issuerResearch.records[0].issuerCode, "3522");
  const supplemental = JSON.parse(
    outcome.artifacts.active["bond-supplemental.json"],
  );
  assert.equal(supplemental.schemaVersion, 1);
  assert.deepEqual(manifest.market.supplementalSources, supplemental.sources);
});

test("refresh reads the prior generation bond history before staging a replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-history-"));
  const dataRoot = join(root, "data");
  const generation = join(dataRoot, "generations", "abcdef");
  const history = [historyPoint()];
  await mkdir(generation, { recursive: true });
  await writeFile(
    join(dataRoot, "current.json"),
    JSON.stringify({ schemaVersion: 1, generation: "generations/abcdef", runtimeUrl: "./data/generations/abcdef/runtime.json" }),
    "utf8",
  );
  await writeFile(join(generation, "bond-market-history.json"), JSON.stringify(history), "utf8");
  await writeFile(
    join(generation, "manifest.json"),
    JSON.stringify({ market: { status: "verified", files: [] } }),
    "utf8",
  );

  assert.deepEqual(await readPublishedBondHistory(dataRoot), history);
});

test("refresh reads the prior conversion-price history before staging a replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-conversion-prices-"));
  const dataRoot = join(root, "data");
  const generation = join(dataRoot, "generations", "abcdef");
  const versions = [{
    bondCode: "35221",
    issuerCode: "3522",
    initialConversionPrice: "40",
    currentConversionPrice: "35",
    effectiveDate: "2026-06-30",
    officialDetailUrl: "https://mopsov.twse.com.tw/mops/web/t120sg01?bond_id=35221&issuer_stock_code=3522",
  }];
  await mkdir(generation, { recursive: true });
  await writeFile(
    join(dataRoot, "current.json"),
    JSON.stringify({ schemaVersion: 1, generation: "generations/abcdef", runtimeUrl: "./data/generations/abcdef/runtime.json" }),
    "utf8",
  );
  await writeFile(join(generation, "conversion-prices.json"), JSON.stringify(versions), "utf8");
  await writeFile(
    join(generation, "manifest.json"),
    JSON.stringify({ market: { status: "verified", files: [] } }),
    "utf8",
  );

  assert.deepEqual(await readPublishedConversionPrices(dataRoot), versions);
});

test("published history verifies and migrates a declared legacy active generation before merging cache", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-legacy-history-"));
  const dataRoot = join(root, "data");
  const generation = join(dataRoot, "generations", "abcdef");
  const cachePath = join(root, ".cache", "published-history", "bond-market-history.json");
  const legacy = [legacyHistoryPoint(), legacyHistoryPoint({ bondCode: "35222" })];
  const legacyText = `${JSON.stringify(legacy)}\n`;
  await mkdir(generation, { recursive: true });
  await mkdir(join(root, ".cache", "published-history"), { recursive: true });
  await writeFile(
    join(dataRoot, "current.json"),
    JSON.stringify({ schemaVersion: 1, generation: "generations/abcdef", runtimeUrl: "./data/generations/abcdef/runtime.json" }),
    "utf8",
  );
  await writeFile(join(generation, "bond-market-history.json"), legacyText, "utf8");
  await writeFile(
    join(generation, "manifest.json"),
    JSON.stringify({
      market: {
        status: "verified",
        files: [{
          name: "bond-market-history.json",
          sha256: `sha256:${createHash("sha256").update(legacyText).digest("hex")}`,
          rawBytes: Buffer.byteLength(legacyText),
          recordCount: legacy.length,
        }],
      },
    }),
    "utf8",
  );
  await writeFile(
    cachePath,
    JSON.stringify([
      historyPoint({ bondCode: "35221", cbClose: "101.5", stockClose: "52.3", effectiveConversionPrice: "44.2", conversionValue: "118.3258", premiumRate: "-14.2201" }),
      historyPoint({ bondCode: "35223", date: "2026-07-01", cbClose: "102" }),
    ]),
    "utf8",
  );

  assert.deepEqual(await readPublishedBondHistory(dataRoot, cachePath), [
    historyPoint({ cbClose: "101.5", stockClose: "52.3", effectiveConversionPrice: "44.2", conversionValue: "118.3258", premiumRate: "-14.2201" }),
    historyPoint({ bondCode: "35222", cbClose: "101.5", stockClose: "52.3", effectiveConversionPrice: "44.2", conversionValue: "118.3258", premiumRate: "-14.2201" }),
    historyPoint({ bondCode: "35223", date: "2026-07-01", cbClose: "102" }),
  ]);
});

test("checked-in active history preserves every published identity and value", async () => {
  const dataRoot = fileURLToPath(new URL("../static-showcase/data/", import.meta.url));
  const pointer = JSON.parse(await readFile(join(dataRoot, "current.json"), "utf8"));
  const published = JSON.parse(await readFile(
    join(dataRoot, pointer.generation, "bond-market-history.json"),
    "utf8",
  ));
  const readModel = await readPublishedBondHistory(dataRoot);
  assert.ok(published.length > 0);
  assert.equal(readModel.length, published.length);
  assert.equal(
    new Set(published.map(({ bondCode, date }) => `${bondCode}:${date}`)).size,
    published.length,
  );
  const sortedPublished = [...published].sort((left, right) =>
    left.bondCode.localeCompare(right.bondCode) || left.date.localeCompare(right.date));
  assert.equal(JSON.stringify(readModel), JSON.stringify(sortedPublished));
});

test("published legacy history verifies manifest count before migration", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-legacy-count-"));
  const dataRoot = join(root, "data");
  const generation = join(dataRoot, "generations", "abcdef");
  const legacyText = `${JSON.stringify([legacyHistoryPoint()])}\n`;
  await mkdir(generation, { recursive: true });
  await writeFile(
    join(dataRoot, "current.json"),
    JSON.stringify({ schemaVersion: 1, generation: "generations/abcdef", runtimeUrl: "./data/generations/abcdef/runtime.json" }),
    "utf8",
  );
  await writeFile(join(generation, "bond-market-history.json"), legacyText, "utf8");
  await writeFile(
    join(generation, "manifest.json"),
    JSON.stringify({ market: { files: [{
      name: "bond-market-history.json",
      sha256: `sha256:${createHash("sha256").update(legacyText).digest("hex")}`,
      recordCount: 2,
    }] } }),
    "utf8",
  );

  await assert.rejects(
    readPublishedBondHistory(dataRoot),
    /manifest integrity is invalid/,
  );
});

test("published history rejects conflicting cache values for the same active legacy identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-history-conflict-"));
  const dataRoot = join(root, "data");
  const generation = join(dataRoot, "generations", "abcdef");
  const cachePath = join(root, "cache.json");
  const legacyText = `${JSON.stringify([legacyHistoryPoint()])}\n`;
  await mkdir(generation, { recursive: true });
  await writeFile(
    join(dataRoot, "current.json"),
    JSON.stringify({ schemaVersion: 1, generation: "generations/abcdef", runtimeUrl: "./data/generations/abcdef/runtime.json" }),
    "utf8",
  );
  await writeFile(join(generation, "bond-market-history.json"), legacyText, "utf8");
  await writeFile(
    join(generation, "manifest.json"),
    JSON.stringify({ market: { files: [{
      name: "bond-market-history.json",
      sha256: `sha256:${createHash("sha256").update(legacyText).digest("hex")}`,
      recordCount: 1,
    }] } }),
    "utf8",
  );
  await writeFile(cachePath, JSON.stringify([historyPoint({ cbClose: "999" })]), "utf8");

  await assert.rejects(
    readPublishedBondHistory(dataRoot, cachePath),
    /CONFLICTING_PUBLISHED_BOND_HISTORY.*35221.*2026-06-30/,
  );
});

for (const manifestFailure of ["missing", "corrupt"]) {
  test(`refresh fails before fetch when the active generation manifest is ${manifestFailure}`, async () => {
    await withTemporaryShowcase(async (root) => {
      await seedPriorGeneration(root);
      const generation = join(root, "static-showcase/data/generations/abcdef");
      const pointerPath = join(root, "static-showcase/data/current.json");
      const beforePointer = await readFile(pointerPath, "utf8");
      if (manifestFailure === "missing") {
        await rm(join(generation, "manifest.json"));
      } else {
        await writeFile(join(generation, "manifest.json"), "{not-json", "utf8");
      }
      let fetchCalls = 0;

      await assert.rejects(
        withBlockedGlobalFetch(() => refreshStaticShowcase({
          fetchImpl: async () => {
            fetchCalls += 1;
            return new Response("must not fetch", { status: 500 });
          },
        })),
        /ACTIVE_GENERATION_MANIFEST|manifest/i,
      );
      assert.equal(fetchCalls, 0);
      assert.equal(await readFile(pointerPath, "utf8"), beforePointer);
    });
  });
}

test("prior generation fails closed when its manifest declares a missing issuer snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-prior-research-"));
  const dataRoot = join(root, "data");
  const generation = join(dataRoot, "generations", "abcdef");
  await mkdir(generation, { recursive: true });
  await writeFile(
    join(dataRoot, "current.json"),
    JSON.stringify({ schemaVersion: 1, generation: "generations/abcdef", runtimeUrl: "./data/generations/abcdef/runtime.json" }),
    "utf8",
  );
  await writeFile(
    join(generation, "manifest.json"),
    JSON.stringify({
      market: { files: [{ name: "cb-issuer-research.json" }] },
    }),
    "utf8",
  );

  await assert.rejects(
    readPublishedCbIssuerResearch(dataRoot),
    /missing prior CB issuer research/i,
  );
});

test("prior generation fails closed when its manifest declares a missing CB supplemental snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-prior-supplemental-"));
  const dataRoot = join(root, "data");
  const generation = join(dataRoot, "generations", "abcdef");
  await mkdir(generation, { recursive: true });
  await writeFile(
    join(dataRoot, "current.json"),
    JSON.stringify({ schemaVersion: 1, generation: "generations/abcdef", runtimeUrl: "./data/generations/abcdef/runtime.json" }),
    "utf8",
  );
  await writeFile(
    join(generation, "manifest.json"),
    JSON.stringify({
      market: { files: [{ name: "bond-supplemental.json" }] },
    }),
    "utf8",
  );

  await assert.rejects(
    readPublishedCbSupplemental(dataRoot),
    /missing prior CB supplemental/i,
  );
});

test("prior workbench is optional only when the active manifest does not declare it", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-prior-workbench-"));
  const dataRoot = join(root, "data");
  const generation = join(dataRoot, "generations", "abcdef");
  await mkdir(generation, { recursive: true });
  await writeFile(
    join(dataRoot, "current.json"),
    JSON.stringify({ schemaVersion: 1, generation: "generations/abcdef", runtimeUrl: "./data/generations/abcdef/runtime.json" }),
    "utf8",
  );
  await writeFile(
    join(generation, "manifest.json"),
    JSON.stringify({ market: { files: [] } }),
    "utf8",
  );
  assert.equal(await readPublishedBondWorkbench(dataRoot), undefined);

  await writeFile(
    join(generation, "manifest.json"),
    JSON.stringify({ market: { files: [{ name: "bond-workbench.json" }] } }),
    "utf8",
  );
  await assert.rejects(
    readPublishedBondWorkbench(dataRoot),
    /missing prior bond workbench/i,
  );
});

test("refresh validates the complete prior CB supplemental snapshot before any fetch", async () => {
  await withTemporaryShowcase(async (root) => {
    await seedPriorGeneration(root);
    const dataDirectory = join(root, "static-showcase/data");
    const generation = join(dataDirectory, "generations/abcdef");
    const pointerPath = join(dataDirectory, "current.json");
    const beforePointer = await readFile(pointerPath, "utf8");
    await writeFile(
      join(generation, "bond-supplemental.json"),
      '{"schemaVersion":1,"unexpected":true}\n',
      "utf8",
    );
    let fetchCalls = 0;

    await assert.rejects(
      withBlockedGlobalFetch(() => refreshStaticShowcase({
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("must not fetch", { status: 500 });
        },
      })),
      /prior CB supplemental snapshot is invalid/i,
    );
    assert.equal(fetchCalls, 0);
    assert.equal(await readFile(pointerPath, "utf8"), beforePointer);
  });
});

test("refresh validates the complete prior workbench before any fetch", async () => {
  await withTemporaryShowcase(async (root) => {
    await seedPriorGeneration(root);
    const dataDirectory = join(root, "static-showcase/data");
    const generation = join(dataDirectory, "generations/abcdef");
    const pointerPath = join(dataDirectory, "current.json");
    const beforePointer = await readFile(pointerPath, "utf8");
    await writeFile(
      join(generation, "manifest.json"),
      JSON.stringify({
        market: {
          status: "verified",
          files: [{ name: "bond-workbench.json" }],
        },
      }),
      "utf8",
    );
    await writeFile(
      join(generation, "bond-workbench.json"),
      '{"schemaVersion":1,"unexpected":true}\n',
      "utf8",
    );
    let fetchCalls = 0;

    await assert.rejects(
      withBlockedGlobalFetch(() => refreshStaticShowcase({
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("must not fetch", { status: 500 });
        },
      })),
      /prior bond workbench snapshot is invalid/i,
    );
    assert.equal(fetchCalls, 0);
    assert.equal(await readFile(pointerPath, "utf8"), beforePointer);
  });
});

test("refresh fails before fetch when the active manifest declares missing history", async () => {
  await withTemporaryShowcase(async (root) => {
    await seedPriorGeneration(root);
    const dataDirectory = join(root, "static-showcase/data");
    const generation = join(dataDirectory, "generations/abcdef");
    await writeFile(
      join(generation, "manifest.json"),
      JSON.stringify({
        market: {
          status: "verified",
          files: [{ name: "bond-market-history.json" }],
        },
      }),
      "utf8",
    );
    let fetchCalls = 0;
    await assert.rejects(
      withBlockedGlobalFetch(() => refreshStaticShowcase({
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("must not fetch", { status: 500 });
        },
      })),
      /missing prior bond market history/i,
    );
    assert.equal(fetchCalls, 0);
  });
});

test("prior declared workbench hash metadata is verified before reuse", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-prior-workbench-hash-"));
  const dataRoot = join(root, "data");
  const generation = join(dataRoot, "generations/abcdef");
  await mkdir(generation, { recursive: true });
  await writeFile(
    join(dataRoot, "current.json"),
    JSON.stringify({ schemaVersion: 1, generation: "generations/abcdef", runtimeUrl: "./data/generations/abcdef/runtime.json" }),
    "utf8",
  );
  const workbench = {
    schemaVersion: 1,
    generatedAt: "2026-07-29T06:00:06.000Z",
    dataDate: "2026-07-29",
    records: [],
  };
  const text = `${JSON.stringify(workbench)}\n`;
  await writeFile(join(generation, "bond-workbench.json"), text, "utf8");
  await writeFile(
    join(generation, "manifest.json"),
    JSON.stringify({
      market: {
        workbenchSourceStateSummary: {
          lifecycle: { active: 0, archived: 0 },
          fields: {},
        },
        files: [{
          name: "bond-workbench.json",
          sha256: `sha256:${"0".repeat(64)}`,
          rawBytes: Buffer.byteLength(text),
          recordCount: 0,
          schemaVersion: 1,
          sourceStateSummary: {
            lifecycle: { active: 0, archived: 0 },
            fields: {},
          },
        }],
      },
    }),
    "utf8",
  );
  await assert.rejects(
    readPublishedBondWorkbench(dataRoot),
    /hash|manifest|integrity/i,
  );
});

test("staged generation rejects an inexact runtime contract before pointer switch", async () => {
  const { runIsolatedRefreshStaticShowcaseTestHarness } = await import(
    "../scripts/refresh-static-showcase-data.mjs"
  );
  const outcome = await runIsolatedRefreshStaticShowcaseTestHarness({
    scenario: "runtime",
    now: "2026-07-30T06:00:06.000Z",
  });
  assert.equal(outcome.status, "rejected");
  assert.match(String(outcome.error), /VALIDATION_FAILED.*RUNTIME/);
  assert.equal(outcome.artifacts.after.pointerText, outcome.artifacts.before.pointerText);
});

test("refresh merges a restored CI history cache with the committed generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-history-cache-"));
  const dataRoot = join(root, "data");
  const generation = join(dataRoot, "generations", "abcdef");
  const cachePath = join(root, ".cache", "published-history", "bond-market-history.json");
  await mkdir(generation, { recursive: true });
  await mkdir(join(root, ".cache", "published-history"), { recursive: true });
  await writeFile(
    join(dataRoot, "current.json"),
    JSON.stringify({ schemaVersion: 1, generation: "generations/abcdef", runtimeUrl: "./data/generations/abcdef/runtime.json" }),
    "utf8",
  );
  await writeFile(
    join(generation, "bond-market-history.json"),
    JSON.stringify([historyPoint()]),
    "utf8",
  );
  await writeFile(
    join(generation, "manifest.json"),
    JSON.stringify({ market: { status: "verified", files: [] } }),
    "utf8",
  );
  await writeFile(
    cachePath,
    JSON.stringify([
      historyPoint(),
      historyPoint({ date: "2026-07-31", cbClose: "102" }),
    ]),
    "utf8",
  );

  assert.deepEqual(await readPublishedBondHistory(dataRoot, cachePath), [
    historyPoint(),
    historyPoint({ date: "2026-07-31", cbClose: "102" }),
  ]);
});

test("refresh leaves the prior generation untouched when publication fails before pointer switch", async () => {
  await withTemporaryShowcase(async (root) => {
    await seedPriorGeneration(root);
    const beforePointer = await readFile(join(root, "static-showcase/data/current.json"), "utf8");
    const beforeManifest = await readFile(join(root, "static-showcase/data/generations/abcdef/manifest.json"), "utf8");
    await assert.rejects(withBlockedGlobalFetch(() => refreshStaticShowcase({
      fetchImpl: async () => new Response("ignored", { status: 500 }),
    })));
    assert.equal(await readFile(join(root, "static-showcase/data/current.json"), "utf8"), beforePointer);
    assert.equal(await readFile(join(root, "static-showcase/data/generations/abcdef/manifest.json"), "utf8"), beforeManifest);
  });
});

for (const failureMode of [
  "hash",
  "manifest",
  "cross-file",
  "supplemental",
  "supplemental-view",
  "workbench",
  "runtime",
]) {
  test(`research ${failureMode} failure after candidate write leaves pointer and prior generation unchanged`, async () => {
    const { runIsolatedRefreshStaticShowcaseTestHarness } = await import(
      "../scripts/refresh-static-showcase-data.mjs"
    );

    const outcome = await runIsolatedRefreshStaticShowcaseTestHarness({
      scenario: failureMode,
      now: "2026-07-30T06:00:06.000Z",
    });

    assert.equal(outcome.status, "rejected");
    assert.match(String(outcome.error), /VALIDATION_FAILED/);
    assert.equal(outcome.artifacts.after.pointerText, outcome.artifacts.before.pointerText);
    assert.equal(
      outcome.artifacts.after.priorResearchText,
      outcome.artifacts.before.priorResearchText,
    );
    assert.equal(
      outcome.artifacts.after.priorSupplementalText,
      outcome.artifacts.before.priorSupplementalText,
    );
    assert.notEqual(outcome.artifacts.before.priorWorkbenchText, undefined);
    assert.equal(
      outcome.artifacts.after.priorWorkbenchText,
      outcome.artifacts.before.priorWorkbenchText,
    );
  });
}

test("cache/rename failure leaves pointer, prior generation and cache bytes unchanged", async () => {
  const { runIsolatedRefreshStaticShowcaseTestHarness } = await import(
    "../scripts/refresh-static-showcase-data.mjs"
  );
  const outcome = await runIsolatedRefreshStaticShowcaseTestHarness({
    scenario: "cache",
    now: "2026-07-30T06:00:06.000Z",
  });

  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.artifacts.after.pointerText, outcome.artifacts.before.pointerText);
  assert.equal(
    outcome.artifacts.after.priorWorkbenchText,
    outcome.artifacts.before.priorWorkbenchText,
  );
  assert.notEqual(outcome.artifacts.before.cacheText, undefined);
  assert.equal(outcome.artifacts.after.cacheText, outcome.artifacts.before.cacheText);
});

test("refresh fails closed and preserves prior files when emerging-market validation fails", async () => {
  await withTemporaryShowcase(async (root) => {
    const dataDirectory = join(root, "static-showcase/data");
    const paths = ["94025.json", "11406.json", "11586.json", "emerging-market.json", "manifest.json", "runtime.js"];
    await Promise.all(paths.map((name) => writeFile(join(dataDirectory, name), `prior:${name}`, "utf8")));
    const before = await Promise.all(paths.map(async (name) => [name, await readFile(join(dataDirectory, name), "utf8")]));

    await assert.rejects(
      withBlockedGlobalFetch(() => refreshStaticShowcase({
        fetchImpl: async (url) => {
          if (String(url) === OFFICIAL_SHOWCASE_SOURCES.emergingMarket) return new Response("{}", { status: 200 });
          if (String(url) === OFFICIAL_SHOWCASE_SOURCES["94025"]) {
            return new Response(await fixtureText("source-verification/94025/csv-minimal.csv"), { status: 200 });
          }
          if (String(url) === OFFICIAL_SHOWCASE_SOURCES["11406"]) {
            return new Response("bondCode\n", { status: 200 });
          }
          return new Response("header\nvalue\n", { status: 200 });
        },
      })),
      /emerging market payload must be an array/,
    );

    const after = await Promise.all(paths.map(async (name) => [name, await readFile(join(dataDirectory, name), "utf8")]));
    assert.deepEqual(after, before);
  });
});

test("正式展示資料只從核准的三個官方 CSV 匯入", () => {
  assert.deepEqual(OFFICIAL_SHOWCASE_SOURCES, {
    "94025": "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv",
    "11406": "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
    "11586":
      "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
    emergingMarket:
      "https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics",
  });
});

test("重新產生 runtime 時只寫入正式資料網址，不嵌入呈現程式", () => {
  const manifest = { generatedAt: "2026-07-30", datasets: [] };
  const result = buildRuntimeBootstrap(manifest);

  assert.match(result, /window\.__OFFICIAL_SHOWCASE__/);
  assert.match(result, /"generationPointerUrl":"\.\/data\/current\.json"/);
  assert.doesNotMatch(result, /公司代號|document\.querySelector/);
});

test("正式 CSV 遇到暫時 DNS 或伺服器錯誤時只重試相同網址", async () => {
  const url = OFFICIAL_SHOWCASE_SOURCES["94025"];
  const requested = [];
  const delays = [];
  const dnsError = new TypeError("fetch failed");
  dnsError.cause = { code: "ENOTFOUND" };
  const responses = [
    dnsError,
    {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/csv" }),
      arrayBuffer: async () => {
        throw new TypeError("terminated");
      },
    },
    new Response("欄位\n資料", {
      status: 200,
      headers: { "content-type": "text/csv" },
    }),
  ];
  const response = await fetchOfficialCsvWithRetry(
    url,
    async (requestedUrl) => {
      requested.push(String(requestedUrl));
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    { sleep: async (milliseconds) => delays.push(milliseconds) },
  );

  assert.equal(response.status, 200);
  assert.equal(new TextDecoder().decode(response.bytes), "欄位\n資料");
  assert.deepEqual(requested, [url, url, url]);
  assert.deepEqual(delays, [2_000, 4_000]);
});

test("runtime 快取標記可重複執行且仍拒絕缺少標記的 HTML", () => {
  const current =
    '<script src="./data/runtime.js?v=d8e5aa9336d0"></script>';

  assert.equal(updateRuntimeCacheKey(current, "d8e5aa9336d0"), current);
  assert.equal(
    updateRuntimeCacheKey(current, "abc123"),
    '<script src="./data/runtime.js?v=abc123"></script>',
  );
  assert.throws(
    () => updateRuntimeCacheKey("<html></html>", "abc123"),
    /runtime cache key marker not found/,
  );
});

async function fixtureText(path) {
  return readFile(new URL(`./fixtures/${path}`, import.meta.url), "utf8");
}

function issuerResearchSnapshot(generatedAt = "2026-07-29T06:00:06.000Z") {
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

async function withTemporaryShowcase(run) {
  const root = await mkdtemp(join(tmpdir(), "showcase-refresh-"));
  const originalDirectory = process.cwd();
  await mkdir(join(root, "static-showcase/data"), { recursive: true });
  await writeFile(
    join(root, "static-showcase/index.html"),
    '<script src="./data/runtime.js?v=prior"></script>',
    "utf8",
  );
  process.chdir(root);
  try {
    await run(root);
  } finally {
    process.chdir(originalDirectory);
    await rm(root, { recursive: true, force: true });
  }
}

async function seedPriorGeneration(root) {
  const generation = join(root, "static-showcase/data/generations/abcdef");
  await mkdir(generation, { recursive: true });
  await writeFile(
    join(generation, "manifest.json"),
    JSON.stringify({ market: { status: "verified", files: [] } }),
    "utf8",
  );
  await writeFile(join(generation, "runtime.json"), "old-runtime", "utf8");
  await writeFile(
    join(generation, "cb-issuer-research.json"),
    `${JSON.stringify(issuerResearchSnapshot())}\n`,
    "utf8",
  );
  await writeFile(join(root, "static-showcase/data/current.json"), JSON.stringify({
    schemaVersion: 1,
    generation: "generations/abcdef",
    runtimeUrl: "./data/generations/abcdef/runtime.json",
  }), "utf8");
}
