import assert from "node:assert/strict";
import test from "node:test";

import {
  DATA_CENTER_STATUS,
  buildDataCenterStatus,
  projectDatasetStatus,
} from "../static-showcase/assets/data-center-status.js";

function verifiedFixture({ evaluatedAt = "2026-08-26T18:20:00+08:00" } = {}) {
  return {
    generation: "generations/abc123",
    evaluatedAt,
    manifest: {
      generatedAt: "2026-08-26",
      datasets: [
        { datasetId: "94025", sourceUrl: "https://mops.example/revenue.csv", downloadedAt: "2026-08-26", rowCount: 12 },
        { datasetId: "11406", sourceUrl: "https://tpex.example/cb.csv", downloadedAt: "2026-08-26", rowCount: 20 },
      ],
      market: {
        status: "verified",
        dataDate: "2026-08-26",
        generatedAt: "2026-08-26T18:12:00+08:00",
        files: [
          { name: "bond-workbench.json", recordCount: 15 },
          { name: "conversion-prices.json", recordCount: 14 },
          { name: "bond-supplemental.json", recordCount: 4 },
        ],
        supplementalSources: { redemption: { dataDate: "2026-08-20" } },
      },
    },
    artifacts: {
      emergingMarket: { tradingDate: "2026-08-26", publishedAt: "2026-08-26T18:01:00+08:00", records: [{ companyCode: "1260" }] },
      ipoEvents: {
        dataDate: "2026-08-26",
        generatedAt: "2026-08-26T18:08:00+08:00",
        sourceManifest: [
          { sourceId: "twse-applications", sourceUrl: "https://twse.example/applications" },
          { sourceId: "tpex-applications", sourceUrl: "https://tpex.example/applications" },
        ],
        records: [{ companyCode: "1234" }],
      },
      bondWorkbench: { dataDate: "2026-08-26", generatedAt: "2026-08-26T18:10:00+08:00", records: [{ bondCode: "12341" }] },
      revenue: { period: "2026-07", records: [{ companyCode: "1260" }] },
    },
    qa: {
      checkedAt: "2026-08-26T18:20:00+08:00",
      checks: [
        { label: "Published generation integrity", passed: true },
        { label: "Required public artifacts", passed: true },
      ],
    },
  };
}

test("Data Center V3 projects only verified public inputs into an OK health record", () => {
  const status = buildDataCenterStatus(verifiedFixture());

  assert.equal(status.system.status, DATA_CENTER_STATUS.OK);
  assert.equal(status.system.normalDatasetCount, status.datasets.length);
  assert.ok(status.datasets.every((dataset) => dataset.status === DATA_CENTER_STATUS.OK));
  assert.equal(status.qa.passed, true);
  assert.equal(status.snapshot.current, "abc123");
  assert.equal(JSON.stringify(status).includes("sourceId"), false);
  assert.equal(JSON.stringify(status).includes("missingReasons"), false);
});

test("Data Center V3 distinguishes waiting, delayed, fallback, error, and non-trading states", () => {
  assert.equal(projectDatasetStatus({
    dataDate: "2026-08-26",
    evaluatedAt: "2026-08-27T10:00:00+08:00",
    cadence: "daily",
    qaPassed: true,
  }), DATA_CENTER_STATUS.WAITING_PUBLISH);
  assert.equal(projectDatasetStatus({
    dataDate: "2026-08-26",
    evaluatedAt: "2026-08-27T19:00:00+08:00",
    cadence: "daily",
    qaPassed: true,
  }), DATA_CENTER_STATUS.DELAYED);
  assert.equal(projectDatasetStatus({
    dataDate: "2026-08-26",
    evaluatedAt: "2026-08-27T19:00:00+08:00",
    cadence: "daily",
    qaPassed: true,
    fallbackSnapshotId: "previous-snapshot",
  }), DATA_CENTER_STATUS.FALLBACK);
  assert.equal(projectDatasetStatus({
    dataDate: "2026-08-26",
    evaluatedAt: "2026-08-26T19:00:00+08:00",
    cadence: "daily",
    qaPassed: false,
  }), DATA_CENTER_STATUS.ERROR);
  assert.equal(projectDatasetStatus({
    dataDate: "2026-08-28",
    evaluatedAt: "2026-08-30T12:00:00+08:00",
    cadence: "daily",
    qaPassed: true,
  }), DATA_CENTER_STATUS.NON_TRADING_DAY);
});

test("Data Center V3 keeps unknown values unavailable instead of changing them to zero", () => {
  const status = buildDataCenterStatus({
    ...verifiedFixture(),
    artifacts: {
      ...verifiedFixture().artifacts,
      revenue: { period: null, records: [] },
    },
  });
  const revenue = status.datasets.find((dataset) => dataset.id === "monthly-revenue");

  assert.equal(revenue.recordCount, 0);
  assert.equal(revenue.dataDate, null);
  assert.equal(revenue.status, DATA_CENTER_STATUS.ERROR);
});
