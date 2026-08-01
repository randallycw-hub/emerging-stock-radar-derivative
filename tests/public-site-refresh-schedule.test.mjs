import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { triggerIpoRefresh } from "../scripts/trigger-ipo-refresh.mjs";
import { createValidIpoSnapshot } from "./helpers/ipo-snapshot.mjs";

const now = new Date("2026-08-01T14:30:00.000Z");

test("daily refresh workflow wakes the public IPO endpoint once at 22:30 Taipei time", async () => {
  const workflow = await readFile(".github/workflows/refresh-public-site.yml", "utf8");

  assert.match(workflow, /name:\s*Refresh public IPO data/);
  assert.match(workflow, /cron:\s*["']30 14 \* \* \*["']/);
  assert.match(workflow, /timeout-minutes:\s*5/);
  assert.match(workflow, /UV_THREADPOOL_SIZE:\s*["']2["']/);
  assert.match(workflow, /IPO_REFRESH_URL:\s*["']https:\/\/emerging-stock-radar-derivative-20260720\.chiayu333\.chatgpt\.site\/api\/ipo-events["']/);
  assert.match(workflow, /node scripts\/trigger-ipo-refresh\.mjs/);
  assert.doesNotMatch(workflow, /deploy-pages|upload-pages-artifact|pages:\s*write|id-token:\s*write|cloudflare|workers\.dev|relay/i);
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
