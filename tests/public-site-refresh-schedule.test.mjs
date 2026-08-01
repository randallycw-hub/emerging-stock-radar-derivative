import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { triggerIpoRefresh } from "../scripts/trigger-ipo-refresh.mjs";

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

test("IPO refresh accepts a complete stale snapshot and adds refresh=1 without retrying", async () => {
  const requested = [];
  const result = await triggerIpoRefresh({
    url: "https://site.test/api/ipo-events",
    fetchImpl: async (url) => {
      requested.push(String(url));
      return new Response(JSON.stringify({ schemaVersion: 1, records: [], stale: true, dataDate: "2026-08-01" }), { status: 200 });
    },
  });

  assert.equal(result.dataDate, "2026-08-01");
  assert.deepEqual(requested, ["https://site.test/api/ipo-events?refresh=1"]);
});

test("IPO refresh rejects incomplete or unsuccessful responses", async () => {
  await assert.rejects(
    triggerIpoRefresh({ url: "https://site.test/api/ipo-events", fetchImpl: async () => new Response("{}", { status: 503 }) }),
    /HTTP 503/,
  );
  await assert.rejects(
    triggerIpoRefresh({ url: "https://site.test/api/ipo-events", fetchImpl: async () => new Response(JSON.stringify({ schemaVersion: 1, records: "bad" }), { status: 200 }) }),
    /records/,
  );
});
