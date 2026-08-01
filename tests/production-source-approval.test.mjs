import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getApprovedResource } from "../lib/pipeline/source-registry.ts";

test("every CSV published by the formal showcase has production approval", () => {
  for (const [sourceId, resourceId] of [
    ["11406", "11406-csv"],
    ["94025", "94025-csv"],
    ["11586", "11586-csv"],
  ]) {
    assert.equal(
      getApprovedResource(sourceId, resourceId).approvalStatus,
      "APPROVED_FOR_PRODUCTION",
    );
  }
  assert.equal(
    getApprovedResource("28567", "28567-csv").approvalStatus,
    "VERIFIED_FOR_IMPLEMENTATION",
  );
});

test("production approval records the exact post-market resources and sign-off", async () => {
  const registry = await readFile("docs/data-source-registry.md", "utf8");
  assert.match(registry, /正式公開核准 amendment（2026-08-01）/);
  assert.match(registry, /專案擁有人已確認正式版公開上線/);
  for (const resource of [
    "11406-csv",
    "94025-csv",
    "11586-csv",
    "cbDayQry",
    "STOCK_DAY_ALL",
    "tpex_mainboard_daily_close_quotes",
    "convSearch",
    "t120sg01",
    "tpex_esb_latest_statistics",
  ]) {
    assert.match(registry, new RegExp(`${resource}[^\n]*APPROVED_FOR_PRODUCTION`));
  }
});
