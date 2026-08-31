import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { stageStaticShowcase } from "../scripts/stage-static-showcase.mjs";

test("V5 staging publishes the locally installed KLineChart ESM build", async () => {
  const destination = await mkdtemp(join(tmpdir(), "market-v5-kline-"));
  try {
    await stageStaticShowcase({
      source: fileURLToPath(new URL("../static-showcase/", import.meta.url)),
      destination,
    });
    const vendor = await readFile(join(destination, "assets", "vendor", "klinecharts.esm.js"), "utf8");
    assert.match(vendor, /KLineChart|klinecharts/i);
    const lightweight = await readFile(join(destination, "assets", "vendor", "lightweight-charts.standalone.production.mjs"), "utf8");
    assert.match(lightweight, /LightweightCharts|createChart/i);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});
