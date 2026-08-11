import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getApprovedResource } from "../lib/pipeline/source-registry.ts";

test("every CSV published by the formal showcase has production approval", () => {
  for (const [sourceId, resourceId] of [
    ["11406", "11406-csv"],
    ["94025", "94025-csv"],
    ["11586", "11586-csv"],
    ["data-gov-18420-listed-monthly-revenue", "data-gov-18420-listed-monthly-revenue-csv"],
    ["data-gov-56510-otc-monthly-revenue", "data-gov-56510-otc-monthly-revenue-csv"],
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
    "data-gov-18420-listed-monthly-revenue-csv",
    "data-gov-56510-otc-monthly-revenue-csv",
  ]) {
    assert.match(registry, new RegExp(`${resource}[^\n]*APPROVED_FOR_PRODUCTION`));
  }
});

test("issuer research approval records independent final live evidence", async () => {
  const evidence = await readFile(
    "docs/source-verification/cb-issuer-research-live-smoke.md",
    "utf8",
  );
  assert.match(evidence, /2026-08-11T05:41:43\.350Z/);
  assert.match(evidence, /839a3526663292df8db574f0dbbca0690ff22d2cbb3175fe9a471256f2163f8a/);
  assert.match(evidence, /75531b69ce9daf23d48f9aaac7908e833c49fdf2bcc8fbf69599ca41187fa79c/);
  assert.match(evidence, /159 matched[^\n]*150 missing[^\n]*1 name conflict/);
  assert.match(evidence, /147 matched[^\n]*161 missing[^\n]*2 name conflicts/);
  assert.match(evidence, /both resources: PASS/);
});
