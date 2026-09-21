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
    assert.equal(await readFile(join(destination, "assets", "cb-issue-scope.js"), "utf8"),
      await readFile(join(showcaseSource, "assets", "cb-issue-scope.js"), "utf8"),
      "the staged CB workbench must include its shared issue-scope dependency");
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
    for (const [field, file, maxBytes] of [
      ['cbOverviewUrl', 'cb-overview.json', 2500000],
      ['homeSummaryUrl', 'home-summary.json', 50000],
      ['emergingOverviewUrl', 'emerging-overview.json', 1000000],
      ['compactSearchIndexUrl', 'quick-search.json', 1000000],
    ]) {
      assert.equal(runtime[field], `./data/${pointer.generation}/${file}`);
      const text = await readFile(join(destination, runtime[field].replace(/^\.\//, '')), 'utf8');
      assert.equal(JSON.parse(text).dataDate, model.dataDate);
      assert.ok(Buffer.byteLength(text) < maxBytes, file);
      assert.doesNotMatch(text, /"sourceId"|"rawTextHash"|"diagnostics"|"missingReason"/);
    }
    assert.equal(model.dataDate, JSON.parse(await readFile(join(showcaseSource, "data", pointer.generation, "bond-workbench.json"), "utf8")).dataDate);
    assert.equal(model.securityMaster.status, "verified");
    assert.equal(model.performance.status, "verified");
    assert.equal(model.dailyChanges.status, "verified");
    assert.ok(model.performance.records.some((record) => record.entityType === "cb"));
    assert.ok(model.performance.records.some((record) => record.entityType === "emerging"));
    assert.ok(model.performance.records.some((record) => record.entityType === "ipo"));
    assert.ok(model.stockPriceHistory.records.every((record) => record.source === "official"));
    assert.doesNotMatch(JSON.stringify(model), /rawSourceId|rawTextHash|missingReason|diagnostics/);
    const sourceEvents = JSON.parse(await readFile(join(showcaseSource, "data", pointer.generation, "canonical-events-v55.json"), "utf8"));
    const stagedEvents = JSON.parse(await readFile(join(destination, runtime.canonicalEventsV55Url.replace(/^\.\//, "")), "utf8"));
    // Legacy snapshots inferred "currently effective" events from conversion
    // values whose effective date was still in the future. Reprojection must
    // drop those, but retain genuine scheduled listings and announced rights.
    const expectedEvents = sourceEvents.records.filter(row => !(
      row.eventType === "conversion_price_adjustment"
      && row.eventId.startsWith("mops-conversion:")
      && !row.announcementDate
      && row.effectiveDate > model.dataDate
    ));
    for (const scope of ["ipo", "cb"]) {
      assert.ok(sourceEvents.records.some(row => row.marketScope === scope));
      assert.deepEqual(stagedEvents.records.filter(row => row.marketScope === scope).map(row => row.eventId).sort(),
        expectedEvents.filter(row => row.marketScope === scope).map(row => row.eventId).sort(),
        `staging must retain every snapshot-valid ${scope} event before removing internal evidence`);
    }
    assert.doesNotMatch(JSON.stringify(stagedEvents), /"sourceId"|"sourceRecordIds"|"missingReason"/);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});
