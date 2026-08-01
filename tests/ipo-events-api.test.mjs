import assert from "node:assert/strict";
import test from "node:test";

import { getIpoEventsResponse } from "../lib/ipo-events/refresh.ts";

const current = {
  schemaVersion: 1,
  dataDate: "2026-07-31",
  generatedAt: "2026-07-31T22:30:00+08:00",
  sourceManifest: [],
  records: [],
};

test("returns the prior complete snapshot marked stale when refresh fails", async () => {
  let publishCalls = 0;
  const response = await getIpoEventsResponse({
    repository: {
      readCurrent: async () => current,
      publish: async () => { publishCalls += 1; },
      tryAcquireRefreshLease: async () => true,
      completeRefreshAttempt: async () => {},
    },
    fetchImpl: async () => new Response("unavailable", { status: 503 }),
    now: new Date("2026-08-01T14:30:00Z"),
    refreshRequested: true,
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=60");
  assert.deepEqual(await response.json(), { ...current, stale: true });
  assert.equal(publishCalls, 0);
});

test("a normal GET reads an old current snapshot without fetching or writing", async () => {
  let leaseCalls = 0;
  const response = await getIpoEventsResponse({
    repository: {
      readCurrent: async () => current,
      publish: async () => { throw new Error("must not publish"); },
      tryAcquireRefreshLease: async () => { leaseCalls += 1; return true; },
      completeRefreshAttempt: async () => {},
    },
    fetchImpl: async () => { throw new Error("must not fetch"); },
    now: new Date("2026-08-01T14:30:00Z"),
    refreshRequested: false,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), current);
  assert.equal(leaseCalls, 0);
});

test("returns a cacheable current snapshot without a public force-refresh switch", async () => {
  const response = await getIpoEventsResponse({
    repository: {
      readCurrent: async () => ({ ...current, dataDate: "2026-08-01" }),
      publish: async () => { throw new Error("must not publish"); },
    },
    fetchImpl: async () => { throw new Error("must not fetch"); },
    now: new Date("2026-08-01T14:30:00Z"),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=300, stale-while-revalidate=3600");
  assert.equal((await response.json()).dataDate, "2026-08-01");
});
