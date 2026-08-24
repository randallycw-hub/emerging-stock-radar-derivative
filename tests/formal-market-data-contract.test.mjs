import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseBondWorkbenchSnapshot } from "../lib/market-data/bond-workbench.ts";

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
      }, {
        name: "bond-workbench.json",
        sha256: `sha256:${"c".repeat(64)}`,
        rawBytes: 100,
        recordCount: 1,
        schemaVersion: 1,
        sourceStateSummary: {},
      }, {
        name: "ipo-events.json",
        sha256: `sha256:${"d".repeat(64)}`,
        rawBytes: 100,
        recordCount: 1,
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
  assert.equal(
    runtime.datasets.bondWorkbench,
    "./data/generations/abc123/bond-workbench.json",
  );
  const serialized = JSON.stringify(runtime);
  assert.equal(serialized.includes("t187ap05_L.csv"), false);
  assert.equal(serialized.includes("t187ap05_O.csv"), false);
  assert.equal(serialized.includes("備註"), false);
  assert.equal(Object.hasOwn(runtime.datasets, "listedMonthlyRevenueCsv"), false);
  assert.equal(Object.hasOwn(runtime.datasets, "otcMonthlyRevenueCsv"), false);
});

test("checked-in formal generation publishes validated workbench and IPO inputs", async () => {
  const dataRoot = new URL("../static-showcase/data/", import.meta.url);
  const pointer = JSON.parse(await readFile(new URL("current.json", dataRoot), "utf8"));
  const runtime = JSON.parse(await readFile(new URL(pointer.runtimeUrl.replace("./data/", ""), dataRoot), "utf8"));
  const manifest = JSON.parse(await readFile(new URL(runtime.manifestUrl.replace("./data/", ""), dataRoot), "utf8"));

  assert.equal(
    runtime.datasets.bondWorkbench,
    `./data/${pointer.generation}/bond-workbench.json`,
  );
  assert.equal(runtime.ipoEventsUrl, `./data/${pointer.generation}/ipo-events.json`);
  assert.equal(
    manifest.market.files.filter((entry) => entry.name === "bond-workbench.json").length,
    1,
  );
  assert.equal(
    manifest.market.files.filter((entry) => entry.name === "ipo-events.json").length,
    1,
  );
  const workbench = JSON.parse(await readFile(
    new URL(runtime.datasets.bondWorkbench.replace("./data/", ""), dataRoot),
    "utf8",
  ));
  assert.equal(parseBondWorkbenchSnapshot(workbench).records.length, workbench.records.length);
});
