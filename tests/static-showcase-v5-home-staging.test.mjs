import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { stageStaticShowcase } from "../scripts/stage-static-showcase.mjs";

const source = fileURLToPath(new URL("../static-showcase", import.meta.url));

test("V5 staging writes the verified home snapshot into the static first screen", async () => {
  const root = await mkdtemp(join(tmpdir(), "v5-home-stage-"));
  const destination = join(root, "market-site");
  try {
    await stageStaticShowcase({ source, destination });
    const home = await readFile(join(destination, "index.html"), "utf8");

    assert.match(home, /資料日 2026\/08\/26/);
    assert.match(home, /市場家數/);
    assert.doesNotMatch(home, /讀取中|載入後顯示|資料日將依|HOME_STATIC_|資料狀態/);
    assert.doesNotMatch(home, /sourceId|missingReasons|Snapshot ID|Dataset Health/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
