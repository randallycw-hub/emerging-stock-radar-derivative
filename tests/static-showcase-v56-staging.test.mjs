import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { stageStaticShowcase } from "../scripts/stage-static-showcase.mjs";

const showcaseSource = fileURLToPath(new URL("../static-showcase/", import.meta.url));

test("V5.6 staging emits one public model for shared data, daily changes, and performance", async () => {
  const destination = await mkdtemp(join(tmpdir(), "market-v56-stage-"));
  try {
    await stageStaticShowcase({ source: showcaseSource, destination });
    const pointer = JSON.parse(await readFile(join(destination, "data", "current.json"), "utf8"));
    const runtime = JSON.parse(await readFile(
      join(destination, pointer.runtimeUrl.replace(/^\.\//, "")),
      "utf8",
    ));

    assert.equal(runtime.v56MarketDataUrl, `./data/${pointer.generation}/v56-market-data.json`);
    const model = JSON.parse(await readFile(
      join(destination, runtime.v56MarketDataUrl.replace(/^\.\//, "")),
      "utf8",
    ));
    assert.equal(model.schemaVersion, 3);
    assert.equal(model.dataDate, "2026-08-28");
    assert.equal(model.securityMaster.status, "verified");
    assert.equal(model.performance.status, "verified");
    assert.equal(model.dailyChanges.status, "verified");
    assert.ok(model.performance.records.some((record) => record.entityType === "cb"));
    assert.ok(model.performance.records.some((record) => record.entityType === "emerging"));
    assert.ok(model.performance.records.some((record) => record.entityType === "ipo"));
    assert.ok(model.stockPriceHistory.records.every((record) => record.source === "official"));
    assert.doesNotMatch(JSON.stringify(model), /rawSourceId|rawTextHash|missingReason|diagnostics/);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});
