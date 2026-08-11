import assert from "node:assert/strict";
import test from "node:test";

test("興櫃列只接受收盤價並保留資料日期", async () => {
  const { normalizeEmergingRow } = await import("../lib/preview/data.ts");
  const row = normalizeEmergingRow({
    code: "6543",
    name: "測試公司",
    closingPrice: 42.5,
    asOf: "2026-07-29",
  });
  assert.equal(row.closingPrice, 42.5);
  assert.equal(row.priceLabel, "收盤價");
  assert.equal(row.asOf, "2026-07-29");
  assert.equal("realtimePrice" in row, false);
});

test("格式化器對缺值使用破折號", async () => {
  const { formatPrice, formatPercent, formatAmount, formatDateOrDash } =
    await import("../lib/preview/format.ts");
  assert.equal(formatPrice(undefined), "—");
  assert.equal(formatPercent(undefined), "—");
  assert.equal(formatAmount(undefined), "—");
  assert.equal(formatDateOrDash(""), "—");
});

test("正式 generation runtime only exposes compact CB issuer research artifact", async () => {
  const { buildGenerationRuntime } = await import(
    "../scripts/refresh-static-showcase-data.mjs"
  );
  const runtime = buildGenerationRuntime("generations/abc123", {
    market: {
      files: [{
        name: "cb-issuer-research.json",
        sha256: `sha256:${"a".repeat(64)}`,
        recordCount: 1,
      }, {
        name: "bond-supplemental.json",
        sha256: `sha256:${"b".repeat(64)}`,
        recordCount: 3,
      }],
    },
  });

  assert.equal(
    runtime.datasets.cbIssuerResearch,
    "./data/generations/abc123/cb-issuer-research.json",
  );
  assert.equal(
    runtime.datasets.bondSupplemental,
    "./data/generations/abc123/bond-supplemental.json",
  );
  const serialized = JSON.stringify(runtime);
  assert.equal(serialized.includes("t187ap05_L.csv"), false);
  assert.equal(serialized.includes("t187ap05_O.csv"), false);
  assert.equal(serialized.includes("備註"), false);
  assert.equal(Object.hasOwn(runtime.datasets, "listedMonthlyRevenueCsv"), false);
  assert.equal(Object.hasOwn(runtime.datasets, "otcMonthlyRevenueCsv"), false);
});
