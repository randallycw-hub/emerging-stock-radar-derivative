import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPreviewData,
  findPreviewBond,
  findPreviewCompany,
} from "../lib/preview/data.ts";
import {
  formatPreviewNumber,
  formatPreviewPercent,
  formatPreviewText,
} from "../lib/preview/format.ts";
import {
  assertPreviewDevelopmentRuntime,
  isPreviewDevelopmentRuntime,
  PreviewUnavailableError,
} from "../lib/preview/runtime.ts";

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

test("preview data builds typed company DTOs through the committed 94025 fixture contract", async () => {
  const data = await previewData();
  assert.equal(data.companies.length, 3);
  assert.deepEqual(
    data.companies.map(({ companyId, companyCode, companyName }) => ({
      companyId,
      companyCode,
      companyName,
    })),
    [
      { companyId: "1260", companyCode: "1260", companyName: "富味鄉" },
      { companyId: "2245", companyCode: "2245", companyName: "詠勝昌*" },
      { companyId: "4172", companyCode: "4172", companyName: "因華" },
    ],
  );
  const company = findPreviewCompany(data, "2245");
  assert.equal(company.industryName, "電機機械");
  assert.equal(company.yearMonth, "2026-06");
  assert.equal(company.currentMonthRevenue, "27750");
  assert.equal(company.monthOverMonthPercent, "-34.224560904501175");
  assert.equal(company.revenueUnit, "仟元");
  assert.equal(company.source.fetchedAt, "2026-07-23T06:10:42.382Z");
  assert.equal(company.source.datasetName, "興櫃公司每月營業收入彙總表");
  assert.equal("noteText" in company, false);
});

test("preview data builds typed bond DTOs through the committed 11406 fixture contract", async () => {
  const data = await previewData();
  assert.equal(data.bonds.length, 2);
  const bond = findPreviewBond(data, "bond:35221");
  assert.equal(bond.bondCode, "35221");
  assert.equal(bond.shortName, "御嵿一");
  assert.equal(bond.issuerName, "御頂");
  assert.equal(bond.issueAmount, "150000000");
  assert.equal(bond.outstandingAmount, "123100000");
  assert.equal(bond.secured, true);
  assert.equal(bond.conversionStartDate, "2024-03-19");
  assert.equal(bond.putPrice, "101.0025");
  assert.equal(bond.source.officialDataDate, "2026-07-23");
  assert.equal(bond.source.fetchedAt, "2026-07-23T05:15:35.872Z");
  assert.equal(bond.source.datasetName, "轉(交)換債發行資料下載");
});

test("preview DTOs contain no quote, arbitrage or recommendation surface", async () => {
  const json = JSON.stringify(await previewData());
  const forbidden = [
    ["market", "Price"].join(""),
    ["bid", "Price"].join(""),
    ["ask", "Price"].join(""),
    ["vol", "ume"].join(""),
    ["change", "Percent"].join(""),
    ["conversion", "Value"].join(""),
    ["theoretical", "Price"].join(""),
    ["arbit", "rage"].join(""),
    ["recommen", "dation"].join(""),
  ];
  for (const field of forbidden) assert.equal(json.includes(`"${field}"`), false);
});

test("preview selectors return undefined for unknown company and bond ids", async () => {
  const data = await previewData();
  assert.equal(findPreviewCompany(data, "unknown-company"), undefined);
  assert.equal(findPreviewBond(data, "unknown-bond"), undefined);
});

test("preview formatters use an em dash and limit display percentages to two decimal places", () => {
  assert.equal(formatPreviewText(undefined), "—");
  assert.equal(formatPreviewText(""), "—");
  assert.equal(formatPreviewNumber(undefined), "—");
  assert.equal(formatPreviewNumber("150000000"), "150,000,000");
  assert.equal(formatPreviewNumber("-1234.50"), "-1,234.50");
  assert.equal(formatPreviewPercent(undefined), "—");
  assert.equal(formatPreviewPercent("-34.224560904501175"), "-34.22%");
  assert.equal(formatPreviewPercent("7.0412127746588835"), "7.04%");
  assert.equal(formatPreviewPercent("0"), "0%");
  assert.equal(formatPreviewPercent("-0.004"), "0%");
});

test("preview runtime is available only for development", () => {
  assert.equal(isPreviewDevelopmentRuntime("development"), true);
  for (const environment of ["production", "test", undefined]) {
    assert.equal(isPreviewDevelopmentRuntime(environment), false);
    assert.throws(
      () => assertPreviewDevelopmentRuntime(environment),
      PreviewUnavailableError,
    );
  }
  assert.doesNotThrow(() => assertPreviewDevelopmentRuntime("development"));
});
