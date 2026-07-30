import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  OFFICIAL_SHOWCASE_SOURCES,
  buildRuntimeBootstrap,
  fetchOfficialCsvWithRetry,
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
        marketBuilder: async () => assert.fail("market builder must not run after a failed TPEx request"),
      }),
      /emergingMarket: HTTP_503/,
    );

    const after = await Promise.all(paths.map(async (name) => [name, await readFile(join(dataDirectory, name), "utf8")]));
    assert.deepEqual(after, before);
  });
});

test("refresh publishes a schema-validated emerging-market snapshot from one TPEx response", async () => {
  await withTemporaryShowcase(async (root) => {
    const sourceTexts = {
      "94025": await fixtureText("source-verification/94025/csv-minimal.csv"),
      "11406": "bondCode\n",
      "11586": "companyCode\n1260\n",
      emergingMarket: await fixtureText(
        "source-verification/emerging-market/tpex-esb-latest-statistics.json",
      ),
    };
    let activeRequests = 0;
    let maximumConcurrency = 0;
    const requested = [];

    await refreshStaticShowcase({
      now: new Date("2026-07-30T06:00:06.000Z"),
      fetchImpl: async (url) => {
        requested.push(String(url));
        activeRequests += 1;
        maximumConcurrency = Math.max(maximumConcurrency, activeRequests);
        await Promise.resolve();
        activeRequests -= 1;
        const datasetId = Object.entries(OFFICIAL_SHOWCASE_SOURCES)
          .find(([, sourceUrl]) => sourceUrl === String(url))?.[0];
        return new Response(sourceTexts[datasetId], { status: 200 });
      },
      marketBuilder: async ({ manifestBase }) => ({
        manifest: { ...manifestBase, market: { status: "verified" } },
        report: { validation: "passed" },
      }),
    });

    assert.equal(requested.filter((url) => url === OFFICIAL_SHOWCASE_SOURCES.emergingMarket).length, 1);
    assert.ok(maximumConcurrency <= 2);

    const snapshot = JSON.parse(await readFile(
      join(root, "static-showcase/data/emerging-market.json"), "utf8",
    ));
    assert.deepEqual(Object.keys(snapshot).sort(), [
      "publishedAt", "records", "schemaVersion", "sourceId", "tradingDate",
    ]);
    assert.equal(snapshot.tradingDate, "2026-07-30");
    assert.equal(snapshot.publishedAt, "2026-07-30T14:00:06+08:00");
    assert.equal(snapshot.sourceId, "tpex_esb_latest_statistics");
    assert.equal(snapshot.records[0].companyCode, "1260");
    assert.equal(snapshot.records[0].industryName, "食品工業");
    assert.ok(snapshot.records.every((record) => record.tradingDate === snapshot.tradingDate));
    assert.equal(new Set(snapshot.records.map((record) => record.companyCode)).size, snapshot.records.length);
    assert.equal("LatestPrice" in snapshot.records[0], false);
    assert.equal("BuyingPrice" in snapshot.records[0], false);

    const manifest = JSON.parse(await readFile(join(root, "static-showcase/data/manifest.json"), "utf8"));
    assert.equal(manifest.emergingMarketUrl, "./data/emerging-market.json");
    const runtime = await readFile(join(root, "static-showcase/data/runtime.js"), "utf8");
    assert.match(runtime, /"emergingMarketUrl":"\.\/data\/emerging-market\.json"/);
  });
});

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
        marketBuilder: async ({ manifestBase }) => ({
          manifest: { ...manifestBase, market: { status: "verified" } }, report: { validation: "passed" },
        }),
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
  assert.match(result, /"manifestUrl":"\.\/data\/manifest\.json"/);
  assert.match(result, /"11406":"\.\/data\/11406\.json"/);
  assert.match(result, /"emergingMarketUrl":"\.\/data\/emerging-market\.json"/);
  assert.doesNotMatch(result, /公司代號|document\.querySelector/);
});

test("正式 CSV 遇到暫時 DNS 或伺服器錯誤時只重試相同網址", async () => {
  const url = OFFICIAL_SHOWCASE_SOURCES["94025"];
  const requested = [];
  const responses = [
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
    { sleep: async () => {} },
  );

  assert.equal(response.status, 200);
  assert.equal(new TextDecoder().decode(response.bytes), "欄位\n資料");
  assert.deepEqual(requested, [url, url]);
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
