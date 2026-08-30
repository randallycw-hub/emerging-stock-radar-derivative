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

test("central registry pins every approved CB supplemental resource", () => {
  for (const expected of [{
    sourceId: "tpex-cb-institution-daily",
    resourceId: "tpex-cb-institution-daily-json",
    exactUrl: "https://www.tpex.org.tw/www/zh-tw/bond/newCb3itrade",
    hostname: "www.tpex.org.tw",
    pathname: "/www/zh-tw/bond/newCb3itrade",
    allowedContentTypes: ["application/json"],
    maxResponseBytes: 500_000,
    usageRole: "primary_json",
  }, {
    sourceId: "tpex-cb-redemption-announcements",
    resourceId: "tpex-cb-redemption-announcements-json",
    exactUrl: "https://www.tpex.org.tw/www/zh-tw/bond/redeem",
    hostname: "www.tpex.org.tw",
    pathname: "/www/zh-tw/bond/redeem",
    allowedContentTypes: ["application/json"],
    maxResponseBytes: 500_000,
    usageRole: "primary_json",
  }, {
    sourceId: "mops-cb-redemption-detail",
    resourceId: "mops-cb-redemption-detail-html",
    exactUrl: "https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?",
    hostname: "mopsov.twse.com.tw",
    pathname: "/mops/web/ajax_t120sb23",
    allowedContentTypes: ["text/html"],
    maxResponseBytes: 500_000,
    usageRole: "primary_html",
  }, {
    sourceId: "twsa-cb-underwriting-announcements",
    resourceId: "twsa-cb-underwriting-announcements-html",
    exactUrl: "https://web.twsa.org.tw/edoc2/default.aspx",
    hostname: "web.twsa.org.tw",
    pathname: "/edoc2/default.aspx",
    allowedContentTypes: ["text/html"],
    maxResponseBytes: 1_000_000,
    usageRole: "primary_html",
  }]) {
    const actual = getApprovedResource(expected.sourceId, expected.resourceId);
    assert.deepEqual({
      sourceId: actual.sourceId,
      resourceId: actual.resourceId,
      exactUrl: actual.exactUrl,
      protocol: actual.protocol,
      hostname: actual.hostname,
      pathname: actual.pathname,
      allowedContentTypes: actual.allowedContentTypes,
      maxResponseBytes: actual.maxResponseBytes,
      timeoutMs: actual.timeoutMs,
      approvalStatus: actual.approvalStatus,
      usageRole: actual.usageRole,
    }, {
      ...expected,
      protocol: "https:",
      timeoutMs: 30_000,
      approvalStatus: "APPROVED_FOR_PRODUCTION",
    });
  }
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
