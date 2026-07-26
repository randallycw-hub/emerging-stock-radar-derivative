import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPreviewData } from "../lib/preview/data.ts";
import {
  buildPreviewDashboard,
  searchPreviewEntities,
} from "../lib/preview/dashboard.ts";
import {
  PREVIEW_THEME_STORAGE_KEY,
  readPreviewTheme,
  writePreviewTheme,
} from "../lib/preview/theme.ts";

const root = new URL("../", import.meta.url);
const fixture = (path) => readFile(new URL(path, root), "utf8");

async function previewData() {
  const [
    revenueCsv,
    revenueMetadataJson,
    bondCsv,
    bondMetadataJson,
  ] = await Promise.all([
    fixture("tests/fixtures/source-verification/94025/csv-minimal.csv"),
    fixture("tests/fixtures/source-verification/94025/metadata.json"),
    fixture("tests/fixtures/source-verification/11406/csv-minimal.csv"),
    fixture("tests/fixtures/source-verification/11406/metadata.json"),
  ]);
  return buildPreviewData({
    revenueCsv,
    revenueMetadataJson,
    bondCsv,
    bondMetadataJson,
  });
}

test("Theme B is the safe default and storage failures never prevent rendering", () => {
  assert.equal(PREVIEW_THEME_STORAGE_KEY, "xingzhai-preview-theme");
  assert.equal(readPreviewTheme(undefined), "b");
  assert.equal(readPreviewTheme({ getItem: () => "a" }), "a");
  assert.equal(readPreviewTheme({ getItem: () => "unknown" }), "b");
  assert.equal(readPreviewTheme({ getItem: () => { throw new Error("blocked"); } }), "b");

  const writes = [];
  assert.equal(writePreviewTheme({ setItem: (...args) => writes.push(args) }, "a"), true);
  assert.deepEqual(writes, [[PREVIEW_THEME_STORAGE_KEY, "a"]]);
  assert.equal(
    writePreviewTheme({ setItem: () => { throw new Error("blocked"); } }, "b"),
    false,
  );
});

test("preview search finds fixture companies and bonds and returns no invented fallback", async () => {
  const data = await previewData();

  assert.deepEqual(
    searchPreviewEntities(data, "2245").map(({ kind, title, href }) => ({
      kind,
      title,
      href,
    })),
    [{
      kind: "company",
      title: "2245 詠勝昌*",
      href: "/dev-preview/emerging/2245",
    }],
  );
  assert.deepEqual(
    searchPreviewEntities(data, "御頂").map(({ kind, title, href }) => ({
      kind,
      title,
      href,
    })),
    [{
      kind: "bond",
      title: "35221 御嵿一",
      href: "/dev-preview/bonds/bond:35221",
    }],
  );
  assert.equal(searchPreviewEntities(data, "35221")[0]?.kind, "bond");
  assert.deepEqual(searchPreviewEntities(data, "不存在的公司或債券"), []);
});

test("dashboard summaries and YoY order are derived from fixture DTOs", async () => {
  const dashboard = buildPreviewDashboard(await previewData());

  assert.equal(dashboard.companyCount, 3);
  assert.equal(dashboard.bondCount, 2);
  assert.equal(dashboard.latestRevenueMonth, "2026-06");
  assert.equal(dashboard.nearestBondImportantDate?.date, "2026-03-09");
  assert.deepEqual(
    dashboard.revenueRows.map(({ companyCode }) => companyCode),
    ["4172", "1260", "2245"],
  );
  assert.deepEqual(
    dashboard.importantDates.map(({ type, date }) => ({ type, date })),
    [
      { type: "bond-maturity", date: "2026-12-18" },
      { type: "bond-conversion-start", date: "2026-03-09" },
      { type: "bond-conversion-end", date: "2026-12-18" },
      { type: "bond-put", date: "2025-12-18" },
    ],
  );
});

test("closest bond dates break equal-distance ties by earlier date then stable id", async () => {
  const data = await previewData();
  const [firstBond, secondBond] = data.bonds;
  const baseBond = {
    ...firstBond,
    listingDate: undefined,
    conversionStartDate: undefined,
    conversionEndDate: undefined,
    putDates: [],
    maturityDate: "2036-01-01",
  };
  data.bondSource.officialDataDate = "2026-01-02";
  data.bonds = [
    { ...baseBond, bondId: "bond:z", issueDate: "2026-01-03" },
    { ...secondBond, ...baseBond, bondId: "bond:a", issueDate: "2026-01-01" },
  ];
  assert.equal(buildPreviewDashboard(data).nearestBondImportantDate?.date, "2026-01-01");

  data.bonds = [
    { ...baseBond, bondId: "bond:z", issueDate: "2026-01-01" },
    { ...secondBond, ...baseBond, bondId: "bond:a", issueDate: "2026-01-01" },
  ];
  assert.equal(buildPreviewDashboard(data).nearestBondImportantDate?.entityId, "bond:a");
});

test("timeline contains only the exact fixture-backed month, source and bond date events", async () => {
  const data = await previewData();
  const dashboard = buildPreviewDashboard(data);
  const privateBondId = data.bonds.find((bond) => bond.bondCode === undefined)?.bondId;
  assert.ok(privateBondId);

  assert.deepEqual(
    dashboard.timeline.map(({ type, date, entityId }) => `${type}|${date}|${entityId}`),
    [
      "bond-issue|2023-12-18|bond:35221",
      "bond-listing|2023-12-18|bond:35221",
      "bond-conversion-start|2024-03-19|bond:35221",
      "bond-put|2025-12-18|bond:35221",
      `bond-issue|2026-03-09|${privateBondId}`,
      `bond-conversion-start|2026-03-09|${privateBondId}`,
      "revenue-month|2026-06|revenue",
      "revenue-source|2026-07-17|revenue",
      "bond-conversion-end|2026-12-18|bond:35221",
      "bond-maturity|2026-12-18|bond:35221",
      `bond-conversion-end|2036-03-08|${privateBondId}`,
      `bond-maturity|2036-03-08|${privateBondId}`,
    ],
  );
});
