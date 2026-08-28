import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { stageStaticShowcase } from "../scripts/stage-static-showcase.mjs";

const source = fileURLToPath(new URL("../static-showcase", import.meta.url));

test("V5.1 staging writes the verified research workbench into the static first screen", async () => {
  const root = await mkdtemp(join(tmpdir(), "v5-home-stage-"));
  const destination = join(root, "market-site");
  try {
    const pointer = JSON.parse(await readFile(
      join(source, "data", "current.json"),
      "utf8",
    ));
    const manifest = JSON.parse(await readFile(
      join(source, "data", ...pointer.generation.split("/"), "manifest.json"),
      "utf8",
    ));
    await stageStaticShowcase({ source, destination });
    const home = await readFile(join(destination, "index.html"), "utf8");

    assert.match(
      home,
      new RegExp(`資料日 ${manifest.market.dataDate.replaceAll("-", "\\/")}`),
    );
    assert.match(home, /今天從這裡開始/);
    assert.match(home, /可轉債標的股漲幅/);
    assert.doesNotMatch(home, /讀取中|載入後顯示|資料日將依|HOME_STATIC_|HOME_V51_|資料狀態/);
    assert.doesNotMatch(home, /sourceId|missingReasons|Snapshot ID|Dataset Health/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
