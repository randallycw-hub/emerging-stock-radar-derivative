import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  OFFICIAL_SHOWCASE_SOURCES,
  buildRuntimeBootstrap,
  fetchOfficialCsvWithRetry,
  readPublishedBondHistory,
  readPublishedCbIssuerResearch,
  refreshStaticShowcase,
  updateRuntimeCacheKey,
} from "../scripts/refresh-static-showcase-data.mjs";

test("refresh preserves prior files when the TPEx snapshot request fails", async () => {
  await withTemporaryShowcase(async (root) => {
    const dataDirectory = join(root, "static-showcase/data");
    const paths = ["94025.json", "11406.json", "11586.json", "emerging-market.json", "manifest.json", "runtime.js"];
    await Promise.all(paths.map((name) => writeFile(join(dataDirectory, name), `prior:${name}`, "utf8")));
    const before = await Promise.all(paths.map(async (name) => [name, await readFile(join(dataDirectory, name), "utf8")]));

    await assert.rejects(
      refreshStaticShowcase({
        fetchImpl: async (url) => {
          if (String(url) === OFFICIAL_SHOWCASE_SOURCES.emergingMarket) return new Response("unavailable", { status: 503 });
          if (String(url) === OFFICIAL_SHOWCASE_SOURCES["94025"]) {
            return new Response(await fixtureText("source-verification/94025/csv-minimal.csv"), { status: 200 });
          }
          return new Response("header\n", { status: 200 });
        },
      }),
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
      refreshStaticShowcase({
        offlineIssuerResearchSourceResults: {
          listed: { status: "fulfilled", value: "injected,current,csv" },
          otc: { status: "rejected", reason: new Error("offline") },
        },
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("must not fetch", { status: 500 });
        },
      }),
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
      refreshStaticShowcase({
        marketBuilder: async () => assert.fail("injected builder must not run"),
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("must not fetch", { status: 500 });
        },
      }),
      /marketBuilder.*not supported/i,
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
  assert.equal(runtime.generation, pointer.generation);
  assert.equal(runtime.manifestUrl, `./data/${pointer.generation}/manifest.json`);
  assert.equal(
    runtime.datasets.cbIssuerResearch,
    `./data/${pointer.generation}/cb-issuer-research.json`,
  );
  const issuerResearch = JSON.parse(
    outcome.artifacts.active["cb-issuer-research.json"],
  );
  assert.equal(issuerResearch.records[0].issuerCode, "1260");
});

test("refresh reads the prior generation bond history before staging a replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-history-"));
  const dataRoot = join(root, "data");
  const generation = join(dataRoot, "generations", "abcdef");
  const history = [{ bondCode: "35221", date: "2026-06-30" }];
  await mkdir(generation, { recursive: true });
  await writeFile(
    join(dataRoot, "current.json"),
    JSON.stringify({ schemaVersion: 1, generation: "generations/abcdef" }),
    "utf8",
  );
  await writeFile(join(generation, "bond-market-history.json"), JSON.stringify(history), "utf8");

  assert.deepEqual(await readPublishedBondHistory(dataRoot), history);
});

test("prior generation fails closed when its manifest declares a missing issuer snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-prior-research-"));
  const dataRoot = join(root, "data");
  const generation = join(dataRoot, "generations", "abcdef");
  await mkdir(generation, { recursive: true });
  await writeFile(
    join(dataRoot, "current.json"),
    JSON.stringify({ schemaVersion: 1, generation: "generations/abcdef" }),
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

test("refresh merges a restored CI history cache with the committed generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-history-cache-"));
  const dataRoot = join(root, "data");
  const generation = join(dataRoot, "generations", "abcdef");
  const cachePath = join(root, ".cache", "published-history", "bond-market-history.json");
  await mkdir(generation, { recursive: true });
  await mkdir(join(root, ".cache", "published-history"), { recursive: true });
  await writeFile(
    join(dataRoot, "current.json"),
    JSON.stringify({ schemaVersion: 1, generation: "generations/abcdef" }),
    "utf8",
  );
  await writeFile(
    join(generation, "bond-market-history.json"),
    JSON.stringify([{ bondCode: "35221", date: "2026-06-30" }]),
    "utf8",
  );
  await writeFile(
    cachePath,
    JSON.stringify([
      { bondCode: "35221", date: "2026-06-30", cbClose: "101" },
      { bondCode: "35221", date: "2026-07-31", cbClose: "102" },
    ]),
    "utf8",
  );

  assert.deepEqual(await readPublishedBondHistory(dataRoot, cachePath), [
    { bondCode: "35221", date: "2026-06-30", cbClose: "101" },
    { bondCode: "35221", date: "2026-07-31", cbClose: "102" },
  ]);
});

test("refresh leaves the prior generation untouched when publication fails before pointer switch", async () => {
  await withTemporaryShowcase(async (root) => {
    await seedPriorGeneration(root);
    const beforePointer = await readFile(join(root, "static-showcase/data/current.json"), "utf8");
    const beforeManifest = await readFile(join(root, "static-showcase/data/generations/abcdef/manifest.json"), "utf8");
    await assert.rejects(refreshStaticShowcase({
      fetchImpl: async () => new Response("ignored", { status: 500 }),
    }));
    assert.equal(await readFile(join(root, "static-showcase/data/current.json"), "utf8"), beforePointer);
    assert.equal(await readFile(join(root, "static-showcase/data/generations/abcdef/manifest.json"), "utf8"), beforeManifest);
  });
});

for (const failureMode of ["hash", "manifest", "cross-file"]) {
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
  });
}

test("refresh fails closed and preserves prior files when emerging-market validation fails", async () => {
  await withTemporaryShowcase(async (root) => {
    const dataDirectory = join(root, "static-showcase/data");
    const paths = ["94025.json", "11406.json", "11586.json", "emerging-market.json", "manifest.json", "runtime.js"];
    await Promise.all(paths.map((name) => writeFile(join(dataDirectory, name), `prior:${name}`, "utf8")));
    const before = await Promise.all(paths.map(async (name) => [name, await readFile(join(dataDirectory, name), "utf8")]));

    await assert.rejects(
      refreshStaticShowcase({
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
      }),
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
  await writeFile(join(root, "static-showcase/data/current.json"), JSON.stringify({ generation: "generations/abcdef" }), "utf8");
}
