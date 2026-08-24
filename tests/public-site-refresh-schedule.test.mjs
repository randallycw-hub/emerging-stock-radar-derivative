import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { triggerIpoRefresh } from "../scripts/trigger-ipo-refresh.mjs";
import { runNightlyMarketRefresh } from "../scripts/run-nightly-market-refresh.mjs";
import { createValidIpoSnapshot } from "./helpers/ipo-snapshot.mjs";

const now = new Date("2026-08-01T14:30:00.000Z");

test("obsolete Cloudflare refresh workflow stays removed", async () => {
  await assert.rejects(access(".github/workflows/refresh-public-site.yml"), { code: "ENOENT" });
});

test("Taipei refresh workflow schedules validation modes without deployment credentials", async () => {
  const workflow = await readFile(".github/workflows/market-data-refresh.yml", "utf8");

  for (const cron of [
    "15 8 * * 1-5",
    "45 9 * * 1-5",
    "30 14 * * *",
    "30 23 * * 0-4",
    "0 2 * * 6",
  ]) {
    assert.match(workflow, new RegExp(`cron: ['\"]${cron.replaceAll("*", "\\*")}['\"]`));
  }
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /mode:/);
  assert.doesNotMatch(workflow, /deploy|hosting|token|secret|curl/i);
});

test("nightly static-input runner rejects deployment and correction controls before I/O", async () => {
  let calls = 0;
  for (const option of [
    { deployUrl: "https://deploy.test/hook" },
    { correction: { path: "evidence.json" } },
    { correctionCallback: () => {} },
  ]) {
    await assert.rejects(
      runNightlyMarketRefresh({
        date: "2026-07-30",
        fetchImpl: async () => {
          calls += 1;
          throw new Error("must not fetch");
        },
        ...option,
      }),
      /not supported by nightly refresh/i,
    );
  }
  assert.equal(calls, 0);
});

test("IPO refresh accepts only a complete non-stale Taipei-today snapshot and adds refresh=1", async () => {
  const requested = [];
  const snapshot = createValidIpoSnapshot();
  const result = await triggerIpoRefresh({
    url: "https://site.test/api/ipo-events",
    now,
    fetchImpl: async (url) => {
      requested.push(String(url));
      return Response.json(snapshot);
    },
  });

  assert.equal(result.dataDate, "2026-08-01");
  assert.deepEqual(requested, ["https://site.test/api/ipo-events?refresh=1"]);
});

test("IPO refresh retries and ultimately rejects stale, empty, wrong-date, or incomplete payloads", async () => {
  const cases = [
    ["stale", { ...createValidIpoSnapshot(), stale: true }, /stale/],
    ["empty", createValidIpoSnapshot({ records: [] }), /records/],
    ["wrong-date", createValidIpoSnapshot({ dataDate: "2026-07-31", generatedAt: "2026-07-31T22:30:00+08:00" }), /Taipei today/],
    ["manifest", { ...createValidIpoSnapshot(), sourceManifest: [] }, /sourceManifest/],
  ];

  for (const [name, payload, error] of cases) {
    let calls = 0;
    const sleeps = [];
    await assert.rejects(triggerIpoRefresh({
      url: "https://site.test/api/ipo-events",
      now,
      retryDelayMs: 1,
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
      fetchImpl: async () => { calls += 1; return Response.json(payload); },
    }), error, name);
    assert.equal(calls, 3, name);
    assert.deepEqual(sleeps, [1, 1], name);
  }
});

test("IPO refresh performs bounded in-job retry and succeeds without another workflow notification", async () => {
  const fresh = createValidIpoSnapshot();
  const stale = { ...fresh, stale: true };
  const responses = [
    Response.json(stale),
    new Response("unavailable", { status: 503 }),
    Response.json(fresh),
  ];
  const sleeps = [];

  const result = await triggerIpoRefresh({
    url: "https://site.test/api/ipo-events",
    now,
    retryDelayMs: 20,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    fetchImpl: async () => responses.shift(),
  });

  assert.equal(result.dataDate, "2026-08-01");
  assert.deepEqual(sleeps, [20, 20]);
});

test("IPO refresh exits nonzero only after the final HTTP failure", async () => {
  let calls = 0;
  await assert.rejects(triggerIpoRefresh({
    url: "https://site.test/api/ipo-events",
    now,
    retryDelayMs: 0,
    sleep: async () => {},
    fetchImpl: async () => { calls += 1; return new Response("{}", { status: 503 }); },
  }), /HTTP 503/);
  assert.equal(calls, 3);
});
